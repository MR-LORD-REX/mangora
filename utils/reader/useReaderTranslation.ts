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
import { getLocalOcrModel, modelIdForLanguage } from "@/services/ocr/ocrModels";
import {
  prepareTextRegions,
  type OcrRegion,
  type OcrTextItem,
} from "@/services/ocr/pageOcr";
import type {
  ReaderTranslationEngine,
  ReaderTranslationMode,
} from "@/services/settings/settingsStore";
import { GEMINI_DEFAULT_MODEL, GEMINI_MODELS } from "@/services/translation/geminiModels";
import type { GeminiModelId } from "@/services/translation/geminiModels";
import {
  GeminiApiError,
  translateGeminiBatch,
} from "@/services/translation/geminiTranslator";
import {
  recordGeminiUsage,
  waitForRpmCapacity,
} from "@/services/translation/geminiUsage";
import { useLocalTranslator } from "@/services/translation/localTranslator";
import { translateSingleText } from "@/services/translation/pageTranslate";
import {
  assignItemsToSlots,
  buildTranslationSlots,
  fillSlotTexts,
} from "@/services/translation/regionText";
import type {
  Box,
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
import { yoloDetector } from "@/services/yolo/yolo";
import type { DetectionResult } from "@/services/yolo/yolo.types";
import { imageHeadersForPage } from "@/utils/reader/imageHeaders";
import type { ReaderIdentity } from "@/utils/reader/readerIdentity";

const MAX_CROPS_PER_PAGE = 24;

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
  bubbles: Map<number, OcrBubbleRecord>;
  items: OcrTextItem[];
  regionsTotal: number;
  regionsDone: number;
  regionsFailed: number;
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
  region: OcrRegion;
  detection: DetectionResult;
  generation: number;
}

interface FreeTranslationTask {
  url: string;
  pageIndex: number;
  bubbleId: number;
  generation: number;
}

interface AiTranslationTask {
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
  aiWorkerCount: number;
  aiMaxContextPages: number;
  freeRequestConcurrency: number;
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
  ocrPageWorkers: number;
  ocrBubbleWorkers: number;
  ocrLookahead: number;
  freeRequestConcurrency: number;
  aiWorkerCount: number;
  aiMaxContextPages: number;
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
  ocrPageWorkers,
  ocrBubbleWorkers,
  ocrLookahead,
  freeRequestConcurrency,
  aiWorkerCount,
  aiMaxContextPages,
  onTranslationSetupRequired,
}: UseReaderTranslationOptions): ReaderTranslationController {
  const { translate } = useLocalTranslator();

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
  const ramMangaRef = useRef<string | null>(null);
  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueMetricsRef = useRef<Record<string, WorkQueueMetrics>>({});
  const metricsRef = useRef<ReaderPipelineMetrics>(EMPTY_METRICS);
  const workersRef = useRef<{
    scan: (task: ScanTask, slot: number) => Promise<void>;
    ocr: (task: OcrTask, slot: number) => Promise<void>;
    free: (task: FreeTranslationTask, slot: number) => Promise<void>;
    ai: (task: AiTranslationTask, slot: number) => Promise<void>;
  }>({
    scan: async () => {},
    ocr: async () => {},
    free: async () => {},
    ai: async () => {},
  });
  const queuesRef = useRef<{
    scan: WorkQueue<ScanTask>;
    ocr: WorkQueue<OcrTask>;
    free: WorkQueue<FreeTranslationTask>;
    ai: WorkQueue<AiTranslationTask>;
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
    aiWorkerCount,
    aiMaxContextPages,
    freeRequestConcurrency,
  });
  configRef.current = {
    engine: translationEngine,
    translationMode,
    sourceLanguage: ocrLanguage,
    targetLanguage: targetLanguage || "en",
    geminiApiKey,
    geminiModelId,
    aiWorkerCount,
    aiMaxContextPages,
    freeRequestConcurrency,
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
      sourceText: region.sourceText,
    }));
    const regions: TranslationRegionState[] = cached.regions.map((region) => ({
      id: region.regionId,
      kind: region.kind,
      pasteBox: region.pasteBox,
      eraseBoxes: region.eraseBoxes,
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
      bubbles,
      items: [],
      regionsTotal: slots.length,
      regionsDone: slots.length,
      regionsFailed: 0,
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
  const finishPageOcr = (page: OcrPageRecord, generation: number) => {
    if (!isCurrentRun(generation)) return;
    const assigned = assignItemsToSlots(page.slots, page.items);
    const filled = fillSlotTexts(
      page.slots,
      assigned,
      isCjkLanguageCode(configRef.current.sourceLanguage),
    );
    const bubbles = new Map<number, OcrBubbleRecord>();
    for (const slot of filled) {
      if (!slot.sourceText.trim()) continue;
      bubbles.set(slot.id, {
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
        confidence: 1,
        status: "ready",
        translatedText: null,
      });
    }
    page.bubbles = bubbles;
    const regions: TranslationRegionState[] = filled.map((slot) => ({
      ...slot,
      translatedText: null,
      status: bubbles.has(slot.id) ? "queued" : "error",
    }));
    console.log("[reader][ocr] page ready", {
      pageIndex: page.pageIndex,
      regions: page.regionsTotal,
      bubbles: bubbles.size,
    });
    if (bubbles.size === 0) {
      markPageError(
        page.url,
        `OCR returned no usable text on page ${page.pageIndex + 1}.`,
      );
      return;
    }
    page.status = "translate";
    updatePage(page.url, {
      stage: "translate",
      busy: true,
      visible: true,
      message: `Translating ${bubbles.size} bubble${bubbles.size === 1 ? "" : "s"}\u2026`,
      regions,
    });
    if (configRef.current.engine === "free") {
      for (const bubble of bubbles.values()) {
        queuesRef.current?.free.push(
          {
            url: page.url,
            pageIndex: page.pageIndex,
            bubbleId: bubble.id,
            generation,
          },
          `${page.url}:${bubble.id}`,
        );
      }
    } else if (configRef.current.engine === "ai") {
      queuesRef.current?.ai.push(
        { url: page.url, pageIndex: page.pageIndex, generation },
        page.url,
      );
    }
  };

  const finishBubbleTranslation = (page: OcrPageRecord, bubble: OcrBubbleRecord) => {
    void bubble;
    const regions: TranslationRegionState[] = [];
    for (const slot of page.slots) {
      const record = page.bubbles.get(slot.id);
      if (!record) continue;
      regions.push({
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
      });
    }
    const allDone = [...page.bubbles.values()].every(
      (item) => item.status === "translated" || item.status === "error",
    );
    const translated = [...page.bubbles.values()].filter(
      (item) => item.status === "translated",
    ).length;
    updatePage(page.url, {
      busy: !allDone,
      stage: allDone ? (translated > 0 ? "done" : "error") : "translate",
      visible: allDone ? translated > 0 : true,
      message: allDone
        ? null
        : `Translating ${translated}/${page.bubbles.size}\u2026`,
      regions,
    });
    if (allDone) {
      page.status = translated > 0 ? "done" : "error";
      console.log("[reader][tr] page finished", {
        pageIndex: page.pageIndex,
        translated,
        failed: page.bubbles.size - translated,
      });
      if (translated > 0) void savePageRecord(page);
      else {
        showTranslationError(
          `Translation failed for page ${page.pageIndex + 1}. Use the retry button on the page.`,
        );
      }
      finishSinglePage(page.url);
    }
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
      const detection = await yoloDetector.detectFromUri(url, {
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
      const ocrModel = getLocalOcrModel(
        modelIdForLanguage(configRef.current.sourceLanguage),
      );
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
      if (regions.length === 0 || slots.length === 0) {
        markPageError(
          url,
          `No text regions found on page ${pageIndex + 1}. Use retry after rescanning.`,
        );
        return;
      }
      const page: OcrPageRecord = {
        url,
        pageIndex,
        chapterId: identity.chapterId,
        seq: ocrSeqRef.current++,
        imageWidth: detection.imageWidth,
        imageHeight: detection.imageHeight,
        slots,
        bubbles: new Map(),
        items: [],
        regionsTotal: regions.length,
        regionsDone: 0,
        regionsFailed: 0,
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
      for (const region of regions) {
        queuesRef.current?.ocr.push(
          {
            url,
            pageIndex,
            region,
            detection,
            generation,
          },
          `${url}:${region.x1}:${region.y1}:${region.classId}`,
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
    const { url, pageIndex, region, detection, generation } = task;
    if (!isCurrentRun(generation)) return;
    const page = ocrStoreRef.current.get(url);
    if (!page) return;
    try {
      const result = await recognizePageRegions({
        pageUrl: url,
        headers: imageHeadersForPage(source, url),
        imageWidth: detection.imageWidth,
        imageHeight: detection.imageHeight,
        regions: [region],
        language: configRef.current.sourceLanguage,
        maxCrops: 1,
      });
      if (!isCurrentRun(generation)) return;
      page.items.push(...result.items);
      page.regionsDone += 1;
      console.log("[reader][ocr] region done", {
        pageIndex,
        classId: region.classId,
        items: result.items.length,
        done: page.regionsDone,
        total: page.regionsTotal,
      });
    } catch (error) {
      if (!isCurrentRun(generation)) return;
      page.regionsFailed += 1;
      console.warn("[reader][ocr] region failed", {
        pageIndex,
        classId: region.classId,
        error,
      });
    }
    if (page.regionsDone + page.regionsFailed >= page.regionsTotal) {
      finishPageOcr(page, generation);
    }
  };

  const freeWorker = async (task: FreeTranslationTask) => {
    const { url, pageIndex, bubbleId, generation } = task;
    if (!isCurrentRun(generation)) return;
    const page = ocrStoreRef.current.get(url);
    const bubble = page?.bubbles.get(bubbleId);
    if (!page || !bubble) return;
    bubble.status = "translating";
    finishBubbleTranslation(page, bubble);
    try {
      const translated = await translateSingleText(
        translate,
        configRef.current.sourceLanguage,
        configRef.current.targetLanguage,
        bubble.text,
      );
      if (!isCurrentRun(generation)) return;
      if (!translated.trim()) throw new Error("Empty translation response.");
      bubble.translatedText = translated;
      bubble.status = "translated";
      console.log("[reader][tr][free] bubble done", { pageIndex, bubbleId });
    } catch (error) {
      if (!isCurrentRun(generation)) return;
      bubble.status = "error";
      console.warn("[reader][tr][free] bubble failed", {
        pageIndex,
        bubbleId,
        error,
      });
    }
    finishBubbleTranslation(page, bubble);
  };
  const aiWorker = async (task: AiTranslationTask, slot: number) => {
    const { url, pageIndex, generation } = task;
    if (!isCurrentRun(generation)) return;
    const page = ocrStoreRef.current.get(url);
    if (!page) return;
    const apiKey = configRef.current.geminiApiKey.trim();
    if (!apiKey) {
      markPageError(url, "AI translation needs a Gemini API key.");
      return;
    }
    const primary = configRef.current.geminiModelId || GEMINI_DEFAULT_MODEL;
    const secondary =
      GEMINI_MODELS.find((model) => model.id !== primary)?.id ?? primary;
    const models =
      configRef.current.aiWorkerCount >= 2 ? [primary, secondary] : [primary];
    const model = models[slot % models.length];
    console.log("[reader][tr][ai] worker start", {
      pageIndex,
      slot,
      model,
      workers: configRef.current.aiWorkerCount,
    });

    const bubbles = [...page.bubbles.values()].filter(
      (bubble) => bubble.status === "ready" || bubble.status === "error",
    );
    if (bubbles.length === 0) return;
    for (const bubble of bubbles) bubble.status = "translating";
    page.status = "translate";
    finishBubbleTranslation(page, bubbles[0]);

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
        label: `history_${index}`,
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

    try {
      await waitForRpmCapacity(model);
      const response = await translateGeminiBatch({
        apiKey,
        model,
        sourceCode: configRef.current.sourceLanguage,
        targetCode: configRef.current.targetLanguage,
        history,
        batch,
      });
      if (!isCurrentRun(generation)) return;
      void recordGeminiUsage({
        model,
        success: true,
        inputTokens: response.usage.inputTokens,
        outputTokens: response.usage.outputTokens,
      });
      if (response.results.length === 0) {
        throw new GeminiApiError(
          "Gemini returned no usable translation results.",
          undefined,
          "EMPTY_RESULT",
        );
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
      page.modelId = model;
      console.log("[reader][tr][ai] page response", {
        pageIndex,
        model,
        bubbles: bubbles.length,
        translated,
        contextPages: history.length,
      });
      finishBubbleTranslation(page, bubbles[0]);
    } catch (error) {
      if (!isCurrentRun(generation)) return;
      void recordGeminiUsage({
        model,
        success: false,
        errorCode:
          error instanceof GeminiApiError
            ? String(error.code ?? error.status ?? "error")
            : "network",
      });
      for (const bubble of bubbles) {
        if (bubble.status === "translating") bubble.status = "error";
      }
      page.status = "error";
      console.warn("[reader][tr][ai] page failed", { pageIndex, model, error });
      finishBubbleTranslation(page, bubbles[0]);
      showTranslationError(
        error instanceof Error
          ? `Page ${pageIndex + 1}: ${error.message}`
          : `AI translation failed for page ${pageIndex + 1}.`,
      );
    }
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
        ocrPageWorkers,
        (task, slot) => workersRef.current.scan(task, slot),
        onQueueChange,
      ),
      ocr: new WorkQueue<OcrTask>(
        "bubble-ocr",
        ocrBubbleWorkers,
        (task, slot) => workersRef.current.ocr(task, slot),
        onQueueChange,
      ),
      free: new WorkQueue<FreeTranslationTask>(
        "free-tr",
        freeRequestConcurrency,
        (task, slot) => workersRef.current.free(task, slot),
        onQueueChange,
      ),
      ai: new WorkQueue<AiTranslationTask>(
        "ai-tr",
        aiWorkerCount,
        (task, slot) => workersRef.current.ai(task, slot),
        onQueueChange,
      ),
    };
    console.log("[reader][tr] queues created", {
      scan: ocrPageWorkers,
      ocr: ocrBubbleWorkers,
      free: freeRequestConcurrency,
      ai: aiWorkerCount,
    });
  }
  const queues = queuesRef.current;

  useEffect(() => {
    queues.scan.setConcurrency(ocrPageWorkers);
  }, [queues, ocrPageWorkers]);

  useEffect(() => {
    queues.ocr.setConcurrency(ocrBubbleWorkers);
  }, [queues, ocrBubbleWorkers]);

  useEffect(() => {
    queues.free.setConcurrency(freeRequestConcurrency);
  }, [queues, freeRequestConcurrency]);

  useEffect(() => {
    queues.ai.setConcurrency(aiWorkerCount);
  }, [queues, aiWorkerCount]);

  const enqueueWindow = (generation: number) => {
    if (!autoRef.current) return;
    const windowSize = Math.min(3, Math.max(1, Math.round(ocrLookahead)));
    const start = currentPageIndexRef.current;
    for (let offset = 0; offset < windowSize; offset += 1) {
      const pageIndex = start + offset;
      const url = pagesRef.current[pageIndex];
      if (!url) continue;
      const state = pagesStateRef.current[url];
      if (state?.stage === "done" || state?.stage === "error") continue;
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
      return "AI translation needs a Gemini API key - set it in TR settings.";
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
