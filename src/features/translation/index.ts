/**
 * Public API for translation. Consumers import this module only; the reader
 * and pre-translate queue use the same endpoint adapter, cache keys and usage
 * policy.
 */

export {
  READER_TARGET_OPTIONS,
  isCjkLanguageCode,
  isSameEngineLanguage,
  toEngineLanguageCode,
} from "./domain/languages";
export type {
  Box,
  BubbleMask,
  PageTranslationState,
  Point,
  ReaderTranslateMode,
  TranslateTextFn,
  TranslationRegionState,
  TranslationSlot,
  TranslationSlotKind,
} from "./domain/types";

export {
  DEFAULT_REGION_DETECTOR_ID,
  isRegionDetectorId,
} from "@shared/contracts/regionDetector";
export type {
  DetectionRole,
  RegionDetectorId,
} from "@shared/contracts/regionDetector";

export {
  DEFAULT_TRANSLATION_BASE_URL,
  DEFAULT_TRANSLATION_MODELS,
  isGeminiBaseUrl,
  normalizeBaseUrl,
  normalizeTranslationBaseUrl,
} from "@shared/contracts/translationProvider";
export type { TranslationProviderConfig } from "@shared/contracts/translationProvider";

export {
  resolveTranslationProvider,
  translationProviderReadinessError,
  translationProviderLabel,
} from "./provider";

export {
  isOpenAiRateLimitError,
  OpenAiCompatibleError,
  translateOpenAiCompatibleBatch,
  translationEndpoint,
  validateOpenAiCompatibleEndpoint,
} from "./engines/openai/openaiClient";
export type {
  OpenAiBatchRequest,
  OpenAiBatchResponse,
  OpenAiUsageInfo,
} from "./engines/openai/openaiClient";

export {
  buildTranslationSystemPrompt,
  buildTranslationUserPrompt,
  parseBatchJson,
  validateBatchResults,
} from "./engines/shared/batchPrompt";
export type {
  TranslationBatchRegion,
  TranslationBatchResult,
  TranslationPagePayload,
} from "./engines/shared/batchPrompt";

export {
  AUTO_MODEL_SWITCH_FAILURE_LIMIT,
  nextAutoSwitchFailureState,
  requestWithModelFallback,
} from "./engines/shared/modelFallback";
export type {
  AutoSwitchFailureState,
  ModelFallbackOutcome,
} from "./engines/shared/modelFallback";

export {
  getTranslationsUsageSnapshot,
  pacificDayStartMs,
  recordTranslationUsage,
  subscribeTranslationUsage,
} from "./pipeline/translationUsage";
export type {
  TranslationUsageRecordInput,
  TranslationUsageSnapshot,
} from "./pipeline/translationUsage";

export {
  localTranslate,
  translateFreeBatch,
} from "./engines/google/googleClient";
export type {
  FreeBatchPage,
  FreeBatchRegion,
  FreeBatchResult,
} from "./engines/google/googleClient";

export {
  assignItemsToSlots,
  assembleSlotText,
  buildTranslationSlots,
  countTextRows,
  fillSlotTexts,
  ocrRegionsForSlots,
} from "./pipeline/translationRegions";
export {
  selectPreviousContextPages,
  selectPreviousContextPagesUnique,
} from "./pipeline/contextPages";
export {
  pageCacheIdentity,
  translationCacheKey,
} from "./pipeline/cacheIdentity";
export type { TranslationCacheIdentity } from "./pipeline/cacheIdentity";
export { runAiTranslationBatch } from "./pipeline/aiBatch";
export type { AiBatchContext, AiBatchOutcome } from "./pipeline/aiBatch";
export type { ContextPage } from "./pipeline/contextPages";

export { withTranslationComputePermit } from "./jobs/translationComputeCoordinator";
export type { TranslationComputePriority } from "./jobs/translationComputeCoordinator";

export {
  cancelTranslationQueue,
  enqueuePretranslateJob,
  getPretranslateSnapshot,
  initPretranslateQueue,
  pauseTranslationQueue,
  removePretranslateJob,
  resumeTranslationQueue,
  subscribePretranslate,
} from "./jobs/pretranslateQueue";
export type {
  PretranslateJob,
  PretranslateQueueDependencies,
  PretranslateSnapshot,
  PretranslateStatus,
} from "./jobs/pretranslateQueue";
export { default as PretranslateDialog } from "./components/PretranslateDialog";
export type { PretranslateDialogProps } from "./components/PretranslateDialog";
