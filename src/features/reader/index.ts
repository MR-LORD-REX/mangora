export {
  isGapLessMode,
  isHorizontalMode,
  isLongStripMode,
  isPagedMode,
} from "./domain/legacyReadingModes";
export type { ReaderReadingMode } from "./domain/legacyReadingModes";
export {
  isReaderViewMode,
  readerViewModeFor,
} from "./domain/modes";
export type { ReaderViewMode } from "./domain/modes";
export {
  pageGeometry,
} from "./domain/layout/pageGeometry";
export type {
  PageDims,
  PageGeometry,
  ReaderPageSplitHalf,
} from "./domain/layout/pageGeometry";
export {
  buildReaderDisplayItems,
  isWidePage,
  splitOrderFor,
} from "./domain/layout/readerItems";
export type {
  ReaderDisplayItem,
  ReaderItemOptions,
} from "./domain/layout/readerItems";
export {
  TAP_ZONE_INSET,
  tapZoneRectsFor,
  resolveTapZoneAction,
} from "./domain/navigation/tapZones";
export type {
  ReaderTapAction,
  ResolveTapZoneOptions,
  TapZoneEdge,
  TapZoneRect,
} from "./domain/navigation/tapZones";
export {
  ReaderSessionProvider,
  useReaderSession,
} from "./state/ReaderSessionProvider";
export type { ReaderSessionValue } from "./state/ReaderSessionProvider";
export { default as ReaderScreen } from "./screens/ReaderScreen";
export type { ReaderScreenProps } from "./screens/ReaderScreen";
export { default as PagedReader } from "./views/paged/PagedReader";
export type { PagedReaderProps } from "./views/paged/PagedReader";
export { default as StripReader } from "./views/strip/StripReader";
export type {
  StripReaderHandle,
  StripReaderProps,
  StripViewportState,
} from "./views/strip/StripReader";
export {
  createInitialReaderSessionState,
  readerSessionReducer,
} from "./state/readerSessionReducer";
export type {
  ReaderChromeUpdate,
  ReaderSessionAction,
  ReaderSessionState,
} from "./state/readerSessionReducer";
export { useReaderTranslation } from "./translation/useReaderTranslation";
export type {
  ReaderPipelineMetrics,
  ReaderTranslationController,
  UseReaderTranslationOptions,
} from "./translation/types";
