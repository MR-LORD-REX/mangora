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
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import ReaderBottomBar from "@/components/reader/ReaderBottomBar";
import { ReaderDownloadButton } from "@/components/downloader/DownloadButtons";
import {
  DEFAULT_READER_CHROME,
  isHorizontalMode,
  isPagedMode,
  orientationToLock,
  type ReaderChromeSettings,
  type ReaderOrientation,
  type ReaderPagedDirection,
  type ReaderReadingMode,
  type ReaderTapZoneLayout,
} from "@/components/reader/readerChrome";
import ReaderConfigPanel, {
  type ReaderConfigTab,
} from "@/components/reader/ReaderConfigPanel";
import ReaderHeader from "@/components/reader/ReaderHeader";
import {
  autoLanguageForReader,
  canonicalChineseForReader,
  languageLabel,
} from "@/components/reader/readerLanguages";
import ReaderPage from "@/components/reader/ReaderPage";
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
import type { LocalModelId } from "@/services/ocr/executorchModels";
import { suggestLocalModelIdForLanguage } from "@/services/ocr/executorchModels";
import {
  isLocalModelDownloaded,
  loadLocalModel,
} from "@/services/ocr/executorchOcr";
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
import { validateGeminiApiKey } from "@/services/translation/geminiTranslator";
import { chapterNumberLabel, chapterTitleFromId } from "@/utils/reader/chapterLabel";
import { imageHeadersForPage } from "@/utils/reader/imageHeaders";
import { loadChapterPages } from "@/utils/reader/loadChapterPages";
import { pageGeometry, type PageDims } from "@/utils/reader/pageGeometry";
import { readerBackgroundColor } from "@/utils/reader/readerBackground";
import {
  chromeFromSettings,
  chromeToSettingsPatch,
} from "@/utils/reader/readerChromeSettings";
import {
  getDownloadedPageUris,
  getDownloadedPageUrisByProviderChapter,
  readerTarget,
} from "@/services/downloader";
import type { DownloadCandidate } from "@/services/downloader";
import { resolveReaderIdentity } from "@/utils/reader/readerIdentity";
import { prepareReaderOpen } from "@/services/library/readerTracking";
import { useReaderTranslation } from "@/utils/reader/useReaderTranslation";

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
  const listRef = useRef<FlatList<string>>(null);
  const [chrome, setChrome] = useState<ReaderChromeSettings>(
    DEFAULT_READER_CHROME,
  );
  const [defaultZoomScale, setDefaultZoomScale] = useState(1);
  const [pageDims, setPageDims] = useState<Record<string, PageDims>>({});
  const lastPageIndexRef = useRef(0);
  const pagedModeRef = useRef(false);

  /** Records the decoded pixel size of a page once known (getSize/onLoad). */
  const rememberPageDims = (url: string, width: number, height: number) => {
    if (!width || !height) return;
    setPageDims((prev) => {
      const current = prev[url];
      if (current && current.width === width && current.height === height) {
        return prev;
      }
      return { ...prev, [url]: { width, height } };
    });
  };
  const [bodySize, setBodySize] = useState({
    width: screenWidth,
    height: screenHeight,
  });

  const [readingModeSheetOpen, setReadingModeSheetOpen] = useState(false);
  const [rotationSheetOpen, setRotationSheetOpen] = useState(false);
  const [pendingReadingMode, setPendingReadingMode] =
    useState<ReaderReadingMode>("scrollVertical");
  const [pendingDirection, setPendingDirection] =
    useState<ReaderPagedDirection>("ltr");
  const [pendingOrientation, setPendingOrientation] =
    useState<ReaderOrientation>("default");

  const [ocrBackend, setOcrBackend] =
    useState<AppSettings["ocrBackend"]>("local");
  const [localModelId, setLocalModelId] = useState<LocalModelId | null>(null);
  const [readerLanguage, setReaderLanguage] = useState("");
  const [targetLanguage, setTargetLanguage] = useState("en");
  const [translateMode, setTranslateMode] =
    useState<AppSettings["readerTranslateMode"]>("off");
  const [textScale, setTextScale] = useState(1);
  const ocrLanguage = readerLanguage || autoLanguage;

  const [geminiApiKey, setGeminiApiKey] = useState("");
  const [geminiModelId, setGeminiModelId] =
    useState<GeminiModelId>(GEMINI_DEFAULT_MODEL);
  const [aiRequestPageInterval, setAiRequestPageInterval] = useState(3);
  const [aiRequestFrequency, setAiRequestFrequency] = useState(1);
  const [aiMaxContextPages, setAiMaxContextPages] = useState(10);
  const [translationOpen, setTranslationOpen] = useState(false);
  const [translationTab, setTranslationTab] =
    useState<ReaderTranslationTab>("mode");

  const [configOpen, setConfigOpen] = useState(false);
  const [configTab, setConfigTab] = useState<ReaderConfigTab>("reading");
  const [downloadingModel, setDownloadingModel] = useState<LocalModelId | null>(
    null,
  );
  const [downloadedModels, setDownloadedModels] = useState<Set<LocalModelId>>(
    () => new Set(),
  );

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
    setTranslationTab("mode");
  };

  // Owns YOLO/OCR/translation state, caching and the auto-translation scheduler.
  const {
    translationPages,
    pipelineError,
    setPipelineError,
    autoTranslation,
    activeTranslationJobs,
    resetTranslationPipeline,
    stopTranslationRun,
    toggleAutoTranslation,
  } = useReaderTranslation({
    source,
    providerLanguage: language,
    ocrLanguage,
    readerLanguageOverride: readerLanguage,
    pages,
    currentPageIndex,
    identity: readerIdentity,
    ocrBackend,
    localModelId,
    downloadedModels,
    translateMode,
    targetLanguage,
    geminiApiKey,
    geminiModelId,
    aiRequestPageInterval,
    aiRequestFrequency,
    aiMaxContextPages,
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
          ...(mangaId ? { mangaId } : {}),
          ...(thumbnailUrl ? { thumbnailUrl } : {}),
          ...(language ? { language } : {}),
        },
        pageIndex: lastPageIndex,
      });
      if (!cancelled) {
        requestAnimationFrame(() => {
          listRef.current?.scrollToIndex({
            index: lastPageIndex,
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
      setPrevChapterId(null);
      setNextChapterId(null);
      setImageWindow(new Set([0, 1, 2, 3, 4]));
      setConfigOpen(false);
      resetTranslationPipeline();

      try {
        // Prefer the downloaded copy: it also keeps the chapter readable offline.
        try {
          const localPages = await getDownloadedPageUris(
            readerIdentity.chapterId,
          );
          if (localPages.length > 0) {
            if (!cancelled) {
              setPages(localPages);
            }
            return;
          }
        } catch (error) {
          console.warn("Downloaded chapter lookup failed:", error);
        }

        // Fall back to matching by provider chapter identity: URL-based
        // providers can rebuild a canonical id from the route that differs
        // from the one recorded at download time, which would otherwise send a
        // downloaded chapter back to the network.
        try {
          const localPages = await getDownloadedPageUrisByProviderChapter(
            source,
            downloadTargetIdentity.providerChapterId,
          );
          if (localPages.length > 0) {
            if (!cancelled) {
              setPages(localPages);
            }
            return;
          }
        } catch (error) {
          console.warn("Downloaded chapter lookup by provider failed:", error);
        }

        await loadChapterPages({
          source,
          chapterId,
          mangaId,
          onPages: (nextPages) => {
            if (!cancelled) setPages(nextPages);
          },
          onAdjacent: (adjacent) => {
            if (!cancelled) {
              setPrevChapterId(adjacent.prev);
              setNextChapterId(adjacent.next);
            }
          },
        });
      } catch (error) {
        console.error("Failed to load chapter pages:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadPages();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterId, source]);

  useEffect(() => {
    pages.forEach((url) => {
      const onSize = (width: number, height: number) =>
        rememberPageDims(url, width, height);
      const onError = () => undefined;
      if (url.startsWith("file://")) {
        // Downloaded pages are already local; remote headers would break it.
        Image.getSize(url, onSize, onError);
        return;
      }
      const headers = imageHeadersForPage(source, url);
      if (headers && typeof (Image as any).getSizeWithHeaders === "function") {
        // Android needs getSizeWithHeaders to attach per-host headers;
        // when unavailable the <Image> onLoad handler records dimensions.
        (Image as any).getSizeWithHeaders(url, headers, onSize, onError);
      } else {
        Image.getSize(url, onSize, onError);
      }
    });
  }, [pages, source]);

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
   * Scroll-mode page counter: resolves the strip/page whose band contains
   * the top of the viewport from the accumulated row heights. FlatList
   * viewability cannot work for stitched strips because a 9000px-tall page
   * is never "50% visible" inside a ~700px viewport - that is what made
   * the counter freeze on those chapters.
   */
  const syncPageIndexFromOffset = (offset: number) => {
    if (pagedModeRef.current || pages.length === 0) return;
    const horizontal = isHorizontalMode(chrome.readingMode);
    let accumulated = 0;
    let index = pages.length - 1;
    for (let i = 0; i < pages.length; i += 1) {
      const geometry = pageGeometry(
        pages[i],
        chrome.readingMode,
        chrome.fitMode,
        chrome.sidePadding,
        bodySize,
        pageDims,
      );
      const length = horizontal ? geometry.itemW : geometry.itemH;
      if (offset < accumulated + Math.max(length, 1)) {
        index = i;
        break;
      }
      accumulated += length;
    }
    if (lastPageIndexRef.current !== index) {
      lastPageIndexRef.current = index;
      setCurrentPageIndex(index);
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
    if (pages.length === 0) {
      setImageWindow(new Set());
      return;
    }

    const start = Math.max(0, currentPageIndex - 3);
    const end = Math.min(pages.length - 1, currentPageIndex + 3);
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
  }, [currentPageIndex, pages.length]);

  // Paged modes only: every page fills the viewport, so viewability is
  // exact there. Scroll modes are handled by syncPageIndexFromOffset.
  const onViewableItemsChanged = ({ viewableItems }: any) => {
    if (!pagedModeRef.current) return;
    if (viewableItems && viewableItems.length > 0) {
      const index = viewableItems[0].index ?? 0;
      if (lastPageIndexRef.current !== index) {
        lastPageIndexRef.current = index;
        setCurrentPageIndex(index);
      }
    }
  };

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
  // Keeps this screen in sync with the persisted settings store (the home
  // screen owns the OCR.space API key, the reader owns backend/model picks).
  useEffect(() => {
    let active = true;

    const apply = (settings: AppSettings) => {
      setOcrBackend(settings.ocrBackend);
      setLocalModelId(settings.localModelId);
      setReaderLanguage(
        settings.readerLanguage
          ? canonicalChineseForReader(settings.readerLanguage)
          : "",
      );
      setTargetLanguage(settings.readerTargetLanguage || "en");
      setTranslateMode(settings.readerTranslateMode);
      setGeminiApiKey(settings.geminiApiKey || "");
      setGeminiModelId(settings.geminiModelId || GEMINI_DEFAULT_MODEL);
      setAiRequestPageInterval(settings.aiRequestPageInterval);
      setAiRequestFrequency(settings.aiRequestFrequency);
      setAiMaxContextPages(settings.aiMaxContextPages);
      setTextScale(settings.readerTextScale || 1);
      setChrome(chromeFromSettings(settings));
      setDefaultZoomScale(settings.readerDefaultZoomScale);
      setScrollSpeed(settings.readerScrollSpeed || 1);
      const modelId = settings.localModelId;
      if (modelId) {
        isLocalModelDownloaded(modelId)
          .then((downloaded) => {
            if (downloaded && active) {
              setDownloadedModels((prev) => {
                if (prev.has(modelId)) return prev;
                const next = new Set(prev);
                next.add(modelId);
                return next;
              });
            }
          })
          .catch(() => {});
      }
    };

    getSettings()
      .then((settings) => {
        if (active) apply(settings);
      })
      .catch(() => {});
    const unsubscribe = subscribeSettings(apply);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const handleSelectReaderLanguage = (code: string) => {
    const nextLanguage = code ? canonicalChineseForReader(code) : "";
    setReaderLanguage(nextLanguage);

    const languageToBind = nextLanguage || autoLanguage;
    const baseLanguage = languageToBind.toLowerCase().split("-")[0];
    if (baseLanguage === "ja" || baseLanguage === "zh") {
      console.log("[reader][ocr] automatic model selection", {
        language: languageToBind,
        backend: "cloud",
        model: null,
      });
      setOcrBackend("cloud");
      updateSettings({
        readerLanguage: nextLanguage,
        ocrBackend: "cloud",
      }).catch(console.error);
      return;
    }

    const modelId = suggestLocalModelIdForLanguage(languageToBind);
    console.log("[reader][ocr] automatic model selection", {
      language: languageToBind,
      backend: "local",
      model: modelId,
    });
    updateSettings({ readerLanguage: nextLanguage }).catch(console.error);
    handleSelectLocalModel(modelId);
  };
  const handleSelectTargetLanguage = (code: string) => {
    setTargetLanguage(code);
    updateSettings({ readerTargetLanguage: code }).catch(console.error);
  };
  const handleSelectTranslateMode = (
    mode: AppSettings["readerTranslateMode"],
  ) => {
    if (mode !== translateMode && autoTranslation) {
      stopTranslationRun();
    }
    updateSettings({ readerTranslateMode: mode }).catch(console.error);
  };
  const handleSelectGeminiModel = (id: GeminiModelId) => {
    setGeminiModelId(id);
    updateSettings({ geminiModelId: id }).catch(console.error);
  };
  const handleSelectRequestInterval = (interval: number) => {
    updateSettings({ aiRequestPageInterval: interval }).catch(console.error);
  };
  const handleSelectRequestFrequency = (frequency: number) => {
    updateSettings({ aiRequestFrequency: frequency }).catch(console.error);
  };
  const handleSelectMaxContextPages = (pages: number) => {
    updateSettings({ aiMaxContextPages: pages }).catch(console.error);
  };
  const handleValidateAndSaveGeminiKey = async (apiKey: string) => {
    const trimmed = apiKey.trim();
    // One request to confirm the key (and selected model) actually work.
    await validateGeminiApiKey(trimmed, geminiModelId);
    setGeminiApiKey(trimmed);
    await updateSettings({ geminiApiKey: trimmed });
  };
  const handleSelectTextScale = (scale: number) => {
    updateSettings({ readerTextScale: scale }).catch(console.error);
  };
  const handleSelectDefaultZoomScale = (scale: number) => {
    const normalized = Math.min(2, Math.max(0.1, scale));
    console.log("handleSelectDefaultZoomScale", normalized);
    setDefaultZoomScale(normalized);
    updateSettings({ readerDefaultZoomScale: normalized }).catch(console.error);
  };

  const handleChromeChange = (patch: Partial<ReaderChromeSettings>) => {
    setChrome((prev) => {
      const next = { ...prev, ...patch };
      updateSettings(chromeToSettingsPatch(patch)).catch(console.error);
      return next;
    });
  };

  const horizontalList = isHorizontalMode(chrome.readingMode);

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

  const scrollToPage = (index: number) => {
    const target = Math.min(Math.max(index, 0), pages.length - 1);
    if (pages.length === 0) return;
    setCurrentPageIndex(target);
    lastPageIndexRef.current = target;
    const isPagedReadingMode = isPagedMode(chrome.readingMode);
    if (isPagedReadingMode) {
      listRef.current?.scrollToIndex({ index: target, animated: false });
      return;
    }
    let offset = 0;
    for (let pageIndex = 0; pageIndex < target; pageIndex += 1) {
      const geometry = pageGeometry(
        pages[pageIndex],
        chrome.readingMode,
        chrome.fitMode,
        chrome.sidePadding,
        bodySize,
        pageDims,
      );
      offset += horizontalList ? geometry.itemW : geometry.itemH;
    }
    listRef.current?.scrollToOffset({ offset, animated: false });
  };

  const handleScrollToIndexFailed = ({ index }: { index: number }) => {
    const pageLength = horizontalList ? bodySize.width : bodySize.height;
    listRef.current?.scrollToOffset({
      offset: Math.max(0, index) * pageLength,
      animated: false,
    });
  };

  /**
   * Paged-mode tap handling: the active tap-zone preset turns pages from the
   * 30% edge bands and the remaining middle space toggles the header/footer.
   * While the chrome is open, any tap closes it first - that keeps the bar
   * buttons and the page-turn zones from fighting over the same touches.
   */
  const handlePagedTap = (x: number, y: number) => {
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
      if (currentPageIndex > 0) scrollToPage(currentPageIndex - 1);
    } else if (action === "next") {
      if (currentPageIndex < pages.length - 1) {
        scrollToPage(currentPageIndex + 1);
      }
    } else {
      setShowHeader(true);
    }
  };

  // Short-lived preview that flashes the active tap zones whenever the user
  // switches the tap-zone preset.
  const flashOpacity = useRef(new Animated.Value(0)).current;
  const [zoneFlashNonce, setZoneFlashNonce] = useState(0);
  const lastZoneLayoutRef = useRef<ReaderTapZoneLayout | null>(null);

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

  const handleSelectLocalModel = async (id: LocalModelId) => {
    if (downloadingModel) return;
    console.log("[reader][ocr] local model set", { model: id });
    await updateSettings({ ocrBackend: "local", localModelId: id }).catch(
      console.error,
    );
    setDownloadingModel(id);
    try {
      // Downloads (first time) and caches the model as app data, then
      // keeps the native module loaded for later scans.
      await loadLocalModel(id);
      setDownloadedModels((prev) => {
        if (prev.has(id)) return prev;
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      setPipelineError(null);
    } catch (error) {
      console.error("Failed to download/load the local OCR model:", error);
      setPipelineError(
        error instanceof Error
          ? error.message
          : "Failed to download the OCR model.",
      );
    } finally {
      setDownloadingModel(null);
    }
  };
  // ---- Derived labels ----------------------------------------------------
  const targetLanguageLabel = languageLabel(targetLanguage || "en");

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

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
          <Text style={styles.emptyText}>No pages found for this chapter.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const pageBackground = readerBackgroundColor(chrome.backgroundColor);
  const toggleChrome = () => setShowHeader((visible) => !visible);

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
            onToggleTranslate={toggleAutoTranslation}
            onOpenTranslation={openTranslationOptions}
            onBack={goBack}
            onClose={() => {
              setConfigOpen(false);
              setTranslationOpen(false);
              setReadingModeSheetOpen(false);
              setRotationSheetOpen(false);
              setShowHeader(false);
            }}
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
            translateMode={translateMode}
            onSelectTranslateMode={handleSelectTranslateMode}
            geminiApiKey={geminiApiKey}
            geminiModelId={geminiModelId}
            onSelectGeminiModel={handleSelectGeminiModel}
            onValidateAndSaveKey={handleValidateAndSaveGeminiKey}
            textScale={textScale}
            onChangeTextScale={handleSelectTextScale}
            targetLanguageLabel={targetLanguageLabel}
            pageCount={pages.length}
            aiRequestPageInterval={aiRequestPageInterval}
            aiRequestFrequency={aiRequestFrequency}
            aiMaxContextPages={aiMaxContextPages}
            onChangeRequestInterval={handleSelectRequestInterval}
            onChangeRequestFrequency={handleSelectRequestFrequency}
            onChangeMaxContextPages={handleSelectMaxContextPages}
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
            fitMode={chrome.fitMode}
            onToggleFit={() =>
              handleChromeChange({
                fitMode: chrome.fitMode === "fit" ? "original" : "fit",
              })
            }
            onOpenSettings={openSettings}
            downloadSlot={
              <ReaderDownloadButton
                candidate={downloadCandidate}
                context={downloadContext}
              />
            }
          />
        )}

        {readingModeSheetOpen && (
          <ReaderReadingModeSheet
            value={pendingReadingMode}
            pagedDirection={pendingDirection}
            onSelect={setPendingReadingMode}
            onSelectDirection={setPendingDirection}
            onRevert={() => {
              setPendingReadingMode("scrollVertical");
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

        <FlatList
          ref={listRef}
          data={pages}
          horizontal={horizontalList}
          inverted={
            chrome.readingMode === "pagedHorizontal" &&
            chrome.pagedDirection === "rtl"
          }
          pagingEnabled={pagedMode}
          keyExtractor={(item, index) => `${item}-${index}`}
          initialNumToRender={pages.length}
          maxToRenderPerBatch={3}
          windowSize={5}
          scrollEnabled={!pagedMode}
          nestedScrollEnabled
          directionalLockEnabled
          removeClippedSubviews={Platform.OS === "android"}
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          onScroll={onScrollEvent}
          scrollEventThrottle={16}
          onScrollBeginDrag={handleScrollBeginDrag}
          onScrollToIndexFailed={handleScrollToIndexFailed}
          contentContainerStyle={
            horizontalList ? styles.horizontalContent : styles.verticalContent
          }
          renderItem={({ item, index }) => (
            <ReaderPage
              url={item}
              loadImage={imageWindow.has(index)}
              geometry={pageGeometry(
                item,
                chrome.readingMode,
                chrome.fitMode,
                chrome.sidePadding,
                bodySize,
                pageDims,
              )}
              pageBackground={pageBackground}
              imageHeaders={imageHeadersForPage(source, item)}
              chrome={chrome}
              defaultZoomScale={defaultZoomScale}
              pagedMode={pagedMode}
              translation={translationPages[item]}
              textScale={textScale}
              onLoadDims={rememberPageDims}
              onToggleChrome={toggleChrome}
              onTapAt={handlePagedTap}
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
                  },
                ]}
              />
            ))}
          </Animated.View>
        )}
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
