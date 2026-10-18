/**
 * useReaderTranslation.ts
 * ---------------------------------------------------------------------------
 * Owns the reader's per-page detection + OCR + translation pipeline:
 *
 *   - YOLO detection cache and ExecuTorch/cloud OCR selection
 *   - the "free" per-bubble translate path
 *   - the "AI" path (whole-page OCR -> batched Gemini requests with history)
 *   - the auto-translation scheduler that walks the +-1 page window
 *   - SQLite translation-page cache restore/save
 *
 * The screen only renders the resulting PageTranslationState overlays and
 * toggles the run on/off; every stateful detail of the pipeline lives here.
 * ---------------------------------------------------------------------------
 */

import { useEffect, useRef, useState } from "react";

import { languageLabel } from "@/components/reader/readerLanguages";

import {
  findTranslationPage,
  pruneTranslationCache,
  saveTranslationPage,
} from "@/services/db/repositories/translationRepository";
import type { LocalModelId } from "@/services/ocr/executorchModels";
import { suggestLocalModelIdForLanguage } from "@/services/ocr/executorchModels";
import {
  isExecutorchAvailable,
  recognizePageRegions as executorchRecognizePageRegions,
} from "@/services/ocr/executorchOcr";
import type { PageOcrOutput } from "@/services/ocr/pageOcr";
import { recognizePageRegionsWithTrappOcr } from "@/services/ocr/trappOcrOcr";
import type { AppSettings } from "@/services/settings/settingsStore";
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
import { yoloDetector } from "@/services/yolo/yolo";
import type { DetectionResult } from "@/services/yolo/yolo.types";
import { imageHeadersForPage } from "@/utils/reader/imageHeaders";
import type { ReaderIdentity } from "@/utils/reader/readerIdentity";

/** One page whose OCR finished, waiting to be dispatched in a Gemini request. */
interface AiBatchUnit {
  url: string;
  pageIndex: number;
  /** Fully OCRed regions (sourceText filled) of this page. */
  regions: TranslationRegionState[];
}

/**
 * RAM-only OCR cache entry for one page of the current manga session. Filled
 * as soon as a page is OCRed so revisits skip OCR and later requests can
 * attach past pages as story context.
 */
interface OcrCachePageEntry {
  pageIndex: number;
  /** Monotonic session counter - keeps history in reading/OCR order. */
  seq: number;
  /** Slots that produced usable source text (text + erase boxes preserved). */
  regions: { id: number; text: string; eraseBoxes: Box[] }[];
}

export interface UseReaderTranslationOptions {
  /** Provider id of the open chapter. */
  source: string;
  /** Raw provider language param, used for logging only. */
  providerLanguage: string;
  /** Effective OCR source language (reader override or auto-detected). */
  ocrLanguage: string;
  /** Raw reader source-language override ("" = auto), for logging. */
  readerLanguageOverride: string;
  /** Page image URLs of the current chapter, in reading order. */
  pages: string[];
  /** Currently visible page index. */
  currentPageIndex: number;
  /** Canonical manga/chapter identities used by the translation cache. */
  identity: ReaderIdentity;
  ocrBackend: AppSettings["ocrBackend"];
  localModelId: LocalModelId | null;
  downloadedModels: Set<LocalModelId>;
  translateMode: AppSettings["readerTranslateMode"];
  targetLanguage: string;
  geminiApiKey: string;
  geminiModelId: GeminiModelId;
  aiRequestPageInterval: number;
  /** Maximum Gemini requests allowed in flight at once. */
  aiRequestFrequency: number;
  aiMaxContextPages: number;
  /** Opens the translation panel when a run cannot start yet. */
  onTranslationSetupRequired: () => void;
}

export interface ReaderTranslationController {
  /** Per-page overlay state, keyed by page image URL. */
  translationPages: Record<string, PageTranslationState>;
  /** Last pipeline error, shown as a transient toast. */
  pipelineError: string | null;
  /** Raw error override used by the OCR model download flow. */
  setPipelineError: (message: string | null) => void;
  /** True while auto-translation is scanning the current window. */
  autoTranslation: boolean;
  /** Number of pages currently inside the pipeline. */
  activeTranslationJobs: number;
  /** Drops all per-chapter pipeline state (call when the chapter changes). */
  resetTranslationPipeline: () => void;
  /** Cancels the active run, keeping already-translated pages. */
  stopTranslationRun: () => void;
  /** Starts or stops auto-translation (validating mode/API key first). */
  toggleAutoTranslation: () => void;
}

export function useReaderTranslation({
  source,
  providerLanguage,
  ocrLanguage,
  readerLanguageOverride,
  pages,
  currentPageIndex,
  identity,
  ocrBackend,
  localModelId,
  downloadedModels,
  translateMode,
  targetLanguage,
  geminiApiKey,
  geminiModelId,
  aiRequestPageInterval,
  aiRequestFrequency,
  aiMaxContextPages,
  onTranslationSetupRequired,
}: UseReaderTranslationOptions): ReaderTranslationController {
  const { translate } = useLocalTranslator();

  // Detection + translation results, cached per page url.
  const [yoloCache, setYoloCache] = useState<Record<string, DetectionResult>>(
    {},
  );
  const [translationPages, setTranslationPages] = useState<
    Record<string, PageTranslationState>
  >({});
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const translationGenerationRef = useRef(0);
  const queuedTranslationPagesRef = useRef<string[]>([]);
  const queuedTranslationPageSetRef = useRef(new Set<string>());
  const activeTranslationPageSetRef = useRef(new Set<string>());
  const activeTranslationJobsRef = useRef(0);
  const translationErrorTimeoutRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  const [autoTranslation, setAutoTranslation] = useState(false);
  const [activeTranslationJobs, setActiveTranslationJobs] = useState(0);

  // ---- AI (Gemini) state -------------------------------------------------
  // Pages whose OCR is done wait here until `requestPageInterval` fresh pages
  // have piled up (or the scanned area drains), then go out as one request.
  const aiBatchQueueRef = useRef<AiBatchUnit[]>([]);
  const aiPageRegionsRef = useRef<Map<string, TranslationRegionState[]>>(
    new Map(),
  );
  const aiPageRemainingRef = useRef<Map<string, number>>(new Map());
  const aiPageDimsRef = useRef<Map<string, { width: number; height: number }>>(
    new Map(),
  );
  const aiFlushRunningRef = useRef(0);
  const aiFlushChainRef = useRef<Promise<void>>(Promise.resolve());
  // RAM-only OCR cache: manga-scoped, survives chapter changes, cleared when
  // the manga identity changes (see resetTranslationPipeline).
  const ocrCacheRef = useRef<Map<string, OcrCachePageEntry>>(new Map());
  const ocrCacheSeqRef = useRef(0);
  const aiCacheMangaRef = useRef<string | null>(null);
  const aiSettingsRef = useRef({
    autoTranslation: false,
    translateMode: "off" as AppSettings["readerTranslateMode"],
    geminiApiKey: "",
    geminiModelId: geminiModelId as GeminiModelId,
    sourceLanguage: "",
    targetLanguage: "en",
    requestPageInterval: aiRequestPageInterval,
    requestFrequency: aiRequestFrequency,
    maxContextPages: 10,
  });

  // Mirrors the latest reader state into a ref so AI dispatch always reads
  // current settings, even when it runs after async OCR completes.
  useEffect(() => {
    aiSettingsRef.current = {
      autoTranslation,
      translateMode,
      geminiApiKey,
      geminiModelId,
      sourceLanguage: ocrLanguage,
      targetLanguage,
      requestPageInterval: aiRequestPageInterval,
      requestFrequency: aiRequestFrequency,
      maxContextPages: aiMaxContextPages,
    };
  });
  const updatePage = (url: string, patch: Partial<PageTranslationState>) => {
    setTranslationPages((prev) => {
      const base = prev[url];
      const next: PageTranslationState = {
        url,
        imageWidth: base?.imageWidth ?? 0,
        imageHeight: base?.imageHeight ?? 0,
        mode: translateMode,
        busy: base?.busy ?? false,
        visible: base?.visible ?? false,
        stage: base?.stage ?? "detect",
        message: base?.message ?? null,
        regions: base?.regions ?? [],
        ...patch,
      };
      return { ...prev, [url]: next };
    });
  };

  const updateRegions = (
    url: string,
    regions: TranslationRegionState[],
    message?: string | null,
  ) => {
    setTranslationPages((prev) => {
      const base = prev[url];
      if (!base) return prev;
      return {
        ...prev,
        [url]: {
          ...base,
          regions,
          message: message === undefined ? base.message : message,
        },
      };
    });
  };

  const updateRegion = (
    url: string,
    region: TranslationRegionState,
    message?: string | null,
  ) => {
    setTranslationPages((prev) => {
      const base = prev[url];
      if (!base) return prev;
      return {
        ...prev,
        [url]: {
          ...base,
          regions: base.regions.map((item) =>
            item.id === region.id ? region : item,
          ),
          message: message === undefined ? base.message : message,
        },
      };
    });
  };

  const isTranslationRunActive = (generation: number) =>
    translationGenerationRef.current === generation;

  const showTranslationError = (message: string) => {
    setPipelineError(message);
    if (translationErrorTimeoutRef.current) {
      clearTimeout(translationErrorTimeoutRef.current);
    }
    translationErrorTimeoutRef.current = setTimeout(() => {
      setPipelineError(null);
      translationErrorTimeoutRef.current = null;
    }, 3000);
  };

  const ensureDetection = async (url: string): Promise<DetectionResult> => {
    const cached = yoloCache[url];
    if (cached) return cached;
    const result = await yoloDetector.detectFromUri(url, {
      headers: imageHeadersForPage(source, url),
      extensionSourceId: source.startsWith("ext:")
        ? source.slice(4)
        : undefined,
    });
    setYoloCache((prev) => ({ ...prev, [url]: result }));
    return result;
  };

  /** OCRs the messy/bubble regions of one page (same flow as the old button). */
  const recognizeCurrentPage = async (
    url: string,
    detection: DetectionResult,
  ): Promise<PageOcrOutput> => {
    const regions = detection.boxes.filter(
      (box) => box.classId === 1 || box.classId === 2,
    );
    if (!regions.length) {
      throw new Error(
        "No messy-text/chat-bubble regions found on this page - nothing to OCR.",
      );
    }
    const common = {
      pageUrl: url,
      imageWidth: detection.imageWidth,
      imageHeight: detection.imageHeight,
      regions,
      headers: imageHeadersForPage(source, url),
    };
    if (ocrBackend === "cloud") {
      console.log(
        "[reader][ocr] cloud request",
        JSON.stringify({
          source,
          chapterLanguage: providerLanguage ?? "",
          languageSent: ocrLanguage,
          override: readerLanguageOverride || "auto",
        }),
      );
      return recognizePageRegionsWithTrappOcr({
        ...common,
        language: ocrLanguage,
      });
    }
    if (!isExecutorchAvailable()) {
      throw new Error(
        "Local OCR needs a development build with react-native-executorch linked - it is not available in Expo Go.",
      );
    }
    let modelId = localModelId;
    if (!modelId) {
      const suggestion = suggestLocalModelIdForLanguage(ocrLanguage);
      if (downloadedModels.has(suggestion)) {
        modelId = suggestion;
      } else {
        throw new Error(
          "No local OCR model ready yet. Open Reader Config -> OCR Models, pick an on-device model and wait for its one-time download.",
        );
      }
    }
    return executorchRecognizePageRegions({ ...common, modelId });
  };

  const recognizeRegion = async (
    url: string,
    detection: DetectionResult,
    region: TranslationRegionState,
  ): Promise<PageOcrOutput> => {
    const ocrRegion = {
      ...region.pasteBox,
      classId: region.kind === "bubble" ? 2 : 1,
      confidence: 1,
    };
    const singleRegionDetection = {
      ...detection,
      boxes: [ocrRegion],
    };
    return recognizeCurrentPage(url, singleRegionDetection);
  };
  /** Restores a previously translated page (coords + result) from the DB. */
  const tryRestoreCachedPage = async (
    url: string,
    pageIndex: number,
    mode: AppSettings["readerTranslateMode"],
  ): Promise<boolean> => {
    const { mangaId } = identity;
    const target = targetLanguage || "en";
    const cached = await findTranslationPage({
      mangaId,
      pageUrl: url,
      sourceLanguage: ocrLanguage,
      targetLanguage: target,
    }).catch((error) => {
      console.warn("Translation cache lookup failed:", error);
      return null;
    });
    if (!cached) return false;
    const restored = cached.regions
      .filter((region) => region.translatedText && region.translatedText.trim())
      .map(
        (region): TranslationRegionState => ({
          id: region.regionId,
          kind: region.kind,
          pasteBox: region.pasteBox,
          eraseBoxes: region.eraseBoxes,
          sourceText: region.sourceText,
          translatedText: region.translatedText,
          status: "done",
        }),
      );
    if (restored.length === 0) return false;
    updatePage(url, {
      mode,
      busy: false,
      visible: true,
      stage: "done",
      message: null,
      regions: restored,
      imageWidth: cached.imageWidth,
      imageHeight: cached.imageHeight,
    });
    // Seed the RAM OCR cache so restored pages still provide story context
    // for the requests that follow (first OCR/restore wins the sequence).
    if (!ocrCacheRef.current.has(url)) {
      ocrCacheRef.current.set(url, {
        pageIndex,
        seq: ocrCacheSeqRef.current++,
        regions: restored
          .filter((region) => region.sourceText.trim().length > 0)
          .map((region) => ({
            id: region.id,
            text: region.sourceText,
            eraseBoxes: region.eraseBoxes,
          })),
      });
    }
    return true;
  };

  /** Persists one translated page into the DB cache (source + coords + result). */
  const savePageCache = async (
    url: string,
    regions: TranslationRegionState[],
    dims: { width: number; height: number },
  ): Promise<void> => {
    const stored = regions
      .filter((region) => region.sourceText.trim().length > 0)
      .map((region) => ({
        regionId: region.id,
        kind: region.kind,
        sourceText: region.sourceText,
        translatedText: region.translatedText,
        pasteBox: region.pasteBox,
        eraseBoxes: region.eraseBoxes,
      }));
    if (stored.length === 0) return;
    try {
      await saveTranslationPage({
        mangaId: identity.mangaId,
        chapterId: identity.chapterId,
        pageUrl: url,
        sourceLanguage: ocrLanguage,
        targetLanguage: targetLanguage || "en",
        model: translateMode === "ai" ? geminiModelId : "free",
        imageWidth: dims.width,
        imageHeight: dims.height,
        regions: stored,
      });
      void pruneTranslationCache(identity.mangaId);
    } catch (error) {
      console.warn("Failed to save translation page cache:", error);
    }
  };

  /** Finishes an AI page once every one of its bubbles has a result. */
  const finalizeAiPage = (url: string) => {
    const regions = aiPageRegionsRef.current.get(url) ?? [];
    const dims = aiPageDimsRef.current.get(url) ?? { width: 0, height: 0 };
    aiPageRegionsRef.current.delete(url);
    aiPageRemainingRef.current.delete(url);
    aiPageDimsRef.current.delete(url);
    const succeeded = regions.filter(
      (region) => region.status === "done",
    ).length;
    const failed = regions.length - succeeded;
    if (succeeded === 0) {
      updatePage(url, {
        busy: false,
        stage: "error",
        message: null,
        regions: [],
        visible: false,
      });
      return;
    }
    updatePage(url, { busy: false, stage: "done", message: null });
    if (failed > 0) {
      showTranslationError(
        `${failed} bubble${failed === 1 ? "" : "s"} failed - ${succeeded} translated.`,
      );
    }
    void savePageCache(url, regions, dims);
  };

  /** Marks the pages of a failed batch as errored and drops their queue state. */
  const failAiBatchPages = (units: AiBatchUnit[], message: string) => {
    const failedUrls = new Set(units.map((unit) => unit.url));
    aiBatchQueueRef.current = aiBatchQueueRef.current.filter(
      (item) => !failedUrls.has(item.url),
    );
    for (const url of failedUrls) {
      aiPageRegionsRef.current.delete(url);
      aiPageRemainingRef.current.delete(url);
      aiPageDimsRef.current.delete(url);
      updatePage(url, {
        busy: false,
        stage: "error",
        message: null,
        regions: [],
        visible: false,
      });
    }
    showTranslationError(message);
  };
  /**
   * Dispatches OCRed pages to Gemini. A request goes out as soon as
   * `requestPageInterval` fresh pages have been OCRed, or - when the +-1
   * prefetch window is fully drained - with whatever is still queued so a
   * slow reader never waits for pages that will only be scanned later.
  * Request frequency controls how many batches may stay in flight.
   */
  const drainAiBatch = (generation: number) => {
    const ctx = aiSettingsRef.current;
    if (!ctx.autoTranslation) return;
    if (!isTranslationRunActive(generation)) return;
    const queue = aiBatchQueueRef.current;
    if (queue.length === 0) return;

    const pagesPerRequest = Math.min(
      10,
      Math.max(1, Math.round(ctx.requestPageInterval)),
    );
    const requestFrequency = Math.min(
      5,
      Math.max(1, Math.round(ctx.requestFrequency)),
    );
    // "Area drained": every page in the +-1 prefetch window has finished OCR,
    // so flush what is queued even if the frequency target was not reached.
    const areaDrained =
      activeTranslationJobsRef.current === 0 &&
      queuedTranslationPagesRef.current.length === 0;
    while (
      queue.length > 0 &&
      aiFlushRunningRef.current < requestFrequency
    ) {
      const take =
        queue.length >= pagesPerRequest
          ? pagesPerRequest
          : areaDrained
            ? queue.length
            : 0;
      if (take === 0) return;

      const units = queue.splice(0, take);
      aiFlushRunningRef.current += 1;
      void flushAiBatch(generation, units).finally(() => {
        aiFlushRunningRef.current -= 1;
        if (generation === translationGenerationRef.current) {
          drainAiBatch(generation);
        }
      });
    }
  };

  /** Sends one Gemini request with the OCR history attached as context. */
  const flushAiBatch = async (generation: number, units: AiBatchUnit[]) => {
    const ctx = aiSettingsRef.current;
    const apiKey = ctx.geminiApiKey.trim();
    if (!apiKey) {
      if (isTranslationRunActive(generation)) {
        failAiBatchPages(
          units,
          "AI translation needs a Gemini API key - set it in Translation options.",
        );
      }
      return;
    }
    if (!isTranslationRunActive(generation)) return;

    try {
      await waitForRpmCapacity(ctx.geminiModelId);
    } catch {
      // The usage meter is best-effort; the API still enforces its own limits.
    }
    if (!isTranslationRunActive(generation)) return;

    // History = past pages from the RAM OCR cache (in reading order, each
    // tagged with its page index). Pages of this batch - and anything still
    // waiting in the dispatch queue - are never part of their own context.
    const batchUrls = new Set(units.map((unit) => unit.url));
    const pendingUrls = new Set(
      aiBatchQueueRef.current.map((unit) => unit.url),
    );
    const excluded = new Set([...batchUrls, ...pendingUrls]);
    const maxContext = Math.min(
      50,
      Math.max(0, Math.round(ctx.maxContextPages)),
    );
    let history: OcrCachePageEntry[] = [];
    if (maxContext > 0) {
      const firstBatchSeq = Math.min(
        ...units.map(
          (unit) =>
            ocrCacheRef.current.get(unit.url)?.seq ?? Number.MAX_SAFE_INTEGER,
        ),
      );
      history = [...ocrCacheRef.current.entries()]
        .filter(
          ([pageUrl, entry]) =>
            !excluded.has(pageUrl) && entry.seq < firstBatchSeq,
        )
        .map(([, entry]) => entry)
        .sort((a, b) => a.seq - b.seq)
        .slice(-maxContext);
    }
    const payloadHistory = history.map((page, historyIndex) => ({
      label: `history_${historyIndex}`,
      pageIndex: page.pageIndex,
      regions: page.regions.map((region) => ({
        regionId: region.id,
        text: region.text,
      })),
    }));
    const batchPages = units.map((unit, batchIndex) => ({
      label: `page_${batchIndex}`,
      pageIndex: unit.pageIndex,
      regions: unit.regions.map((region) => ({
        regionId: region.id,
        text: region.sourceText,
      })),
    }));

    let response: Awaited<ReturnType<typeof translateGeminiBatch>>;
    try {
      response = await translateGeminiBatch({
        apiKey,
        model: ctx.geminiModelId,
        sourceCode: ctx.sourceLanguage,
        targetCode: ctx.targetLanguage,
        history: payloadHistory,
        batch: batchPages,
      });
    } catch (error) {
      void recordGeminiUsage({
        model: ctx.geminiModelId,
        success: false,
        errorCode:
          error instanceof GeminiApiError
            ? String(error.code ?? error.status ?? "error")
            : "network",
      });
      if (!isTranslationRunActive(generation)) return;
      failAiBatchPages(
        units,
        error instanceof Error ? error.message : "AI translation failed.",
      );
      return;
    }
    if (!isTranslationRunActive(generation)) return;

    void recordGeminiUsage({
      model: ctx.geminiModelId,
      success: true,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
    });

    const resultByKey = new Map<string, string>();
    for (const result of response.results) {
      resultByKey.set(`${result.label}:${result.regionId}`, result.text);
    }

    for (let batchIndex = 0; batchIndex < units.length; batchIndex += 1) {
      const unit = units[batchIndex];
      const label = `page_${batchIndex}`;
      const stored = aiPageRegionsRef.current.get(unit.url);
      if (!stored) continue;
      const nextRegions = [...stored];
      let remaining = aiPageRemainingRef.current.get(unit.url) ?? 0;
      let applied = false;
      for (const region of unit.regions) {
        const slotIndex = nextRegions.findIndex(
          (item) => item.id === region.id,
        );
        if (slotIndex < 0) continue;
        const translated = resultByKey.get(`${label}:${region.id}`);
        applied = true;
        if (translated !== undefined && translated.trim().length > 0) {
          nextRegions[slotIndex] = {
            ...nextRegions[slotIndex],
            translatedText: translated,
            status: "done" as const,
          };
        } else {
          nextRegions[slotIndex] = {
            ...nextRegions[slotIndex],
            status: "error" as const,
          };
        }
        remaining = Math.max(0, remaining - 1);
      }
      aiPageRegionsRef.current.set(unit.url, nextRegions);
      aiPageRemainingRef.current.set(unit.url, remaining);
      if (applied) updateRegions(unit.url, nextRegions, null);
      if (remaining === 0) finalizeAiPage(unit.url);
    }
  };
  const runPageTranslation = async (url: string, generation: number) => {
    const mode = translateMode;
    if (mode === "off") {
      throw new Error("Translation is off. Enable it in Translation options.");
    }
    const sourceLanguage = ocrLanguage;
    const target = targetLanguage || "en";
    if (isSameEngineLanguage(sourceLanguage, target)) {
      throw new Error(
        `Target language (${languageLabel(target)}) matches the page language (${languageLabel(sourceLanguage)}) - nothing to translate.`,
      );
    }

    const pageIndex = pages.indexOf(url);
    if (pageIndex < 0) {
      throw new Error("Page is not part of the current chapter.");
    }

    // 0. Cache-first: a page translated before for this source -> target pair
    //    restores instantly from SQLite without YOLO/OCR or another API call.
    if (await tryRestoreCachedPage(url, pageIndex, mode)) return;

    updatePage(url, {
      mode,
      busy: true,
      visible: true,
      stage: "detect",
      message: "Detecting text\u2026",
      regions: [],
    });

    // 1. Detect text regions.
    const detection = await ensureDetection(url);
    if (!isTranslationRunActive(generation)) return;
    updatePage(url, {
      imageWidth: detection.imageWidth,
      imageHeight: detection.imageHeight,
    });
    if (!detection.boxes?.length) {
      throw new Error("No text regions detected on this page.");
    }

    // 2. Build one translation slot per bubble/messy region.
    const slots = buildTranslationSlots(detection);
    const active = slots.filter(
      (slot) =>
        slot.pasteBox.x2 > slot.pasteBox.x1 &&
        slot.pasteBox.y2 > slot.pasteBox.y1,
    );
    if (!active.length) {
      throw new Error(
        "No messy-text/chat-bubble regions found on this page - nothing to OCR.",
      );
    }

    const regions: TranslationRegionState[] = active.map((slot) => ({
      ...slot,
      translatedText: null,
      status: "queued",
    }));
    updateRegions(
      url,
      regions,
      `Translating ${regions.length} region${regions.length === 1 ? "" : "s"}\u2026`,
    );

    if (mode === "free") {
      // Free mode keeps the per-bubble pipeline: each bubble is OCRed and
      // translated independently and pasted as soon as it finishes.
      const finalRegions: TranslationRegionState[] = [];
      let failed = 0;
      await Promise.all(
        regions.map(async (region, index) => {
          updateRegion(
            url,
            { ...region, status: "processing" },
            `Reading bubble ${index + 1} of ${regions.length}\u2026`,
          );
          try {
            const ocrResult = await recognizeRegion(url, detection, region);
            if (!isTranslationRunActive(generation)) return;
            if (!ocrResult.items.length) {
              throw new Error("No readable text found");
            }
            const assigned = assignItemsToSlots([region], ocrResult.items);
            const recognized = fillSlotTexts(
              [region],
              assigned,
              isCjkLanguageCode(sourceLanguage),
            )[0];
            if (!recognized?.sourceText.trim()) {
              throw new Error("No usable text found");
            }
            updateRegion(
              url,
              { ...recognized, translatedText: null, status: "processing" },
              `Translating bubble ${index + 1} of ${regions.length}\u2026`,
            );
            const translated = await translateSingleText(
              translate,
              sourceLanguage,
              target,
              recognized.sourceText,
            );
            if (!isTranslationRunActive(generation)) return;
            const doneRegion: TranslationRegionState = {
              ...recognized,
              translatedText: translated,
              status: "done",
            };
            finalRegions.push(doneRegion);
            updateRegion(url, doneRegion);
          } catch (error) {
            console.warn("Bubble OCR/translate failed:", error);
            failed += 1;
            updateRegion(url, { ...region, status: "error" });
          }
        }),
      );
      const succeeded = regions.length - failed;
      if (succeeded === 0) {
        updatePage(url, {
          busy: false,
          stage: "error",
          message: null,
          regions: [],
          visible: false,
        });
        showTranslationError(
          `${failed} region${failed === 1 ? "" : "s"} could not be translated. Tap again to retry.`,
        );
      } else {
        updatePage(url, { busy: false, stage: "done", message: null });
        if (failed > 0) {
          showTranslationError(
            `${failed} region${failed === 1 ? "" : "s"} failed - ${succeeded} translated.`,
          );
        }
        void savePageCache(url, finalRegions, {
          width: detection.imageWidth,
          height: detection.imageHeight,
        });
      }
      return;
    }

    // AI mode: OCR the whole page once (cached in RAM per manga), then queue
    // its bubbles for a Gemini request at the configured page frequency.
    updatePage(url, { stage: "ocr", message: "Reading text\u2026" });
    const cachedOcr = ocrCacheRef.current.get(url);
    let filledSlots: TranslationSlot[];
    if (cachedOcr) {
      const textById = new Map(
        cachedOcr.regions.map((region) => [region.id, region]),
      );
      filledSlots = slots.map((slot) => {
        const cached = textById.get(slot.id);
        if (!cached) return slot;
        return {
          ...slot,
          sourceText: cached.text,
          eraseBoxes:
            cached.eraseBoxes.length > 0 ? cached.eraseBoxes : slot.eraseBoxes,
        };
      });
    } else {
      const ocrResult = await recognizeCurrentPage(url, detection);
      if (!isTranslationRunActive(generation)) return;
      if (!ocrResult.items.length) {
        throw new Error("No readable text found on this page.");
      }
      const assigned = assignItemsToSlots(slots, ocrResult.items);
      filledSlots = fillSlotTexts(
        slots,
        assigned,
        isCjkLanguageCode(sourceLanguage),
      );
      ocrCacheRef.current.set(url, {
        pageIndex,
        seq: ocrCacheSeqRef.current++,
        regions: filledSlots
          .filter((slot) => slot.sourceText.trim().length > 0)
          .map((slot) => ({
            id: slot.id,
            text: slot.sourceText,
            eraseBoxes: slot.eraseBoxes,
          })),
      });
    }
    const pageRegions = filledSlots
      .filter((slot) => slot.sourceText.trim().length > 0)
      .map((slot) => ({
        ...slot,
        translatedText: null,
        status: "queued" as const,
      }));
    if (!pageRegions.length) {
      throw new Error("OCR returned no usable text for any region.");
    }
    updateRegions(
      url,
      pageRegions,
      `Queued ${pageRegions.length} bubble${pageRegions.length === 1 ? "" : "s"} for AI translation\u2026`,
    );
    aiPageRegionsRef.current.set(url, pageRegions);
    aiPageRemainingRef.current.set(url, pageRegions.length);
    aiPageDimsRef.current.set(url, {
      width: detection.imageWidth,
      height: detection.imageHeight,
    });
    aiBatchQueueRef.current.push({ url, pageIndex, regions: pageRegions });
    drainAiBatch(generation);
  };
  const pumpTranslationQueue = () => {
    const generation = translationGenerationRef.current;
    while (
      autoTranslation &&
      activeTranslationJobsRef.current < 3 &&
      queuedTranslationPagesRef.current.length > 0
    ) {
      const url = queuedTranslationPagesRef.current.shift();
      if (!url) continue;
      queuedTranslationPageSetRef.current.delete(url);
      if (
        activeTranslationPageSetRef.current.has(url) ||
        translationPages[url]?.stage === "done" ||
        aiPageRegionsRef.current.has(url)
      ) {
        continue;
      }

      activeTranslationPageSetRef.current.add(url);
      activeTranslationJobsRef.current += 1;
      setActiveTranslationJobs(activeTranslationJobsRef.current);
      runPageTranslation(url, generation)
        .catch((error) => {
          if (!isTranslationRunActive(generation)) return;
          console.error("Translation pipeline failed:", error);
          showTranslationError(
            error instanceof Error ? error.message : "Translation failed",
          );
          updatePage(url, {
            busy: false,
            stage: "error",
            message: null,
            regions: [],
            visible: false,
          });
        })
        .finally(() => {
          if (generation !== translationGenerationRef.current) return;
          activeTranslationPageSetRef.current.delete(url);
          activeTranslationJobsRef.current -= 1;
          setActiveTranslationJobs(activeTranslationJobsRef.current);
          pumpTranslationQueue();
          drainAiBatch(translationGenerationRef.current);
        });
    }
  };

  const enqueueTranslationWindow = () => {
    if (!autoTranslation) return;
    for (let offset = -1; offset <= 2; offset += 1) {
      const url = pages[currentPageIndex + offset];
      if (!url || translationPages[url]?.stage === "done") continue;
      if (
        !queuedTranslationPageSetRef.current.has(url) &&
        !activeTranslationPageSetRef.current.has(url) &&
        !aiPageRegionsRef.current.has(url)
      ) {
        queuedTranslationPageSetRef.current.add(url);
        queuedTranslationPagesRef.current.push(url);
      }
    }
    pumpTranslationQueue();
    drainAiBatch(translationGenerationRef.current);
  };

  useEffect(() => {
    enqueueTranslationWindow();
    // The scheduler function intentionally follows the current render state.
    // Its inputs below are the only values that should trigger scheduling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoTranslation, currentPageIndex, pages]);

  useEffect(() => {
    return () => {
      if (translationErrorTimeoutRef.current) {
        clearTimeout(translationErrorTimeoutRef.current);
      }
    };
  }, []);

  /** Cancels the active translation run (used when toggling off or switching mode). */
  const stopTranslationRun = () => {
    translationGenerationRef.current += 1;
    queuedTranslationPagesRef.current = [];
    queuedTranslationPageSetRef.current.clear();
    activeTranslationPageSetRef.current.clear();
    activeTranslationJobsRef.current = 0;
    setActiveTranslationJobs(0);
    aiBatchQueueRef.current = [];
    aiPageRegionsRef.current.clear();
    aiPageRemainingRef.current.clear();
    aiPageDimsRef.current.clear();
    aiFlushRunningRef.current = 0;
    aiFlushChainRef.current = Promise.resolve();
    setAutoTranslation(false);
    setTranslationPages((prev) =>
      Object.fromEntries(
        Object.entries(prev).filter(([, page]) => page.stage === "done"),
      ),
    );
  };

  /**
   * Drops all per-chapter pipeline state when a new chapter loads. The RAM OCR
   * cache is manga-scoped, so it only resets when the manga identity changes.
   */
  const resetTranslationPipeline = () => {
    setYoloCache({});
    setTranslationPages({});
    setPipelineError(null);
    setAutoTranslation(false);
    translationGenerationRef.current += 1;
    queuedTranslationPagesRef.current = [];
    queuedTranslationPageSetRef.current.clear();
    aiBatchQueueRef.current = [];
    aiPageRegionsRef.current.clear();
    aiPageRemainingRef.current.clear();
    aiPageDimsRef.current.clear();
    aiFlushRunningRef.current = 0;
    aiFlushChainRef.current = Promise.resolve();
    if (aiCacheMangaRef.current !== identity.mangaId) {
      aiCacheMangaRef.current = identity.mangaId;
      ocrCacheRef.current.clear();
      ocrCacheSeqRef.current = 0;
    }
  };

  const toggleAutoTranslation = () => {
    if (autoTranslation) {
      stopTranslationRun();
      return;
    }

    if (translateMode === "off") {
      showTranslationError(
        "Translation mode is Off - pick Free or AI translation first.",
      );
      onTranslationSetupRequired();
      return;
    }
    if (translateMode === "ai" && !geminiApiKey.trim()) {
      showTranslationError(
        "AI translation needs a Gemini API key - set it in Translation options.",
      );
      onTranslationSetupRequired();
      return;
    }

    translationGenerationRef.current += 1;
    setPipelineError(null);
    setAutoTranslation(true);
  };

  return {
    translationPages,
    pipelineError,
    setPipelineError,
    autoTranslation,
    activeTranslationJobs,
    resetTranslationPipeline,
    stopTranslationRun,
    toggleAutoTranslation,
  };
}
