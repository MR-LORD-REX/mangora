/**
 * pretranslateQueue.ts
 * ---------------------------------------------------------------------------
 * Global pre-translate scheduler for downloaded chapters.
 *
 * One job runs at a time (OCR is expensive). Each page goes through the same
 * segmentation -> OCR -> free/AI translation flow as the reader, then is written to the
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
  translationPageKey,
} from "@/services/db/repositories/translationRepository";
import {
  isModelDownloaded,
  recognizePageRegions,
} from "@/services/ocr/localOcr";
import {
  clampOcrBubbleWorkers,
  getLocalOcrModel,
  modelIdForLanguage,
} from "@/services/ocr/ocrModels";
import { preparePaddleRegions } from "@/services/ocr/pageOcr";
import { detectPageRegions } from "@/services/detection/pageDetector";
import {
  cleanupDownloadedPageSession,
  openDownloadedPageSessionForChapter,
} from "@/services/downloader";
import type { DownloadedPageSession } from "@/services/downloader";
import {
  getSettings,
  updateSettings,
  type AppSettings,
  type ReaderTranslationEngine,
} from "@/services/settings/settingsStore";
import { translateFreeBatch } from "@/services/translation/freeGoogleTranslator";
import {
  GeminiApiError,
  translateGeminiBatch,
} from "@/services/translation/geminiTranslator";
import {
  GEMINI_DEFAULT_MODEL,
  type GeminiModelId,
} from "@/services/translation/geminiModels";
import {
  fallbackModelChain,
  nextAutoSwitchFailureState,
  requestWithModelFallback,
} from "@/services/translation/modelFallback";
import {
  recordGeminiUsage,
  waitForRpmCapacity,
} from "@/services/translation/geminiUsage";
import {
  assignItemsToSlots,
  buildTranslationSlots,
  fillSlotTexts,
} from "@/services/translation/regionText";
import {
  releaseTranslationLock,
  subscribeTranslationLock,
  tryAcquireTranslationLock,
} from "@/services/translation/translationRuntimeLock";
import { isCjkLanguageCode } from "@/services/translation/translationLang";
import {
  notifyTranslationBackground,
  notifyTranslationProgress,
} from "@/services/notifications/notifications";

const MAX_CROPS_PER_PAGE = 24;
const STORE_FILE = "trapp-translation-jobs.json";

/** Consecutive failed model switches across queued pages. */
let autoSwitchFailures = 0;

/** Persistently disables auto-switch after repeated fallback failures. */
function disableAutoModelSwitch(job: PretranslateJob): void {
  autoSwitchFailures = 0;
  job.autoModelSwitch = false;
  for (const candidate of jobs) candidate.autoModelSwitch = false;
  console.warn(
    "[translation][queue][ai] auto model switch disabled after repeated failures",
  );
  void updateSettings({ readerAutoModelSwitch: false }).catch((error) => {
    console.warn("[translation][queue] could not persist auto-switch setting", error);
  });
  publish();
}

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
  autoModelSwitch: boolean;
  aiMaxContextPages: number;
  /** PP-OCR recognition batch size for this job. */
  recognitionBatch: number;
  status: PretranslateStatus;
  pagesDone: number;
  pagesFailed: number;
  /** 0-based index of the next page to process; survives pause/resume. */
  nextPageIndex: number;
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
    const currentSettings = await getSettings().catch(() => null);
    const file = storeFile();
    if (!file.exists) return;
    const parsed = JSON.parse(await file.text()) as PretranslateJob[];
    if (!Array.isArray(parsed)) return;
    jobs = parsed.map((job) => {
      const pageUris = Array.isArray(job.pageUris)
        ? job.pageUris.filter((uri): uri is string => typeof uri === "string")
        : [];
      const pageCount = pageUris.length;
      const hasResumeIndex =
        typeof job.nextPageIndex === "number" &&
        Number.isFinite(job.nextPageIndex);
      const nextPageIndex = hasResumeIndex
        ? Math.min(pageCount, Math.max(0, Math.round(job.nextPageIndex)))
        : 0;
      // Jobs saved by older builds do not have a resume index. Their counters
      // may already contain replayed cached pages, so rebuild progress from
      // the cache instead of trusting the inflated values.
      const pagesDone = hasResumeIndex
        ? Math.min(nextPageIndex, Math.max(0, Math.round(job.pagesDone ?? 0)))
        : 0;
      const pagesFailed = hasResumeIndex
        ? Math.min(
            nextPageIndex - pagesDone,
            Math.max(0, Math.round(job.pagesFailed ?? 0)),
          )
        : 0;
      const geminiModelId =
        typeof job.geminiModelId === "string" && job.geminiModelId
          ? job.geminiModelId
          : (currentSettings?.geminiModelId ?? GEMINI_DEFAULT_MODEL);
      const autoModelSwitch =
        typeof job.autoModelSwitch === "boolean"
          ? job.autoModelSwitch
          : (currentSettings?.readerAutoModelSwitch ?? false);
      const aiMaxContextPages = Math.min(
        50,
        Math.max(
          1,
          Math.round(
            typeof job.aiMaxContextPages === "number" &&
              Number.isFinite(job.aiMaxContextPages)
              ? job.aiMaxContextPages
              : (currentSettings?.aiMaxContextPages ?? 10),
          ),
        ),
      );
      return {
        ...job,
        pageUris,
        geminiModelId,
        autoModelSwitch,
        aiMaxContextPages,
        recognitionBatch: clampOcrBubbleWorkers(
          modelIdForLanguage(job.sourceLanguage),
          typeof job.recognitionBatch === "number"
            ? job.recognitionBatch
            : (currentSettings?.ocrBubbleWorkers ?? 8),
        ),
        status: job.status === "running" ? "paused" : job.status,
        pagesDone,
        pagesFailed,
        nextPageIndex,
        currentPage: null,
      };
    });
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
    autoModelSwitch: settings.readerAutoModelSwitch,
    aiMaxContextPages: settings.aiMaxContextPages,
    recognitionBatch: clampOcrBubbleWorkers(
      modelIdForLanguage(settings.readerLanguage || "ja"),
      settings.ocrBubbleWorkers,
    ),
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
    autoModelSwitch: snap.autoModelSwitch,
    aiMaxContextPages: snap.aiMaxContextPages,
    recognitionBatch: clampOcrBubbleWorkers(
      modelIdForLanguage(input.sourceLanguage ?? snap.sourceLanguage),
      snap.recognitionBatch,
    ),
    status: paused ? "paused" : "queued",
    pagesDone: 0,
    pagesFailed: 0,
    nextPageIndex: 0,
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

  const detection = await detectPageRegions(pageUri);
  const slots = buildTranslationSlots(detection).filter(
    (slot) =>
      slot.pasteBox.x2 > slot.pasteBox.x1 &&
      slot.pasteBox.y2 > slot.pasteBox.y1,
  );
  const regions = preparePaddleRegions(detection.boxes, MAX_CROPS_PER_PAGE);
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
    concurrency: job.recognitionBatch,
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
    const response = await translateFreeBatch({
      sourceCode: job.sourceLanguage,
      targetCode: job.targetLanguage,
      history: [],
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
    });
    const byRegion = new Map<number, string>();
    for (const item of response.results) {
      if (item.label === "page_0") byRegion.set(item.regionId, item.text);
    }
    for (const bubble of bubbles) {
      bubble.translatedText = byRegion.get(bubble.id)?.trim() ?? "";
    }
    modelIdUsed = "free-google";
  } else {
    const settings = await getSettings();
    const apiKey = settings.geminiApiKey.trim();
    if (!apiKey) throw new Error("AI translation needs a Gemini API key.");
    const context = Math.min(
      job.aiMaxContextPages,
      Math.max(0, history.length),
    );
    const recent = history.slice(-context);
    const historyPayload = recent.map((item, index) => ({
      label: "history_" + index,
      pageIndex: item.pageIndex,
      regions: item.bubbles.map((bubble) => ({
        regionId: bubble.id,
        text: bubble.text,
      })),
    }));
    const batchPayload = [
      {
        label: "page_0",
        pageIndex,
        regions: bubbles.map((bubble) => ({
          regionId: bubble.id,
          text: bubble.sourceText,
        })),
      },
    ];
    const primary = job.geminiModelId as GeminiModelId;
    const models: GeminiModelId[] = fallbackModelChain(
      primary,
      job.autoModelSwitch && settings.readerAutoModelSwitch,
    );
    const outcome = await requestWithModelFallback({
      models,
      request: async (model) => {
        await waitForRpmCapacity(model);
        return translateGeminiBatch({
          apiKey,
          model,
          sourceCode: job.sourceLanguage,
          targetCode: job.targetLanguage,
          history: historyPayload,
          batch: batchPayload,
        });
      },
      onSwitch: (from, to) => {
        console.warn("[translation][queue][ai] rate limited; fallback model", {
          from,
          to,
        });
      },
    });
    const response = outcome.value;
    const usedModel = outcome.usedModel;
    const lastError = outcome.lastError;
    const failureState = nextAutoSwitchFailureState(
      autoSwitchFailures,
      outcome,
    );
    autoSwitchFailures = failureState.failures;
    if (failureState.disable) disableAutoModelSwitch(job);
    if (!response) {
      void recordGeminiUsage({
        model: usedModel,
        success: false,
        errorCode:
          lastError instanceof GeminiApiError
            ? String(lastError.code ?? lastError.status ?? "error")
            : "network",
      });
      throw lastError instanceof Error
        ? lastError
        : new Error("AI translation failed.");
    }
    void recordGeminiUsage({
      model: usedModel,
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
    modelIdUsed = usedModel;
  }

  const translated = bubbles.filter((bubble) => bubble.translatedText.trim());
  if (translated.length > 0) {
    await saveTranslationPage({
      mangaId: job.mangaId,
      chapterId: job.chapterId,
      pageUrl: pageUri,
      pageKey: translationPageKey(job.chapterId, pageIndex),
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
        mask: bubble.mask,
        lineCount: bubble.lineCount,
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

function pageFilesUsable(uris: string[]): boolean {
  if (uris.length === 0) return false;
  return uris.every((uri) => {
    try {
      const file = new File(uri);
      return file.exists && file.size > 0;
    } catch {
      return false;
    }
  });
}

/**
 * Reopens download-owned files or creates a temporary archive extraction when
 * persisted job page URIs are stale after a process restart.
 */
async function refreshJobPageSession(
  job: PretranslateJob,
): Promise<DownloadedPageSession> {
  if (pageFilesUsable(job.pageUris)) {
    return {
      pages: job.pageUris,
      cleanup: () => cleanupDownloadedPageSession(job.pageUris),
    };
  }
  console.log("[translation][queue] opening downloaded page session", {
    id: job.id,
    chapterId: job.chapterId,
  });
  return openDownloadedPageSessionForChapter(job.chapterId);
}

async function runJob(job: PretranslateJob, lockKey: string): Promise<void> {
  void lockKey;
  let pageSession: DownloadedPageSession;
  try {
    pageSession = await refreshJobPageSession(job);
  } catch (error) {
    console.warn("[translation][queue] downloaded pages unavailable", {
      id: job.id,
      chapterId: job.chapterId,
      error,
    });
    job.status = "failed";
    job.error =
      "The downloaded chapter pages are no longer available. Download the chapter again.";
    job.currentPage = null;
    job.finishedAt = Date.now();
    publish();
    return;
  }
  if (pageSession.pages.length === 0) {
    await pageSession.cleanup();
    job.status = "failed";
    job.error =
      "The downloaded chapter pages are no longer available. Download the chapter again.";
    job.currentPage = null;
    job.finishedAt = Date.now();
    publish();
    return;
  }
  const resumeIndex = Math.round(job.nextPageIndex ?? 0);
  job.pageUris = pageSession.pages;
  job.nextPageIndex = Math.min(Math.max(0, resumeIndex), pageSession.pages.length);
  job.status = "running";
  job.startedAt = Date.now();
  job.error = null;
  publish();
  console.log("[translation][queue] job started", {
    id: job.id,
    pages: job.pageUris.length,
  });
  const history: HistoryPage[] = [];
  const totalPages = job.pageUris.length;
  const startIndex = Math.min(
    totalPages,
    Math.max(0, Math.round(job.nextPageIndex ?? 0)),
  );

  // Resume with the same AI context the job had before it was paused. Only
  // the context window is read back; earlier pages are not re-counted.
  if (job.engine === "ai" && startIndex > 0) {
    const contextPages = Math.min(job.aiMaxContextPages, startIndex);
    const firstContext = startIndex - contextPages;
    for (let index = firstContext; index < startIndex; index += 1) {
      const cached = await findTranslationPage({
        mangaId: job.mangaId,
        pageUrl: job.pageUris[index],
        pageKey: translationPageKey(job.chapterId, index),
        sourceLanguage: job.sourceLanguage,
        targetLanguage: job.targetLanguage,
        chapterId: job.chapterId,
        legacyPageIndex: index,
      }).catch(() => null);
      if (!cached) continue;
      history.push({
        pageIndex: index,
        bubbles: cached.regions.map((region) => ({
          id: region.regionId,
          text: region.sourceText,
        })),
      });
    }
    console.log("[translation][queue] context restored", {
      id: job.id,
      from: firstContext,
      pages: history.length,
      startIndex,
    });
  }
  try {
    for (let index = startIndex; index < totalPages; index += 1) {
      if (cancelRequested.has(job.id) || paused) break;
      const pageUri = job.pageUris[index];
      job.currentPage = index + 1;
      publish();
      const cached = await findTranslationPage({
        mangaId: job.mangaId,
        pageUrl: pageUri,
        pageKey: translationPageKey(job.chapterId, index),
        sourceLanguage: job.sourceLanguage,
        targetLanguage: job.targetLanguage,
        chapterId: job.chapterId,
        legacyPageIndex: index,
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
        job.nextPageIndex = index + 1;
        publish();
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
      job.nextPageIndex = index + 1;
      publish();
      void notifyTranslationProgress(job, index + 1, totalPages);
    }
  } finally {
    await pageSession.cleanup();
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
