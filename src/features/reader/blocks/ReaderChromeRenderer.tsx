/**
 * Reader chrome composition for the current session.
 *
 * ReaderScreen owns state and callbacks; this block only maps them onto the
 * chrome stack. Keeping the long prop list here makes the screen's remaining
 * lifecycle and view wiring easier to scan without changing touch behavior.
 */
import type { ReactNode } from "react";

import type { ReaderChromeStackProps } from "../components/chrome/ReaderChromeStack.types";
import ReaderChromeStack from "../components/chrome/ReaderChromeStack";

export interface ReaderChromeRendererProps {
  showHeader: ReaderChromeStackProps["showHeader"];
  setShowHeader: ReaderChromeStackProps["setShowHeader"];
  chrome: ReaderChromeStackProps["chrome"];
  mangaTitle: string;
  chapterLabel: string;
  autoTranslation: boolean;
  activeTranslationJobs: number;
  translationMode: ReaderChromeStackProps["translationMode"];
  toggleAutoTranslation: () => void;
  openTranslationOptions: () => void;
  goBack: () => void;
  closeChrome: () => void;
  bookmarkSlot: ReactNode;
  downloadSlot: ReactNode;
  configOpen: boolean;
  configTab: ReaderChromeStackProps["configTab"];
  setConfigTab: ReaderChromeStackProps["setConfigTab"];
  closeConfig: () => void;
  handleChromeChange: ReaderChromeStackProps["handleChromeChange"];
  defaultZoomScale: number;
  handleSelectDefaultZoomScale: (scale: number) => void;
  scrollSpeed: number;
  handleSelectScrollSpeed: (speed: number) => void;
  translationOpen: boolean;
  translationTab: ReaderChromeStackProps["translationTab"];
  setTranslationTab: ReaderChromeStackProps["setTranslationTab"];
  closeTranslation: () => void;
  readerLanguage: string;
  ocrLanguage: string;
  autoLanguage: string;
  targetLanguage: string;
  handleSelectReaderLanguage: (code: string) => void;
  handleSelectTargetLanguage: (code: string) => void;
  translationEngine: ReaderChromeStackProps["translationEngine"];
  handleSelectTranslationEngine: ReaderChromeStackProps["handleSelectTranslationEngine"];
  handleSelectTranslationMode: ReaderChromeStackProps["handleSelectTranslationMode"];
  geminiModelId: ReaderChromeStackProps["geminiModelId"];
  handleSelectGeminiModel: ReaderChromeStackProps["handleSelectGeminiModel"];
  autoModelSwitch: boolean;
  handleChangeAutoModelSwitch: (value: boolean) => void;
  ocrLookahead: number;
  handleChangeLookahead: (value: number) => void;
  metrics: ReaderChromeStackProps["metrics"];
  handleClearTranslationCache: ReaderChromeStackProps["handleClearTrCache"];
  overlayFont: ReaderChromeStackProps["overlayFont"];
  handleSelectOverlayFont: ReaderChromeStackProps["handleSelectOverlayFont"];
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
  openReadingModeSheet: () => void;
  openRotationSheet: () => void;
  autoScroll: boolean;
  setAutoScroll: (active: boolean) => void;
  pagedMode: boolean;
  openSettings: () => void;
  pendingReadingMode: ReaderChromeStackProps["pendingReadingMode"];
  pendingDirection: ReaderChromeStackProps["pendingDirection"];
  setPendingReadingMode: ReaderChromeStackProps["setPendingReadingMode"];
  setPendingDirection: ReaderChromeStackProps["setPendingDirection"];
  readingModeSheetOpen: boolean;
  setReadingModeSheetOpen: (open: boolean) => void;
  pendingOrientation: ReaderChromeStackProps["pendingOrientation"];
  setPendingOrientation: ReaderChromeStackProps["setPendingOrientation"];
  rotationSheetOpen: boolean;
  setRotationSheetOpen: (open: boolean) => void;
  pageActionsUrl: string | null;
  setPageActionsUrl: (url: string | null) => void;
  retryPage: (url: string) => void;
  pipelineError: string | null;
  singlePageUrl: string;
  singleStage: ReaderChromeStackProps["singleStage"];
  singlePageBusy: boolean;
  translateSinglePage: (url: string) => void;
}

export default function ReaderChromeRenderer({
  showHeader,
  setShowHeader,
  chrome,
  mangaTitle,
  chapterLabel,
  autoTranslation,
  activeTranslationJobs,
  translationMode,
  toggleAutoTranslation,
  openTranslationOptions,
  goBack,
  closeChrome,
  bookmarkSlot,
  downloadSlot,
  configOpen,
  configTab,
  setConfigTab,
  closeConfig,
  handleChromeChange,
  defaultZoomScale,
  handleSelectDefaultZoomScale,
  scrollSpeed,
  handleSelectScrollSpeed,
  translationOpen,
  translationTab,
  setTranslationTab,
  closeTranslation,
  readerLanguage,
  ocrLanguage,
  autoLanguage,
  targetLanguage,
  handleSelectReaderLanguage,
  handleSelectTargetLanguage,
  translationEngine,
  handleSelectTranslationEngine,
  handleSelectTranslationMode,
  geminiModelId,
  handleSelectGeminiModel,
  autoModelSwitch,
  handleChangeAutoModelSwitch,
  ocrLookahead,
  handleChangeLookahead,
  metrics,
  handleClearTranslationCache,
  overlayFont,
  handleSelectOverlayFont,
  overlayFontWeight,
  handleSelectOverlayFontWeight,
  overlayFontScale,
  handleSelectOverlayFontScale,
  overlayTextColor,
  handleSelectOverlayTextColor,
  showPageStatus,
  handleChangeShowPageStatus,
  hideTranslated,
  handleChangeHideTranslated,
  currentPageIndex,
  pagesLength,
  scrollToPage,
  canPrevChapter,
  canNextChapter,
  onPrevChapter,
  onNextChapter,
  openReadingModeSheet,
  openRotationSheet,
  autoScroll,
  setAutoScroll,
  pagedMode,
  openSettings,
  pendingReadingMode,
  pendingDirection,
  setPendingReadingMode,
  setPendingDirection,
  readingModeSheetOpen,
  setReadingModeSheetOpen,
  pendingOrientation,
  setPendingOrientation,
  rotationSheetOpen,
  setRotationSheetOpen,
  pageActionsUrl,
  setPageActionsUrl,
  retryPage,
  pipelineError,
  singlePageUrl,
  singleStage,
  singlePageBusy,
  translateSinglePage,
}: ReaderChromeRendererProps) {
  return (
    <ReaderChromeStack
      showHeader={showHeader}
      setShowHeader={setShowHeader}
      chrome={chrome}
      mangaTitle={mangaTitle}
      chapterLabel={chapterLabel}
      autoTranslation={autoTranslation}
      activeTranslationJobs={activeTranslationJobs}
      translationMode={translationMode}
      toggleAutoTranslation={toggleAutoTranslation}
      openTranslationOptions={openTranslationOptions}
      goBack={goBack}
      closeChrome={closeChrome}
      bookmarkSlot={bookmarkSlot}
      downloadSlot={downloadSlot}
      configOpen={configOpen}
      configTab={configTab}
      setConfigTab={setConfigTab}
      closeConfig={closeConfig}
      handleChromeChange={handleChromeChange}
      defaultZoomScale={defaultZoomScale}
      handleSelectDefaultZoomScale={handleSelectDefaultZoomScale}
      scrollSpeed={scrollSpeed}
      handleSelectScrollSpeed={handleSelectScrollSpeed}
      translationOpen={translationOpen}
      translationTab={translationTab}
      setTranslationTab={setTranslationTab}
      closeTranslation={closeTranslation}
      readerLanguage={readerLanguage}
      ocrLanguage={ocrLanguage}
      autoLanguage={autoLanguage}
      targetLanguage={targetLanguage}
      handleSelectReaderLanguage={handleSelectReaderLanguage}
      handleSelectTargetLanguage={handleSelectTargetLanguage}
      translationEngine={translationEngine}
      handleSelectTranslationEngine={handleSelectTranslationEngine}
      handleSelectTranslationMode={handleSelectTranslationMode}
      geminiModelId={geminiModelId}
      handleSelectGeminiModel={handleSelectGeminiModel}
      autoModelSwitch={autoModelSwitch}
      handleChangeAutoModelSwitch={handleChangeAutoModelSwitch}
      ocrLookahead={ocrLookahead}
      handleChangeLookahead={handleChangeLookahead}
      metrics={metrics}
      handleClearTrCache={handleClearTranslationCache}
      overlayFont={overlayFont}
      handleSelectOverlayFont={handleSelectOverlayFont}
      overlayFontWeight={overlayFontWeight}
      handleSelectOverlayFontWeight={handleSelectOverlayFontWeight}
      overlayFontScale={overlayFontScale}
      handleSelectOverlayFontScale={handleSelectOverlayFontScale}
      overlayTextColor={overlayTextColor}
      handleSelectOverlayTextColor={handleSelectOverlayTextColor}
      showPageStatus={showPageStatus}
      handleChangeShowPageStatus={handleChangeShowPageStatus}
      hideTranslated={hideTranslated}
      handleChangeHideTranslated={handleChangeHideTranslated}
      currentPageIndex={currentPageIndex}
      pagesLength={pagesLength}
      scrollToPage={scrollToPage}
      canPrevChapter={canPrevChapter}
      canNextChapter={canNextChapter}
      onPrevChapter={onPrevChapter}
      onNextChapter={onNextChapter}
      readingMode={chrome.readingMode}
      openReadingModeSheet={openReadingModeSheet}
      openRotationSheet={openRotationSheet}
      autoScroll={autoScroll}
      setAutoScroll={setAutoScroll}
      pagedMode={pagedMode}
      pendingReadingMode={pendingReadingMode}
      pendingDirection={pendingDirection}
      setPendingReadingMode={setPendingReadingMode}
      setPendingDirection={setPendingDirection}
      readingModeSheetOpen={readingModeSheetOpen}
      setReadingModeSheetOpen={setReadingModeSheetOpen}
      pendingOrientation={pendingOrientation}
      setPendingOrientation={setPendingOrientation}
      rotationSheetOpen={rotationSheetOpen}
      setRotationSheetOpen={setRotationSheetOpen}
      pageActionsUrl={pageActionsUrl}
      setPageActionsUrl={setPageActionsUrl}
      retryPage={retryPage}
      openSettings={openSettings}
      pipelineError={pipelineError}
      singlePageUrl={singlePageUrl}
      singleStage={singleStage}
      singlePageBusy={singlePageBusy}
      translateSinglePage={translateSinglePage}
    />
  );
}
