import { openMangaInfo } from "@/components/manga/openMangaInfo";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import * as ScreenOrientation from "expo-screen-orientation";
import { StatusBar } from "expo-status-bar";
import { ArrowLeft, Menu } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import ReaderBottomBar from "@/components/reader/ReaderBottomBar";
import AddToLibraryButton from "@/components/library/AddToLibraryButton";
import { ReaderDownloadButton } from "@/components/downloader/DownloadButtons";
import {
  applyFilterExclusivity,
  DEFAULT_READER_CHROME,
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
  type ReaderTapZoneLayout,
} from "@/components/reader/readerChrome";
import { overlayFontSupportsLanguage } from "@/components/reader/overlayFonts";
import ReaderConfigPanel, {
  type ReaderConfigTab,
} from "@/components/reader/ReaderConfigPanel";
import ReaderHeader from "@/components/reader/ReaderHeader";
import {
  autoLanguageForReader,
  canonicalChineseForReader,
} from "@/components/reader/readerLanguages";
import ReaderPage from "@/components/reader/ReaderPage";
import ReaderPageActionsSheet from "@/components/reader/ReaderPageActionsSheet";
import SingleTranslateFab from "@/components/reader/SingleTranslateFab";
import ReaderReadingModeSheet from "@/components/reader/ReaderReadingModeSheet";
import ReaderRotationSheet from "@/components/reader/ReaderRotationSheet";
import ReaderTranslationPanel, {
  type ReaderTranslationTab,
} from "@/components/reader/ReaderTranslationPanel";
import {
  resolveTapZoneAction,
  tapZoneRectsFor,
} from "@/components/reader/tapZones";
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
import {
  clampOcrBubbleWorkers,
  modelIdForLanguage,
} from "@/services/ocr/ocrModels";
import type { AppSettings } from "@/services/settings/settingsStore";
import {
  getSettings,
  subscribeSettings,
  updateSettings,
} from "@/services/settings/settingsStore";
import {
  GEMINI_DEFAULT_MODEL,
  type GeminiModelId,
} from "@/services/translation/geminiModels";
import { chapterNumberLabel, chapterTitleFromId } from "@/utils/reader/chapterLabel";
import { imageHeadersForPage } from "@/utils/reader/imageHeaders";
import {
  loadAdjacentChapters,
  loadChapterPages,
} from "@/utils/reader/loadChapterPages";
import { pageGeometry, type PageDims } from "@/utils/reader/pageGeometry";
import { readerBackgroundColor } from "@/utils/reader/readerBackground";
import {
  chromeFromSettings,
  chromeToSettingsPatch,
} from "@/utils/reader/readerChromeSettings";
import {
  getDownloadedChapter,
  readerTarget,
} from "@/services/downloader";
import type { DownloadCandidate } from "@/services/downloader";
import {
  buildReaderDisplayItems,
  type ReaderDisplayItem,
} from "@/utils/reader/readerItems";
import { resolveReaderIdentity } from "@/utils/reader/readerIdentity";
import { prepareReaderOpen } from "@/services/library/readerTracking";
import { useReaderTranslation } from "@/utils/reader/useReaderTranslation";
import {
  enforceReaderCacheLimit,
  materializeDownloadedReaderChapter,
  materializeNetworkReaderChapter,
  pinReaderCacheChapter,
  readValidReaderCacheChapter,
  releaseReaderCacheChapter,
} from "@/services/reader/readerCache";

function paramString(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

const screenWidth = Dimensions.get("window").width;

const screenHeight = Dimensions.get("window").height;

export default function GenericReader() {
  const params = useLocalSearchParams<{
    id: string | string[];
    source: string;
    mangaId?: string | string[];
    title?: string | string[];
    mangaTitle?: string | string[];
    chapterTitle?: string | string[];
    chapterMemo?: string | string[];
    thumbnailUrl?: string | string[];
    language?: string;
  }>();

  const source = paramString(params.source);
  const chapterId = paramString(params.id);
  const mangaId = paramString(params.mangaId);
  const title =
    paramString(params.chapterTitle) || paramString(params.title) || chapterId;
  const mangaTitle = paramString(params.mangaTitle) || title;
  const thumbnailUrl = paramString(params.thumbnailUrl);
  const language = paramString(params.language);
  const chapterMemo = paramString(params.chapterMemo);
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
  const [showHeader, setShowHeader] = useState(true);
  const [loading, setLoading] = useState(true);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [autoScroll, setAutoScroll] = useState(false);
  const listRef = useRef<FlatList<ReaderDisplayItem>>(null);
  const [chrome, setChrome] = useState<ReaderChromeSettings>(
    DEFAULT_READER_CHROME,
  );
  const [defaultZoomScale, setDefaultZoomScale] = useState(1);
  const [pageDims, setPageDims] = useState<Record<string, PageDims>>({});
  const lastPageIndexRef = useRef(0);
  const lastDisplayIndexRef = useRef(0);
  const [currentDisplayIndex, setCurrentDisplayIndex] = useState(0);
  const pagedModeRef = useRef(false);

  /** Records the decoded pixel size of a page once known (getSize/onLoad). */
  const rememberPageDims = useCallback(
    (url: string, width: number, height: number) => {
      if (!width || !height) return;
      setPageDims((prev) => {
        const current = prev[url];
        if (current && current.width === width && current.height === height) {
          return prev;
        }
        return { ...prev, [url]: { width, height } };
      });
    },
    [],
  );
  const requestedPageDimsRef = useRef<Set<string>>(new Set());
  const [bodySize, setBodySize] = useState({
    width: screenWidth,
    height: screenHeight,
  });

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
      }),
    [
      chrome.pagedDirection,
      chrome.rotateWidePagesToFit,
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

  // A split can change the row count after the first image measurement.
  // Keep the visible source page selected while moving to its first half.
  useEffect(() => {
    const item = displayItems[currentDisplayIndex];
    if (item && item.pageIndex === currentPageIndex) return;
    const next = firstDisplayIndexByPage[currentPageIndex] ?? 0;
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

  const [readerLanguage, setReaderLanguage] = useState("");
  const [targetLanguage, setTargetLanguage] = useState("en");
  const [translationEngine, setTranslationEngine] =
    useState<AppSettings["readerTranslationEngine"]>("free");
  const [translationMode, setTranslationMode] =
    useState<AppSettings["readerTranslationMode"]>("off");
  const [showPageStatus, setShowPageStatus] = useState(true);
  const [hideTranslated, setHideTranslated] = useState(false);
  const [overlayFont, setOverlayFont] =
    useState<ReaderOverlayFont>("default");
  const [overlayFontWeight, setOverlayFontWeight] = useState(600);
  const [overlayFontScale, setOverlayFontScale] = useState(1);
  const [overlayTextColor, setOverlayTextColor] = useState("#000000");
  const settingsPersistTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const pendingSettingsPatchRef = useRef<Partial<AppSettings>>({});
  const ocrLanguage = readerLanguage || autoLanguage;

  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [geminiModelId, setGeminiModelId] =
    useState<GeminiModelId>(GEMINI_DEFAULT_MODEL);
  const [autoModelSwitch, setAutoModelSwitch] = useState(false);
  const [ocrBubbleWorkers, setOcrBubbleWorkers] = useState(8);
  const [ocrLookahead, setOcrLookahead] = useState(2);
  const [aiMaxContextPages, setAiMaxContextPages] = useState(10);
  const [loadError, setLoadError] = useState<string | null>(null);
  const pinnedChapterRef = useRef<string | null>(null);
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
          listRef.current?.scrollToIndex({
            index: targetIndex,
            animated: false,
          });
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
    source,
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
      openMangaInfo({ provider: source, id: mangaId });
    } else {
      router.back();
    }
  };

  useEffect(() => {
    let cancelled = false;

    const loadPages = async () => {
      if (!chapterId || !source) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setLoadError(null);
      setPrevChapterId(null);
      setNextChapterId(null);
      setImageWindow(new Set([0, 1, 2, 3, 4]));
      setConfigOpen(false);
      resetTranslationPipeline();
      if (pinnedChapterRef.current) {
        releaseReaderCacheChapter(pinnedChapterRef.current);
        pinnedChapterRef.current = null;
      }

      try {
        // Pin this chapter before any extraction/download so the LRU pass
        // cannot remove pages while the reader is using them.
        pinReaderCacheChapter(readerIdentity.chapterId);
        pinnedChapterRef.current = readerIdentity.chapterId;

        const download = await getDownloadedChapter(
          readerIdentity.chapterId,
          source,
          downloadTargetIdentity.providerChapterId,
        );
        if (download?.status === "completed") {
          const hit = await materializeDownloadedReaderChapter(
            readerIdentity,
            {
              fileUri: download.fileUri ?? null,
              pageCount: download.pageCount ?? null,
              pagesDirUri: download.pagesDirUri ?? null,
            },
            {
              mangaTitle: download.mangaTitle,
              chapterTitle: download.chapterTitle,
            },
          );
          if (!cancelled) setPages(hit.pages);
          return;
        }

        // Warm open: the shared cache is the content authority, so reuse a
        // complete entry without asking the extension for the page list.
        const cached = await readValidReaderCacheChapter(readerIdentity);
        if (cached) {
          if (!cancelled) {
            setPages(cached.pages);
            loadAdjacentChapters({
              source,
              chapterId,
              mangaId,
              onAdjacent: (adjacent) => {
                if (!cancelled) {
                  setPrevChapterId(adjacent.prev);
                  setNextChapterId(adjacent.next);
                }
              },
            });
            void enforceReaderCacheLimit();
          }
          return;
        }

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
        const hit = await materializeNetworkReaderChapter(
          readerIdentity,
          networkUrls,
          { mangaTitle, chapterTitle: title },
        );
        if (!cancelled) setPages(hit.pages);
      } catch (error) {
        console.error("Failed to load chapter pages:", error);
        if (!cancelled) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Could not load this chapter.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadPages();
    return () => {
      cancelled = true;
      if (pinnedChapterRef.current) {
        releaseReaderCacheChapter(pinnedChapterRef.current);
        pinnedChapterRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId, source]);

  // Only measure pages near the current position. Measuring every page in a
  // 300-page chapter fired hundreds of network requests before first paint.
  useEffect(() => {
    requestedPageDimsRef.current = new Set();
  }, [pages]);

  useEffect(() => {
    if (!pages.length) return;
    const requested = requestedPageDimsRef.current;
    // Long strips need a few extra rows measured ahead of time; otherwise a
    // page that enters the viewport with a placeholder height makes the whole
    // column jump. Paged readers only need the current prefetch window.
    const prefetchRadius = isLongStripMode(chrome.readingMode) ? 8 : 2;
    const wanted = new Set<number>(imageWindow);
    for (
      let index = Math.max(0, currentPageIndex);
      index <= Math.min(pages.length - 1, currentPageIndex + prefetchRadius);
      index += 1
    ) {
      wanted.add(index);
    }
    for (const index of wanted) {
      const url = pages[index];
      if (!url || requested.has(url) || pageDims[url]) continue;
      requested.add(url);
      const onSize = (width: number, height: number) =>
        rememberPageDims(url, width, height);
      const onError = () => undefined;
      if (url.startsWith("file://")) {
        // Downloaded pages are already local; remote headers would break it.
        Image.getSize(url, onSize, onError);
        continue;
      }
      const headers = imageHeadersForPage(source, url);
      if (headers && typeof (Image as any).getSizeWithHeaders === "function") {
        // Android needs getSizeWithHeaders to attach per-host headers;
        // when unavailable the <Image> onLoad handler records dimensions.
        (Image as any).getSizeWithHeaders(url, headers, onSize, onError);
      } else {
        Image.getSize(url, onSize, onError);
      }
    }
  }, [
    chrome.readingMode,
    currentPageIndex,
    imageWindow,
    pageDims,
    pages,
    rememberPageDims,
    source,
  ]);

  const scrollOffset = useRef(0);
  const [scrollSpeed, setScrollSpeed] = useState(1);
  const scrollSpeedRef = useRef(1);
  const requestRef = useRef<number | undefined>(undefined);

  const handleSetSpeed = (speed: number) => {
    setScrollSpeed(speed);
    scrollSpeedRef.current = speed;
    updateSettings({ readerScrollSpeed: speed }).catch(console.error);
  };

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

  const onScrollEvent = (e: any) => {
    const offset = isHorizontalMode(chrome.readingMode)
      ? e.nativeEvent.contentOffset.x
      : e.nativeEvent.contentOffset.y;
    scrollOffset.current = offset;
    syncPageIndexFromOffset(offset);
  };

  const handleScrollBeginDrag = () => {
    setAutoScroll(false);
  };

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
  }, []);

  const animateScroll = () => {
    scrollOffset.current += scrollSpeedRef.current;
    listRef.current?.scrollToOffset({
      offset: scrollOffset.current,
      animated: false,
    });
    requestRef.current = requestAnimationFrame(animateScroll);
  };

  const pagedMode = isPagedMode(chrome.readingMode);
  pagedModeRef.current = pagedMode;

  useEffect(() => {
    if (autoScroll && pages.length && !pagedMode) {
      requestRef.current = requestAnimationFrame(animateScroll);
    } else {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    }
    return () => {
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoScroll, pages, pagedMode]);

  useEffect(() => {
    if (pagedMode) {
      setAutoScroll(false);
    }
  }, [pagedMode]);

  // ---- Settings ----------------------------------------------------------
  // Keeps this screen in sync with the persisted settings store.
  useEffect(() => {
    const apply = (settings: AppSettings) => {
      setReaderLanguage(
        settings.readerLanguage
          ? canonicalChineseForReader(settings.readerLanguage)
          : "",
      );
      setTargetLanguage(settings.readerTargetLanguage || "en");
      setTranslationEngine(settings.readerTranslationEngine);
      setTranslationMode(settings.readerTranslationMode);
      setShowPageStatus(settings.readerShowPageStatus);
      setHideTranslated(settings.readerHideTranslated);
      setGeminiApiKey(settings.geminiApiKey || "");
      setGeminiModelId(settings.geminiModelId || GEMINI_DEFAULT_MODEL);
      setAutoModelSwitch(settings.readerAutoModelSwitch);
      const effectiveLanguage = settings.readerLanguage || autoLanguage;
      setOcrBubbleWorkers(
        clampOcrBubbleWorkers(
          modelIdForLanguage(effectiveLanguage),
          settings.ocrBubbleWorkers,
        ),
      );
      setOcrLookahead(settings.ocrLookahead);
      setAiMaxContextPages(settings.aiMaxContextPages);
      setOverlayFont(settings.readerOverlayFont);
      setOverlayFontWeight(settings.readerOverlayFontWeight);
      setOverlayFontScale(settings.readerOverlayFontScale);
      setOverlayTextColor(settings.readerOverlayTextColor);
      setChrome(chromeFromSettings(settings));
      setDefaultZoomScale(settings.readerDefaultZoomScale);
      setScrollSpeed(settings.readerScrollSpeed || 1);
    };

    getSettings()
      .then((settings) => {
        apply(settings);
      })
      .catch(() => {});
    const unsubscribe = subscribeSettings(apply);
    return unsubscribe;
  }, [autoLanguage]);

  const handleSelectReaderLanguage = (code: string) => {
    const nextLanguage = code ? canonicalChineseForReader(code) : "";
    setReaderLanguage(nextLanguage);

    const languageToBind = nextLanguage || autoLanguage;
    console.log("[reader][ocr] provider selection", {
      language: languageToBind,
      model: modelIdForLanguage(languageToBind),
    });
    updateSettings({ readerLanguage: nextLanguage }).catch(console.error);
  };
  const handleSelectTargetLanguage = (code: string) => {
    setTargetLanguage(code);
    updateSettings({ readerTargetLanguage: code }).catch(console.error);
    console.log("[reader][settings] target language", code);
  };
  const handleSelectTranslationEngine = (
    engine: AppSettings["readerTranslationEngine"],
  ) => {
    if (engine !== translationEngine) stopTranslationRun();
    setTranslationEngine(engine);
    updateSettings({ readerTranslationEngine: engine }).catch(console.error);
    console.log("[reader][settings] translation engine", engine);
  };
  const handleSelectTranslationMode = (
    mode: AppSettings["readerTranslationMode"],
  ) => {
    if (mode !== translationMode) stopTranslationRun();
    setTranslationMode(mode);
    updateSettings({ readerTranslationMode: mode }).catch(console.error);
    console.log("[reader][settings] translation mode", mode);
  };
  const handleChangeShowPageStatus = (value: boolean) => {
    setShowPageStatus(value);
    updateSettings({ readerShowPageStatus: value }).catch(console.error);
    console.log("[reader][settings] show page status", value);
  };
  const handleChangeHideTranslated = (value: boolean) => {
    setHideTranslated(value);
    updateSettings({ readerHideTranslated: value }).catch(console.error);
    console.log("[reader][settings] hide translated", value);
  };
  const handleSelectGeminiModel = (model: GeminiModelId) => {
    if (model !== geminiModelId) stopTranslationRun();
    setGeminiModelId(model);
    updateSettings({ geminiModelId: model }).catch(console.error);
    console.log("[reader][settings] Gemini model", model);
  };
  const handleChangeAutoModelSwitch = (value: boolean) => {
    setAutoModelSwitch(value);
    updateSettings({ readerAutoModelSwitch: value }).catch(console.error);
    console.log("[reader][settings] auto model switch", value);
  };
  const handleChangeLookahead = (value: number) => {
    const next = Math.min(5, Math.max(1, Math.round(value)));
    setOcrLookahead(next);
    updateSettings({ ocrLookahead: next }).catch(console.error);
    console.log("[reader][settings] look ahead", next);
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
    updateSettings({ readerOverlayFont: font }).catch(console.error);
  };
  const handleSelectOverlayFontWeight = (weight: number) => {
    const normalized = Math.min(900, Math.max(400, Math.round(weight / 100) * 100));
    setOverlayFontWeight(normalized);
    queueSettingsPatch({ readerOverlayFontWeight: normalized });
  };
  const handleSelectOverlayTextColor = (color: string) => {
    setOverlayTextColor(color);
    queueSettingsPatch({ readerOverlayTextColor: color });
  };
  const handleSelectOverlayFontScale = (scale: number) => {
    const normalized = Math.round(Math.min(1.5, Math.max(0.5, scale)) * 100) / 100;
    setOverlayFontScale(normalized);
    queueSettingsPatch({ readerOverlayFontScale: normalized });
  };
  const handleSelectDefaultZoomScale = (scale: number) => {
    const normalized = Math.min(2, Math.max(0.1, scale));
    console.log("handleSelectDefaultZoomScale", normalized);
    setDefaultZoomScale(normalized);
    updateSettings({ readerDefaultZoomScale: normalized }).catch(console.error);
  };

  /** Coalesces slider drags into one file/DB write (state still updates live). */
  const queueSettingsPatch = (patch: Partial<AppSettings>, delay = 160) => {
    pendingSettingsPatchRef.current = {
      ...pendingSettingsPatchRef.current,
      ...patch,
    };
    if (settingsPersistTimerRef.current) {
      clearTimeout(settingsPersistTimerRef.current);
    }
    settingsPersistTimerRef.current = setTimeout(() => {
      const pending = pendingSettingsPatchRef.current;
      pendingSettingsPatchRef.current = {};
      settingsPersistTimerRef.current = null;
      if (Object.keys(pending).length > 0) {
        updateSettings(pending).catch(console.error);
      }
    }, delay);
  };

  useEffect(
    () => () => {
      if (settingsPersistTimerRef.current) {
        clearTimeout(settingsPersistTimerRef.current);
      }
      const pending = pendingSettingsPatchRef.current;
      if (Object.keys(pending).length > 0) {
        updateSettings(pending).catch(console.error);
      }
    },
    [],
  );

  const handleChromeChange = (patch: Partial<ReaderChromeSettings>) => {
    const safePatch = applyFilterExclusivity(patch);
    setChrome((prev) => ({ ...prev, ...safePatch }));
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
    (index: number) => {
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
        listRef.current?.scrollToIndex({ index: target, animated: false });
        return;
      }
      listRef.current?.scrollToOffset({
        offset: pageOffsets[target] ?? 0,
        animated: false,
      });
    },
    [chrome.readingMode, displayItems, pageOffsets],
  );

  // Image measurements can turn a landscape page into two rows after it has
  // already been displayed. Keep the pager on the same source page instead of
  // letting inserted halves shift the visible row under the user.
  useEffect(() => {
    const previous = previousDisplayItemsRef.current;
    if (previous === displayItems) return;
    previousDisplayItemsRef.current = displayItems;
    if (!pagedMode || displayItems.length === 0) return;

    const visiblePage =
      previous[lastDisplayIndexRef.current]?.pageIndex ?? currentPageIndex;
    const target = displayItems.findIndex(
      (item) => item.pageIndex === visiblePage,
    );
    if (target < 0) return;
    lastDisplayIndexRef.current = target;
    setCurrentDisplayIndex(target);
    setCurrentPageIndex(visiblePage);
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ index: target, animated: false });
    });
  }, [currentPageIndex, displayItems, pagedMode]);

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
      listRef.current?.scrollToOffset({ offset: estimated, animated: false });
      // FlatList needs one frame after the estimated offset before the target
      // row exists. Retry once so variable-height pages land exactly.
      if (scrollRetryRef.current < 1) {
        scrollRetryRef.current += 1;
        setTimeout(() => {
          listRef.current?.scrollToIndex({
            index: target,
            animated: false,
            viewPosition: 0,
          });
        }, 120);
      }
    },
    [displayItems.length, pageOffsets],
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
          scrollToDisplayItem(currentDisplayIndex - 1);
        }
      } else if (action === "next") {
        if (currentDisplayIndex < displayItems.length - 1) {
          scrollToDisplayItem(currentDisplayIndex + 1);
        }
      } else {
        setShowHeader(true);
      }
    },
    [
      bodySize.height,
      bodySize.width,
      chrome,
      configOpen,
      currentDisplayIndex,
      displayItems.length,
      scrollToDisplayItem,
    ],
  );

  /**
   * Strip-mode tap handling. A tap is measured against the viewport (page rows
   * can be many screens tall), and prev/next scrolls by roughly one screenful
   * like Mihon's webtoon viewer instead of jumping to a page boundary.
   */
  const handleStripTap = useCallback(
    (x: number, y: number, index: number) => {
      if (configOpen) return;
      const offset = pageOffsets[index] ?? 0;
      const scroll = scrollOffset.current;
      const viewportX = horizontalList ? x + offset - scroll : x;
      const viewportY = horizontalList ? y : y + offset - scroll;
      const rtl =
        chrome.readingMode === "pagedHorizontal" &&
        chrome.pagedDirection === "rtl";
      const action = resolveTapZoneAction({
        layout: chrome.tapZoneLayout,
        invert: chrome.invertTapZones,
        rtl,
        x: viewportX,
        y: viewportY,
        width: bodySize.width,
        height: bodySize.height,
      });
      if (action === "toggle") {
        setShowHeader(true);
        return;
      }
      const step =
        (horizontalList ? bodySize.width : bodySize.height) * 0.85;
      const target = Math.max(
        0,
        scroll + (action === "next" ? step : -step),
      );
      scrollOffset.current = target;
      listRef.current?.scrollToOffset({
        offset: target,
        animated: chrome.animatePageTransitions,
      });
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
      horizontalList,
      pageOffsets,
    ],
  );

  // Short-lived preview that flashes the active tap zones whenever the user
  // switches the tap-zone preset.
  const flashOpacity = useRef(new Animated.Value(0)).current;
  const [zoneFlashNonce, setZoneFlashNonce] = useState(0);
  const lastZoneLayoutRef = useRef<ReaderTapZoneLayout | null>(null);

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

  useEffect(() => {
    const layout = chrome.tapZoneLayout;
    if (lastZoneLayoutRef.current === null) {
      lastZoneLayoutRef.current = layout;
      return;
    }
    if (lastZoneLayoutRef.current !== layout) {
      lastZoneLayoutRef.current = layout;
      setZoneFlashNonce((nonce) => nonce + 1);
    }
  }, [chrome.tapZoneLayout]);

  useEffect(() => {
    if (zoneFlashNonce > 0) {
      setTimeout(() => setZoneFlashNonce(0), 2000);
    }
  }, [zoneFlashNonce]);

  useEffect(() => {
    if (zoneFlashNonce === 0) return;
    flashOpacity.setValue(0.7);
    const animation = Animated.timing(flashOpacity, {
      toValue: 0,
      duration: 2000,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [zoneFlashNonce, flashOpacity]);

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

  const toggleChrome = useCallback(() => setShowHeader((visible) => !visible), []);

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

  const chapterTitleText = paramString(params.chapterTitle);
  const chapterLabel = chapterTitleText
    ? chapterTitleText
    : chapterNumberLabel(title, chapterId);

  /**
   * Jumps to an adjacent chapter. The old params are dropped, not spread:
   * the target chapter's title/number come from the catalog when known (so
   * the header number updates), and the manga + chapter rows are upserted
   * first so progress/history are tracked against the right chapter.
   */
  const openAdjacentChapter = async (targetParam: string) => {
    const nextId = paramString(targetParam);
    if (!nextId) return;
    const nextIdentity = resolveReaderIdentity({
      source,
      chapterId: nextId,
      mangaId,
    });
    const known = await getChapterDownloadInfo(nextIdentity.chapterId).catch(
      () => null,
    );
    const nextChapterTitle = known?.title ?? chapterTitleFromId(nextId);
    const nextMangaTitle = mangaTitle || title;
    const nextLanguage = known?.languageCode ?? language;
    await prepareReaderOpen({
      provider: nextIdentity.provider,
      providerMangaId: nextIdentity.providerMangaId,
      providerChapterId: nextIdentity.providerChapterId,
      mangaTitle: nextMangaTitle,
      chapterTitle: nextChapterTitle,
      chapterNumber: known?.chapterNumber ?? null,
      scanlationGroup: known?.scanlationGroup ?? null,
      chapterGroupKey: known?.chapterGroupKey ?? null,
      languageCode: nextLanguage ?? null,
      thumbnailUrl: thumbnailUrl || null,
      readerParams: {
        id: nextId,
        source: nextIdentity.provider,
        mangaTitle: nextMangaTitle,
        chapterTitle: nextChapterTitle,
        ...(mangaId ? { mangaId } : {}),
        ...(thumbnailUrl ? { thumbnailUrl } : {}),
        ...(nextLanguage ? { language: nextLanguage } : {}),
      },
    });
    router.replace({
      pathname: "/reader/[id]",
      params: {
        id: nextId,
        source,
        ...(mangaId ? { mangaId } : {}),
        mangaTitle: nextMangaTitle,
        chapterTitle: nextChapterTitle,
        ...(known?.chapterNumber != null
          ? { chapterNumber: known.chapterNumber }
          : {}),
        ...(thumbnailUrl ? { thumbnailUrl } : {}),
        ...(nextLanguage ? { language: nextLanguage } : {}),
      },
    });
  };

  const goPrevChapter = () => {
    if (prevChapterId) void openAdjacentChapter(prevChapterId);
  };
  const goNextChapter = () => {
    if (nextChapterId) void openAdjacentChapter(nextChapterId);
  };

  const navFlipped =
    chrome.readingMode === "pagedHorizontal" && chrome.pagedDirection === "rtl";
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
        {showHeader && (
          <ReaderHeader
            mangaTitle={mangaTitle}
            chapterLabel={chapterLabel}
            translateActive={autoTranslation}
            translationBusy={activeTranslationJobs > 0}
            showTranslateToggle={translationMode !== "single"}
            onToggleTranslate={toggleAutoTranslation}
            onOpenTranslation={openTranslationOptions}
            onBack={goBack}
            onClose={() => {
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
          />
        )}

        {showHeader && configOpen && (
          <ReaderConfigPanel
            tab={configTab}
            onTabChange={setConfigTab}
            onClose={() => setConfigOpen(false)}
            chrome={chrome}
            onChangeChrome={handleChromeChange}
            defaultZoomScale={defaultZoomScale}
            onChangeDefaultZoomScale={handleSelectDefaultZoomScale}
            scrollSpeed={scrollSpeed}
            onSelectScrollSpeed={handleSetSpeed}
          />
        )}

        {showHeader && translationOpen && !configOpen && (
          <ReaderTranslationPanel
            tab={translationTab}
            onTabChange={setTranslationTab}
            onClose={() => setTranslationOpen(false)}
            readerLanguage={readerLanguage}
            ocrLanguage={ocrLanguage}
            autoLanguage={autoLanguage}
            targetLanguage={targetLanguage}
            onSelectReaderLanguage={handleSelectReaderLanguage}
            onSelectTargetLanguage={handleSelectTargetLanguage}
            translationEngine={translationEngine}
            onSelectTranslationEngine={handleSelectTranslationEngine}
            translationMode={translationMode}
            onSelectTranslationMode={handleSelectTranslationMode}
            geminiModelId={geminiModelId}
            onSelectGeminiModel={handleSelectGeminiModel}
            autoModelSwitch={autoModelSwitch}
            onChangeAutoModelSwitch={handleChangeAutoModelSwitch}
            ocrLookahead={ocrLookahead}
            onChangeLookahead={handleChangeLookahead}
            metrics={metrics}
            onClearTrCache={handleClearTrCache}
            overlayFont={overlayFont}
            onChangeOverlayFont={handleSelectOverlayFont}
            overlayFontWeight={overlayFontWeight}
            onChangeOverlayFontWeight={handleSelectOverlayFontWeight}
            overlayFontScale={overlayFontScale}
            onChangeOverlayFontScale={handleSelectOverlayFontScale}
            overlayTextColor={overlayTextColor}
            onChangeOverlayTextColor={handleSelectOverlayTextColor}
            showPageStatus={showPageStatus}
            onChangeShowPageStatus={handleChangeShowPageStatus}
            hideTranslated={hideTranslated}
            onChangeHideTranslated={handleChangeHideTranslated}
          />
        )}

        {showHeader && !configOpen && !translationOpen && (
          <ReaderBottomBar
            currentIndex={currentPageIndex}
            totalPages={pages.length}
            onScrub={scrollToPage}
            canPrevChapter={canPrevChapter}
            canNextChapter={canNextChapter}
            onPrevChapter={onPrevChapter}
            onNextChapter={onNextChapter}
            readingMode={chrome.readingMode}
            onOpenReadingModeSheet={openReadingModeSheet}
            onOpenRotationSheet={openRotationSheet}
            autoScrollActive={autoScroll}
            autoScrollDisabled={pagedMode}
            onToggleAutoScroll={() => setAutoScroll((value) => !value)}
            pagedDirection={chrome.pagedDirection}
            orientation={chrome.orientation}
            cropEnabled={chrome.cropBorders}
            onToggleCrop={() =>
              handleChromeChange({ cropBorders: !chrome.cropBorders })
            }
            onOpenSettings={openSettings}
          />
        )}

        {readingModeSheetOpen && (
          <ReaderReadingModeSheet
            value={pendingReadingMode}
            pagedDirection={pendingDirection}
            onSelect={setPendingReadingMode}
            onSelectDirection={setPendingDirection}
            onRevert={() => {
              setPendingReadingMode("webtoon");
              setPendingDirection("ltr");
            }}
            onApply={() => {
              handleChromeChange({
                readingMode: pendingReadingMode,
                pagedDirection: pendingDirection,
              });
              setReadingModeSheetOpen(false);
            }}
          />
        )}

        {rotationSheetOpen && (
          <ReaderRotationSheet
            value={pendingOrientation}
            onSelect={setPendingOrientation}
            onApply={() => {
              handleChromeChange({ orientation: pendingOrientation });
              setRotationSheetOpen(false);
            }}
          />
        )}

        {pageActionsUrl && (
          <ReaderPageActionsSheet
            pageUrl={pageActionsUrl}
            hideTranslated={hideTranslated}
            onClose={() => setPageActionsUrl(null)}
            onToggleHideTranslated={() =>
              handleChangeHideTranslated(!hideTranslated)
            }
            onRetryTranslation={retryPage}
          />
        )}

        {chrome.showPageNumber && !showHeader && (
          <View style={styles.pageChip} pointerEvents="none">
            <Text style={styles.pageChipText}>
              {currentPageIndex + 1} / {pages.length}
            </Text>
          </View>
        )}

        {!showHeader && (
          <Pressable
            onPress={() => setShowHeader(true)}
            style={styles.floatingMenuBtn}
            hitSlop={8}
            accessibilityLabel="Show reader controls"
          >
            <Menu color="#fff" size={22} />
          </Pressable>
        )}

        {pipelineError && (
          <View style={styles.errorToast}>
            <Text style={styles.errorToastText}>{pipelineError}</Text>
          </View>
        )}

        {translationMode === "single" && singlePageUrl ? (
          <SingleTranslateFab
            stage={singleStage}
            busy={singlePageBusy}
            onPress={() => translateSinglePage(singlePageUrl)}
          />
        ) : null}
        <FlatList
          ref={listRef}
          data={displayItems}
          horizontal={horizontalList}
          inverted={
            chrome.readingMode === "pagedHorizontal" &&
            chrome.pagedDirection === "rtl"
          }
          pagingEnabled={pagedMode}
          keyExtractor={(item) => item.key}
          initialNumToRender={pagedMode ? 1 : 3}
          maxToRenderPerBatch={4}
          windowSize={5}
          updateCellsBatchingPeriod={60}
          scrollEnabled={!pagedMode}
          nestedScrollEnabled
          directionalLockEnabled
          removeClippedSubviews={false}
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          getItemLayout={getItemLayout}
          onScroll={pagedMode ? undefined : onScrollEvent}
          scrollEventThrottle={32}
          onScrollBeginDrag={handleScrollBeginDrag}
          onScrollToIndexFailed={handleScrollToIndexFailed}
          contentContainerStyle={
            horizontalList ? styles.horizontalContent : styles.verticalContent
          }
          renderItem={({ item, index }) => (
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
              )}
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
              onToggleChrome={toggleChrome}
              onTapAt={
                pagedMode
                  ? handlePagedTap
                  : (x, y) => handleStripTap(x, y, index)
              }
              onLongPress={() => {
                if (chrome.showActionsOnLongTap) setPageActionsUrl(item.url);
              }}
              pageGap={item.gapAfter ? pageGap : 0}
              onRetryTranslation={retryPage}
            />
          )}
        />

        {zoneFlashNonce > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[styles.zoneFlash, { opacity: flashOpacity }]}
          >
            {tapZoneRectsFor(
              chrome.tapZoneLayout,
              bodySize.width,
              bodySize.height,
              chrome.readingMode === "pagedHorizontal" &&
                chrome.pagedDirection === "rtl",
              chrome.invertTapZones,
            ).map((rect) => (
              <View
                key={rect.edge}
                style={[
                  styles.zoneFlashBand,
                  {
                    left: rect.x,
                    top: rect.y,
                    width: rect.width,
                    height: rect.height,
                    backgroundColor: rect.color,
                  },
                ]}
              />
            ))}
          </Animated.View>
        )}

        <Animated.View
          pointerEvents="none"
          style={[styles.pageFlash, { opacity: pageFlashOpacity }]}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  singleTrFab: {
    position: "absolute",
    right: 18,
    bottom: 118,
    zIndex: 30,
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(14,165,233,0.92)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.25)",
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  singleTrFabBusy: { backgroundColor: "rgba(14,116,144,0.95)" },
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
  pageChip: {
    position: "absolute",
    bottom: 28,
    alignSelf: "center",
    backgroundColor: "rgba(10,10,14,0.7)",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    zIndex: 20,
  },
  pageChipText: { color: "#fff", fontSize: 12, fontWeight: "600" },
  floatingMenuBtn: {
    position: "absolute",
    bottom: 26,
    right: 16,
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(10,10,14,0.82)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.28)",
    zIndex: 35,
  },
  zoneFlash: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    // Above the config panel (zIndex 60) so the preview is visible while the
    // user is still picking a preset.
    zIndex: 70,
  },
  zoneFlashBand: {
    position: "absolute",
    backgroundColor: "rgba(251,191,36,0.35)",
  },
  pageFlash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "#000",
    zIndex: 15,
  },
  errorToast: {
    position: "absolute",
    bottom: 150,
    alignSelf: "center",
    backgroundColor: "#7f1d1d",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    zIndex: 30,
    maxWidth: screenWidth * 0.9,
  },
  errorToastText: { color: "#fff", fontSize: 12 },
});
