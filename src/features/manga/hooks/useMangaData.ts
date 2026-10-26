import { useFocusEffect } from "expo-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FlatList, TextInput } from "react-native";

import type { ProviderId } from "@core/catalog";
import { loadOfflineChapterViewer } from "@features/downloads";
import { getTrackedChapterProgress } from "@features/library";
import type {
  ChapterSortField,
  ChapterSourceModule,
  ChapterViewerData,
  ProgressMap,
  SortDirection,
  ViewerChapterRow,
} from "@shared/contracts";
import type { DownloadCandidate } from "@features/downloads";
import type { TagPopoverAnchor } from "../components/detail/TagPopover";

export interface UseMangaDataOptions {
  param: string;
  source: ChapterSourceModule;
  thumbnailUrl?: string | null;
  downloadsOnly?: boolean;
}

export function useMangaData({
  param,
  source,
  thumbnailUrl,
  downloadsOnly = false,
}: UseMangaDataOptions) {
const identity = useMemo(() => source.decodeIdentity(param), [param, source]);

  const [data, setData] = useState<ChapterViewerData | null>(null);
  const [language, setLanguage] = useState<string>("all");
  const [progress, setProgress] = useState<ProgressMap>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [overlayVisible, setOverlayVisible] = useState(false);
  const [showRead, setShowRead] = useState(true);
  const [showUnread, setShowUnread] = useState(true);
  const [sortField, setSortField] = useState<ChapterSortField>("number");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  /** null = every scanlation group is shown. */
  const [selectedGroups, setSelectedGroups] = useState<string[] | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showFab, setShowFab] = useState(false);
  const [menuRow, setMenuRow] = useState<ViewerChapterRow | null>(null);
  const [menuVisible, setMenuVisible] = useState(false);
  const [updatingRead, setUpdatingRead] = useState(false);
  const [tagPopover, setTagPopover] = useState<TagPopoverAnchor | null>(null);
  const [tagNotice, setTagNotice] = useState<string | null>(null);
  const [pretranslateCandidate, setPretranslateCandidate] =
    useState<DownloadCandidate | null>(null);

  const listRef = useRef<FlatList<ViewerChapterRow>>(null);
  const searchInputRef = useRef<TextInput>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    if (downloadsOnly) {
      // Opened from the Downloads library: database only, never the network,
      // and only the chapters that actually have a downloaded file.
      const offline = await loadOfflineChapterViewer(
        source.provider,
        identity,
      ).catch(() => null);
      if (offline) {
        setData(offline);
      } else {
        setData(null);
        setLoadError("Nothing downloaded for this series yet.");
      }
      setLoading(false);
      return;
    }
    try {
      const next = await source.load(identity, {
        language: language === "all" ? undefined : language,
        thumbnailUrl,
      });
      setData(next);
    } catch (error) {
      console.error(`Failed to load ${source.label} manga:`, error);
      // Network-first, database second: show the downloaded chapters so a
      // saved series stays readable with no connection.
      const offline = await loadOfflineChapterViewer(
        source.provider,
        identity,
      ).catch(() => null);
      if (offline) {
        setData(offline);
        setLoadError(null);
      } else {
        setLoadError(
          error instanceof Error ? error.message : "Could not load this manga.",
        );
      }
    } finally {
      setLoading(false);
    }
  }, [downloadsOnly, identity, language, source, thumbnailUrl]);

  useEffect(() => {
    void load();
  }, [load]);

  const refreshProgress = useCallback(() => {
    const query = source.progressQuery(identity);
    getTrackedChapterProgress({
      provider: query.provider as ProviderId,
      providerMangaIds: query.providerMangaIds,
      toChapterKey: query.toChapterKey,
    })
      .then(setProgress)
      .catch(() => {});
  }, [identity, source]);

  useFocusEffect(
    useCallback(() => {
      refreshProgress();
    }, [refreshProgress]),
  );

  const meta = data?.meta ?? null;
  const rows = useMemo(() => data?.rows ?? [], [data]);

  /** One entry per "main chapter": explicit sections or rows that share a
   *  chapter key/number (duplicate scanlation-group uploads). */
  
  return {
    identity,
    data,
    language,
    setLanguage,
    progress,
    loading,
    loadError,
    meta,
    rows,
    load,
    refreshProgress,
    overlayVisible,
    setOverlayVisible,
    showRead,
    setShowRead,
    showUnread,
    setShowUnread,
    sortField,
    setSortField,
    sortDir,
    setSortDir,
    selectedGroups,
    setSelectedGroups,
    searchOpen,
    setSearchOpen,
    searchQuery,
    setSearchQuery,
    showFab,
    setShowFab,
    menuRow,
    setMenuRow,
    menuVisible,
    setMenuVisible,
    updatingRead,
    setUpdatingRead,
    tagPopover,
    setTagPopover,
    tagNotice,
    setTagNotice,
    pretranslateCandidate,
    setPretranslateCandidate,
    listRef,
    searchInputRef,
  };
}
