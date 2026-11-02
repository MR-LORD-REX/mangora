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

import type {
  DownloadPageSession,
  DownloadSessionPort,
  TranslationNotificationCommandPort,
  TranslationNotificationPort,
} from "@shared/contracts";
import type { TranslationEngine } from "@shared/contracts/translationEngine";
import { isAiTranslationEngine } from "@shared/contracts/translationEngine";
import {
  DEFAULT_REGION_DETECTOR_ID,
  isRegionDetectorId,
  type RegionDetectorId,
} from "@shared/contracts/regionDetector";
import { getSettings, updateSettings, type AppSettings } from "@core/settings";
import { translateFreeBatch } from "../engines/google/googleClient";
import {
  assignItemsToSlots,
  buildTranslationSlots,
  fillSlotTexts,
  ocrRegionsForSlots,
} from "../pipeline/translationRegions";
import { withTranslationComputePermit } from "./translationComputeCoordinator";
import {
  clampOcrBubbleWorkers,
  detectPageRegions,
  getLocalOcrModel,
  getRegionDetector,
  isRegionModelDownloaded,
  isModelDownloaded,
  modelIdForLanguage,
  preparePaddleRegions,
  recognizePageRegions,
} from "@features/vision";
import {
  findTranslationPage,
  pruneTranslationCache,
  saveTranslationPage,
  translationPageKey,
} from "@core/db/repositories/translationRepository";
import { isCjkLanguageCode } from "../domain/languages";
import { selectPreviousContextPages } from "../pipeline/contextPages";
import { runAiTranslationBatch } from "../pipeline/aiBatch";
import { cacheVersionForJob, settingsForJob } from "./jobCacheIdentity";
import { cancelJobs, pauseJobs, resumeJobs, type ControlledJobStatus } from "./jobControl";

const MAX_CROPS_PER_PAGE = 24;
const STORE_FILE = "trapp-translation-jobs.json";

/** Consecutive failed model switches across queued pages. */
let autoSwitchFailures = 0;
interface PretranslateQueuePorts {
  downloads: DownloadSessionPort;
  notifications: TranslationNotificationPort;
  notificationCommands: TranslationNotificationCommandPort;
}

let ports: PretranslateQueuePorts | null = null;

function requirePorts(): PretranslateQueuePorts {
  if (!ports) {
    throw new Error("Translation queue was used before initialization.");
  }
  return ports;
}

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

export type PretranslateStatus = ControlledJobStatus;

export interface PretranslateJob {
  id: string;
  mangaId: string;
  chapterId: string;
  mangaTitle: string;
  chapterTitle: string;
  pageUris: string[];
  engine: TranslationEngine;
  sourceLanguage: string;
  targetLanguage: string;
  translationModelId: string;
  /** Provider identity is frozen; the current API key may still be rotated. */
  translationBaseUrl?: string;
  translationModels?: string[];
  regionDetectorId: RegionDetectorId;
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
let initializationGate: Promise<void> | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
const cancelRequested = new Set<string>();
class JobInterrupted extends Error {}

function assertJobRunnable(job: PretranslateJob): void {
  if (cancelRequested.has(job.id) || job.status === "cancelling" || paused) {
    throw new JobInterrupted("Translation job interrupted.");
  }
}
const listeners = new Set<(snapshot: PretranslateSnapshot) => void>();
let cachedSnapshot: PretranslateSnapshot = {
  jobs: [],
  runningCount: 0,
  pendingCount: 0,
  paused: false,
};

function snapshot(): PretranslateSnapshot {
  return {
    jobs: jobs.map((job) => ({ ...job })),
    runningCount: jobs.filter((job) => job.status === "running" || job.status === "cancelling").length,
    pendingCount: jobs.filter(
      (job) => job.status === "queued" || job.status === "paused",
    ).length,
    paused,
  };
}

function publish(): void {
  cachedSnapshot = snapshot();
  listeners.forEach((listener) => listener(cachedSnapshot));
  scheduleSave();
  const notificationJob = jobs.find((job) => job.id === activeJobId) ??
    jobs.find((job) => job.status === "paused");
  if (ports && notificationJob && notificationJob.status !== "completed" &&
      notificationJob.status !== "failed") {
    void ports.notifications.show({
      jobId: notificationJob.id,
      chapterTitle: notificationJob.chapterTitle,
      mangaTitle: notificationJob.mangaTitle,
      status: notificationJob.status === "cancelling" ? "cancelling" :
        notificationJob.status === "paused" ? "paused" : "running",
      pagesFailed: notificationJob.pagesFailed,
      current: Math.min(notificationJob.pageUris.length,
        notificationJob.currentPage ?? notificationJob.nextPageIndex),
      total: notificationJob.pageUris.length,
    }).catch(() => {});
  } else if (ports) {
    void ports.notifications.clear().catch(() => {});
  }
}

function persistNow(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  try {
    storeFile().write(JSON.stringify(jobs.filter((job) => job.status !== "completed"), null, 2));
  } catch (error) {
    console.warn("[translation][queue] persist failed", error);
  }
}

export function subscribePretranslate(
  listener: (snapshot: PretranslateSnapshot) => void,
): () => void {
  listeners.add(listener);
  listener(cachedSnapshot);
  return () => {
    listeners.delete(listener);
  };
}

export function getPretranslateSnapshot(): PretranslateSnapshot {
  return cachedSnapshot;
}

function storeFile(): File {
  return new File(Paths.document, STORE_FILE);
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    persistNow();
  }, 400);
}

async function loadPersisted(): Promise<void> {
  try {
    const currentSettings = await getSettings().catch(() => null);
    const file = storeFile();
    if (!file.exists) return;
    const parsed = JSON.parse(await file.text()) as PretranslateJob[];
    if (!Array.isArray(parsed)) return;
    jobs = parsed.filter((job) => job.status !== "cancelling" && job.status !== "completed").map((job) => {
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
      const legacyEngine = job.engine as string;
      const engine: TranslationEngine =
        legacyEngine === "ai" || legacyEngine === "custom"
          ? "openai"
          : legacyEngine === "openai"
            ? "openai"
            : "free";
      const translationModelId =
        typeof job.translationModelId === "string" && job.translationModelId
          ? job.translationModelId
          : (currentSettings?.translationModelId ?? "");
      const regionDetectorId = isRegionDetectorId(job.regionDetectorId)
        ? job.regionDetectorId
        : (currentSettings?.regionDetectorId ?? DEFAULT_REGION_DETECTOR_ID);
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
        engine,
        translationModelId,
        translationBaseUrl: job.translationBaseUrl ?? currentSettings?.translationBaseUrl,
        translationModels: job.translationModels ?? currentSettings?.translationModels,
        regionDetectorId,
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
    paused = jobs.some((job) => job.status === "paused");
    console.log("[translation][queue] restored jobs", { count: jobs.length });
  } catch (error) {
    console.warn("[translation][queue] restore failed", error);
  }
}

export type PretranslateQueueDependencies = PretranslateQueuePorts;

export async function initPretranslateQueue(
  dependencies: PretranslateQueueDependencies,
): Promise<void> {
  if (initialised) return initializationGate ?? Promise.resolve();
  let resolveInitialization!: () => void;
  initializationGate = new Promise<void>((resolve) => { resolveInitialization = resolve; });
  initialised = true;
  ports = dependencies;
  try {
    await loadPersisted();
    dependencies.notificationCommands.registerHandler("pause", (jobId) => {
      if (jobs.some((job) => job.id === jobId &&
          (job.status === "running" || job.status === "paused"))) {
        pauseTranslationQueue();
      }
    });
    dependencies.notificationCommands.registerHandler("resume", (jobId) => {
      if (jobs.some((job) => job.id === jobId && job.status === "paused")) {
        resumeTranslationQueue();
      }
    });
    dependencies.notificationCommands.registerHandler("cancel", (jobId) => {
      if (jobs.some((job) => job.id === jobId &&
          (job.status === "running" || job.status === "paused"))) {
        removePretranslateJob(jobId);
      }
    });
    publish();
    AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") {
        if (pausedByBackground) {
          pausedByBackground = false;
          paused = false;
          resumeJobs(jobs, activeJobId);
          console.log("[translation][queue] resumed after foreground return");
          publish();
          pump();
        }
        return;
      }
      if (activeJobId && !paused) {
        pausedByBackground = true;
        paused = true;
        pauseJobs(jobs);
        console.log("[translation][queue] paused - app backgrounded");
        publish();
        persistNow();
      }
    });
    pump();
    console.log("[translation][queue] initialised");
  } finally {
    resolveInitialization();
    initializationGate = null;
  }
}

function settingsSnapshot(settings: AppSettings) {
  return {
    engine: settings.readerTranslationEngine,
    sourceLanguage: settings.readerLanguage || "ja",
    targetLanguage: settings.readerTargetLanguage || "en",
    translationModelId: settings.translationModelId,
    regionDetectorId: settings.regionDetectorId,
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
  engine?: TranslationEngine;
  settings?: AppSettings;
}): Promise<{ ok: boolean; job?: PretranslateJob; reason?: string }> {
  if (!initialised) {
    return { ok: false, reason: "The translation queue is starting. Try again in a moment." };
  }
  if (initializationGate) await initializationGate;
  const existing = jobs.find(
    (job) =>
      job.chapterId === input.chapterId &&
      (job.status === "queued" ||
        job.status === "running" ||
        job.status === "paused" ||
        job.status === "cancelling"),
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
    translationModelId: snap.translationModelId,
    translationBaseUrl: settings.translationBaseUrl,
    translationModels: [...settings.translationModels],
    regionDetectorId: snap.regionDetectorId,
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
  if (AppState.currentState === "background" || AppState.currentState === "inactive") {
    paused = true;
    pausedByBackground = true;
    pauseJobs(jobs);
    publish();
    persistNow();
    return;
  }
  activeJobId = next.id;
  next.status = "running";
  next.startedAt ??= Date.now();
  next.error = null;
  publish();
  void runJob(next).catch((error) => {
    console.error("[translation][queue] unexpected job failure", error);
    next.status = "failed";
    next.error = error instanceof Error ? error.message : String(error);
    next.finishedAt = Date.now();
  }).finally(() => {
    activeJobId = null;
    if (!jobs.some((job) => job.status === "queued" || job.status === "paused" || job.status === "running" || job.status === "cancelling")) {
      paused = false;
      pausedByBackground = false;
    }
    publish();
    persistNow();
    if (!paused) pump();
    if (!activeJobId && (next.status === "completed" || next.status === "failed") &&
        !jobs.some((job) => job.status === "queued" || job.status === "paused" ||
          job.status === "running" || job.status === "cancelling")) {
      void requirePorts().notifications.finish({
        jobId: next.id,
        chapterTitle: next.chapterTitle,
        mangaTitle: next.mangaTitle,
        status: next.status,
        pagesDone: next.pagesDone,
        pagesFailed: next.pagesFailed,
        total: next.pageUris.length,
      }).catch(() => {});
    }
  });
}

async function translatePage(
  job: PretranslateJob,
  pageUri: string,
  pageIndex: number,
  history: HistoryPage[],
): Promise<{ bubbles: number; history: HistoryPage } | null> {
  const detector = getRegionDetector(job.regionDetectorId);
  if (!(await isRegionModelDownloaded(job.regionDetectorId))) {
    throw new Error(
      detector.label +
        " is not downloaded. Open Settings > Models and download it.",
    );
  }
  const modelId = modelIdForLanguage(job.sourceLanguage);
  if (!(await isModelDownloaded(modelId))) {
    const model = getLocalOcrModel(modelId);
    throw new Error(
      `${model?.label ?? modelId} is not downloaded. Open Settings > Models.`,
    );
  }

  const { detection, bubbles } = await withTranslationComputePermit("background", async () => {
    assertJobRunnable(job);
    const detection = await detectPageRegions(pageUri, {
      detectorId: job.regionDetectorId,
    });
    assertJobRunnable(job);
    const slots = buildTranslationSlots(detection).filter(
      (slot) =>
        slot.pasteBox.x2 > slot.pasteBox.x1 &&
        slot.pasteBox.y2 > slot.pasteBox.y1,
    );
    const regions = preparePaddleRegions(
      ocrRegionsForSlots(slots),
      MAX_CROPS_PER_PAGE,
    );
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
    assertJobRunnable(job);
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
    return { detection, bubbles };
  });

  assertJobRunnable(job);
  const settings = settingsForJob(job, await getSettings());
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
    assertJobRunnable(job);
    const byRegion = new Map<number, string>();
    for (const item of response.results) {
      if (item.label === "page_0") byRegion.set(item.regionId, item.text);
    }
    for (const bubble of bubbles) {
      bubble.translatedText = byRegion.get(bubble.id)?.trim() ?? "";
    }
    modelIdUsed = "free-google";
  } else {
    const recent = selectPreviousContextPages(
      history.map((item) => ({ pageIndex: item.pageIndex, value: item })),
      pageIndex,
      job.aiMaxContextPages,
    ).map((entry) => entry.value);
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
    const outcome = await runAiTranslationBatch({
      settings,
      engine: job.engine,
      sourceCode: job.sourceLanguage,
      targetCode: job.targetLanguage,
      history: historyPayload,
      batch: batchPayload,
      autoSwitch: job.autoModelSwitch,
      previousFailures: autoSwitchFailures,
      onSwitch: (from, to) => {
        console.warn("[translation][queue][ai] rate limited; fallback model", {
          from,
          to,
        });
      },
    });
    assertJobRunnable(job);
    autoSwitchFailures = outcome.failures;
    if (outcome.disableAutoSwitch) disableAutoModelSwitch(job);
    if (!outcome.response) {
      throw outcome.lastError instanceof Error
        ? outcome.lastError
        : new Error(outcome.providerLabel + " translation failed.");
    }
    const byRegion = new Map<number, string>();
    for (const item of outcome.response.results) {
      if (item.label === "page_0") byRegion.set(item.regionId, item.text);
    }
    for (const bubble of bubbles) {
      bubble.translatedText = byRegion.get(bubble.id)?.trim() ?? "";
    }
    modelIdUsed = outcome.usedModel;
  }

  const translated = bubbles.filter((bubble) => bubble.translatedText.trim());
  if (translated.length > 0) {
    assertJobRunnable(job);
    await saveTranslationPage({
      mangaId: job.mangaId,
      chapterId: job.chapterId,
      pageUrl: pageUri,
      pageKey: translationPageKey(job.chapterId, pageIndex),
      sourceLanguage: job.sourceLanguage,
      targetLanguage: job.targetLanguage,
      model: modelIdUsed,
      promptVersion: cacheVersionForJob(job, settings),
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
): Promise<DownloadPageSession> {
  if (pageFilesUsable(job.pageUris)) {
    return {
      pages: job.pageUris,
      cleanup: () => requirePorts().downloads.cleanupPages(job.pageUris),
    };
  }
  console.log("[translation][queue] opening downloaded page session", {
    id: job.id,
    chapterId: job.chapterId,
  });
  return requirePorts().downloads.openChapter(job.chapterId);
}

async function runJob(job: PretranslateJob): Promise<void> {
  let pageSession: DownloadPageSession | null = null;
  let fatalError: string | null = null;
  try {
    assertJobRunnable(job);
    pageSession = await refreshJobPageSession(job);
    assertJobRunnable(job);
    if (pageSession.pages.length === 0) {
      throw new Error("The downloaded chapter pages are no longer available. Download the chapter again.");
    }
    job.pageUris = pageSession.pages;
    job.nextPageIndex = Math.min(pageSession.pages.length,
      Math.max(0, Math.round(job.nextPageIndex ?? 0)));
    const cacheVersion = cacheVersionForJob(job, await getSettings());
    const history: HistoryPage[] = [];
    const totalPages = job.pageUris.length;
    const startIndex = job.nextPageIndex;

    if (isAiTranslationEngine(job.engine) && startIndex > 0) {
      const firstContext = Math.max(0, startIndex - job.aiMaxContextPages);
      for (let index = firstContext; index < startIndex; index += 1) {
        assertJobRunnable(job);
        const cached = await findTranslationPage({
          mangaId: job.mangaId,
          pageUrl: job.pageUris[index],
          pageKey: translationPageKey(job.chapterId, index),
          sourceLanguage: job.sourceLanguage,
          targetLanguage: job.targetLanguage,
          chapterId: job.chapterId,
          legacyPageIndex: index,
          promptVersion: cacheVersion,
        }).catch(() => null);
        assertJobRunnable(job);
        if (cached) history.push({
          pageIndex: index,
          bubbles: cached.regions.map((region) => ({ id: region.regionId, text: region.sourceText })),
        });
      }
    }

    for (let index = startIndex; index < totalPages; index += 1) {
      assertJobRunnable(job);
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
        promptVersion: cacheVersion,
      }).catch(() => null);
      assertJobRunnable(job);
      if (cached) {
        history.push({
          pageIndex: index,
          bubbles: cached.regions.map((region) => ({ id: region.regionId, text: region.sourceText })),
        });
        job.pagesDone += 1;
      } else {
        try {
          const result = await translatePage(job, pageUri, index, history);
          assertJobRunnable(job);
          if (result) history.push(result.history);
          job.pagesDone += 1;
        } catch (error) {
          if (error instanceof JobInterrupted) throw error;
          job.pagesFailed += 1;
          console.warn("[translation][queue] page skipped", { id: job.id, page: index + 1, error });
        }
      }
      job.nextPageIndex = index + 1;
      publish();
    }
  } catch (error) {
    if (!(error instanceof JobInterrupted)) {
      fatalError = error instanceof Error ? error.message : String(error);
      console.warn("[translation][queue] job failed", { id: job.id, error });
    }
  } finally {
    if (pageSession) {
      try {
        await pageSession.cleanup();
      } catch (error) {
        console.warn("[translation][queue] page session cleanup failed", { id: job.id, error });
      }
    }
    job.currentPage = null;
    if (cancelRequested.delete(job.id) || job.status === "cancelling") {
      jobs = jobs.filter((item) => item.id !== job.id);
      console.log("[translation][queue] job cancelled", { id: job.id });
    } else if (fatalError) {
      job.status = "failed";
      job.error = fatalError;
      job.finishedAt = Date.now();
    } else if (paused) {
      job.status = "paused";
    } else {
      job.status = job.pagesDone > 0 ? "completed" : "failed";
      job.error = job.status === "failed" ? "No pages could be translated." : null;
      job.finishedAt = Date.now();
    }
    publish();
    persistNow();
  }
}

export function pauseTranslationQueue(): void {
  paused = true;
  pausedByBackground = false;
  pauseJobs(jobs);
  console.log("[translation][queue] paused by user");
  publish();
  persistNow();
}

export function resumeTranslationQueue(): void {
  if (AppState.currentState === "background" || AppState.currentState === "inactive") {
    paused = true;
    pausedByBackground = true;
    publish();
    persistNow();
    return;
  }
  paused = false;
  pausedByBackground = false;
  resumeJobs(jobs, activeJobId);
  console.log("[translation][queue] resumed by user");
  publish();
  persistNow();
  pump();
}

export function cancelTranslationQueue(): number {
  const outcome = cancelJobs(jobs, activeJobId, cancelRequested);
  jobs = outcome.remaining;
  if (!activeJobId) {
    paused = false;
    pausedByBackground = false;
  }
  console.log("[translation][queue] cancelled", { count: outcome.count });
  publish();
  persistNow();
  return outcome.count;
}

export function removePretranslateJob(id: string): void {
  const job = jobs.find((item) => item.id === id);
  if (job && id === activeJobId) {
    cancelRequested.add(id);
    job.status = "cancelling";
  } else {
    jobs = jobs.filter((item) => item.id !== id);
  }
  publish();
  persistNow();
}
