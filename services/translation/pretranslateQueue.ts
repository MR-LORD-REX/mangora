/**
 * pretranslateQueue.ts
 * ---------------------------------------------------------------------------
 * Global pre-translate scheduler for downloaded chapters.
 *
 * One job runs at a time (OCR is expensive). Each page goes through the same
 * YOLO -> OCR -> free/AI translation flow as the reader, then is written to the
 * translation cache so opening the chapter feels instant. Failed pages are
 * counted and skipped; the reader retry button still works on them.
 *
 * The queue pauses when the app leaves the foreground (JS timers / native
 * inference can be suspended) and posts a notification asking the user to
 * return. State is persisted to a small JSON file so a queued chapter survives
 * a restart.
 * ---------------------------------------------------------------------------
 */

import { File, Paths } from "expo-file-system";
import { AppState, type AppStateStatus } from "react-native";

import {
  findTranslationPage,
  pruneTranslationCache,
  saveTranslationPage,
} from "@/services/db/repositories/translationRepository";
import {
  isModelDownloaded,
  recognizePageRegions,
} from "@/services/ocr/localOcr";
import { getLocalOcrModel, modelIdForLanguage } from "@/services/ocr/ocrModels";
import { prepareTextRegions, type OcrRegion } from "@/services/ocr/pageOcr";
import { getSettings, type AppSettings } from "@/services/settings/settingsStore";
import { localTranslate } from "@/services/translation/freeGoogleTranslator";
import {
  GeminiApiError,
  translateGeminiBatch,
} from "@/services/translation/geminiTranslator";
import {
  recordGeminiUsage,
  waitForRpmCapacity,
} from "@/services/translation/geminiUsage";
import { translateSingleText } from "@/services/translation/pageTranslate";
import {
  assignItemsToSlots,
  buildTranslationSlots,
  fillSlotTexts,
} from "@/services/translation/regionText";
import type { ReaderTranslationEngine } from "@/services/settings/settingsStore";
import {
  releaseTranslationLock,
  subscribeTranslationLock,
  tryAcquireTranslationLock,
} from "@/services/translation/translationRuntimeLock";
import { isCjkLanguageCode } from "@/services/translation/translationLang";
import { yoloDetector } from "@/services/yolo/yolo";
import {
  notifyTranslationBackground,
  notifyTranslationProgress,
} from "@/services/notifications/notifications";

const MAX_CROPS_PER_PAGE = 24;
const STORE_FILE = "trapp-translation-jobs.json";

export type PretranslateStatus =
  | "queued"
  | "running"
  | "paused"
  | "completed"
  | "failed";

export interface PretranslateJob {
  id: string;
  mangaId: string;
  chapterId: string;
  mangaTitle: string;
  chapterTitle: string;
  pageUris: string[];
  engine: ReaderTranslationEngine;
  sourceLanguage: string;
  targetLanguage: string;
  geminiModelId: string;
  aiWorkerCount: number;
  aiMaxContextPages: number;
  freeRequestConcurrency: number;
  status: PretranslateStatus;
  pagesDone: number;
  pagesFailed: number;
  currentPage: number | null;
  error: string | null;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
}

export interface PretranslateSnapshot {
  jobs: PretranslateJob[];
  runningCount: number;
  pendingCount: number;
  paused: boolean;
}

interface HistoryPage {
  pageIndex: number;
  bubbles: { id: number; text: string }[];
}

let jobs: PretranslateJob[] = [];
let activeJobId: string | null = null;
let paused = false;
let pausedByBackground = false;
let initialised = false;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const cancelRequested = new Set<string>();
const listeners = new Set<(snapshot: PretranslateSnapshot) => void>();

function snapshot(): PretranslateSnapshot {
  return {
    jobs: jobs.map((job) => ({ ...job })),
    runningCount: jobs.filter((job) => job.status === "running").length,
    pendingCount: jobs.filter(
      (job) => job.status === "queued" || job.status === "paused",
    ).length,
    paused,
  };
}

function publish(): void {
  const next = snapshot();
  listeners.forEach((listener) => listener(next));
  scheduleSave();
}

export function subscribePretranslate(
  listener: (snapshot: PretranslateSnapshot) => void,
): () => void {
  listeners.add(listener);
  listener(snapshot());
  return () => {
    listeners.delete(listener);
  };
}

export function getPretranslateSnapshot(): PretranslateSnapshot {
  return snapshot();
}

function storeFile(): File {
  return new File(Paths.document, STORE_FILE);
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      storeFile().write(
        JSON.stringify(
          jobs.filter((job) => job.status !== "completed"),
          null,
          2,
        ),
      );
    } catch (error) {
      console.warn("[translation][queue] persist failed", error);
    }
  }, 400);
}

async function loadPersisted(): Promise<void> {
  try {
    const file = storeFile();
    if (!file.exists) return;
    const parsed = JSON.parse(await file.text()) as PretranslateJob[];
    if (!Array.isArray(parsed)) return;
    jobs = parsed.map((job) => ({
      ...job,
      status: job.status === "running" ? "paused" : job.status,
      currentPage: null,
    }));
    console.log("[translation][queue] restored jobs", { count: jobs.length });
  } catch (error) {
    console.warn("[translation][queue] restore failed", error);
  }
}

export async function initPretranslateQueue(): Promise<void> {
  if (initialised) return;
  initialised = true;
  await loadPersisted();
  publish();
  subscribeTranslationLock(() => {
    if (!activeJobId) pump();
  });
  AppState.addEventListener("change", (state: AppStateStatus) => {
    if (state === "active") {
      if (pausedByBackground) {
        pausedByBackground = false;
        paused = false;
        for (const job of jobs) {
          if (job.status === "paused") job.status = "queued";
        }
        console.log("[translation][queue] resumed after foreground return");
        publish();
        pump();
      }
      return;
    }
    if (activeJobId) {
      pausedByBackground = true;
      paused = true;
      console.log("[translation][queue] paused - app backgrounded");
      void notifyTranslationBackground();
      publish();
    }
  });
  pump();
  console.log("[translation][queue] initialised");
}

function settingsSnapshot(settings: AppSettings) {
  return {
    engine: settings.readerTranslationEngine,
    sourceLanguage: settings.readerLanguage || "ja",
    targetLanguage: settings.readerTargetLanguage || "en",
    geminiModelId: settings.geminiModelId,
    aiWorkerCount: settings.aiWorkerCount,
    aiMaxContextPages: settings.aiMaxContextPages,
    freeRequestConcurrency: settings.freeRequestConcurrency,
  };
}

export async function enqueuePretranslateJob(input: {
  mangaId: string;
  chapterId: string;
  mangaTitle: string;
  chapterTitle: string;
  pageUris: string[];
  sourceLanguage?: string;
  targetLanguage?: string;
  engine?: ReaderTranslationEngine;
  settings?: AppSettings;
}): Promise<{ ok: boolean; job?: PretranslateJob; reason?: string }> {
  const existing = jobs.find(
    (job) =>
      job.chapterId === input.chapterId &&
      (job.status === "queued" ||
        job.status === "running" ||
        job.status === "paused"),
  );
  if (existing) {
    return { ok: false, reason: "This chapter is already in the translation queue." };
  }
  if (input.pageUris.length === 0) {
    return { ok: false, reason: "The downloaded chapter has no page files." };
  }
  const settings = input.settings ?? (await getSettings());
  const snap = settingsSnapshot(settings);
  const job: PretranslateJob = {
    id: `trjob-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    mangaId: input.mangaId,
    chapterId: input.chapterId,
    mangaTitle: input.mangaTitle,
    chapterTitle: input.chapterTitle,
    pageUris: input.pageUris,
    engine: input.engine ?? snap.engine,
    sourceLanguage: input.sourceLanguage ?? snap.sourceLanguage,
    targetLanguage: input.targetLanguage ?? snap.targetLanguage,
    geminiModelId: snap.geminiModelId,
    aiWorkerCount: snap.aiWorkerCount,
    aiMaxContextPages: snap.aiMaxContextPages,
    freeRequestConcurrency: snap.freeRequestConcurrency,
    status: paused ? "paused" : "queued",
    pagesDone: 0,
    pagesFailed: 0,
    currentPage: null,
    error: null,
    createdAt: Date.now(),
    startedAt: null,
    finishedAt: null,
  };
  jobs.push(job);
  console.log("[translation][queue] job queued", {
    id: job.id,
    chapterId: job.chapterId,
    pages: job.pageUris.length,
    engine: job.engine,
  });
  publish();
  pump();
  return { ok: true, job };
}

function pump(): void {
  if (!initialised || paused || activeJobId) return;
  const next = jobs.find((job) => job.status === "queued");
  if (!next) return;
  const lockKey = `pretranslate:${next.id}`;
  if (!tryAcquireTranslationLock(lockKey, `Pre-translate ${next.chapterTitle}`)) {
    return;
  }
  activeJobId = next.id;
  void runJob(next, lockKey).finally(() => {
    activeJobId = null;
    releaseTranslationLock(lockKey);
    publish();
    if (!paused) pump();
  });
}

async function mapLimit<T>(
  items: T[],
  limit: number,
  work: (item: T, index: number) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        await work(items[index], index);
      }
    },
  );
  await Promise.all(workers);
}

async function translatePage(
  job: PretranslateJob,
  pageUri: string,
  pageIndex: number,
  history: HistoryPage[],
): Promise<{ bubbles: number; history: HistoryPage } | null> {
  const modelId = modelIdForLanguage(job.sourceLanguage);
  if (!(await isModelDownloaded(modelId))) {
    const model = getLocalOcrModel(modelId);
    throw new Error(
      `${model?.label ?? modelId} is not downloaded. Open Settings > OCR models.`,
    );
  }

  const detection = await yoloDetector.detectFromUri(pageUri);
  const slots = buildTranslationSlots(detection).filter(
    (slot) =>
      slot.pasteBox.x2 > slot.pasteBox.x1 &&
      slot.pasteBox.y2 > slot.pasteBox.y1,
  );
  const ocrModel = getLocalOcrModel(modelId);
  let regions: OcrRegion[];
  if (ocrModel?.engine === "ctc") {
    const clean = detection.boxes
      .filter((box) => box.classId === 0)
      .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
      .slice(0, MAX_CROPS_PER_PAGE)
      .sort((a, b) => a.y1 - b.y1 || a.x1 - b.x1);
    regions = clean.length
      ? clean
      : prepareTextRegions(detection.boxes, MAX_CROPS_PER_PAGE);
  } else {
    regions = prepareTextRegions(detection.boxes, MAX_CROPS_PER_PAGE);
  }
  if (slots.length === 0 || regions.length === 0) {
    throw new Error(`No text regions found on page ${pageIndex + 1}.`);
  }

  const ocr = await recognizePageRegions({
    pageUrl: pageUri,
    imageWidth: detection.imageWidth,
    imageHeight: detection.imageHeight,
    regions,
    language: job.sourceLanguage,
    maxCrops: MAX_CROPS_PER_PAGE,
  });
  const assigned = assignItemsToSlots(slots, ocr.items);
  const filled = fillSlotTexts(
    slots,
    assigned,
    isCjkLanguageCode(job.sourceLanguage),
  );
  const bubbles = filled
    .filter((slot) => slot.sourceText.trim())
    .map((slot) => ({ ...slot, translatedText: "" }));
  if (bubbles.length === 0) {
    throw new Error(`OCR returned no usable text on page ${pageIndex + 1}.`);
  }

  let modelIdUsed: string | null = null;
  if (job.engine === "free") {
    await mapLimit(bubbles, job.freeRequestConcurrency, async (bubble) => {
      try {
        bubble.translatedText = await translateSingleText(
          localTranslate,
          job.sourceLanguage,
          job.targetLanguage,
          bubble.sourceText,
        );
      } catch (error) {
        console.warn("[translation][queue][free] bubble failed", error);
        bubble.translatedText = "";
      }
    });
  } else {
    const settings = await getSettings();
    const apiKey = settings.geminiApiKey.trim();
    if (!apiKey) throw new Error("AI translation needs a Gemini API key.");
    const context = Math.min(
      job.aiMaxContextPages,
      Math.max(0, history.length),
    );
    const recent = history.slice(-context);
    const response = await waitForRpmCapacity(job.geminiModelId as never)
      .then(() =>
        translateGeminiBatch({
          apiKey,
          model: job.geminiModelId as never,
          sourceCode: job.sourceLanguage,
          targetCode: job.targetLanguage,
          history: recent.map((item, index) => ({
            label: `history_${index}`,
            pageIndex: item.pageIndex,
            regions: item.bubbles.map((bubble) => ({
              regionId: bubble.id,
              text: bubble.text,
            })),
          })),
          batch: [
            {
              label: "page_0",
              pageIndex,
              regions: bubbles.map((bubble) => ({
                regionId: bubble.id,
                text: bubble.sourceText,
              })),
            },
          ],
        }),
      )
      .catch((error) => {
        void recordGeminiUsage({
          model: job.geminiModelId as never,
          success: false,
          errorCode:
            error instanceof GeminiApiError
              ? String(error.code ?? error.status ?? "error")
              : "network",
        });
        throw error;
      });
    void recordGeminiUsage({
      model: job.geminiModelId as never,
      success: true,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
    });
    const byRegion = new Map<number, string>();
    for (const item of response.results) {
      if (item.label === "page_0") byRegion.set(item.regionId, item.text);
    }
    for (const bubble of bubbles) {
      bubble.translatedText = byRegion.get(bubble.id)?.trim() ?? "";
    }
    modelIdUsed = job.geminiModelId;
  }

  const translated = bubbles.filter((bubble) => bubble.translatedText.trim());
  if (translated.length > 0) {
    await saveTranslationPage({
      mangaId: job.mangaId,
      chapterId: job.chapterId,
      pageUrl: pageUri,
      sourceLanguage: job.sourceLanguage,
      targetLanguage: job.targetLanguage,
      model: modelIdUsed,
      imageWidth: detection.imageWidth,
      imageHeight: detection.imageHeight,
      regions: translated.map((bubble) => ({
        regionId: bubble.id,
        kind: bubble.kind,
        sourceText: bubble.sourceText,
        translatedText: bubble.translatedText,
        pasteBox: bubble.pasteBox,
        eraseBoxes: bubble.eraseBoxes,
      })),
    });
    void pruneTranslationCache(job.mangaId);
  }
  return {
    bubbles: translated.length,
    history: {
      pageIndex,
      bubbles: bubbles.map((bubble) => ({ id: bubble.id, text: bubble.sourceText })),
    },
  };
}

async function runJob(job: PretranslateJob, lockKey: string): Promise<void> {
  void lockKey;
  job.status = "running";
  job.startedAt = Date.now();
  job.error = null;
  publish();
  console.log("[translation][queue] job started", {
    id: job.id,
    pages: job.pageUris.length,
  });
  const history: HistoryPage[] = [];
  try {
    for (let index = 0; index < job.pageUris.length; index += 1) {
      if (cancelRequested.has(job.id) || paused) break;
      const pageUri = job.pageUris[index];
      job.currentPage = index + 1;
      publish();
      const cached = await findTranslationPage({
        mangaId: job.mangaId,
        pageUrl: pageUri,
        sourceLanguage: job.sourceLanguage,
        targetLanguage: job.targetLanguage,
      }).catch(() => null);
      if (cached) {
        console.log("[translation][queue] page cached", { page: index + 1 });
        history.push({
          pageIndex: index,
          bubbles: cached.regions.map((region) => ({
            id: region.regionId,
            text: region.sourceText,
          })),
        });
        job.pagesDone += 1;
        publish();
        void notifyTranslationProgress(job, index + 1, job.pageUris.length);
        continue;
      }
      try {
        const result = await translatePage(job, pageUri, index, history);
        if (result) history.push(result.history);
        job.pagesDone += 1;
        console.log("[translation][queue] page done", {
          page: index + 1,
          bubbles: result?.bubbles ?? 0,
        });
      } catch (error) {
        job.pagesFailed += 1;
        console.warn("[translation][queue] page skipped", {
          page: index + 1,
          error,
        });
      }
      publish();
      void notifyTranslationProgress(job, index + 1, job.pageUris.length);
    }
  } finally {
    job.currentPage = null;
    if (cancelRequested.delete(job.id)) {
      jobs = jobs.filter((item) => item.id !== job.id);
      console.log("[translation][queue] job cancelled", { id: job.id });
    } else if (paused) {
      job.status = "paused";
      console.log("[translation][queue] job paused", { id: job.id });
    } else {
      job.status = job.pagesDone > 0 ? "completed" : "failed";
      job.finishedAt = Date.now();
      console.log("[translation][queue] job finished", {
        id: job.id,
        done: job.pagesDone,
        failed: job.pagesFailed,
      });
    }
    publish();
  }
}

export function pauseTranslationQueue(): void {
  paused = true;
  pausedByBackground = false;
  for (const job of jobs) {
    if (job.status === "queued" || job.status === "running") {
      job.status = "paused";
    }
  }
  console.log("[translation][queue] paused by user");
  publish();
}

export function resumeTranslationQueue(): void {
  paused = false;
  pausedByBackground = false;
  for (const job of jobs) {
    if (job.status === "paused") job.status = "queued";
  }
  console.log("[translation][queue] resumed by user");
  publish();
  pump();
}

export function cancelTranslationQueue(): number {
  const count = jobs.filter(
    (job) => job.status === "queued" || job.status === "running" || job.status === "paused",
  ).length;
  for (const job of jobs) {
    if (job.status === "running") cancelRequested.add(job.id);
  }
  jobs = jobs.filter(
    (job) => job.status !== "queued" && job.status !== "paused",
  );
  if (!activeJobId) paused = false;
  console.log("[translation][queue] cancelled", { count });
  publish();
  return count;
}

export function removePretranslateJob(id: string): void {
  const job = jobs.find((item) => item.id === id);
  if (job?.status === "running") cancelRequested.add(id);
  jobs = jobs.filter((item) => item.id !== id);
  publish();
}