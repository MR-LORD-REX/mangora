/**
 * useReaderTranslation.ts
 * ---------------------------------------------------------------------------
 * Queue-based reader translation pipeline.
 *
 * Three independent work queues:
 *   page scan (YOLO)  -> pushes bubbles into
 *   bubble OCR        -> pushes ready bubbles/pages into
 *   translation       -> free (per-bubble) or AI (per-page, two models)
 *
 * OCR output lives in a RAM store keyed by page URL, with each page keeping
 * its page index and a bubble map: { text, sourceLanguage, targetLanguage,
 * location }. Translation writes back into the same records, so bubbles can
 * finish out of order without losing their page/bubble identity.
 * ---------------------------------------------------------------------------
 */
import { useEffect, useRef, useState } from "react";

import { languageLabel } from "@/components/reader/readerLanguages";
import {
  deleteTranslationPage,
  findTranslationPage,
  pruneTranslationCache,
  saveTranslationPage,
} from "@/services/db/repositories/translationRepository";
import {
  isModelDownloaded,
  recognizePageRegions,
  releaseLocalOcrEngines,
} from "@/services/ocr/localOcr";
import {
  clampOcrBubbleWorkers,
  getLocalOcrModel,
  modelIdForLanguage,
  ocrEngineConcurrency,
} from "@/services/ocr/ocrModels";
import {
  preparePaddleRegions,
  type OcrRegion,
  type OcrTextItem,
} from "@/services/ocr/pageOcr";
import { detectPageRegions } from "@/services/detection/pageDetector";
import type {
  ReaderTranslationEngine,
  ReaderTranslationMode,
} from "@/services/settings/settingsStore";
import { GEMINI_DEFAULT_MODEL } from "@/services/translation/geminiModels";
import type { GeminiModelId } from "@/services/translation/geminiModels";
import {
  GeminiApiError,
  translateGeminiBatch,
} from "@/services/translation/geminiTranslator";
import {
  recordGeminiUsage,
  waitForRpmCapacity,
} from "@/services/translation/geminiUsage";
import { translateFreeBatch } from "@/services/translation/freeGoogleTranslator";
import {
  fallbackModelChain,
  nextAutoSwitchFailureState,
  requestWithModelFallback,
} from "@/services/translation/modelFallback";
import {
  assignItemsToSlots,
  buildTranslationSlots,
  fillSlotTexts,
} from "@/services/translation/regionText";
import type {
  Box,
  BubbleMask,
  PageTranslationState,
  TranslationRegionState,
  TranslationSlot,
} from "@/services/translation/translation.types";
import {
  isCjkLanguageCode,
  isSameEngineLanguage,
} from "@/services/translation/translationLang";
import { WorkQueue, type WorkQueueMetrics } from "@/services/translation/workQueue";
import {
  getTranslationLockOwner,
  releaseTranslationLock,
  tryAcquireTranslationLock,
} from "@/services/translation/translationRuntimeLock";
import type { DetectionResult } from "@/services/yolo/yolo.types";
import { imageHeadersForPage } from "@/utils/reader/imageHeaders";
import type { ReaderIdentity } from "@/utils/reader/readerIdentity";

const MAX_CROPS_PER_PAGE = 24;

/** True when a YOLO OCR region can contribute text to a translation slot. */
function regionTouchesSlot(region: OcrRegion, box: Box): boolean {
  const cx = (region.x1 + region.x2) / 2;
  const cy = (region.y1 + region.y2) / 2;
  const padX = (box.x2 - box.x1) * 0.08;
  const padY = (box.y2 - box.y1) * 0.08;
  if (
    cx >= box.x1 - padX &&
    cx <= box.x2 + padX &&
    cy >= box.y1 - padY &&
    cy <= box.y2 + padY
  ) {
    return true;
  }
  const width = Math.min(region.x2, box.x2) - Math.max(region.x1, box.x1);
  const height = Math.min(region.y2, box.y2) - Math.max(region.y1, box.y1);
  if (width <= 0 || height <= 0) return false;
  const regionArea = (region.x2 - region.x1) * (region.y2 - region.y1);
  return regionArea > 0 && (width * height) / regionArea >= 0.5;
}


interface OcrBubbleRecord {
  id: number;
  pageIndex: number;
  url: string;
  pageNumber: number;
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
  kind: "bubble" | "messy";
  pasteBox: Box;
  eraseBoxes: Box[];
  mask?: BubbleMask;
  lineCount?: number;
  confidence: number;
  status: "ready" | "translating" | "translated" | "error";
  translatedText: string | null;
}

interface OcrPageRecord {
  url: string;
  pageIndex: number;
  chapterId: string;
  seq: number;
  imageWidth: number;
  imageHeight: number;
  slots: TranslationSlot[];
  /** OCR regions for this page, indexed by `pendingRegions`. */
  regions: OcrRegion[];
  bubbles: Map<number, OcrBubbleRecord>;
  items: OcrTextItem[];
  regionsTotal: number;
  regionsDone: number;
  regionsFailed: number;
  /**
   * False until every OCR region of the page has finished. Auto mode waits for
   * the full pass before the page enters the translation queue.
   */
  ocrComplete: boolean;
  /** Region indexes still running; used for per-slot readiness. */
  pendingRegions: Set<number>;
  /** slot id -> region indexes whose text can land in that slot. */
  slotRegions: Map<number, number[]>;
  status: "scan" | "ocr" | "translate" | "done" | "error";
  modelId: string | null;
}

interface ScanTask {
  url: string;
  pageIndex: number;
  generation: number;
}

interface OcrTask {
  url: string;
  pageIndex: number;
  /** Index of this region inside the page's OCR region list. */
  regionIndex: number;
  region: OcrRegion;
  /** Additional regions bundled into one CTC forward pass. */
  regionBatch?: { regionIndex: number; region: OcrRegion }[];
  detection: DetectionResult;
  generation: number;
}

interface PageTranslationTask {
  url: string;
  pageIndex: number;
  generation: number;
}

interface PipelineConfig {
  engine: ReaderTranslationEngine;
  translationMode: ReaderTranslationMode;
  sourceLanguage: string;
  targetLanguage: string;
  geminiApiKey: string;
  geminiModelId: GeminiModelId;
  aiMaxContextPages: number;
  autoModelSwitch: boolean;
}

export interface ReaderPipelineMetrics {
  scanPending: number;
  scanActive: number;
  ocrPending: number;
  ocrActive: number;
  trPending: number;
  trActive: number;
  pagesQueued: number;
  pagesScanning: number;
  pagesOcr: number;
  pagesTranslating: number;
  pagesTotal: number;
  pagesDone: number;
  pagesError: number;
  bubblesTotal: number;
  bubblesTranslated: number;
  bubblesFailed: number;
  activeJobs: number;
}

const EMPTY_METRICS: ReaderPipelineMetrics = {
  scanPending: 0,
  scanActive: 0,
  ocrPending: 0,
  ocrActive: 0,
  trPending: 0,
  trActive: 0,
  pagesQueued: 0,
  pagesScanning: 0,
  pagesOcr: 0,
  pagesTranslating: 0,
  pagesTotal: 0,
  pagesDone: 0,
  pagesError: 0,
  bubblesTotal: 0,
  bubblesTranslated: 0,
  bubblesFailed: 0,
  activeJobs: 0,
};

export interface UseReaderTranslationOptions {
  source: string;
  providerLanguage: string;
  ocrLanguage: string;
  readerLanguageOverride: string;
  pages: string[];
  currentPageIndex: number;
  identity: ReaderIdentity;
  translationEngine: ReaderTranslationEngine;
  translationMode: ReaderTranslationMode;
  targetLanguage: string;
  geminiApiKey: string;
  geminiModelId: GeminiModelId;
  ocrBubbleWorkers: number;
  ocrLookahead: number;
  aiMaxContextPages: number;
  autoModelSwitch: boolean;
  onAutoModelSwitchDisabled: () => void;
  onTranslationSetupRequired: () => void;
}

export interface ReaderTranslationController {
  translationPages: Record<string, PageTranslationState>;
  pipelineError: string | null;
  setPipelineError: (message: string | null) => void;
  autoTranslation: boolean;
  translationActive: boolean;
  singlePageBusy: boolean;
  singlePageIndex: number | null;
  activeTranslationJobs: number;
  metrics: ReaderPipelineMetrics;
  resetTranslationPipeline: () => void;
  stopTranslationRun: () => void;
  toggleAutoTranslation: () => void;
  translateSinglePage: (url: string) => void;
  retryPage: (url: string) => void;
  clearRamCache: () => void;
}
export function useReaderTranslation({
  source,
  providerLanguage,
  ocrLanguage,
  readerLanguageOverride,
  pages,
  currentPageIndex,
  identity,
  translationEngine,
  translationMode,
  targetLanguage,
  geminiApiKey,
  geminiModelId,
  ocrBubbleWorkers,
  ocrLookahead,
  aiMaxContextPages,
  autoModelSwitch,
  onAutoModelSwitchDisabled,
  onTranslationSetupRequired,
}: UseReaderTranslationOptions): ReaderTranslationController {
  const ocrModelId = modelIdForLanguage(ocrLanguage);
  const effectiveOcrBubbleWorkers = clampOcrBubbleWorkers(
    ocrModelId,
    ocrBubbleWorkers,
  );
  const ocrQueueConcurrency = ocrEngineConcurrency(
    ocrModelId,
    effectiveOcrBubbleWorkers,
  );

  const [translationPages, setTranslationPages] = useState<
    Record<string, PageTranslationState>
  >({});
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [autoTranslation, setAutoTranslation] = useState(false);
  const [singlePageBusy, setSinglePageBusy] = useState(false);
  const [singlePageIndex, setSinglePageIndex] = useState<number | null>(null);
  const [metrics, setMetrics] = useState<ReaderPipelineMetrics>(EMPTY_METRICS);

  const pagesStateRef = useRef<Record<string, PageTranslationState>>({});
  const pagesRef = useRef(pages);
  const generationRef = useRef(0);
  const autoRef = useRef(false);
  const singleRef = useRef(false);
  const singlePageIndexRef = useRef<number | null>(null);
  const singleLockKeyRef = useRef('reader-single:' + identity.chapterId);
  const autoLockKeyRef = useRef('reader-auto:' + identity.chapterId);
  const currentPageIndexRef = useRef(currentPageIndex);
  const detectionRef = useRef(new Map<string, DetectionResult>());
  const ocrStoreRef = useRef(new Map<string, OcrPageRecord>());
  const ocrSeqRef = useRef(0);
  /** Consecutive failed auto-switch attempts; two in a row disable switching. */
  const autoSwitchFailuresRef = useRef(0);
  const ramMangaRef = useRef<string | null>(null);
  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueMetricsRef = useRef<Record<string, WorkQueueMetrics>>({});
  const metricsRef = useRef<ReaderPipelineMetrics>(EMPTY_METRICS);
  const workersRef = useRef<{
    scan: (task: ScanTask, slot: number) => Promise<void>;
    ocr: (task: OcrTask, slot: number) => Promise<void>;
    free: (task: PageTranslationTask, slot: number) => Promise<void>;
    ai: (task: PageTranslationTask, slot: number) => Promise<void>;
  }>({
    scan: async () => {},
    ocr: async () => {},
    free: async () => {},
    ai: async () => {},
  });
  const queuesRef = useRef<{
    scan: WorkQueue<ScanTask>;
    ocr: WorkQueue<OcrTask>;
    free: WorkQueue<PageTranslationTask>;
    ai: WorkQueue<PageTranslationTask>;
  } | null>(null);

  pagesRef.current = pages;
  currentPageIndexRef.current = currentPageIndex;
  autoRef.current = autoTranslation;

  const configRef = useRef<PipelineConfig>({
    engine: translationEngine,
    translationMode,
    sourceLanguage: ocrLanguage,
    targetLanguage: targetLanguage || "en",
    geminiApiKey,
    geminiModelId,
    aiMaxContextPages,
    autoModelSwitch,
  });
  configRef.current = {
    engine: translationEngine,
    translationMode,
    sourceLanguage: ocrLanguage,
    targetLanguage: targetLanguage || "en",
    geminiApiKey,
    geminiModelId,
    aiMaxContextPages,
    autoModelSwitch,
  };

  const isCurrentRun = (generation: number) =>
    generation === generationRef.current &&
    (autoRef.current || singleRef.current);

  const pageDefaults = (url: string): PageTranslationState => ({
    url,
    imageWidth: 0,
    imageHeight: 0,
    mode: configRef.current.engine,
    busy: false,
    visible: false,
    stage: "queued",
    message: null,
    regions: [],
  });

  const publishMetrics = () => {
    const state = pagesStateRef.current;
    const pageList = Object.values(state);
    const ocrPages = [...ocrStoreRef.current.values()];
    let bubblesTotal = 0;
    let bubblesTranslated = 0;
    let bubblesFailed = 0;
    for (const page of ocrPages) {
      for (const bubble of page.bubbles.values()) {
        bubblesTotal += 1;
        if (bubble.status === "translated") bubblesTranslated += 1;
        if (bubble.status === "error") bubblesFailed += 1;
      }
    }
    const q = queueMetricsRef.current;
    const next: ReaderPipelineMetrics = {
      scanPending: q["page-scan"]?.pending ?? 0,
      scanActive: q["page-scan"]?.active ?? 0,
      ocrPending: q["bubble-ocr"]?.pending ?? 0,
      ocrActive: q["bubble-ocr"]?.active ?? 0,
      trPending: (q["free-tr"]?.pending ?? 0) + (q["ai-tr"]?.pending ?? 0),
      trActive: (q["free-tr"]?.active ?? 0) + (q["ai-tr"]?.active ?? 0),
      pagesQueued: pageList.filter((page) => page.stage === "queued").length,
      pagesScanning: pageList.filter((page) => page.stage === "detect").length,
      pagesOcr: pageList.filter((page) => page.stage === "ocr").length,
      pagesTranslating: pageList.filter((page) => page.stage === "translate")
        .length,
      pagesTotal: pageList.length,
      pagesDone: pageList.filter((page) => page.stage === "done").length,
      pagesError: pageList.filter((page) => page.stage === "error").length,
      bubblesTotal,
      bubblesTranslated,
      bubblesFailed,
      activeJobs: 0,
    };
    next.activeJobs = next.scanActive + next.ocrActive + next.trActive;
    metricsRef.current = next;
    setMetrics(next);
  };

  const onQueueChange = (next: WorkQueueMetrics) => {
    queueMetricsRef.current[next.name] = next;
    publishMetrics();
  };

  const updatePage = (url: string, patch: Partial<PageTranslationState>) => {
    const previous = pagesStateRef.current;
    const base = previous[url] ?? pageDefaults(url);
    const next: PageTranslationState = { ...base, ...patch, url };
    pagesStateRef.current = { ...previous, [url]: next };
    setTranslationPages(pagesStateRef.current);
    publishMetrics();
  };

  const showTranslationError = (message: string) => {
    console.log("[reader][tr] error toast", message);
    setPipelineError(message);
    if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
    errorTimeoutRef.current = setTimeout(() => {
      setPipelineError(null);
      errorTimeoutRef.current = null;
    }, 3500);
  };

  const markPageError = (url: string, message: string) => {
    const page = ocrStoreRef.current.get(url);
    if (page) page.status = "error";
    updatePage(url, {
      busy: false,
      stage: "error",
      message: null,
      visible: Boolean(
        pagesStateRef.current[url]?.regions.some(
          (region) => region.status === "done",
        ),
      ),
    });
    showTranslationError(message);
    finishSinglePage(url);
  };

  const savePageRecord = async (page: OcrPageRecord) => {
    const regions = [...page.bubbles.values()]
      .filter((bubble) => bubble.status === "translated" && bubble.translatedText)
      .map((bubble) => ({
        regionId: bubble.id,
        kind: bubble.kind,
        sourceText: bubble.text,
        translatedText: bubble.translatedText,
        pasteBox: bubble.pasteBox,
        eraseBoxes: bubble.eraseBoxes,
        mask: bubble.mask,
        lineCount: bubble.lineCount,
      }));
    if (regions.length === 0) return;
    try {
      await saveTranslationPage({
        mangaId: identity.mangaId,
        chapterId: identity.chapterId,
        pageUrl: page.url,
        sourceLanguage: configRef.current.sourceLanguage,
        targetLanguage: configRef.current.targetLanguage,
        model: page.modelId,
        imageWidth: page.imageWidth,
        imageHeight: page.imageHeight,
        regions,
      });
      void pruneTranslationCache(identity.mangaId);
      console.log("[reader][tr] cache saved", {
        pageIndex: page.pageIndex,
        bubbles: regions.length,
      });
    } catch (error) {
      console.warn("[reader][tr] cache save failed", error);
    }
  };

  const restoreCachedPage = async (
    url: string,
    pageIndex: number,
    generation: number,
  ): Promise<boolean> => {
    const cached = await findTranslationPage({
      mangaId: identity.mangaId,
      pageUrl: url,
      sourceLanguage: configRef.current.sourceLanguage,
      targetLanguage: configRef.current.targetLanguage,
    }).catch((error) => {
      console.warn("[reader][tr] cache lookup failed", error);
      return null;
    });
    if (!cached || generation !== generationRef.current) return Boolean(cached);

    const slots: TranslationSlot[] = cached.regions.map((region) => ({
      id: region.regionId,
      kind: region.kind,
      pasteBox: region.pasteBox,
      eraseBoxes: region.eraseBoxes,
      mask: region.mask,
      lineCount: region.lineCount,
      sourceText: region.sourceText,
    }));
    const regions: TranslationRegionState[] = cached.regions.map((region) => ({
      id: region.regionId,
      kind: region.kind,
      pasteBox: region.pasteBox,
      eraseBoxes: region.eraseBoxes,
      mask: region.mask,
      lineCount: region.lineCount,
      sourceText: region.sourceText,
      translatedText: region.translatedText,
      status: region.translatedText ? "done" : "error",
    }));
    const bubbles = new Map<number, OcrBubbleRecord>();
    for (const region of cached.regions) {
      if (!region.sourceText.trim()) continue;
      bubbles.set(region.regionId, {
        id: region.regionId,
        pageIndex,
        url,
        pageNumber: pageIndex + 1,
        text: region.sourceText,
        sourceLanguage: configRef.current.sourceLanguage,
        targetLanguage: configRef.current.targetLanguage,
        kind: region.kind,
        pasteBox: region.pasteBox,
        eraseBoxes: region.eraseBoxes,
        mask: region.mask,
        lineCount: region.lineCount,
        confidence: 1,
        status: region.translatedText ? "translated" : "error",
        translatedText: region.translatedText,
      });
    }
    ocrStoreRef.current.set(url, {
      url,
      pageIndex,
      chapterId: identity.chapterId,
      seq: ocrSeqRef.current++,
      imageWidth: cached.imageWidth,
      imageHeight: cached.imageHeight,
      slots,
      regions: [],
      bubbles,
      items: [],
      regionsTotal: slots.length,
      regionsDone: slots.length,
      regionsFailed: 0,
      ocrComplete: true,
      pendingRegions: new Set(),
      slotRegions: new Map(),
      status: "done",
      modelId: cached.model,
    });
    updatePage(url, {
      mode: configRef.current.engine,
      imageWidth: cached.imageWidth,
      imageHeight: cached.imageHeight,
      busy: false,
      visible: true,
      stage: "done",
      message: null,
      regions,
    });
    console.log("[reader][tr] cache restored", {
      pageIndex,
      bubbles: bubbles.size,
    });
    return true;
  };
  const createBubbleRecord = (
    page: OcrPageRecord,
    slot: TranslationSlot,
  ): OcrBubbleRecord => ({
    id: slot.id,
    pageIndex: page.pageIndex,
    url: page.url,
    pageNumber: page.pageIndex + 1,
    text: slot.sourceText,
    sourceLanguage: configRef.current.sourceLanguage,
    targetLanguage: configRef.current.targetLanguage,
    kind: slot.kind,
    pasteBox: slot.pasteBox,
    eraseBoxes: slot.eraseBoxes,
    mask: slot.mask,
    lineCount: slot.lineCount,
    confidence: 1,
    status: "ready",
    translatedText: null,
  });

  const buildPageRegions = (page: OcrPageRecord): TranslationRegionState[] =>
    page.slots.map((slot) => {
      const record = page.bubbles.get(slot.id);
      if (!record) {
        return {
          ...slot,
          translatedText: null,
          status: page.ocrComplete ? "error" : "queued",
        };
      }
      return {
        ...slot,
        sourceText: record.text,
        eraseBoxes: record.eraseBoxes,
        translatedText: record.translatedText,
        status:
          record.status === "translated"
            ? "done"
            : record.status === "error"
              ? "error"
              : record.status === "translating"
                ? "processing"
                : "queued",
      };
    });

  /** Rebuilds the overlay + page status from the live bubble records. */
  const refreshPageState = (page: OcrPageRecord) => {
    const bubbles = [...page.bubbles.values()];
    const settled = bubbles.every(
      (item) => item.status === "translated" || item.status === "error",
    );
    const translated = bubbles.filter(
      (item) => item.status === "translated",
    ).length;
    const translating = bubbles.some(
      (item) => item.status === "translating",
    );
    const complete = page.ocrComplete && bubbles.length > 0 && settled;
    const alreadyComplete = page.status === "done" || page.status === "error";
    if (complete) {
      page.status = translated > 0 ? "done" : "error";
    }
    updatePage(page.url, {
      mode: configRef.current.engine,
      busy: !complete,
      stage: complete ? (translated > 0 ? "done" : "error") : "translate",
      visible: complete ? translated > 0 : true,
      message: complete
        ? null
        : translated > 0
          ? `Translating ${translated}/${bubbles.length}\u2026`
          : translating
            ? "Translating\u2026"
            : "Reading text\u2026",
      regions: buildPageRegions(page),
    });
    if (!complete || alreadyComplete) return;
    console.log("[reader][tr] page finished", {
      pageIndex: page.pageIndex,
      translated,
      failed: bubbles.length - translated,
    });
    if (translated > 0) void savePageRecord(page);
    else {
      showTranslationError(
        `Translation failed for page ${page.pageIndex + 1}. Use the retry button on the page.`,
      );
    }
    finishSinglePage(page.url);
  };

  const finishPageOcr = (page: OcrPageRecord, generation: number) => {
    if (!isCurrentRun(generation)) return;
    page.ocrComplete = true;
    page.pendingRegions.clear();
    const assigned = assignItemsToSlots(page.slots, page.items);
    const filled = fillSlotTexts(
      page.slots,
      assigned,
      isCjkLanguageCode(configRef.current.sourceLanguage),
    );
    const created: OcrBubbleRecord[] = [];
    for (const slot of filled) {
      if (!slot.sourceText.trim() || page.bubbles.has(slot.id)) continue;
      const bubble = createBubbleRecord(page, slot);
      page.bubbles.set(slot.id, bubble);
      created.push(bubble);
    }
    console.log("[reader][ocr] page ready", {
      pageIndex: page.pageIndex,
      regions: page.regionsTotal,
      bubbles: page.bubbles.size,
      created: created.length,
    });
    if (page.bubbles.size === 0) {
      markPageError(
        page.url,
        `OCR returned no usable text on page ${page.pageIndex + 1}.`,
      );
      return;
    }
    page.status = "translate";
    updatePage(page.url, {
      mode: configRef.current.engine,
      stage: "translate",
      busy: true,
      visible: true,
      message: `Translating ${page.bubbles.size} bubble${page.bubbles.size === 1 ? "" : "s"}\u2026`,
      regions: buildPageRegions(page),
    });
    const pageTask = {
      url: page.url,
      pageIndex: page.pageIndex,
      generation,
    };
    if (configRef.current.engine === "free") {
      queuesRef.current?.free.push(pageTask, page.url);
    } else if (configRef.current.engine === "ai") {
      queuesRef.current?.ai.push(pageTask, page.url);
    }
    const settled = [...page.bubbles.values()].every(
      (item) => item.status === "translated" || item.status === "error",
    );
    if (settled) refreshPageState(page);
  };
  const scanWorker = async (task: ScanTask) => {
    const { url, pageIndex, generation } = task;
    if (!isCurrentRun(generation)) return;
    console.log("[reader][scan] start", { pageIndex });
    const restored = await restoreCachedPage(url, pageIndex, generation);
    if (restored) {
      finishSinglePage(url);
      return;
    }
    // The OCR RAM cache already has this page (for example after a stopped
    // run). Reuse the YOLO/OCR result instead of scanning the page again.
    const existing = ocrStoreRef.current.get(url);
    if (existing && !existing.ocrComplete) {
      const detection = detectionRef.current.get(url);
      if (detection && existing.regions.length > 0) {
        if (existing.pendingRegions.size === 0) {
          finishPageOcr(existing, generation);
          return;
        }
        existing.status = "ocr";
        updatePage(url, {
          mode: configRef.current.engine,
          imageWidth: existing.imageWidth,
          imageHeight: existing.imageHeight,
          busy: true,
          visible: true,
          stage: "ocr",
          message: `Resuming text (${existing.pendingRegions.size} region${existing.pendingRegions.size === 1 ? "" : "s"})\u2026`,
          regions: buildPageRegions(existing),
        });
        console.log("[reader][scan] resume OCR", {
          pageIndex,
          pending: existing.pendingRegions.size,
          total: existing.regionsTotal,
        });
        const pendingIndexes = [...existing.pendingRegions].sort(
          (a, b) => a - b,
        );
        const batchSize = effectiveOcrBubbleWorkers;
        for (let offset = 0; offset < pendingIndexes.length; offset += batchSize) {
          const entries = pendingIndexes
            .slice(offset, offset + batchSize)
            .map((regionIndex) => {
              const region = existing.regions[regionIndex];
              return region ? { regionIndex, region } : null;
            })
            .filter(
              (
                entry,
              ): entry is { regionIndex: number; region: OcrRegion } =>
                entry !== null,
            );
          const first = entries[0];
          if (!first) continue;
          queuesRef.current?.ocr.push(
            {
              url,
              pageIndex,
              regionIndex: first.regionIndex,
              region: first.region,
              regionBatch: entries.length > 1 ? entries : undefined,
              detection,
              generation,
            },
            `${url}:${first.regionIndex}:${first.region.x1}:${first.region.y1}:${entries.length}`,
          );
        }
        return;
      }
    }
    if (existing && existing.ocrComplete) {
      const bubbles = [...existing.bubbles.values()];
      for (const bubble of bubbles) {
        if (bubble.status === "translating" || bubble.status === "error") {
          bubble.status = "ready";
        }
      }
      const pending = bubbles.filter(
        (bubble) => bubble.status === "ready" || bubble.status === "error",
      );
      console.log("[reader][scan] reuse OCR", {
        pageIndex,
        bubbles: bubbles.length,
        pending: pending.length,
      });
      if (pending.length === 0) {
        refreshPageState(existing);
        finishSinglePage(url);
        return;
      }
      existing.status = "translate";
      updatePage(url, {
        mode: configRef.current.engine,
        imageWidth: existing.imageWidth,
        imageHeight: existing.imageHeight,
        busy: true,
        visible: true,
        stage: "translate",
        message: `Translating ${pending.length} bubble${pending.length === 1 ? "" : "s"}\u2026`,
        regions: buildPageRegions(existing),
      });
      const pageTask = { url, pageIndex, generation };
      if (configRef.current.engine === "free") {
        queuesRef.current?.free.push(pageTask, url);
      } else {
        queuesRef.current?.ai.push(pageTask, url);
      }
      return;
    }
    if (!isCurrentRun(generation)) return;
    const modelId = modelIdForLanguage(configRef.current.sourceLanguage);
    if (!(await isModelDownloaded(modelId))) {
      if (!isCurrentRun(generation)) return;
      const label = getLocalOcrModel(modelId)?.label ?? modelId;
      console.warn("[reader][scan] OCR model missing", {
        pageIndex,
        modelId,
      });
      markPageError(
        url,
        `${label} is not downloaded. Open Settings > OCR models and download it, then retry this page.`,
      );
      return;
    }

    updatePage(url, {
      mode: configRef.current.engine,
      busy: true,
      visible: false,
      stage: "detect",
      message: "Scanning page\u2026",
      regions: [],
    });
    try {
      const detection = await detectPageRegions(url, {
        headers: imageHeadersForPage(source, url),
        extensionSourceId: source.startsWith("ext:")
          ? source.slice(4)
          : undefined,
      });
      if (!isCurrentRun(generation)) return;
      detectionRef.current.set(url, detection);
      const slots = buildTranslationSlots(detection).filter(
        (slot) =>
          slot.pasteBox.x2 > slot.pasteBox.x1 &&
          slot.pasteBox.y2 > slot.pasteBox.y1,
      );
      const regions = preparePaddleRegions(
        detection.boxes,
        MAX_CROPS_PER_PAGE,
      );
      if (regions.length === 0 || slots.length === 0) {
        markPageError(
          url,
          `No text regions found on page ${pageIndex + 1}. Use retry after rescanning.`,
        );
        return;
      }
      const slotRegions = new Map<number, number[]>();
      for (const slot of slots) {
        const indexes: number[] = [];
        regions.forEach((region, index) => {
          if (regionTouchesSlot(region, slot.pasteBox)) indexes.push(index);
        });
        slotRegions.set(slot.id, indexes);
      }
      const page: OcrPageRecord = {
        url,
        pageIndex,
        chapterId: identity.chapterId,
        seq: ocrSeqRef.current++,
        imageWidth: detection.imageWidth,
        imageHeight: detection.imageHeight,
        slots,
        regions,
        bubbles: new Map(),
        items: [],
        regionsTotal: regions.length,
        regionsDone: 0,
        regionsFailed: 0,
        ocrComplete: false,
        pendingRegions: new Set(regions.map((_, index) => index)),
        slotRegions,
        status: "ocr",
        modelId: null,
      };
      ocrStoreRef.current.set(url, page);
      updatePage(url, {
        imageWidth: detection.imageWidth,
        imageHeight: detection.imageHeight,
        stage: "ocr",
        busy: true,
        visible: true,
        message: `Reading text (${regions.length} region${regions.length === 1 ? "" : "s"})\u2026`,
        regions: slots.map((slot) => ({
          ...slot,
          translatedText: null,
          status: "queued" as const,
        })),
      });
      console.log("[reader][scan] done", {
        pageIndex,
        slots: slots.length,
        ocrRegions: regions.length,
      });
      const batchSize = effectiveOcrBubbleWorkers;
      for (let offset = 0; offset < regions.length; offset += batchSize) {
        const entries = regions
          .slice(offset, offset + batchSize)
          .map((region, index) => ({ regionIndex: offset + index, region }));
        const first = entries[0];
        if (!first) continue;
        queuesRef.current?.ocr.push(
          {
            url,
            pageIndex,
            regionIndex: first.regionIndex,
            region: first.region,
            regionBatch: entries.length > 1 ? entries : undefined,
            detection,
            generation,
          },
          `${url}:${first.regionIndex}:${first.region.x1}:${first.region.y1}:${entries.length}`,
        );
      }
    } catch (error) {
      if (!isCurrentRun(generation)) return;
      console.warn("[reader][scan] failed", { pageIndex, error });
      markPageError(
        url,
        error instanceof Error ? error.message : "Page scan failed.",
      );
    }
  };

  const ocrWorker = async (task: OcrTask) => {
    const { url, pageIndex, detection, generation } = task;
    if (!isCurrentRun(generation)) return;
    const page = ocrStoreRef.current.get(url);
    if (!page) return;
    const entries = task.regionBatch ?? [
      { regionIndex: task.regionIndex, region: task.region },
    ];
    try {
      const result = await recognizePageRegions({
        pageUrl: url,
        headers: imageHeadersForPage(source, url),
        imageWidth: detection.imageWidth,
        imageHeight: detection.imageHeight,
        regions: entries.map((entry) => entry.region),
        language: configRef.current.sourceLanguage,
        maxCrops: entries.length,
        concurrency: effectiveOcrBubbleWorkers,
      });
      if (!isCurrentRun(generation)) return;
      page.items.push(...result.items);
      page.regionsDone += entries.length;
      for (const entry of entries) {
        page.pendingRegions.delete(entry.regionIndex);
      }
      console.log("[reader][ocr] region done", {
        pageIndex,
        regions: entries.length,
        items: result.items.length,
        done: page.regionsDone,
        total: page.regionsTotal,
      });
    } catch (error) {
      if (!isCurrentRun(generation)) return;
      page.regionsFailed += entries.length;
      for (const entry of entries) {
        page.pendingRegions.delete(entry.regionIndex);
      }
      console.warn("[reader][ocr] region failed", {
        pageIndex,
        regions: entries.length,
        error,
      });
    }
    if (page.regionsDone + page.regionsFailed >= page.regionsTotal) {
      finishPageOcr(page, generation);
    }
  };

  const freeWorker = async (task: PageTranslationTask) => {
    const { url, pageIndex, generation } = task;
    if (!isCurrentRun(generation)) return;
    const page = ocrStoreRef.current.get(url);
    if (!page) return;
    const bubbles = [...page.bubbles.values()].filter(
      (bubble) => bubble.status === "ready" || bubble.status === "error",
    );
    if (bubbles.length === 0) return;
    for (const bubble of bubbles) bubble.status = "translating";
    page.status = "translate";
    refreshPageState(page);

    const batch = [
      {
        label: "page_0",
        pageIndex,
        regions: bubbles.map((bubble) => ({
          regionId: bubble.id,
          text: bubble.text,
        })),
      },
    ];
    try {
      const response = await translateFreeBatch({
        sourceCode: configRef.current.sourceLanguage,
        targetCode: configRef.current.targetLanguage,
        history: [],
        batch,
      });
      if (!isCurrentRun(generation)) return;
      if (response.results.length === 0) {
        throw new Error("Free translation returned no usable results.");
      }
      const resultByRegion = new Map<number, string>();
      for (const result of response.results) {
        if (result.label === "page_0") {
          resultByRegion.set(result.regionId, result.text);
        }
      }
      let translated = 0;
      for (const bubble of bubbles) {
        const text = resultByRegion.get(bubble.id);
        if (text && text.trim()) {
          bubble.translatedText = text;
          bubble.status = "translated";
          translated += 1;
        } else {
          bubble.status = "error";
        }
      }
      page.modelId = "free-google";
      console.log("[reader][tr][free] page response", {
        pageIndex,
        bubbles: bubbles.length,
        translated,
      });
      refreshPageState(page);
    } catch (error) {
      if (!isCurrentRun(generation)) return;
      for (const bubble of bubbles) {
        if (bubble.status === "translating") bubble.status = "error";
      }
      console.warn("[reader][tr][free] page failed", { pageIndex, error });
      refreshPageState(page);
      showTranslationError(
        error instanceof Error
          ? "Page " + (pageIndex + 1) + ": " + error.message
          : "Free translation failed for page " + (pageIndex + 1) + ".",
      );
    }
  };

  const disableAutoModelSwitch = () => {
    configRef.current.autoModelSwitch = false;
    autoSwitchFailuresRef.current = 0;
    console.warn("[reader][tr][ai] auto model switch disabled after repeated failures");
    onAutoModelSwitchDisabled();
  };

  const aiPageWorker = async (task: PageTranslationTask) => {
    const { url, pageIndex, generation } = task;
    if (!isCurrentRun(generation)) return;
    const page = ocrStoreRef.current.get(url);
    if (!page) return;
    const apiKey = configRef.current.geminiApiKey.trim();
    if (!apiKey) {
      markPageError(
        url,
        "AI translation needs a Gemini API key - set it in Settings > Translation.",
      );
      return;
    }

    const bubbles = [...page.bubbles.values()].filter(
      (bubble) => bubble.status === "ready" || bubble.status === "error",
    );
    if (bubbles.length === 0) return;
    for (const bubble of bubbles) bubble.status = "translating";
    page.status = "translate";
    refreshPageState(page);

    const maxContext = Math.min(
      50,
      Math.max(1, Math.round(configRef.current.aiMaxContextPages)),
    );
    const history = [...ocrStoreRef.current.values()]
      .filter(
        (candidate) =>
          candidate.url !== url &&
          candidate.seq < page.seq &&
          candidate.bubbles.size > 0,
      )
      .sort((a, b) => a.seq - b.seq)
      .slice(-maxContext)
      .map((candidate, index) => ({
        label: "history_" + index,
        pageIndex: candidate.pageIndex,
        regions: [...candidate.bubbles.values()]
          .filter((bubble) => bubble.text.trim())
          .map((bubble) => ({ regionId: bubble.id, text: bubble.text })),
      }));
    const batch = [
      {
        label: "page_0",
        pageIndex,
        regions: bubbles.map((bubble) => ({
          regionId: bubble.id,
          text: bubble.text,
        })),
      },
    ];

    const primary = configRef.current.geminiModelId || GEMINI_DEFAULT_MODEL;
    const models: GeminiModelId[] = fallbackModelChain(
      primary,
      configRef.current.autoModelSwitch,
    );
    console.log("[reader][tr][ai] worker start", {
      pageIndex,
      models,
      autoSwitch: configRef.current.autoModelSwitch,
    });

    const outcome = await requestWithModelFallback({
      models,
      request: async (model) => {
        await waitForRpmCapacity(model);
        return translateGeminiBatch({
          apiKey,
          model,
          sourceCode: configRef.current.sourceLanguage,
          targetCode: configRef.current.targetLanguage,
          history,
          batch,
        });
      },
      onSwitch: (from, to) => {
        console.warn("[reader][tr][ai] rate limited; trying fallback model", {
          pageIndex,
          from,
          to,
        });
      },
    });
    const response = outcome.value;
    const usedModel = outcome.usedModel;
    const lastError = outcome.lastError;
    const failureState = nextAutoSwitchFailureState(
      autoSwitchFailuresRef.current,
      outcome,
    );
    autoSwitchFailuresRef.current = failureState.failures;
    if (failureState.disable) disableAutoModelSwitch();

    if (!response) {
      if (!isCurrentRun(generation)) return;
      void recordGeminiUsage({
        model: usedModel,
        success: false,
        errorCode:
          lastError instanceof GeminiApiError
            ? String(lastError.code ?? lastError.status ?? "error")
            : "network",
      });
      for (const bubble of bubbles) {
        if (bubble.status === "translating") bubble.status = "error";
      }
      console.warn("[reader][tr][ai] page failed", {
        pageIndex,
        model: usedModel,
        error: lastError,
      });
      refreshPageState(page);
      showTranslationError(
        lastError instanceof Error
          ? "Page " + (pageIndex + 1) + ": " + lastError.message
          : "AI translation failed for page " + (pageIndex + 1) + ".",
      );
      return;
    }

    if (!isCurrentRun(generation)) return;
    void recordGeminiUsage({
      model: usedModel,
      success: true,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
    });
    if (response.results.length === 0) {
      for (const bubble of bubbles) {
        if (bubble.status === "translating") bubble.status = "error";
      }
      refreshPageState(page);
      showTranslationError(
        "Page " + (pageIndex + 1) + ": Gemini returned no usable results.",
      );
      return;
    }
    const resultByRegion = new Map<number, string>();
    for (const result of response.results) {
      if (result.label === "page_0") {
        resultByRegion.set(result.regionId, result.text);
      }
    }
    let translated = 0;
    for (const bubble of bubbles) {
      const text = resultByRegion.get(bubble.id);
      if (text && text.trim()) {
        bubble.translatedText = text;
        bubble.status = "translated";
        translated += 1;
      } else {
        bubble.status = "error";
      }
    }
    page.modelId = usedModel;
    console.log("[reader][tr][ai] page response", {
      pageIndex,
      model: usedModel,
      bubbles: bubbles.length,
      translated,
      contextPages: history.length,
    });
    refreshPageState(page);
  };

  const aiWorker = async (task: PageTranslationTask) => {
    await aiPageWorker(task);
  };

  workersRef.current = {
    scan: scanWorker,
    ocr: ocrWorker,
    free: freeWorker,
    ai: aiWorker,
  };

  if (!queuesRef.current) {
    queuesRef.current = {
      scan: new WorkQueue<ScanTask>(
        "page-scan",
        1,
        (task, slot) => workersRef.current.scan(task, slot),
        onQueueChange,
      ),
      ocr: new WorkQueue<OcrTask>(
        "bubble-ocr",
        ocrQueueConcurrency,
        (task, slot) => workersRef.current.ocr(task, slot),
        onQueueChange,
      ),
      free: new WorkQueue<PageTranslationTask>(
        "free-tr",
        1,
        (task, slot) => workersRef.current.free(task, slot),
        onQueueChange,
      ),
      ai: new WorkQueue<PageTranslationTask>(
        "ai-tr",
        1,
        (task, slot) => workersRef.current.ai(task, slot),
        onQueueChange,
      ),
    };
    console.log("[reader][tr] queues created", {
      scan: 1,
      ocr: ocrQueueConcurrency,
      free: 1,
      ai: 1,
    });
  }
  const queues = queuesRef.current;

  useEffect(() => {
    queues.ocr.setConcurrency(ocrQueueConcurrency);
  }, [ocrQueueConcurrency, queues]);

  const enqueueWindow = (generation: number) => {
    if (!autoRef.current) return;
    const windowSize = Math.min(5, Math.max(1, Math.round(ocrLookahead)));
    const start = currentPageIndexRef.current;
    for (let offset = 0; offset < windowSize; offset += 1) {
      const pageIndex = start + offset;
      const url = pagesRef.current[pageIndex];
      if (!url) continue;
      const state = pagesStateRef.current[url];
      // Any existing state means this page already entered the pipeline
      // (queued / YOLO / OCR / translation / done). Re-pushing it here used to
      // re-run YOLO on pages that were still being OCRed and flooded the
      // bubble OCR queue with duplicate crops.
      if (state) continue;
      queues.scan.push({ url, pageIndex, generation }, url);
    }
    console.log("[reader][scan] window queued", {
      start,
      size: windowSize,
      generation,
    });
  };

  useEffect(() => {
    if (!autoTranslation) return;
    enqueueWindow(generationRef.current);
    // Scheduling is intentionally driven by these inputs only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTranslation, currentPageIndex, pages, ocrLookahead]);

  const releaseRunLocks = () => {
    releaseTranslationLock(autoLockKeyRef.current);
    releaseTranslationLock(singleLockKeyRef.current);
  };

  const finishSinglePage = (url: string) => {
    if (!singleRef.current) return;
    const pageIndex = singlePageIndexRef.current;
    console.log("[reader][tr][single] page finished", {
      pageIndex,
      url,
      stage: pagesStateRef.current[url]?.stage,
    });
    singleRef.current = false;
    releaseTranslationLock(singleLockKeyRef.current);
    setSinglePageBusy(false);
  };

  const stopTranslationRun = () => {
    generationRef.current += 1;
    autoRef.current = false;
    singleRef.current = false;
    queues.scan.clearPending();
    queues.ocr.clearPending();
    queues.free.clearPending();
    queues.ai.clearPending();
    releaseRunLocks();
    setAutoTranslation(false);
    setSinglePageBusy(false);
    setSinglePageIndex(null);
    singlePageIndexRef.current = null;
    const kept = Object.fromEntries(
      Object.entries(pagesStateRef.current).filter(
        ([, page]) => page.stage === "done",
      ),
    );
    pagesStateRef.current = kept;
    setTranslationPages(kept);
    publishMetrics();
    console.log("[reader][tr] run stopped", {
      keptPages: Object.keys(kept).length,
    });
  };

  const resetTranslationPipeline = () => {
    generationRef.current += 1;
    autoRef.current = false;
    singleRef.current = false;
    queues.scan.clearPending();
    queues.ocr.clearPending();
    queues.free.clearPending();
    queues.ai.clearPending();
    releaseRunLocks();
    setSinglePageBusy(false);
    setSinglePageIndex(null);
    singlePageIndexRef.current = null;
    detectionRef.current.clear();
    pagesStateRef.current = {};
    setTranslationPages({});
    setPipelineError(null);
    setAutoTranslation(false);
    if (ramMangaRef.current !== identity.mangaId) {
      ramMangaRef.current = identity.mangaId;
      ocrStoreRef.current.clear();
      ocrSeqRef.current = 0;
      console.log("[reader][tr] RAM OCR store reset", {
        mangaId: identity.mangaId,
      });
    }
    publishMetrics();
    console.log("[reader][tr] pipeline reset", {
      chapterId: identity.chapterId,
    });
  };

  const validateRun = (): string | null => {
    if (configRef.current.translationMode === "off") {
      return "Translation mode is Off - choose Single page or Auto first.";
    }
    if (
      isSameEngineLanguage(
        configRef.current.sourceLanguage,
        configRef.current.targetLanguage,
      )
    ) {
      return `Target language (${languageLabel(
        configRef.current.targetLanguage,
      )}) matches the page language (${languageLabel(
        configRef.current.sourceLanguage,
      )}) - nothing to translate.`;
    }
    if (configRef.current.engine === "ai" && !geminiApiKey.trim()) {
      return "AI translation needs a Gemini API key - set it in Settings > Translation.";
    }
    return null;
  };

  const lockMessage = (): string => {
    const lock = getTranslationLockOwner();
    if (lock && lock.key.startsWith("pretranslate:")) {
      return "A translation job is running. Pause or cancel it in Settings > Translation queue.";
    }
    return lock ? `Translation is already running (${lock.label}).` : "";
  };

  const toggleAutoTranslation = () => {
    if (autoTranslation) {
      stopTranslationRun();
      return;
    }
    if (configRef.current.translationMode !== "auto") {
      showTranslationError(
        "Auto translation is not selected - switch Translation mode to Auto.",
      );
      onTranslationSetupRequired();
      return;
    }
    const validationError = validateRun();
    if (validationError) {
      showTranslationError(validationError);
      onTranslationSetupRequired();
      return;
    }
    if (
      !tryAcquireTranslationLock(
        autoLockKeyRef.current,
        "Reader auto translation",
      )
    ) {
      showTranslationError(lockMessage());
      return;
    }
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    autoRef.current = true;
    singleRef.current = false;
    setPipelineError(null);
    setAutoTranslation(true);
    console.log("[reader][tr] run started", {
      engine: configRef.current.engine,
      mode: configRef.current.translationMode,
      generation,
      lookahead: ocrLookahead,
    });
  };

  const translateSinglePage = (url: string) => {
    if (configRef.current.translationMode !== "single") {
      console.log("[reader][tr][single] ignored - mode is not single");
      return;
    }
    if (singleRef.current) {
      const page = (singlePageIndexRef.current ?? 0) + 1;
      showTranslationError(`Processing page ${page}.`);
      return;
    }
    const pageIndex = pagesRef.current.indexOf(url);
    if (pageIndex < 0) return;
    const validationError = validateRun();
    if (validationError) {
      showTranslationError(validationError);
      onTranslationSetupRequired();
      return;
    }
    if (
      !tryAcquireTranslationLock(
        singleLockKeyRef.current,
        `Reader page ${pageIndex + 1}`,
      )
    ) {
      showTranslationError(lockMessage());
      return;
    }
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    autoRef.current = false;
    singleRef.current = true;
    singlePageIndexRef.current = pageIndex;
    queues.scan.clearPending();
    queues.ocr.clearPending();
    queues.free.clearPending();
    queues.ai.clearPending();
    delete pagesStateRef.current[url];
    detectionRef.current.delete(url);
    ocrStoreRef.current.delete(url);
    setSinglePageBusy(true);
    setSinglePageIndex(pageIndex);
    setPipelineError(null);
    setTranslationPages({ ...pagesStateRef.current });
    queues.scan.push({ url, pageIndex, generation }, url);
    publishMetrics();
    console.log("[reader][tr][single] page queued", { pageIndex, url });
  };
  const retryPage = (url: string) => {
    const pageIndex = pagesRef.current.indexOf(url);
    if (pageIndex < 0) return;
    const stage = pagesStateRef.current[url]?.stage;
    if (stage === "detect" || stage === "ocr" || stage === "translate") {
      console.log("[reader][tr] retry ignored - page busy", {
        pageIndex,
        stage,
      });
      return;
    }
    console.log("[reader][tr] retry page", { pageIndex, stage });
    ocrStoreRef.current.delete(url);
    detectionRef.current.delete(url);
    delete pagesStateRef.current[url];
    setTranslationPages({ ...pagesStateRef.current });
    void deleteTranslationPage({
      mangaId: identity.mangaId,
      pageUrl: url,
      sourceLanguage: configRef.current.sourceLanguage,
      targetLanguage: configRef.current.targetLanguage,
    }).catch((error) => {
      console.warn("[reader][tr] retry cache delete failed", error);
    });
    if (configRef.current.translationMode === "single") {
      if (singleRef.current) {
        showTranslationError(
          `Processing page ${(singlePageIndexRef.current ?? 0) + 1}.`,
        );
        return;
      }
      if (!tryAcquireTranslationLock(
        singleLockKeyRef.current,
        `Reader page ${pageIndex + 1}`,
      )) {
        showTranslationError(lockMessage());
        return;
      }
      const generation = generationRef.current + 1;
      generationRef.current = generation;
      singleRef.current = true;
      singlePageIndexRef.current = pageIndex;
      setSinglePageBusy(true);
      setSinglePageIndex(pageIndex);
      queues.scan.push({ url, pageIndex, generation }, url);
      console.log("[reader][tr][single] retry queued", { pageIndex });
      publishMetrics();
      return;
    }
    if (!autoRef.current) return;
    queues.scan.push(
      { url, pageIndex, generation: generationRef.current },
      url,
    );
    publishMetrics();
  };

  const clearRamCache = () => {
    ocrStoreRef.current.clear();
    detectionRef.current.clear();
    ocrSeqRef.current = 0;
    pagesStateRef.current = {};
    setTranslationPages({});
    publishMetrics();
    console.log("[reader][tr] RAM cache cleared", {
      mangaId: identity.mangaId,
    });
    if (autoRef.current) enqueueWindow(generationRef.current);
  };

  useEffect(() => {
    return () => {
      if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
      queues.scan.stop();
      queues.ocr.stop();
      queues.free.stop();
      queues.ai.stop();
      releaseRunLocks();
      void releaseLocalOcrEngines();
      console.log("[reader][tr] pipeline unmounted", {
        source,
        chapterLanguage: providerLanguage,
        override: readerLanguageOverride || "auto",
      });
    };
    // Queues are stable refs; cleanup runs once per reader mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const translationActive =
    autoTranslation || singlePageBusy || singlePageIndex !== null;

  return {
    translationPages,
    pipelineError,
    setPipelineError,
    autoTranslation,
    translationActive,
    singlePageBusy,
    singlePageIndex,
    activeTranslationJobs: metrics.activeJobs,
    metrics,
    resetTranslationPipeline,
    stopTranslationRun,
    toggleAutoTranslation,
    translateSinglePage,
    retryPage,
    clearRamCache,
  };
}
