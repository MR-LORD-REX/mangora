/**
 * Shared contracts for the reader translation pipeline.
 *
 * The pipeline has three queue stages (scan, OCR, translate) plus a cache
 * adapter. These types keep those stages independent of React and of each
 * other's implementation files.
 */

import type {
  ReaderTranslationEngine,
  ReaderTranslationMode,
} from "@core/settings";
import type { WorkQueue, WorkQueueMetrics } from "@shared/async/workQueue";
import type {
  Box,
  BubbleMask,
  GeminiModelId,
  PageTranslationState,
  TranslationRegionState,
  TranslationSlot,
} from "@features/translation";
import type {
  DetectionResult,
  OcrRegion,
  OcrTextItem,
} from "@features/vision";

import type { ReaderIdentity } from "@core/catalog/readerIdentity";

export interface OcrBubbleRecord {
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

export interface OcrPageRecord {
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

export interface ScanTask {
  url: string;
  pageIndex: number;
  generation: number;
}

export interface OcrTask {
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

export interface PageTranslationTask {
  url: string;
  pageIndex: number;
  generation: number;
}

export interface PipelineConfig {
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

export const EMPTY_READER_PIPELINE_METRICS: ReaderPipelineMetrics = {
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

export interface ReaderTranslationSnapshot {
  translationPages: Record<string, PageTranslationState>;
  pipelineError: string | null;
  autoTranslation: boolean;
  translationActive: boolean;
  singlePageBusy: boolean;
  singlePageIndex: number | null;
  activeTranslationJobs: number;
  metrics: ReaderPipelineMetrics;
}

export interface ReaderTranslationController extends ReaderTranslationSnapshot {
  setPipelineError: (message: string | null) => void;
  resetTranslationPipeline: () => void;
  stopTranslationRun: () => void;
  toggleAutoTranslation: () => void;
  translateSinglePage: (url: string) => void;
  retryPage: (url: string) => void;
  clearRamCache: () => void;
}

export interface TranslationQueues {
  scan: WorkQueue<ScanTask>;
  ocr: WorkQueue<OcrTask>;
  free: WorkQueue<PageTranslationTask>;
  ai: WorkQueue<PageTranslationTask>;
}

/**
 * Surface used by queue stages. It intentionally exposes the shared mutable
 * page stores, but keeps stage modules from owning pipeline lifecycle.
 */
export interface ReaderTranslationRuntime {
  readonly config: PipelineConfig;
  readonly identity: ReaderIdentity;
  readonly detection: Map<string, DetectionResult>;
  readonly ocrStore: Map<string, OcrPageRecord>;
  readonly queues: TranslationQueues;
  readonly effectiveOcrBubbleWorkers: number;
  readonly pages: string[];

  isCurrentRun(generation: number): boolean;
  nextOcrSequence(): number;
  updatePage(url: string, patch: Partial<PageTranslationState>): void;
  buildPageRegions(page: OcrPageRecord): TranslationRegionState[];
  refreshPageState(page: OcrPageRecord): void;
  markPageError(url: string, message: string): void;
  showTranslationError(message: string): void;
  finishSinglePage(url: string): void;
  finishPageOcr(page: OcrPageRecord, generation: number): void;
  restoreCachedPage(
    url: string,
    pageIndex: number,
    generation: number,
  ): Promise<boolean>;
  savePageRecord(page: OcrPageRecord): Promise<void>;
  getAutoSwitchFailures(): number;
  setAutoSwitchFailures(value: number): void;
  disableAutoModelSwitch(): void;
}

export type TranslationQueueMetrics = WorkQueueMetrics;
