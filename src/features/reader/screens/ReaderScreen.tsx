import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { useFocusEffect } from "expo-router";
import * as ScreenOrientation from "expo-screen-orientation";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import ReaderChromeStack from "../components/chrome/ReaderChromeStack";
import type { ReaderConfigTab } from "../components/panels/ReaderConfigPanel";
import type { ReaderTranslationTab } from "../components/panels/ReaderTranslationPanel";
import { ArrowLeft } from "lucide-react-native";
import ReaderTapZonePreview from "../components/overlays/ReaderTapZonePreview";
import { useReaderSession } from "../state/ReaderSessionProvider";
import PagedReader from "../views/paged/PagedReader";
import StripReader, {
  type StripReaderHandle,
  type StripTapEvent,
} from "../views/strip/StripReader";
import { AddToLibraryButton } from "@features/library";
import {
  getDownloadedChapter,
  openDownloadedPageSession,
  ReaderDownloadButton,
  readerTarget,
  type DownloadCandidate,
  type DownloadedPageSession,
} from "@features/downloads";
import {
  applyFilterExclusivity,
  isGapLessMode,
  isHorizontalMode,
  isLongStripMode,
  isPagedMode,
  orientationToLock,
  type ReaderChromeSettings,
  type ReaderOrientation,
  type ReaderOverlayFont,
  type ReaderPagedDirection,
  type ReaderReadingMode,
} from "../components/panels/readerChrome";
import { overlayFontSupportsLanguage } from "../components/panels/overlayFonts";
import {
  autoLanguageForReader,
  canonicalChineseForReader,
} from "../components/panels/readerLanguages";
import ReaderPage from "../components/page/ReaderPage";
import { resolveTapZoneAction } from "../domain/navigation/tapZones";
import {
  getChapterDownloadInfo,
  type ChapterDownloadInfo,
  updateChapterPageCount,
} from "@/services/db/repositories/catalogRepository";
import {
  recordHistoryOpen,
  updateHistoryPage,
} from "@/services/db/repositories/historyRepository";
import {
  getProgress,
  markChapterGroupCompleted,
  updateProgress,
} from "@/services/db/repositories/progressRepository";
import { clearTranslationCacheForManga } from "@/services/db/repositories/translationRepository";
import type { AppSettings } from "@core/settings";
import {
  getSettings,
  subscribeSettings,
  updateSettings,
} from "@core/settings";
import { chapterNumberLabel } from "@/utils/reader/chapterLabel";
import { imageHeadersForPage } from "@/utils/reader/imageHeaders";
import {
  loadChapterPages,
} from "@/utils/reader/loadChapterPages";
import { pageGeometry } from "@/utils/reader/pageGeometry";
import { readerBackgroundColor } from "@/utils/reader/readerBackground";
import {
  chromeFromSettings,
  chromeToSettingsPatch,
} from "@/utils/reader/readerChromeSettings";
import {
  buildReaderDisplayItems,
  type ReaderDisplayItem,
} from "@/utils/reader/readerItems";
import { resolveReaderIdentity } from "@/utils/reader/readerIdentity";
import { useReaderTranslation } from "@/utils/reader/useReaderTranslation";
import { useReaderAutoScroll } from "../hooks/useReaderAutoScroll";
import { useReaderPageDims } from "../hooks/useReaderPageDims";
import { useReaderSettings } from "../hooks/useReaderSettings";
import { modelIdForLanguage } from "@features/vision";
import type { GeminiModelId } from "@features/translation";
import {
  chapterNavigationFlipped,
  openAdjacentChapter,
} from "./readerChapterNavigation";

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

  /** Canonical DB identities used by history, translation cache + AI context. */
  const readerIdentity = useMemo(
    () => resolveReaderIdentity({ source, chapterId, mangaId }),
    [source, chapterId, mangaId],
  );

  /** Downloader identity + payload for the chapter that is open. */
  const downloadTargetIdentity = useMemo(
    () => readerTarget({ source, chapterId, mangaId }),
    [source, chapterId, mangaId],
  );
  /** Catalogued row for this chapter; gives the downloader the real index,
   *  scanlation group and language instead of parsing them from the title. */
  const [chapterDownloadInfo, setChapterDownloadInfo] =
    useState<ChapterDownloadInfo | null>(null);
  useEffect(() => {
    let active = true;
    getChapterDownloadInfo(downloadTargetIdentity.chapterId)
      .then((info) => {
        if (active) setChapterDownloadInfo(info);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [downloadTargetIdentity.chapterId]);
  const downloadChapterIndex = useMemo(() => {
    if (chapterDownloadInfo?.chapterNumber != null) {
      return String(chapterDownloadInfo.chapterNumber);
    }
    const match = title.match(/\d+(?:\.\d+)?/);
    return match ? match[0] : null;
  }, [chapterDownloadInfo, title]);
  const downloadCandidate = useMemo<DownloadCandidate>(
    () => ({
      target: downloadTargetIdentity,
      chapterTitle: chapterDownloadInfo?.title ?? title,
      chapterIndex: downloadChapterIndex,
      chapterNumber:
        chapterDownloadInfo?.chapterNumber ??
        (downloadChapterIndex ? Number(downloadChapterIndex) : null),
      scanlationGroup: chapterDownloadInfo?.scanlationGroup ?? null,
      chapterGroupKey:
        chapterDownloadInfo?.chapterGroupKey ?? downloadChapterIndex,
      languageCode: chapterDownloadInfo?.languageCode ?? (language || null),
      pageCount: chapterDownloadInfo?.pageCount ?? null,
    }),
    [
      chapterDownloadInfo,
      downloadChapterIndex,
      downloadTargetIdentity,
      language,
      title,
    ],
  );
  const downloadContext = useMemo(
    () => ({ mangaTitle, thumbnailUrl: thumbnailUrl || null }),
    [mangaTitle, thumbnailUrl],
  );

  const autoLanguage = useMemo(
    () => autoLanguageForReader(source, language),
    [source, language],
  );

  const [pages, setPages] = useState<string[]>([]);
  // Keep image work bounded independently from FlatList's row virtualization.
  // The first five pages are ready immediately; navigation moves this window.
  const [imageWindow, setImageWindow] = useState<Set<number>>(
    () => new Set([0, 1, 2, 3, 4]),
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
  const pagedListRef = useRef<FlatList<ReaderDisplayItem>>(null);
  const stripListRef = useRef<StripReaderHandle>(null);
  const lastPageIndexRef = useRef(0);
  const lastDisplayIndexRef = useRef(0);
  const [currentDisplayIndex, setCurrentDisplayIndex] = useState(0);
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
  const displayItemsRef = useRef(displayItems);
  displayItemsRef.current = displayItems;
  const previousDisplayItemsRef = useRef(displayItems);

  /** First FlatList row for each source page (used by the page scrubber). */
  const firstDisplayIndexByPage = useMemo(() => {
    const first = new Array<number>(pages.length).fill(0);
    for (let index = displayItems.length - 1; index >= 0; index -= 1) {
      first[displayItems[index].pageIndex] = index;
    }
    return first;
  }, [displayItems, pages.length]);

  // A split or slice can change the row count after the first image
  // measurement. Keep the visible source page selected while preserving the
  // current slice when possible.
  useEffect(() => {
    const item = displayItems[currentDisplayIndex];
    if (item && item.pageIndex === currentPageIndex) return;
    const previous = displayItemsRef.current[currentDisplayIndex];
    const sliceIndex = previous?.slice?.index ?? 0;
    const sameSlice = displayItems.findIndex(
      (candidate) =>
        candidate.pageIndex === currentPageIndex &&
        (candidate.slice?.index ?? 0) === sliceIndex,
    );
    const next =
      sameSlice >= 0
        ? sameSlice
        : firstDisplayIndexByPage[currentPageIndex] ?? 0;
    lastDisplayIndexRef.current = next;
    setCurrentDisplayIndex(next);
  }, [
    currentDisplayIndex,
    currentPageIndex,
    displayItems,
    firstDisplayIndexByPage,
  ]);

  const [readingModeSheetOpen, setReadingModeSheetOpen] = useState(false);
  const [rotationSheetOpen, setRotationSheetOpen] = useState(false);
  const [pendingReadingMode, setPendingReadingMode] =
    useState<ReaderReadingMode>("webtoon");
  const [pendingDirection, setPendingDirection] =
    useState<ReaderPagedDirection>("ltr");
  const [pendingOrientation, setPendingOrientation] =
    useState<ReaderOrientation>("default");

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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [translationOpen, setTranslationOpen] = useState(false);
  const [translationTab, setTranslationTab] =
    useState<ReaderTranslationTab>("trMode");

  const [configOpen, setConfigOpen] = useState(false);
  const [configTab, setConfigTab] = useState<ReaderConfigTab>("reading");
  const [pageActionsUrl, setPageActionsUrl] = useState<string | null>(null);
  const [prevChapterId, setPrevChapterId] = useState<string | null>(null);
  const [nextChapterId, setNextChapterId] = useState<string | null>(null);
  const readerRecordRef = useRef<{
    chapterId: string;
    historyId: string;
    pageCount: number;
  } | null>(null);

  /** Opens the translation panel when an auto-translation run cannot start. */
  const openTranslationSetup = () => {
    setConfigOpen(false);
    setTranslationOpen(true);
    setTranslationTab("trMode");
  };

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

  useEffect(() => {
    if (!pages.length || !chapterId || !source) return;
    let cancelled = false;

    const persistReaderOpen = async () => {
      const provider = readerIdentity.provider;
      const canonicalMangaId = readerIdentity.mangaId;
      const canonicalChapterId = readerIdentity.chapterId;
      if (cancelled) return;
      await updateChapterPageCount(canonicalChapterId, pages.length);

      const progress = await getProgress(canonicalChapterId);
      if (cancelled) return;
      const lastPageIndex = Math.min(
        Math.max(progress?.lastPageIndex ?? 0, 0),
        Math.max(pages.length - 1, 0),
      );
      readerRecordRef.current = {
        chapterId: canonicalChapterId,
        historyId: canonicalChapterId,
        pageCount: pages.length,
      };
      setCurrentPageIndex(lastPageIndex);
      lastPageIndexRef.current = lastPageIndex;
      await recordHistoryOpen({
        mangaId: canonicalMangaId,
        chapterId: canonicalChapterId,
        provider,
        title,
        thumbnailUrl: thumbnailUrl || null,
        readerParams: {
          id: chapterId,
          source: provider,
          mangaTitle,
          chapterTitle: title,
          chapterMemo,
          ...(mangaId ? { mangaId } : {}),
          ...(thumbnailUrl ? { thumbnailUrl } : {}),
          ...(language ? { language } : {}),
        },
        pageIndex: lastPageIndex,
      });
      if (!cancelled) {
        const displayIndex = displayItemsRef.current.findIndex(
          (item) => item.pageIndex === lastPageIndex,
        );
        const targetIndex = displayIndex >= 0 ? displayIndex : 0;
        lastDisplayIndexRef.current = targetIndex;
        setCurrentDisplayIndex(targetIndex);
        requestAnimationFrame(() => {
          scrollToReaderIndex(targetIndex, false);
        });
      }
    };

    persistReaderOpen().catch((error) => {
      console.error("Failed to persist reader history:", error);
    });
    return () => {
      cancelled = true;
    };
  }, [
    chapterId,
    chapterMemo,
    language,
    mangaId,
    mangaTitle,
    pages,
    readerIdentity,
    scrollToReaderIndex,
    source,
    setCurrentPageIndex,
    thumbnailUrl,
    title,
  ]);

  useEffect(() => {
    const record = readerRecordRef.current;
    if (!record || !pages.length) return;
    const finished =
      record.pageCount != null &&
      record.pageCount > 0 &&
      currentPageIndex >= record.pageCount - 1;
    void updateProgress(record.chapterId, {
      pageIndex: currentPageIndex,
      pageCount: record.pageCount,
    }).catch((error) =>
      console.warn("Failed to save reading progress:", error),
    );
    if (finished) {
      // Finish propagates to every scanlation-group upload of this chapter.
      void markChapterGroupCompleted(record.chapterId).catch((error) =>
        console.warn("Failed to sync group read state:", error),
      );
    }
    void updateHistoryPage(record.historyId, currentPageIndex).catch((error) =>
      console.warn("Failed to save history page:", error),
    );
  }, [currentPageIndex, pages.length]);

  useEffect(() => {
    return () => {
      const record = readerRecordRef.current;
      if (!record) return;
      const finished =
        record.pageCount != null &&
        record.pageCount > 0 &&
        currentPageIndex >= record.pageCount - 1;
      void updateProgress(record.chapterId, {
        pageIndex: currentPageIndex,
        pageCount: record.pageCount,
      }).catch(() => {});
      if (finished) {
        void markChapterGroupCompleted(record.chapterId).catch(() => {});
      }
      void updateHistoryPage(record.historyId, currentPageIndex).catch(
        () => {},
      );
    };
  }, [currentPageIndex]);

  const goBack = () => {
    if (mangaId) {
      onOpenMangaInfo({ provider: source, id: mangaId });
    } else {
      onBack();
    }
  };

  useEffect(() => {
    let cancelled = false;
    let downloadedSession: DownloadedPageSession | null = null;

    const loadPages = async () => {
      if (!chapterId || !source) {
        setLoading(false);
        return;
      }
      const startedAt = Date.now();
      let stage = "starting";
      let loadedPageCount = 0;
      console.log("[reader][open] started", {
        chapterId,
        provider: source,
        mangaId: mangaId || null,
      });
      setLoading(true);
      setLoadError(null);
      setPrevChapterId(null);
      setNextChapterId(null);
      lastPageIndexRef.current = 0;
      lastDisplayIndexRef.current = 0;
      setCurrentPageIndex(0);
      setCurrentDisplayIndex(0);
      setPages([]);
      setImageWindow(new Set([0, 1, 2, 3, 4]));
      setConfigOpen(false);
      resetTranslationPipeline();

      try {
        stage = "checking completed download";
        const download = await getDownloadedChapter(
          readerIdentity.chapterId,
          source,
          downloadTargetIdentity.providerChapterId,
        );
        console.log("[reader][open] download lookup finished", {
          chapterId,
          found: Boolean(download),
          status: download?.status ?? null,
          hasArchive: Boolean(download?.fileUri),
          pageCount: download?.pageCount ?? null,
        });
        if (download?.status === "completed") {
          stage = "opening downloaded page files";
          downloadedSession = await openDownloadedPageSession(download);
          loadedPageCount = downloadedSession.pages.length;
          console.log("[reader][open] downloaded chapter ready", {
            chapterId,
            pages: downloadedSession.pages.length,
            temporaryExtraction: Boolean(download.fileUri && !download.pagesDirUri),
            elapsedMs: Date.now() - startedAt,
          });
          if (cancelled) {
            await downloadedSession.cleanup();
            downloadedSession = null;
            return;
          }
          setPages(downloadedSession.pages);
          return;
        }

        stage = "loading network page list";
        const networkUrls = await loadChapterPages({
          source,
          chapterId,
          mangaId,
          chapterMemo,
          onPages: () => {},
          onAdjacent: (adjacent) => {
            if (!cancelled) {
              setPrevChapterId(adjacent.prev);
              setNextChapterId(adjacent.next);
            }
          },
        });
        if (cancelled) return;
        if (!networkUrls || networkUrls.length === 0) {
          throw new Error("This chapter returned no pages.");
        }
        console.log("[reader][open] network page list loaded", {
          chapterId,
          pages: networkUrls.length,
        });
        stage = "displaying network pages";
        loadedPageCount = networkUrls.length;
        console.log("[reader][open] displaying fetched page list", {
          chapterId,
          pages: networkUrls.length,
        });
        if (!cancelled) setPages(networkUrls);
      } catch (error) {
        console.error("[reader][open] failed", {
          chapterId,
          provider: source,
          stage,
          elapsedMs: Date.now() - startedAt,
          error,
        });
        if (!cancelled) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Could not load this chapter.",
          );
        }
      } finally {
        console.log("[reader][open] finished", {
          chapterId,
          cancelled,
          stage,
          pages: loadedPageCount,
          elapsedMs: Date.now() - startedAt,
        });
        if (!cancelled) setLoading(false);
      }
    };

    loadPages();
    return () => {
      cancelled = true;
      if (downloadedSession) void downloadedSession.cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId, source]);

  const pagedTapInFlightRef = useRef(false);
  const pagedTapUnlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  /**
   * Prefix offsets for the current strip layout. Recomputing every page's
   * geometry inside onScroll was O(pages) on every frame; lookups now use a
   * binary search over this table, and jumps reuse the same offsets.
   */
  const pageOffsets = useMemo(() => {
    const horizontal = isHorizontalMode(chrome.readingMode);
    const pageGapValue =
      isLongStripMode(chrome.readingMode) &&
      !isGapLessMode(chrome.readingMode)
        ? chrome.webtoonPageGap
        : 0;
    const offsets = new Array<number>(displayItems.length + 1);
    offsets[0] = 0;
    for (let i = 0; i < displayItems.length; i += 1) {
      const item = displayItems[i];
      const geometry = pageGeometry(
        item.url,
        chrome.readingMode,
        chrome.sidePadding,
        bodySize,
        pageDims,
        chrome.imageScaleType,
        chrome.rotateWidePagesToFit,
        item.half,
        undefined,
        item.slice,
      );
      const gap = item.gapAfter ? pageGapValue : 0;
      const length = horizontal
        ? geometry.itemW
        : geometry.itemH + gap;
      offsets[i + 1] = offsets[i] + Math.max(length, 1);
    }
    return offsets;
  }, [
    bodySize,
    chrome.imageScaleType,
    chrome.readingMode,
    chrome.rotateWidePagesToFit,
    chrome.sidePadding,
    chrome.webtoonPageGap,
    displayItems,
    pageDims,
  ]);

  const syncPageIndexFromOffset = (offset: number) => {
    if (pagedModeRef.current || displayItems.length === 0) return;
    let low = 0;
    let high = displayItems.length - 1;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (pageOffsets[mid + 1] > offset) {
        high = mid;
      } else {
        low = mid + 1;
      }
    }
    if (lastDisplayIndexRef.current !== low) {
      lastDisplayIndexRef.current = low;
      setCurrentDisplayIndex(low);
    }
    const pageIndex = displayItems[low]?.pageIndex ?? 0;
    if (lastPageIndexRef.current !== pageIndex) {
      lastPageIndexRef.current = pageIndex;
      setCurrentPageIndex(pageIndex);
    }
  };

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

  const releasePagedTapLock = useCallback(() => {
    pagedTapInFlightRef.current = false;
    if (pagedTapUnlockTimerRef.current) {
      clearTimeout(pagedTapUnlockTimerRef.current);
      pagedTapUnlockTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (pagedMode) {
      setAutoScroll(false);
    }
  }, [pagedMode, setAutoScroll]);

  // ---- Settings ----------------------------------------------------------
  // Keeps this screen in sync with the persisted settings store.
  useEffect(() => {
    const apply = (settings: AppSettings) => {
      applyReaderSettings(settings, autoLanguage);
      setChrome(chromeFromSettings(settings));
      setAutoScrollSpeed(settings.readerScrollSpeed || 1);
    };

    getSettings()
      .then((settings) => {
        apply(settings);
      })
      .catch(() => {});
    const unsubscribe = subscribeSettings(apply);
    return unsubscribe;
  }, [applyReaderSettings, autoLanguage, setAutoScrollSpeed, setChrome]);

  /** Persist user speed changes; settings sync uses the hook setter directly. */
  const handleSelectScrollSpeed = (speed: number) => {
    setAutoScrollSpeed(speed);
    updateSettings({ readerScrollSpeed: speed }).catch(console.error);
  };

  const handleSelectReaderLanguage = (code: string) => {
    const nextLanguage = code ? canonicalChineseForReader(code) : "";
    setReaderLanguage(nextLanguage);

    const languageToBind = nextLanguage || autoLanguage;
    console.log("[reader][ocr] provider selection", {
      language: languageToBind,
      model: modelIdForLanguage(languageToBind),
    });
  };
  const handleSelectTargetLanguage = (code: string) => {
    setTargetLanguage(code);
  };
  const handleSelectTranslationEngine = (
    engine: AppSettings["readerTranslationEngine"],
  ) => {
    if (engine !== translationEngine) stopTranslationRun();
    setTranslationEngine(engine);
  };
  const handleSelectTranslationMode = (
    mode: AppSettings["readerTranslationMode"],
  ) => {
    if (mode !== translationMode) stopTranslationRun();
    setTranslationMode(mode);
  };
  const handleChangeShowPageStatus = (value: boolean) => {
    setShowPageStatus(value);
  };
  const handleChangeHideTranslated = (value: boolean) => {
    setHideTranslated(value);
  };
  const handleSelectGeminiModel = (model: GeminiModelId) => {
    if (model !== geminiModelId) stopTranslationRun();
    setGeminiModelId(model);
  };
  const handleChangeAutoModelSwitch = (value: boolean) => {
    setAutoModelSwitch(value);
  };
  const handleChangeLookahead = (value: number) => {
    setOcrLookahead(value);
  };
  const handleClearTrCache = async (): Promise<number> => {
    const removed = await clearTranslationCacheForManga(readerIdentity.mangaId);
    clearRamCache();
    console.log("[reader][tr] cache cleared for manga", {
      mangaId: readerIdentity.mangaId,
      removed,
    });
    return removed;
  };
  const handleSelectOverlayFont = (font: ReaderOverlayFont) => {
    setOverlayFont(font);
  };
  const handleSelectOverlayFontWeight = (weight: number) => {
    setOverlayFontWeight(weight);
  };
  const handleSelectOverlayTextColor = (color: string) => {
    setOverlayTextColor(color);
  };
  const handleSelectOverlayFontScale = (scale: number) => {
    setOverlayFontScale(scale);
  };
  const handleSelectDefaultZoomScale = (scale: number) => {
    setDefaultZoomScale(scale);
  };

  useEffect(
    () => () => {
      flushSettingsPatch();
      if (pagedTapUnlockTimerRef.current) {
        clearTimeout(pagedTapUnlockTimerRef.current);
      }
    },
    [flushSettingsPatch],
  );

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

  useEffect(() => {
    const lock = orientationToLock(chrome.orientation);
    ScreenOrientation.lockAsync(lock).catch((error) => {
      console.warn("Failed to lock screen orientation:", error);
    });
    return () => {
      ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.DEFAULT,
      ).catch(() => {});
    };
  }, [chrome.orientation]);

  useFocusEffect(
    useCallback(() => {
      if (chrome.keepScreenOn) {
        activateKeepAwakeAsync("trapp-reader").catch(() => {});
      }
      return () => {
        deactivateKeepAwake("trapp-reader").catch(() => {});
      };
    }, [chrome.keepScreenOn]),
  );

  const openReadingModeSheet = () => {
    setPendingReadingMode(chrome.readingMode);
    setPendingDirection(chrome.pagedDirection);
    setReadingModeSheetOpen(true);
  };

  const openRotationSheet = () => {
    setPendingOrientation(chrome.orientation);
    setRotationSheetOpen(true);
  };

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

  // Image measurements can turn a page into two halves or several slices after
  // it has already been displayed. Keep the pager on the same logical page and
  // slice instead of letting inserted rows shift the visible row under the
  // user.
  useEffect(() => {
    const previous = previousDisplayItemsRef.current;
    if (previous === displayItems) return;
    previousDisplayItemsRef.current = displayItems;
    if (!pagedMode || displayItems.length === 0) return;

    const visibleItem =
      previous[lastDisplayIndexRef.current] ?? previous[currentDisplayIndex];
    const visiblePage = visibleItem?.pageIndex ?? currentPageIndex;
    const visibleSlice = visibleItem?.slice?.index ?? 0;
    const sameSlice = displayItems.findIndex(
      (item) =>
        item.pageIndex === visiblePage &&
        (item.slice?.index ?? 0) === visibleSlice,
    );
    const target =
      sameSlice >= 0
        ? sameSlice
        : displayItems.findIndex((item) => item.pageIndex === visiblePage);
    if (target < 0) return;
    lastDisplayIndexRef.current = target;
    setCurrentDisplayIndex(target);
    setCurrentPageIndex(visiblePage);
    requestAnimationFrame(() => {
      scrollToReaderIndex(target, false);
    });
  }, [
    currentDisplayIndex,
    currentPageIndex,
    displayItems,
    pagedMode,
    setCurrentPageIndex,
    scrollToReaderIndex,
  ]);

  const scrollToPage = useCallback(
    (index: number) => {
      const target = Math.min(Math.max(index, 0), pages.length - 1);
      if (pages.length === 0) return;
      scrollToDisplayItem(firstDisplayIndexByPage[target] ?? 0);
    },
    [firstDisplayIndexByPage, pages.length, scrollToDisplayItem],
  );

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
  const handlePagedTap = useCallback(
    (x: number, y: number) => {
      if (configOpen) return;
      if (pagedTapInFlightRef.current) return;
      const rtl =
        chrome.readingMode === "pagedHorizontal" &&
        chrome.pagedDirection === "rtl";
      const action = resolveTapZoneAction({
        layout: chrome.tapZoneLayout,
        invert: chrome.invertTapZones,
        rtl,
        x,
        y,
        width: bodySize.width,
        height: bodySize.height,
      });
      if (action === "prev") {
        if (currentDisplayIndex > 0) {
          if (chrome.animatePageTransitions) {
            pagedTapInFlightRef.current = true;
            if (pagedTapUnlockTimerRef.current) {
              clearTimeout(pagedTapUnlockTimerRef.current);
            }
            pagedTapUnlockTimerRef.current = setTimeout(
              releasePagedTapLock,
              700,
            );
            scrollToDisplayItem(currentDisplayIndex - 1, true);
          } else {
            scrollToDisplayItem(currentDisplayIndex - 1);
          }
        }
      } else if (action === "next") {
        if (currentDisplayIndex < displayItems.length - 1) {
          if (chrome.animatePageTransitions) {
            pagedTapInFlightRef.current = true;
            if (pagedTapUnlockTimerRef.current) {
              clearTimeout(pagedTapUnlockTimerRef.current);
            }
            pagedTapUnlockTimerRef.current = setTimeout(
              releasePagedTapLock,
              700,
            );
            scrollToDisplayItem(currentDisplayIndex + 1, true);
          } else {
            scrollToDisplayItem(currentDisplayIndex + 1);
          }
        }
      } else {
        setShowHeader(true);
      }
    },
    [
      bodySize.height,
      bodySize.width,
      chrome.animatePageTransitions,
      chrome.invertTapZones,
      chrome.pagedDirection,
      chrome.readingMode,
      chrome.tapZoneLayout,
      configOpen,
      currentDisplayIndex,
      displayItems.length,
      releasePagedTapLock,
      scrollToDisplayItem,
      setShowHeader,
    ],
  );

  /**
   * Strip-mode tap handling. A tap is measured against the viewport (page rows
   * can be many screens tall). Page-turn zones move by a fraction of the
   * viewport so tall pages are not skipped; the whole strip camera owns zoom
   * and pan.
   */
  const handleStripTap = useCallback(
    ({ x, y }: StripTapEvent) => {
      if (configOpen) return;
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
      configOpen,
      setShowHeader,
      stepReaderViewport,
    ],
  );

  const pageFlashOpacity = useRef(new Animated.Value(0)).current;
  const lastFlashIndexRef = useRef(currentPageIndex);

  useEffect(() => {
    if (lastFlashIndexRef.current === currentPageIndex) return;
    lastFlashIndexRef.current = currentPageIndex;
    if (!chrome.flashOnPageChange) return;
    pageFlashOpacity.stopAnimation();
    pageFlashOpacity.setValue(1);
    Animated.timing(pageFlashOpacity, {
      toValue: 0,
      duration: 110,
      useNativeDriver: true,
    }).start();
  }, [chrome.flashOnPageChange, currentPageIndex, pageFlashOpacity]);

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

  /** FlatList jump targets use the same prefix table as scroll tracking. */
  const getItemLayout = useCallback(
    (_data: ArrayLike<ReaderDisplayItem> | null | undefined, index: number) => {
      const offset = pageOffsets[index] ?? 0;
      const next = pageOffsets[index + 1] ?? offset;
      return { length: Math.max(next - offset, 1), offset, index };
    },
    [pageOffsets],
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loaderWrap}>
          <ActivityIndicator color="#fbbf24" size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (!pages.length) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loaderWrap}>
          <Pressable onPress={goBack} style={styles.emptyBack}>
            <ArrowLeft color="white" size={28} />
          </Pressable>
          <Text style={styles.emptyText}>
            {loadError ?? "No pages found for this chapter."}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const pageBackground = readerBackgroundColor(chrome.backgroundColor);

  const chapterTitleText = chapterTitle ?? "";
  const chapterLabel = chapterTitleText
    ? chapterTitleText
    : chapterNumberLabel(title, chapterId);

  const goPrevChapter = () => {
    if (prevChapterId) {
      void openAdjacentChapter(prevChapterId, {
        source,
        mangaId,
        title,
        mangaTitle,
        thumbnailUrl,
        language,
        onReplaceReader,
      });
    }
  };
  const goNextChapter = () => {
    if (nextChapterId) {
      void openAdjacentChapter(nextChapterId, {
        source,
        mangaId,
        title,
        mangaTitle,
        thumbnailUrl,
        language,
        onReplaceReader,
      });
    }
  };
  const navFlipped = chapterNavigationFlipped(
    chrome.readingMode,
    chrome.pagedDirection,
  );
  const canPrevChapter = navFlipped ? !!nextChapterId : !!prevChapterId;
  const canNextChapter = navFlipped ? !!prevChapterId : !!nextChapterId;
  const onPrevChapter = navFlipped ? goNextChapter : goPrevChapter;
  const onNextChapter = navFlipped ? goPrevChapter : goNextChapter;

  const openSettings = () => {
    setReadingModeSheetOpen(false);
    setRotationSheetOpen(false);
    setTranslationOpen(false);
    setConfigOpen(true);
  };

  const openTranslationOptions = () => {
    setReadingModeSheetOpen(false);
    setRotationSheetOpen(false);
    setConfigOpen(false);
    setTranslationOpen(true);
  };

  const singlePageUrl = pages[currentPageIndex] ?? "";
  const singlePageState = translationPages[singlePageUrl];
  const singleStage = singlePageState?.stage;

  const renderReaderPage = (item: ReaderDisplayItem, index: number) => (
    <ReaderPage
      url={item.url}
      loadImage={imageWindow.has(index)}
      extensionSourceId={extensionSourceId}
      geometry={pageGeometry(
        item.url,
        chrome.readingMode,
        chrome.sidePadding,
        bodySize,
        pageDims,
        chrome.imageScaleType,
        chrome.rotateWidePagesToFit,
        item.half,
        undefined,
        item.slice,
      )}
      sourceWidth={pageDims[item.url]?.width}
      sourceHeight={pageDims[item.url]?.height}
      pageBackground={pageBackground}
      imageHeaders={pageImageHeaders.get(item.url)}
      chrome={chrome}
      defaultZoomScale={defaultZoomScale}
      pagedMode={pagedMode}
      splitHalf={item.half}
      translation={translationPages[item.url]}
      translationActive={translationActive}
      showPageStatus={showPageStatus}
      hideTranslated={hideTranslated}
      overlayFont={
        overlayFontSupportsLanguage(targetLanguage)
          ? overlayFont
          : "default"
      }
      overlayFontWeight={overlayFontWeight}
      overlayFontScale={overlayFontScale}
      overlayTextColor={overlayTextColor}
      onLoadDims={rememberPageDims}
      interactive={pagedMode}
      onTapAt={pagedMode ? handlePagedTap : undefined}
      onLongPress={
        pagedMode
          ? () => {
              if (chrome.showActionsOnLongTap) setPageActionsUrl(item.url);
            }
          : undefined
      }
      pageGap={item.gapAfter ? pageGap : 0}
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
          closeChrome={() => {
            setConfigOpen(false);
            setTranslationOpen(false);
            setReadingModeSheetOpen(false);
            setRotationSheetOpen(false);
            setPageActionsUrl(null);
            setShowHeader(false);
          }}
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
          configOpen={configOpen}
          configTab={configTab}
          setConfigTab={setConfigTab}
          closeConfig={() => setConfigOpen(false)}
          handleChromeChange={handleChromeChange}
          defaultZoomScale={defaultZoomScale}
          handleSelectDefaultZoomScale={handleSelectDefaultZoomScale}
          scrollSpeed={scrollSpeed}
          handleSelectScrollSpeed={handleSelectScrollSpeed}
          translationOpen={translationOpen}
          translationTab={translationTab}
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
          handleClearTrCache={handleClearTrCache}
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

        {pagedMode ? (
          <PagedReader
            listRef={pagedListRef}
            data={displayItems}
            horizontal={horizontalList}
            inverted={
              chrome.readingMode === "pagedHorizontal" &&
              chrome.pagedDirection === "rtl"
            }
            pagingEnabled
            keyExtractor={(item) => item.key}
            initialNumToRender={1}
            maxToRenderPerBatch={4}
            windowSize={5}
            updateCellsBatchingPeriod={60}
            scrollEnabled
            nestedScrollEnabled
            directionalLockEnabled
            removeClippedSubviews={false}
            showsVerticalScrollIndicator={false}
            showsHorizontalScrollIndicator={false}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            getItemLayout={getItemLayout}
            scrollEventThrottle={32}
            onScrollBeginDrag={handleScrollBeginDrag}
            onMomentumScrollEnd={releasePagedTapLock}
            onScrollToIndexFailed={handleScrollToIndexFailed}
            contentContainerStyle={
              horizontalList
                ? styles.horizontalContent
                : styles.verticalContent
            }
            renderItem={({ item, index }) => renderReaderPage(item, index)}
          />
        ) : (
          <StripReader
            ref={stripListRef}
            items={displayItems}
            offsets={pageOffsets}
            viewport={bodySize}
            resetKey={`${source}:${chapterId}`}
            initialOffset={pageOffsets[currentDisplayIndex] ?? 0}
            onScroll={handleStripScroll}
            onViewportChange={handleStripViewportChange}
            onScrollBeginDrag={handleScrollBeginDrag}
            onTap={handleStripTap}
            onLongPress={(index) => {
              const item = displayItems[index];
              if (chrome.showActionsOnLongTap && item) {
                setPageActionsUrl(item.url);
              }
            }}
            renderPage={renderReaderPage}
          />
        )}

        <ReaderTapZonePreview
          layout={chrome.tapZoneLayout}
          invert={chrome.invertTapZones}
          rtl={
            chrome.readingMode === "pagedHorizontal" &&
            chrome.pagedDirection === "rtl"
          }
          width={bodySize.width}
          height={bodySize.height}
        />

        <Animated.View
          pointerEvents="none"
          style={[styles.pageFlash, { opacity: pageFlashOpacity }]}
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
  loaderWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyBack: { position: "absolute", top: 16, left: 16 },
  emptyText: {
    color: "#fff",
    fontSize: 16,
    textAlign: "center",
    paddingHorizontal: 24,
  },
  verticalContent: { paddingBottom: 24 },
  horizontalContent: { paddingHorizontal: 0 },
  pageFlash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
    zIndex: 15,
  },
});
