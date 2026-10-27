/**
 * Reader chrome stack contract.
 *
 * Kept separate from the component module so UI layout changes do not create
 * an import cycle through type-only consumers.
 */
import type { ReactNode } from "react";

import type { ReaderPipelineMetrics } from "@/utils/reader/useReaderTranslation";
import type { GeminiModelId } from "@features/translation";

import type {
  ReaderChromeSettings,
  ReaderOrientation,
  ReaderOverlayFont,
  ReaderPagedDirection,
  ReaderReadingMode,
} from "../panels/readerChrome";
import type { ReaderConfigTab } from "../panels/ReaderConfigPanel";
import type { ReaderTranslationTab } from "../panels/ReaderTranslationPanel";

export type TranslationStage = import("@features/translation").PageTranslationState["stage"] | undefined;

export interface ReaderChromeStackProps {
  showHeader: boolean;
  setShowHeader: (show: boolean) => void;
  chrome: ReaderChromeSettings;
  mangaTitle: string;
  chapterLabel: string;
  autoTranslation: boolean;
  activeTranslationJobs: number;
  translationMode: "off" | "single" | "auto";
  toggleAutoTranslation: () => void;
  openTranslationOptions: () => void;
  goBack: () => void;
  closeChrome: () => void;
  bookmarkSlot: ReactNode;
  downloadSlot: ReactNode;

  configOpen: boolean;
  configTab: ReaderConfigTab;
  setConfigTab: (tab: ReaderConfigTab) => void;
  closeConfig: () => void;
  handleChromeChange: (patch: Partial<ReaderChromeSettings>) => void;
  defaultZoomScale: number;
  handleSelectDefaultZoomScale: (scale: number) => void;
  scrollSpeed: number;
  handleSelectScrollSpeed: (speed: number) => void;

  translationOpen: boolean;
  translationTab: ReaderTranslationTab;
  setTranslationTab: (tab: ReaderTranslationTab) => void;
  closeTranslation: () => void;
  readerLanguage: string;
  ocrLanguage: string;
  autoLanguage: string;
  targetLanguage: string;
  handleSelectReaderLanguage: (code: string) => void;
  handleSelectTargetLanguage: (code: string) => void;
  translationEngine: "free" | "ai";
  handleSelectTranslationEngine: (engine: "free" | "ai") => void;
  handleSelectTranslationMode: (mode: "off" | "single" | "auto") => void;
  geminiModelId: GeminiModelId;
  handleSelectGeminiModel: (model: GeminiModelId) => void;
  autoModelSwitch: boolean;
  handleChangeAutoModelSwitch: (value: boolean) => void;
  ocrLookahead: number;
  handleChangeLookahead: (value: number) => void;
  metrics: ReaderPipelineMetrics;
  handleClearTrCache: () => Promise<number>;
  overlayFont: ReaderOverlayFont;
  handleSelectOverlayFont: (font: ReaderOverlayFont) => void;
  overlayFontWeight: number;
  handleSelectOverlayFontWeight: (weight: number) => void;
  overlayFontScale: number;
  handleSelectOverlayFontScale: (scale: number) => void;
  overlayTextColor: string;
  handleSelectOverlayTextColor: (color: string) => void;
  showPageStatus: boolean;
  handleChangeShowPageStatus: (value: boolean) => void;
  hideTranslated: boolean;
  handleChangeHideTranslated: (value: boolean) => void;

  currentPageIndex: number;
  pagesLength: number;
  scrollToPage: (index: number) => void;
  canPrevChapter: boolean;
  canNextChapter: boolean;
  onPrevChapter: () => void;
  onNextChapter: () => void;
  readingMode: ReaderReadingMode;
  openReadingModeSheet: () => void;
  openRotationSheet: () => void;
  autoScroll: boolean;
  setAutoScroll: (active: boolean) => void;
  pagedMode: boolean;
  openSettings: () => void;

  readingModeSheetOpen: boolean;
  pendingReadingMode: ReaderReadingMode;
  pendingDirection: ReaderPagedDirection;
  setPendingReadingMode: (mode: ReaderReadingMode) => void;
  setPendingDirection: (direction: ReaderPagedDirection) => void;
  setReadingModeSheetOpen: (open: boolean) => void;
  rotationSheetOpen: boolean;
  pendingOrientation: ReaderOrientation;
  setPendingOrientation: (orientation: ReaderOrientation) => void;
  setRotationSheetOpen: (open: boolean) => void;
  pageActionsUrl: string | null;
  setPageActionsUrl: (url: string | null) => void;
  retryPage: (url: string) => void;

  pipelineError: string | null;
  singlePageUrl: string;
  singleStage: TranslationStage;
  singlePageBusy: boolean;
  translateSinglePage: (url: string) => void;
}