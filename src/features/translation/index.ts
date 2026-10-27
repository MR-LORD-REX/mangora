/**
 * Public API for translation. Consumers import this module only; the reader
 * and pre-translate queue use the same engines, cache keys and quota policy.
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
  GEMINI_MODELS,
  geminiModelInfo,
} from "./engines/gemini/geminiModels";
export {
  GEMINI_DEFAULT_MODEL,
  GEMINI_MODEL_IDS,
  isGeminiModelId,
} from "@core/settings/geminiModelId";
export type { GeminiModelId } from "@core/settings/geminiModelId";

export {
  GeminiApiError,
  parseGeminiJson,
  translateGeminiBatch,
  validateGeminiApiKey,
} from "./engines/gemini/geminiClient";
export type {
  GeminiBatchRegion,
  GeminiBatchResponse,
  GeminiBatchResult,
  GeminiPagePayload,
  GeminiUsageInfo,
} from "./engines/gemini/geminiClient";
export {
  AUTO_MODEL_SWITCH_FAILURE_LIMIT,
  fallbackModelChain,
  isGeminiRateLimitError,
  nextAutoSwitchFailureState,
  requestWithModelFallback,
} from "./engines/gemini/geminiFallback";
export type {
  AutoSwitchFailureState,
  ModelFallbackOutcome,
} from "./engines/gemini/geminiFallback";
export {
  getGeminiUsageSnapshot,
  pacificDayStartMs,
  recordGeminiUsage,
  subscribeGeminiUsage,
  waitForRpmCapacity,
} from "./engines/gemini/geminiUsage";
export type {
  GeminiUsageRecordInput,
  GeminiUsageSnapshot,
} from "./engines/gemini/geminiUsage";

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
} from "./pipeline/translationRegions";

export {
  getTranslationLockOwner,
  releaseTranslationLock,
  subscribeTranslationLock,
  tryAcquireTranslationLock,
} from "./jobs/translationRuntimeLock";
export type { TranslationLockOwner } from "./jobs/translationRuntimeLock";

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
