/**
 * Reader translation pipeline controller.
 *
 * Owns queue lifecycle, page/bubble RAM state, cache restore, the automatic
 * translation window, and run start/stop. React only mirrors the snapshot this
 * controller publishes; the queue stages live in `scanOcr.ts` and
 * `translateWorkers.ts`.
 */

import {
  assignItemsToSlots,
  fillSlotTexts,
  getTranslationLockOwner,
  isCjkLanguageCode,
  isSameEngineLanguage,
  releaseTranslationLock,
  tryAcquireTranslationLock,
  type PageTranslationState,
  type TranslationRegionState,
  type TranslationSlot,
} from "@features/translation";
import {
  clampOcrBubbleWorkers,
  modelIdForLanguage,
  ocrEngineConcurrency,
  releaseLocalOcrEngines,
  releaseDecodablePageUri,
  type DetectionResult,
} from "@features/vision";
import { WorkQueue } from "@shared/async/workQueue";
import { languageLabel } from "@features/reader/components/panels/readerLanguages";

import type { ReaderIdentity } from "@core/catalog/readerIdentity";

import {
  bubblesFromCachedRegions,
  deletePageFromCache,
  loadPageFromCache,
  regionsFromCachedRegions,
  savePageToCache,
} from "./cache";
import {
  buildPageRegions,
  countBubbleProgress,
  createBubbleRecord,
  createPageDefaults,
} from "./pageState";
import { recognizeBubbleBatch, scanPage } from "./scanOcr";
import { translateAiPage, translateFreePage } from "./translateWorkers";
import {
  EMPTY_READER_PIPELINE_METRICS,
  type OcrPageRecord,
  type PipelineConfig,
  type ReaderPipelineMetrics,
  type ReaderTranslationRuntime,
  type ReaderTranslationSnapshot,
  type ScanTask,
  type TranslationQueues,
} from "./types";

export interface ReaderTranslationPipelineOptions {
  source: string;
  identity: ReaderIdentity;
  config: PipelineConfig;
  pages: string[];
  currentPageIndex: number;
  ocrBubbleWorkers: number;
  ocrLookahead: number;
  onSnapshot: (snapshot: ReaderTranslationSnapshot) => void;
  onAutoModelSwitchDisabled: () => void;
  onTranslationSetupRequired: () => void;
}

interface PipelineState {
  translationPages: Record<string, PageTranslationState>;
  pipelineError: string | null;
  autoTranslation: boolean;
  singlePageBusy: boolean;
  singlePageIndex: number | null;
  metrics: ReaderPipelineMetrics;
}

export class ReaderTranslationPipeline implements ReaderTranslationRuntime {
  config: PipelineConfig;
  identity: ReaderIdentity;
  readonly detection = new Map<string, DetectionResult>();
  readonly ocrStore = new Map<string, OcrPageRecord>();
  readonly queues: TranslationQueues;

  get pages(): string[] {
    return this.options.pages;
  }

  private readonly source: string;
  private readonly options: ReaderTranslationPipelineOptions;
  private readonly state: PipelineState = {
    translationPages: {},
    pipelineError: null,
    autoTranslation: false,
    singlePageBusy: false,
    singlePageIndex: null,
    metrics: EMPTY_READER_PIPELINE_METRICS,
  };
  private currentPageIndex: number;
  private generation = 0;
  private autoActive = false;
  private singleActive = false;
  private singlePageIndexValue: number | null = null;
  private ocrSequence = 0;
  private autoSwitchFailures = 0;
  private ramMangaId: string | null = null;
  private errorTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly queueMetrics: Record<
    string,
    { pending: number; active: number }
  > = {};
  private publishScheduled = false;
  private readonly singleLockKey: string;
  private readonly autoLockKey: string;
  private disposed = false;

  get effectiveOcrBubbleWorkers(): number {
    return clampOcrBubbleWorkers(
      modelIdForLanguage(this.config.sourceLanguage),
      this.options.ocrBubbleWorkers,
    );
  }

  constructor(options: ReaderTranslationPipelineOptions) {
    this.options = options;
    this.source = options.source;
    this.identity = options.identity;
    this.config = options.config;
    this.currentPageIndex = options.currentPageIndex;
    const ocrModelId = modelIdForLanguage(options.config.sourceLanguage);
    const ocrQueueConcurrency = ocrEngineConcurrency(
      ocrModelId,
      this.effectiveOcrBubbleWorkers,
    );
    this.singleLockKey = "reader-single:" + options.identity.chapterId;
    this.autoLockKey = "reader-auto:" + options.identity.chapterId;
    this.queues = {
      scan: new WorkQueue<ScanTask>(
        "page-scan",
        1,
        (task) => scanPage(this, this.source, task),
        this.onQueueChange,
      ),
      ocr: new WorkQueue(
        "bubble-ocr",
        ocrQueueConcurrency,
        (task) => recognizeBubbleBatch(this, this.source, task),
        this.onQueueChange,
      ),
      free: new WorkQueue(
        "free-tr",
        1,
        (task) => translateFreePage(this, task),
        this.onQueueChange,
      ),
      ai: new WorkQueue(
        "ai-tr",
        1,
        (task) => translateAiPage(this, task),
        this.onQueueChange,
      ),
    };
    console.log("[reader][tr] queues created", {
      scan: 1,
      ocr: ocrQueueConcurrency,
      free: 1,
      ai: 1,
    });
    this.publish();
  }

  updateConfig(config: PipelineConfig): void {
    this.config = config;
    const ocrModelId = modelIdForLanguage(config.sourceLanguage);
    this.queues.ocr.setConcurrency(
      ocrEngineConcurrency(ocrModelId, this.effectiveOcrBubbleWorkers),
    );
  }

  setPages(pages: string[]): void {
    this.options.pages = pages;
  }

  setCurrentPageIndex(pageIndex: number): void {
    this.currentPageIndex = pageIndex;
    this.options.currentPageIndex = pageIndex;
  }

  setOcrLookahead(lookahead: number): void {
    this.options.ocrLookahead = lookahead;
  }

  scheduleAutoWindow(): void {
    this.enqueueWindow(this.generation);
  }

  isCurrentRun(generation: number): boolean {
    return (
      generation === this.generation && (this.autoActive || this.singleActive)
    );
  }

  nextOcrSequence(): number {
    return this.ocrSequence++;
  }

  updatePage(url: string, patch: Partial<PageTranslationState>): void {
    const previous = this.state.translationPages;
    const base = previous[url] ?? createPageDefaults(url, this.config);
    this.state.translationPages = {
      ...previous,
      [url]: { ...base, ...patch, url },
    };
    this.publish();
  }

  buildPageRegions(page: OcrPageRecord): TranslationRegionState[] {
    return buildPageRegions(page);
  }

  refreshPageState(page: OcrPageRecord): void {
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
    if (complete) page.status = translated > 0 ? "done" : "error";
    this.updatePage(page.url, {
      mode: this.config.engine,
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
    if (translated > 0) void this.savePageRecord(page);
    else {
      this.showTranslationError(
        `Translation failed for page ${page.pageIndex + 1}. Use the retry button on the page.`,
      );
    }
    this.finishSinglePage(page.url);
  }

  finishPageOcr(page: OcrPageRecord, generation: number): void {
    if (!this.isCurrentRun(generation)) return;
    void releaseDecodablePageUri(page.url);
    page.ocrComplete = true;
    page.pendingRegions.clear();
    const assigned = assignItemsToSlots(page.slots, page.items);
    const filled = fillSlotTexts(
      page.slots,
      assigned,
      isCjkLanguageCode(this.config.sourceLanguage),
    );
    const created = [];
    for (const slot of filled) {
      if (!slot.sourceText.trim() || page.bubbles.has(slot.id)) continue;
      const bubble = createBubbleRecord(page, slot, this.config);
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
      this.markPageError(
        page.url,
        `OCR returned no usable text on page ${page.pageIndex + 1}.`,
      );
      return;
    }
    page.status = "translate";
    this.updatePage(page.url, {
      mode: this.config.engine,
      stage: "translate",
      busy: true,
      visible: true,
      message: `Translating ${page.bubbles.size} bubble${page.bubbles.size === 1 ? "" : "s"}\u2026`,
      regions: buildPageRegions(page),
    });
    const pageTask = { url: page.url, pageIndex: page.pageIndex, generation };
    if (this.config.engine === "free") this.queues.free.push(pageTask, page.url);
    else if (this.config.engine === "ai") {
      this.queues.ai.push(pageTask, page.url);
    }
    const settled = [...page.bubbles.values()].every(
      (item) => item.status === "translated" || item.status === "error",
    );
    if (settled) this.refreshPageState(page);
  }

  markPageError(url: string, message: string): void {
    const page = this.ocrStore.get(url);
    if (page) page.status = "error";
    this.updatePage(url, {
      busy: false,
      stage: "error",
      message: null,
      visible: Boolean(
        this.state.translationPages[url]?.regions.some(
          (region) => region.status === "done",
        ),
      ),
    });
    this.showTranslationError(message);
    this.finishSinglePage(url);
  }

  showTranslationError(message: string): void {
    console.log("[reader][tr] error toast", message);
    this.state.pipelineError = message;
    this.publish();
    if (this.errorTimeout) clearTimeout(this.errorTimeout);
    this.errorTimeout = setTimeout(() => {
      this.state.pipelineError = null;
      this.errorTimeout = null;
      this.publish();
    }, 3500);
  }

  setPipelineError(message: string | null): void {
    if (this.errorTimeout) {
      clearTimeout(this.errorTimeout);
      this.errorTimeout = null;
    }
    this.state.pipelineError = message;
    this.publish();
  }

  async savePageRecord(page: OcrPageRecord): Promise<void> {
    try {
      await savePageToCache(page, {
        identity: this.identity,
        sourceLanguage: this.config.sourceLanguage,
        targetLanguage: this.config.targetLanguage,
      });
    } catch (error) {
      // Cache persistence is deliberately non-fatal: a failed write must not
      // hide a translation that is already visible on the page.
      console.warn("[reader][tr] cache save failed", error);
    }
  }

  async restoreCachedPage(
    url: string,
    pageIndex: number,
    generation: number,
  ): Promise<boolean> {
    const cached = await loadPageFromCache({
      identity: this.identity,
      url,
      pageIndex,
      sourceLanguage: this.config.sourceLanguage,
      targetLanguage: this.config.targetLanguage,
    }).catch((error) => {
      console.warn("[reader][tr] cache lookup failed", error);
      return null;
    });
    if (!cached || generation !== this.generation) return Boolean(cached);
    const slots: TranslationSlot[] = cached.regions.map((region) => ({
      id: region.regionId,
      kind: region.kind,
      pasteBox: region.pasteBox,
      eraseBoxes: region.eraseBoxes,
      mask: region.mask,
      lineCount: region.lineCount,
      sourceText: region.sourceText,
    }));
    const regions = regionsFromCachedRegions(cached.regions);
    const bubbles = bubblesFromCachedRegions({
      regions: cached.regions,
      url,
      pageIndex,
      sourceLanguage: this.config.sourceLanguage,
      targetLanguage: this.config.targetLanguage,
    });
    this.ocrStore.set(url, {
      url,
      pageIndex,
      chapterId: this.identity.chapterId,
      seq: this.nextOcrSequence(),
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
    this.updatePage(url, {
      mode: this.config.engine,
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
  }

  finishSinglePage(url: string): void {
    if (!this.singleActive) return;
    console.log("[reader][tr][single] page finished", {
      pageIndex: this.singlePageIndexValue,
      url,
      stage: this.state.translationPages[url]?.stage,
    });
    this.singleActive = false;
    releaseTranslationLock(this.singleLockKey);
    this.state.singlePageBusy = false;
    this.state.singlePageIndex = null;
    this.publish();
  }

  getAutoSwitchFailures(): number {
    return this.autoSwitchFailures;
  }

  setAutoSwitchFailures(value: number): void {
    this.autoSwitchFailures = value;
  }

  disableAutoModelSwitch(): void {
    this.config.autoModelSwitch = false;
    this.autoSwitchFailures = 0;
    console.warn(
      "[reader][tr][ai] auto model switch disabled after repeated failures",
    );
    this.options.onAutoModelSwitchDisabled();
  }

  toggleAutoTranslation(): void {
    if (this.state.autoTranslation) {
      this.stopTranslationRun();
      return;
    }
    if (this.config.translationMode !== "auto") {
      this.showTranslationError(
        "Auto translation is not selected - switch Translation mode to Auto.",
      );
      this.options.onTranslationSetupRequired();
      return;
    }
    const validationError = this.validateRun();
    if (validationError) {
      this.showTranslationError(validationError);
      this.options.onTranslationSetupRequired();
      return;
    }
    if (!tryAcquireTranslationLock(this.autoLockKey, "Reader auto translation")) {
      this.showTranslationError(this.lockMessage());
      return;
    }
    this.generation += 1;
    this.autoActive = true;
    this.singleActive = false;
    this.state.singlePageBusy = false;
    this.state.singlePageIndex = null;
    this.singlePageIndexValue = null;
    this.state.pipelineError = null;
    this.state.autoTranslation = true;
    this.publish();
    console.log("[reader][tr] run started", {
      engine: this.config.engine,
      mode: this.config.translationMode,
      generation: this.generation,
      lookahead: this.options.ocrLookahead,
    });
  }

  translateSinglePage(url: string): void {
    if (this.config.translationMode !== "single") {
      console.log("[reader][tr][single] ignored - mode is not single");
      return;
    }
    if (this.singleActive) {
      const page = (this.singlePageIndexValue ?? 0) + 1;
      this.showTranslationError(`Processing page ${page}.`);
      return;
    }
    const pageIndex = this.pages.indexOf(url);
    if (pageIndex < 0) return;
    const validationError = this.validateRun();
    if (validationError) {
      this.showTranslationError(validationError);
      this.options.onTranslationSetupRequired();
      return;
    }
    if (
      !tryAcquireTranslationLock(this.singleLockKey, `Reader page ${pageIndex + 1}`)
    ) {
      this.showTranslationError(this.lockMessage());
      return;
    }
    this.generation += 1;
    this.autoActive = false;
    this.singleActive = true;
    this.singlePageIndexValue = pageIndex;
    this.state.autoTranslation = false;
    this.clearPendingQueues();
    delete this.state.translationPages[url];
    this.detection.delete(url);
    this.ocrStore.delete(url);
    this.state.singlePageBusy = true;
    this.state.singlePageIndex = pageIndex;
    this.state.pipelineError = null;
    this.queues.scan.push({ url, pageIndex, generation: this.generation }, url);
    this.publish();
    console.log("[reader][tr][single] page queued", { pageIndex, url });
  }

  retryPage(url: string): void {
    const pageIndex = this.pages.indexOf(url);
    if (pageIndex < 0) return;
    const stage = this.state.translationPages[url]?.stage;
    if (stage === "detect" || stage === "ocr" || stage === "translate") {
      console.log("[reader][tr] retry ignored - page busy", { pageIndex, stage });
      return;
    }
    console.log("[reader][tr] retry page", { pageIndex, stage });
    this.ocrStore.delete(url);
    this.detection.delete(url);
    delete this.state.translationPages[url];
    this.publish();
    void deletePageFromCache({
      identity: this.identity,
      url,
      pageIndex,
      sourceLanguage: this.config.sourceLanguage,
      targetLanguage: this.config.targetLanguage,
    }).catch((error) => {
      console.warn("[reader][tr] retry cache delete failed", error);
    });
    if (this.config.translationMode === "single") {
      if (this.singleActive) {
        this.showTranslationError(
          `Processing page ${(this.singlePageIndexValue ?? 0) + 1}.`,
        );
        return;
      }
      if (!tryAcquireTranslationLock(this.singleLockKey, `Reader page ${pageIndex + 1}`)) {
        this.showTranslationError(this.lockMessage());
        return;
      }
      this.generation += 1;
      this.singleActive = true;
      this.singlePageIndexValue = pageIndex;
      this.state.autoTranslation = false;
      this.state.singlePageBusy = true;
      this.state.singlePageIndex = pageIndex;
      this.queues.scan.push({ url, pageIndex, generation: this.generation }, url);
      console.log("[reader][tr][single] retry queued", { pageIndex });
      this.publish();
      return;
    }
    if (!this.autoActive) return;
    this.queues.scan.push({ url, pageIndex, generation: this.generation }, url);
    this.publish();
  }

  clearRamCache(): void {
    this.ocrStore.clear();
    this.detection.clear();
    this.ocrSequence = 0;
    this.state.translationPages = {};
    this.publish();
    console.log("[reader][tr] RAM cache cleared", {
      mangaId: this.identity.mangaId,
    });
    if (this.autoActive) this.enqueueWindow(this.generation);
  }

  stopTranslationRun(): void {
    this.generation += 1;
    this.autoActive = false;
    this.singleActive = false;
    this.clearPendingQueues();
    this.releaseRunLocks();
    this.state.autoTranslation = false;
    this.state.singlePageBusy = false;
    this.state.singlePageIndex = null;
    this.singlePageIndexValue = null;
    this.state.translationPages = Object.fromEntries(
      Object.entries(this.state.translationPages).filter(
        ([, page]) => page.stage === "done",
      ),
    );
    this.publish();
    console.log("[reader][tr] run stopped", {
      keptPages: Object.keys(this.state.translationPages).length,
    });
  }

  resetTranslationPipeline(): void {
    this.generation += 1;
    this.autoActive = false;
    this.singleActive = false;
    this.clearPendingQueues();
    this.releaseRunLocks();
    this.state.singlePageBusy = false;
    this.state.singlePageIndex = null;
    this.singlePageIndexValue = null;
    this.detection.clear();
    this.state.translationPages = {};
    this.state.pipelineError = null;
    this.state.autoTranslation = false;
    if (this.ramMangaId !== this.identity.mangaId) {
      this.ramMangaId = this.identity.mangaId;
      this.ocrStore.clear();
      this.ocrSequence = 0;
      console.log("[reader][tr] RAM OCR store reset", {
        mangaId: this.identity.mangaId,
      });
    }
    this.publish();
    console.log("[reader][tr] pipeline reset", {
      chapterId: this.identity.chapterId,
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.errorTimeout) clearTimeout(this.errorTimeout);
    this.queues.scan.stop();
    this.queues.ocr.stop();
    this.queues.free.stop();
    this.queues.ai.stop();
    this.releaseRunLocks();
    void releaseLocalOcrEngines();
    console.log("[reader][tr] pipeline unmounted", {
      source: this.source,
    });
  }

  private enqueueWindow(generation: number): void {
    if (!this.autoActive) return;
    const windowSize = Math.min(
      5,
      Math.max(1, Math.round(this.options.ocrLookahead)),
    );
    const start = this.currentPageIndex;
    for (let offset = 0; offset < windowSize; offset += 1) {
      const pageIndex = start + offset;
      const url = this.pages[pageIndex];
      if (!url) continue;
      if (this.state.translationPages[url]) continue;
      this.queues.scan.push({ url, pageIndex, generation }, url);
    }
    console.log("[reader][scan] window queued", {
      start,
      size: windowSize,
      generation,
    });
  }

  private releaseRunLocks(): void {
    releaseTranslationLock(this.autoLockKey);
    releaseTranslationLock(this.singleLockKey);
  }

  private clearPendingQueues(): void {
    this.queues.scan.clearPending();
    this.queues.ocr.clearPending();
    this.queues.free.clearPending();
    this.queues.ai.clearPending();
  }

  private validateRun(): string | null {
    if (this.config.translationMode === "off") {
      return "Translation mode is Off - choose Single page or Auto first.";
    }
    if (
      isSameEngineLanguage(
        this.config.sourceLanguage,
        this.config.targetLanguage,
      )
    ) {
      return `Target language (${languageLabel(this.config.targetLanguage)}) matches the page language (${languageLabel(this.config.sourceLanguage)}) - nothing to translate.`;
    }
    if (this.config.engine === "ai" && !this.config.geminiApiKey.trim()) {
      return "AI translation needs a Gemini API key - set it in Settings > Translation.";
    }
    return null;
  }

  private lockMessage(): string {
    const lock = getTranslationLockOwner();
    if (lock && lock.key.startsWith("pretranslate:")) {
      return "A translation job is running. Pause or cancel it in Settings > Translation queue.";
    }
    return lock ? `Translation is already running (${lock.label}).` : "";
  }

  private readonly onQueueChange = (next: {
    name: string;
    pending: number;
    active: number;
  }): void => {
    this.queueMetrics[next.name] = next;
    this.publish();
  };

  private publish(): void {
    if (this.publishScheduled) return;
    this.publishScheduled = true;
    queueMicrotask(() => {
      this.publishScheduled = false;
      this.publishNow();
    });
  }

  private publishNow(): void {
    const pageList = Object.values(this.state.translationPages);
    const progress = countBubbleProgress(this.ocrStore.values());
    const q = this.queueMetrics;
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
      pagesTranslating: pageList.filter(
        (page) => page.stage === "translate",
      ).length,
      pagesTotal: pageList.length,
      pagesDone: pageList.filter((page) => page.stage === "done").length,
      pagesError: pageList.filter((page) => page.stage === "error").length,
      ...progress,
      activeJobs: 0,
    };
    next.activeJobs = next.scanActive + next.ocrActive + next.trActive;
    this.state.metrics = next;
    this.options.onSnapshot({
      translationPages: this.state.translationPages,
      pipelineError: this.state.pipelineError,
      autoTranslation: this.state.autoTranslation,
      translationActive:
        this.state.autoTranslation ||
        this.state.singlePageBusy ||
        this.state.singlePageIndex !== null,
      singlePageBusy: this.state.singlePageBusy,
      singlePageIndex: this.state.singlePageIndex,
      activeTranslationJobs: next.activeJobs,
      metrics: next,
    });
  }
}
