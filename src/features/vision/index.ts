/** Public API for on-device page detection, segmentation and OCR. */

export {
  detectImage,
  isYoloRuntimeAvailable,
  yoloDetector,
  YOLO_CLASSES,
  YoloDetector,
  YoloError,
} from "./detection/yolo";
export {
  YOLO_CLASS_COLORS,
  YOLO_CLASS_LABELS,
  YOLO_CLASS_NAMES,
} from "./detection/detectionTypes";
export type {
  Detection,
  DetectionResult,
  YoloClassName,
  YoloOptions,
} from "./detection/detectionTypes";
export { detectPageRegions } from "./detection/pageDetector";

export {
  isMangaBubbleSegAvailable,
  mangaBubbleSegmenter,
  MangaBubbleSegError,
  MangaBubbleSegmenter,
  SEG_INPUT_SIZE,
} from "./segmentation/mangaBubbleSeg";

export {
  isModelDownloaded,
  recognizePageRegions,
  releaseLocalOcrEngines,
  LocalOcrError,
} from "./ocr/localOcr";
export type { LocalOcrPageOptions } from "./ocr/localOcr";
export {
  clearAbandonedOcrPageSources,
  cropRegionToLocalFile,
  deleteCropFile,
  emptyPageOutput,
  ensureDecodablePageUri,
  makePageItem,
  MIN_CROP_PX,
  OcrError,
  preparePaddleRegions,
  prepareTextRegions,
  releaseDecodablePageUri,
  roundPx,
} from "./ocr/pageOcr";
export type {
  DecodablePageOptions,
  OcrCrop,
  OcrRecognitionLevel,
  OcrRegion,
  OcrTextItem,
  PageOcrOptions,
  PageOcrOutput,
} from "./ocr/pageOcr";

export {
  ALL_MODEL_IDS,
  cancelModelDownload,
  deleteModel,
  downloadModel,
  getModelDownloadState,
  subscribeModelDownloads,
} from "./ocr/models/modelStore";
export type {
  ModelDownloadState,
  ModelDownloadStatus,
} from "./ocr/models/modelStore";
export {
  clampOcrBubbleWorkers,
  formatModelBytes,
  getLocalOcrModel,
  LOCAL_OCR_MODELS,
  maxOcrBubbleWorkers,
  modelForLanguageLabel,
  modelIdForLanguage,
  ocrEngineConcurrency,
  ocrRecognitionBatchSize,
} from "./ocr/models/ocrModels";
export type {
  LocalOcrEngine,
  LocalOcrModelDef,
  LocalOcrModelFile,
  LocalOcrModelId,
} from "./ocr/models/ocrModels";
