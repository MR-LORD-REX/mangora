import { StatusBar } from "expo-status-bar";
import { useMemo, useRef } from "react";
import { Dimensions, FlatList, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  ReaderEmptyState,
  ReaderLoadingState,
} from "../components/screens/ReaderScreenStates";
import { useReaderSession } from "../state/ReaderSessionProvider";
import { AddToLibraryButton } from "@features/library";
import { ReaderDownloadButton } from "@features/downloads";
import {
  applyFilterExclusivity,
  isGapLessMode,
  isHorizontalMode,
  isLongStripMode,
  orientationToLock,
  type ReaderChromeSettings,
} from "../components/panels/readerChrome";
import { autoLanguageForReader } from "../components/panels/readerLanguages";
import ReaderChromeRenderer from "../blocks/ReaderChromeRenderer";
import ReaderPageRenderer from "../blocks/ReaderPageRenderer";
import { clearTranslationCacheForManga } from "@core/db/repositories/translationRepository";
import { updateSettings } from "@core/settings";
import { readerBackgroundColor } from "../domain/readerBackground";
import { chromeToSettingsPatch } from "../domain/readerChromeSettings";
import type { ReaderDisplayItem } from "../domain/layout/readerItems";
import type { StripReaderHandle } from "../views/strip/StripReader";
import { useReaderTranslation } from "../translation/useReaderTranslation";
import { useReaderChapterPages } from "../hooks/useReaderChapterPages";
import { useReaderSessionLedger } from "../hooks/useReaderSessionLedger";
import { useReaderDownloadState } from "../hooks/useReaderDownloadState";
import { useReaderPageFlash } from "../hooks/useReaderPageFlash";
import { useReaderPageStatus } from "../hooks/useReaderPageStatus";
import { useReaderChromeController } from "../hooks/useReaderChromeController";
import { useReaderSettings } from "../hooks/useReaderSettings";
import { useReaderSettingsBridge } from "../hooks/useReaderSettingsBridge";
import { useReaderScreenLifetime } from "../hooks/useReaderScreenLifetime";
import { useReaderViewportState } from "../hooks/useReaderViewportState";
import { useReaderViewportControls } from "../hooks/useReaderViewportControls";
import ReaderViewport from "../views/ReaderViewport/ReaderViewport";

const windowDimensions = Dimensions.get("window");

const screenWidth = windowDimensions.width;

const screenHeight = windowDimensions.height;

export interface ReaderScreenProps {
  source: string;
  chapterId: string;
  mangaId: string;
  title: string;
  mangaTitle: string;
  thumbnailUrl: string;
  language: string;
  chapterMemo: string;
  chapterTitle?: string;
  onOpenMangaInfo: (target: { provider: string; id: string }) => void;
  onBack: () => void;
  onReplaceReader: (params: {
    id: string;
    [key: string]: string | number | undefined;
  }) => void;
}

export default function ReaderScreen({
  source,
  chapterId,
  mangaId,
  title,
  mangaTitle,
  thumbnailUrl,
  language,
  chapterMemo,
  chapterTitle,
  onOpenMangaInfo,
  onBack,
  onReplaceReader,
}: ReaderScreenProps) {
  const extensionSourceId = source.startsWith("ext:")
    ? source.slice(4)
    : undefined;

  const resetTranslationPipelineRef = useRef<() => void>(() => {});
  const clearTranslationCacheRef = useRef<() => Promise<number>>(
    async () => 0,
  );
  const resetViewportRef = useRef<() => void>(() => {});
  const setConfigOpenRef = useRef<(open: boolean) => void>(() => {});
  const pagedListRef = useRef<FlatList<ReaderDisplayItem> | null>(null);
  const stripListRef = useRef<StripReaderHandle | null>(null);

  const {
    readerIdentity,
    downloadTargetIdentity,
    downloadCandidate,
    downloadContext,
  } = useReaderDownloadState({
    source,
    chapterId,
    mangaId,
    title,
    mangaTitle,
    thumbnailUrl,
    language,
  });

  const autoLanguage = useMemo(
    () => autoLanguageForReader(source, language),
    [source, language],
  );

  const {
    chrome,
    setChrome,
    patchChrome,
    currentPageIndex,
    setCurrentPageIndex,
    showHeader,
    setShowHeader,
    loading,
    setLoading,
  } = useReaderSession();
  const {
    pages,
    loadError,
    prevChapterId,
    nextChapterId,
  } = useReaderChapterPages({
    source,
    chapterId,
    mangaId,
    chapterMemo,
    readerIdentity,
    providerChapterId: downloadTargetIdentity.providerChapterId,
    setLoading,
    resetTranslationPipeline: () => resetTranslationPipelineRef.current(),
    onChapterStart: () => {
      resetViewportRef.current();
      setConfigOpenRef.current(false);
    },
  });

  const {
    sheet,
    setConfigOpen,
    setConfigTab,
    setTranslationOpen,
    setTranslationTab,
    setPageActionsUrl,
    setReadingModeOpen,
    setRotationOpen,
    setPendingReadingMode,
    setPendingDirection,
    setPendingOrientation,
    goBack,
    openSettings,
    openTranslationOptions,
    openTranslationSetup,
    openReadingModeSheet,
    openRotationSheet,
    closeChrome,
    chapterLabel,
    canPrevChapter,
    canNextChapter,
    onPrevChapter,
    onNextChapter,
  } = useReaderChromeController({
    source,
    chapterId,
    mangaId,
    title,
    mangaTitle,
    thumbnailUrl,
    language,
    chapterTitle,
    chrome,
    prevChapterId,
    nextChapterId,
    onOpenMangaInfo,
    onBack,
    onReplaceReader,
    setShowHeader,
  });

  const {
    bodySize,
    setBodySize,
    currentDisplayIndex,
    setCurrentDisplayIndex,
    imageWindow,
    pageDims,
    rememberPageDims,
    pageImageHeaders,
    displayItems,
    displayItemsRef,
    pageOffsets,
    pagedMode,
    getItemLayout,
    syncPageIndexFromOffset,
    lastPageIndexRef,
    lastDisplayIndexRef,
    onViewableItemsChanged,
    resetViewport,
  } = useReaderViewportState({
    pages,
    source,
    chrome,
    currentPageIndex,
    setCurrentPageIndex,
    initialSize: { width: screenWidth, height: screenHeight },
  });
  resetViewportRef.current = resetViewport;
  setConfigOpenRef.current = setConfigOpen;

  const {
    scrollToReaderIndex,
    scrollToPage,
    handleScrollToIndexFailed,
    handlePagedTap,
    releasePagedTapLock,
    handleStripTap,
    handleStripScroll,
    autoScroll,
    scrollSpeed,
    setAutoScroll,
    setAutoScrollSpeed,
    handleScrollBeginDrag,
    handleStripViewportChange,
  } = useReaderViewportControls({
    chrome,
    sheet,
    bodySize,
    pagesLength: pages.length,
    displayItems,
    pageOffsets,
    currentPageIndex,
    setCurrentPageIndex,
    currentDisplayIndex,
    setCurrentDisplayIndex,
    pagedMode,
    lastPageIndexRef,
    lastDisplayIndexRef,
    pagedListRef,
    stripListRef,
    syncPageIndexFromOffset,
    setShowHeader,
  });

  // Settings and translation own their persisted values. The bridge below
  // updates chrome/auto-scroll after the store subscription is applied.
  const {
    readerLanguage,
    targetLanguage,
    translationEngine,
    translationMode,
    showPageStatus,
    hideTranslated,
    overlayFont,
    overlayFontWeight,
    overlayFontScale,
    overlayTextColor,
    geminiApiKey,
    geminiModelId,
    autoModelSwitch,
    ocrBubbleWorkers,
    ocrLookahead,
    aiMaxContextPages,
    defaultZoomScale,
    applySettings: applyReaderSettings,
    setAutoModelSwitch,
    setDefaultZoomScale,
    setOverlayFont,
    setOverlayFontWeight,
    setOverlayFontScale,
    setOverlayTextColor,
    setReaderLanguage,
    setTargetLanguage,
    setTranslationEngine,
    setTranslationMode,
    setShowPageStatus,
    setHideTranslated,
    setGeminiModelId,
    setOcrLookahead,
    queueSettingsPatch,
    flushSettingsPatch,
  } = useReaderSettings();
  const ocrLanguage = readerLanguage || autoLanguage;

  const {
    translationPages,
    pipelineError,
    autoTranslation,
    translationActive,
    singlePageBusy,
    activeTranslationJobs,
    metrics,
    resetTranslationPipeline,
    stopTranslationRun,
    toggleAutoTranslation,
    translateSinglePage,
    retryPage,
    clearRamCache,
  } = useReaderTranslation({
    source,
    providerLanguage: language,
    ocrLanguage,
    readerLanguageOverride: readerLanguage,
    pages,
    currentPageIndex,
    identity: readerIdentity,
    translationEngine,
    translationMode,
    targetLanguage,
    geminiApiKey,
    geminiModelId,
    ocrBubbleWorkers,
    ocrLookahead,
    aiMaxContextPages,
    autoModelSwitch,
    onAutoModelSwitchDisabled: () => {
      setAutoModelSwitch(false);
      updateSettings({ readerAutoModelSwitch: false }).catch(console.error);
    },
    onTranslationSetupRequired: openTranslationSetup,
  });
  resetTranslationPipelineRef.current = resetTranslationPipeline;
  clearTranslationCacheRef.current = async () => {
    const removed = await clearTranslationCacheForManga(readerIdentity.mangaId);
    clearRamCache();
    console.log("[reader][tr] cache cleared for manga", {
      mangaId: readerIdentity.mangaId,
      removed,
    });
    return removed;
  };

  useReaderSessionLedger({
    source,
    chapterId,
    mangaId,
    title,
    mangaTitle,
    thumbnailUrl,
    language,
    chapterMemo,
    pages,
    currentPageIndex,
    identity: readerIdentity,
    displayItemsRef,
    lastPageIndexRef,
    lastDisplayIndexRef,
    setCurrentPageIndex,
    setCurrentDisplayIndex,
    scrollToReaderIndex,
  });

  const {
    handleSelectScrollSpeed,
    handleSelectReaderLanguage,
    handleSelectTargetLanguage,
    handleSelectTranslationEngine,
    handleSelectTranslationMode,
    handleChangeShowPageStatus,
    handleChangeHideTranslated,
    handleSelectGeminiModel,
    handleChangeAutoModelSwitch,
    handleChangeLookahead,
    handleSelectOverlayFont,
    handleSelectOverlayFontWeight,
    handleSelectOverlayTextColor,
    handleSelectOverlayFontScale,
    handleSelectDefaultZoomScale,
    handleClearTranslationCache,
  } = useReaderSettingsBridge({
    settings: {
      applySettings: applyReaderSettings,
      translationEngine,
      translationMode,
      geminiModelId,
      setAutoModelSwitch,
      setDefaultZoomScale,
      setOverlayFont,
      setOverlayFontWeight,
      setOverlayFontScale,
      setOverlayTextColor,
      setReaderLanguage,
      setTargetLanguage,
      setTranslationEngine,
      setTranslationMode,
      setShowPageStatus,
      setHideTranslated,
      setGeminiModelId,
      setOcrLookahead,
      flushSettingsPatch,
    },
    autoLanguage,
    setChrome,
    setAutoScrollSpeed,
    stopTranslationRun,
    clearTranslationCache: () => clearTranslationCacheRef.current(),
  });

  const handleChromeChange = (patch: Partial<ReaderChromeSettings>) => {
    const safePatch = applyFilterExclusivity(patch);
    patchChrome(safePatch);
    queueSettingsPatch(chromeToSettingsPatch(safePatch));
  };

  const horizontalList = isHorizontalMode(chrome.readingMode);
  const longStripMode = isLongStripMode(chrome.readingMode);
  const pageGap =
    longStripMode && !isGapLessMode(chrome.readingMode)
      ? chrome.webtoonPageGap
      : 0;

  useReaderScreenLifetime({
    orientationLock: orientationToLock(chrome.orientation),
    keepScreenOn: chrome.keepScreenOn,
  });

  const pageFlashOpacity = useReaderPageFlash({
    pageIndex: currentPageIndex,
    enabled: chrome.flashOnPageChange,
  });

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

  const { singlePageUrl, singleStage, overlayFontForTarget } =
    useReaderPageStatus({
      pages,
      currentPageIndex,
      translationPages,
      targetLanguage,
      overlayFont,
    });

  if (loading) {
    return <ReaderLoadingState />;
  }

  if (!pages.length) {
    return (
      <ReaderEmptyState
        message={loadError ?? "No pages found for this chapter."}
        onBack={goBack}
      />
    );
  }

  const pageBackground = readerBackgroundColor(chrome.backgroundColor);


  const renderReaderPage = (item: ReaderDisplayItem, index: number) => (
    <ReaderPageRenderer
      item={item}
      loadImage={imageWindow.has(index)}
      extensionSourceId={extensionSourceId}
      chrome={chrome}
      bodySize={bodySize}
      pageDims={pageDims}
      pageBackground={pageBackground}
      pageGap={item.gapAfter ? pageGap : 0}
      imageHeaders={pageImageHeaders.get(item.url)}
      defaultZoomScale={defaultZoomScale}
      pagedMode={pagedMode}
      translation={translationPages[item.url]}
      translationActive={translationActive}
      showPageStatus={showPageStatus}
      hideTranslated={hideTranslated}
      overlayFont={overlayFontForTarget}
      overlayFontWeight={overlayFontWeight}
      overlayFontScale={overlayFontScale}
      overlayTextColor={overlayTextColor}
      onLoadDims={rememberPageDims}
      onTapAt={pagedMode ? handlePagedTap : undefined}
      onLongPress={
        pagedMode
          ? () => {
              if (chrome.showActionsOnLongTap) setPageActionsUrl(item.url);
            }
          : undefined
      }
      onRetryTranslation={retryPage}
    />
  );

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: pageBackground }]}
    >
      <StatusBar hidden={chrome.fullscreen} />
      <View
        style={[styles.container, { backgroundColor: pageBackground }]}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          setBodySize({ width, height });
        }}
      >
        <ReaderChromeRenderer
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
          bookmarkSlot={
            <AddToLibraryButton
              provider={readerIdentity.provider}
              providerMangaId={readerIdentity.providerMangaId}
              title={mangaTitle}
              thumbnailUrl={thumbnailUrl}
              variant="icon"
              iconVariant="bookmark"
            />
          }
          downloadSlot={
            <ReaderDownloadButton
              candidate={downloadCandidate}
              context={downloadContext}
              variant="header"
            />
          }
          configOpen={sheet.configOpen}
          configTab={sheet.configTab}
          setConfigTab={setConfigTab}
          closeConfig={() => setConfigOpen(false)}
          handleChromeChange={handleChromeChange}
          defaultZoomScale={defaultZoomScale}
          handleSelectDefaultZoomScale={handleSelectDefaultZoomScale}
          scrollSpeed={scrollSpeed}
          handleSelectScrollSpeed={handleSelectScrollSpeed}
          translationOpen={sheet.translationOpen}
          translationTab={sheet.translationTab}
          setTranslationTab={setTranslationTab}
          closeTranslation={() => setTranslationOpen(false)}
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
          handleClearTranslationCache={handleClearTranslationCache}
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
          pagesLength={pages.length}
          scrollToPage={scrollToPage}
          canPrevChapter={canPrevChapter}
          canNextChapter={canNextChapter}
          onPrevChapter={onPrevChapter}
          onNextChapter={onNextChapter}
          openReadingModeSheet={openReadingModeSheet}
          openRotationSheet={openRotationSheet}
          autoScroll={autoScroll}
          setAutoScroll={setAutoScroll}
          pagedMode={pagedMode}
          pendingReadingMode={sheet.pendingReadingMode}
          pendingDirection={sheet.pendingDirection}
          setPendingReadingMode={setPendingReadingMode}
          setPendingDirection={setPendingDirection}
          readingModeSheetOpen={sheet.readingModeSheetOpen}
          setReadingModeSheetOpen={setReadingModeOpen}
          pendingOrientation={sheet.pendingOrientation}
          setPendingOrientation={setPendingOrientation}
          rotationSheetOpen={sheet.rotationSheetOpen}
          setRotationSheetOpen={setRotationOpen}
          pageActionsUrl={sheet.pageActionsUrl}
          setPageActionsUrl={setPageActionsUrl}
          retryPage={retryPage}
          openSettings={openSettings}
          pipelineError={pipelineError}
          singlePageUrl={singlePageUrl}
          singleStage={singleStage}
          singlePageBusy={singlePageBusy}
          translateSinglePage={translateSinglePage}
        />

        <ReaderViewport
          displayItems={displayItems}
          pageOffsets={pageOffsets}
          bodySize={bodySize}
          chrome={chrome}
          pagedMode={pagedMode}
          pageBackground={pageBackground}
          pagedListRef={pagedListRef}
          stripListRef={stripListRef}
          currentDisplayIndex={currentDisplayIndex}
          horizontalList={horizontalList}
          rtl={
            chrome.readingMode === "pagedHorizontal" &&
            chrome.pagedDirection === "rtl"
          }
          resetKey={`${source}:${chapterId}`}
          pageFlashOpacity={pageFlashOpacity}
          renderPage={renderReaderPage}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          getItemLayout={getItemLayout}
          onScrollBeginDrag={handleScrollBeginDrag}
          onMomentumScrollEnd={releasePagedTapLock}
          onScrollToIndexFailed={handleScrollToIndexFailed}
          onStripScroll={handleStripScroll}
          onStripViewportChange={handleStripViewportChange}
          onStripTap={handleStripTap}
          onStripLongPress={(index) => {
            const item = displayItems[index];
            if (chrome.showActionsOnLongTap && item) {
              setPageActionsUrl(item.url);
            }
          }}
        />

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#000" },
  container: {
    flex: 1,
    backgroundColor: "#000",
  },

});
