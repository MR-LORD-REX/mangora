import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dimensions, FlatList, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  ReaderEmptyState,
  ReaderLoadingState,
} from "../components/screens/ReaderScreenStates";
import { useReaderSession } from "../state/ReaderSessionProvider";
import type { StripReaderHandle, StripTapEvent } from "../views/strip/StripReader";
import { AddToLibraryButton } from "@features/library";
import { ReaderDownloadButton } from "@features/downloads";
import {
  applyFilterExclusivity,
  isGapLessMode,
  isHorizontalMode,
  isLongStripMode,
  isPagedMode,
  orientationToLock,
  type ReaderChromeSettings,
} from "../components/panels/readerChrome";
import { autoLanguageForReader } from "../components/panels/readerLanguages";
import ReaderChromeRenderer from "../blocks/ReaderChromeRenderer";
import ReaderPageRenderer from "../blocks/ReaderPageRenderer";
import { resolveTapZoneAction } from "../domain/navigation/tapZones";
import { clearTranslationCacheForManga } from "@/services/db/repositories/translationRepository";
import { updateSettings } from "@core/settings";
import { imageHeadersForPage } from "@/utils/reader/imageHeaders";
import { buildPageOffsets } from "../domain/layout/pageOffsets";
import { readerBackgroundColor } from "@/utils/reader/readerBackground";
import { chromeToSettingsPatch } from "@/utils/reader/readerChromeSettings";
import {
  buildReaderDisplayItems,
  type ReaderDisplayItem,
} from "../domain/layout/readerItems";
import { useReaderTranslation } from "../translation/useReaderTranslation";
import { useReaderAutoScroll } from "../hooks/useReaderAutoScroll";
import { useReaderChapterPages } from "../hooks/useReaderChapterPages";
import { usePagedTap } from "../hooks/usePagedTap";
import { useReaderSessionLedger } from "../hooks/useReaderSessionLedger";
import { useReaderDownloadState } from "../hooks/useReaderDownloadState";
import { usePagedDisplayAnchor } from "../hooks/usePagedDisplayAnchor";
import { useReaderDisplayIndex } from "../hooks/useReaderDisplayIndex";
import { useReaderPageDims } from "../hooks/useReaderPageDims";
import { useReaderPageFlash } from "../hooks/useReaderPageFlash";
import { useReaderPageStatus } from "../hooks/useReaderPageStatus";
import { useReaderChromeController } from "../hooks/useReaderChromeController";
import { useReaderScrollTracking } from "../hooks/useReaderScrollTracking";
import { useReaderSettings } from "../hooks/useReaderSettings";
import { useReaderSettingsBridge } from "../hooks/useReaderSettingsBridge";
import { useReaderScreenLifetime } from "../hooks/useReaderScreenLifetime";
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
      lastPageIndexRef.current = 0;
      lastDisplayIndexRef.current = 0;
      setCurrentPageIndex(0);
      setCurrentDisplayIndex(0);
      setImageWindow(new Set([0, 1, 2, 3, 4]));
      setConfigOpen(false);
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

  const pagedListRef = useRef<FlatList<ReaderDisplayItem>>(null);
  const stripListRef = useRef<StripReaderHandle>(null);
  const lastPageIndexRef = useRef(0);
  const lastDisplayIndexRef = useRef(0);
  const [currentDisplayIndex, setCurrentDisplayIndex] = useState(0);
  const [imageWindow, setImageWindow] = useState<Set<number>>(
    () => new Set([0, 1, 2, 3, 4]),
  );
  const pagedModeRef = useRef(false);
  const pagedMode = isPagedMode(chrome.readingMode);
  pagedModeRef.current = pagedMode;
  const [bodySize, setBodySize] = useState({
    width: screenWidth,
    height: screenHeight,
  });
  const { pageDims, rememberPageDims } = useReaderPageDims({
    pages,
    source,
    readingMode: chrome.readingMode,
    currentPageIndex,
    imageWindow,
  });

  const scrollToReaderIndex = useCallback(
    (index: number, animated = false, viewPosition?: number) => {
      if (isPagedMode(chrome.readingMode)) {
        pagedListRef.current?.scrollToIndex({
          index,
          animated,
          viewPosition,
        });
      } else {
        stripListRef.current?.scrollToIndex({ index, animated, viewPosition });
      }
    },
    [chrome.readingMode],
  );

  const scrollToReaderOffset = useCallback(
    (offset: number, animated = false) => {
      if (isPagedMode(chrome.readingMode)) {
        pagedListRef.current?.scrollToOffset({ offset, animated });
      } else {
        stripListRef.current?.scrollToOffset({ offset, animated });
      }
    },
    [chrome.readingMode],
  );

  const stepReaderViewport = useCallback(
    (direction: "previous" | "next") => {
      stripListRef.current?.stepByViewport(direction);
    },
    [],
  );

  // Resolve headers once per page list. Passing a freshly looked-up object on
  // every render would retrigger SubsamplingStripImage's download effect when
  // unrelated chrome settings (such as crop) change.
  const pageImageHeaders = useMemo(() => {
    const byUrl = new Map<string, Record<string, string> | undefined>();
    for (const url of pages) {
      byUrl.set(url, imageHeadersForPage(source, url));
    }
    return byUrl;
  }, [pages, source]);

  const displayItems = useMemo(
    () =>
      buildReaderDisplayItems(pages, pageDims, {
        splitWidePages: chrome.splitWidePages,
        rotateWidePagesToFit: chrome.rotateWidePagesToFit,
        pagedDirection: chrome.pagedDirection,
        sliceTallPages: isPagedMode(chrome.readingMode),
        viewportHeight: bodySize.height,
        imageScaleType: chrome.imageScaleType,
        sidePadding: chrome.sidePadding,
        body: bodySize,
      }),
    [
      bodySize,
      chrome.pagedDirection,
      chrome.imageScaleType,
      chrome.readingMode,
      chrome.rotateWidePagesToFit,
      chrome.sidePadding,
      chrome.splitWidePages,
      pageDims,
      pages,
    ],
  );

  const { displayItemsRef } = useReaderDisplayIndex({
    displayItems,
    pagesLength: pages.length,
    currentPageIndex,
    currentDisplayIndex,
    lastDisplayIndexRef,
    setCurrentDisplayIndex,
  });


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

  // Owns the scan -> OCR -> translation queues, RAM cache and metrics.
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


  /**
   * Prefix offsets for the current strip layout. Recomputing every page's
   * geometry inside onScroll was O(pages) on every frame; lookups now use a
   * binary search over this table, and jumps reuse the same offsets.
   */
  const pageOffsets = useMemo(
    () =>
      buildPageOffsets(
        displayItems,
        chrome.readingMode,
        chrome.sidePadding,
        bodySize,
        pageDims,
        chrome.imageScaleType,
        chrome.rotateWidePagesToFit,
        chrome.webtoonPageGap,
      ),
    [
      bodySize,
      chrome.imageScaleType,
      chrome.readingMode,
      chrome.rotateWidePagesToFit,
      chrome.sidePadding,
      chrome.webtoonPageGap,
      displayItems,
      pageDims,
    ],
  );

  const { syncPageIndexFromOffset: syncPagedOffset, getItemLayout } =
    useReaderScrollTracking({
      displayItems,
      pageOffsets,
      lastDisplayIndexRef,
      lastPageIndexRef,
      setCurrentDisplayIndex,
      setCurrentPageIndex,
    });

  const syncPageIndexFromOffset = (offset: number) => {
    if (pagedModeRef.current) return;
    syncPagedOffset(offset);
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
  const handleStripScroll = (offset: number) => {
    syncPageIndexFromOffset(offset);
  };

  const {
    active: autoScroll,
    speed: scrollSpeed,
    setActive: setAutoScroll,
    setSpeed: setAutoScrollSpeed,
    handleScrollBeginDrag,
    handleViewportChange: handleStripViewportChange,
  } = useReaderAutoScroll({
    readingMode: chrome.readingMode,
    pageOffsets,
    contentReady: pages.length > 0,
    viewportHeight: bodySize.height,
    stripRef: stripListRef,
    scrollToOffset: scrollToReaderOffset,
  });

  useEffect(() => {
    if (displayItems.length === 0) {
      setImageWindow(new Set());
      return;
    }

    // Keep the prefetch window tight: each entry can hold a decoded tiled
    // page, and a 300-page chapter should not keep seven huge images alive.
    const radius = isPagedMode(chrome.readingMode) ? 1 : 3;
    const start = Math.max(0, currentDisplayIndex - radius);
    const end = Math.min(displayItems.length - 1, currentDisplayIndex + radius);
    const nextWindow = new Set<number>();
    for (let index = start; index <= end; index += 1) {
      nextWindow.add(index);
    }

    setImageWindow((previous) => {
      if (
        previous.size === nextWindow.size &&
        [...nextWindow].every((index) => previous.has(index))
      ) {
        return previous;
      }
      return nextWindow;
    });
  }, [chrome.readingMode, currentDisplayIndex, displayItems.length]);

  // Paged modes only: every page fills the viewport, so viewability is
  // exact there. Scroll modes are handled by syncPageIndexFromOffset.
  const onViewableItemsChanged = useCallback(({ viewableItems }: any) => {
    if (!pagedModeRef.current) return;
    if (viewableItems && viewableItems.length > 0) {
      const displayIndex = viewableItems[0].index ?? 0;
      const item = viewableItems[0].item as ReaderDisplayItem | undefined;
      const pageIndex = item?.pageIndex ?? displayIndex;
      if (lastDisplayIndexRef.current !== displayIndex) {
        lastDisplayIndexRef.current = displayIndex;
        setCurrentDisplayIndex(displayIndex);
      }
      if (lastPageIndexRef.current !== pageIndex) {
        lastPageIndexRef.current = pageIndex;
        setCurrentPageIndex(pageIndex);
      }
    }
  }, [setCurrentPageIndex]);

  useEffect(() => {
    if (pagedMode) {
      setAutoScroll(false);
    }
  }, [pagedMode, setAutoScroll]);

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

  const scrollRetryRef = useRef(0);

  const scrollToDisplayItem = useCallback(
    (index: number, animated = false) => {
      if (displayItems.length === 0) return;
      const target = Math.min(Math.max(index, 0), displayItems.length - 1);
      const item = displayItems[target];
      if (!item) return;
      scrollRetryRef.current = 0;
      setCurrentDisplayIndex(target);
      lastDisplayIndexRef.current = target;
      setCurrentPageIndex(item.pageIndex);
      lastPageIndexRef.current = item.pageIndex;
      if (isPagedMode(chrome.readingMode)) {
        scrollToReaderIndex(target, animated);
        return;
      }
      scrollToReaderOffset(pageOffsets[target] ?? 0, false);
    },
    [
      chrome.readingMode,
      displayItems,
      pageOffsets,
      setCurrentPageIndex,
      scrollToReaderIndex,
      scrollToReaderOffset,
    ],
  );

  const { scrollToPage } = usePagedDisplayAnchor({
    displayItems,
    pagesLength: pages.length,
    currentPageIndex,
    currentDisplayIndex,
    pagedMode,
    lastDisplayIndexRef,
    setCurrentPageIndex,
    setCurrentDisplayIndex,
    scrollToDisplayItem,
    scrollToReaderIndex,
  });

  const handleScrollToIndexFailed = useCallback(
    ({ index, averageItemLength }: { index: number; averageItemLength: number }) => {
      const target = Math.min(
        Math.max(index, 0),
        Math.max(displayItems.length - 1, 0),
      );
      const estimated =
        pageOffsets[target] ?? Math.max(0, averageItemLength) * target;
      scrollToReaderOffset(estimated, false);
      // FlatList needs one frame after the estimated offset before the target
      // row exists. Retry once so variable-height pages land exactly.
      if (scrollRetryRef.current < 1) {
        scrollRetryRef.current += 1;
        setTimeout(() => {
          scrollToReaderIndex(target, false, 0);
        }, 120);
      }
    },
    [displayItems.length, pageOffsets, scrollToReaderIndex, scrollToReaderOffset],
  );

  /**
   * Paged-mode tap handling: the active tap-zone preset turns pages from the
   * 30% edge bands and the remaining middle space toggles the header/footer.
   * While the chrome is open, any tap closes it first - that keeps the bar
   * buttons and the page-turn zones from fighting over the same touches.
   */
  const { handlePagedTap, releasePagedTapLock } = usePagedTap({
    chrome,
    configOpen: sheet.configOpen,
    bodySize,
    currentDisplayIndex,
    displayCount: displayItems.length,
    scrollToDisplayItem,
    setShowHeader,
  });

  /**
   * Strip-mode tap handling. A tap is measured against the viewport (page rows
   * can be many screens tall). Page-turn zones move by a fraction of the
   * viewport so tall pages are not skipped; the whole strip camera owns zoom
   * and pan.
   */
  const handleStripTap = useCallback(
    ({ x, y }: StripTapEvent) => {
      if (sheet.configOpen) return;
      const action = resolveTapZoneAction({
        layout: chrome.tapZoneLayout,
        invert: chrome.invertTapZones,
        x,
        y,
        width: bodySize.width,
        height: bodySize.height,
      });
      if (action === "toggle") {
        setShowHeader(true);
        return;
      }
      stepReaderViewport(action === "next" ? "next" : "previous");
    },
    [
      bodySize.height,
      bodySize.width,
      chrome.invertTapZones,
      chrome.tapZoneLayout,
      sheet.configOpen,
      setShowHeader,
      stepReaderViewport,
    ],
  );

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
