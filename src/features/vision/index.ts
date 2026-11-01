/** Public API for on-device page detection, segmentation and OCR. */

export type {
  Detection,
  DetectionResult,
  YoloOptions,
} from "./detection/detectionTypes";
export { detectPageRegions } from "./detection/pageDetector";
export type { DetectPageOptions } from "./detection/pageDetector";
export { RtDetrDetector, RtDetrError, rtdetrDetector } from "./detection/rtdetr";

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
export {
  DEFAULT_REGION_DETECTOR_ID,
  getRegionDetector,
  isRegionDetectorId,
  REGION_DETECTORS,
  regionRoleForClass,
} from "./models/regionModels";
export type {
  DetectionRole,
  RegionDetectorDef,
  RegionDetectorId,
  RegionDetectorKind,
  RegionModelFile,
} from "./models/regionModels";
export {
  ALL_REGION_DETECTOR_IDS,
  cancelRegionModelDownload,
  deleteRegionModel,
  downloadRegionModel,
  getRegionModelDownloadState,
  isRegionModelDownloaded,
  regionDetectorDirectoryUri,
  regionDetectorFileUri,
  subscribeRegionModelDownloads,
} from "./models/regionModelStore";
export type {
  RegionModelDownloadState,
  RegionModelDownloadStatus,
} from "./models/regionModelStore";
