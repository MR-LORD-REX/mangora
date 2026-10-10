import { router, useLocalSearchParams } from "expo-router";
import { LayoutGrid, Rows3, SlidersHorizontal } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import AppHeader from "@/components/common/AppHeader";
import DownloadedStrip from "@/components/downloader/DownloadedStrip";
import { openMangaInfo } from "@/components/manga/openMangaInfo";
import SourceTabs from "@/components/sources/SourceTabs";
import SourceFilterOverlay, {
  hasActiveFilters,
  type FilterSection,
  type FilterValue,
} from "@/components/sources/SourceFilterOverlay";
import {
  MangaGridCard,
  MangaListRow,
  type SourceEntry,
} from "@/components/sources/MangaCards";
import { colors, providerAccent, type ViewMode } from "@/constants/theme";
import { BrainRotComicsClient } from "@/services/brainrot/brainrot";
import { brainrotBridgeFetch } from "@/services/brainrot/brainrotBridge";
import type {
  GenreItem,
  MangaEntry,
  SortOrder,
  StatusFilter,
} from "@/services/brainrot/brainrot.types";

const accent = providerAccent.brainrot;

const api = new BrainRotComicsClient({ fetchImpl: brainrotBridgeFetch });

const SORT_TABS: { value: SortOrder; label: string }[] = [
  { value: "latest", label: "Latest" },
  { value: "views", label: "Popular" },
  { value: "trending", label: "Trending" },
  { value: "new", label: "New" },
  { value: "rating", label: "Rating" },
  { value: "az", label: "A-Z" },
];

const SORT_SECTION: FilterSection = {
  key: "sort",
  title: "Sort by",
  single: true,
  options: SORT_TABS,
};

const STATUS_SECTION: FilterSection = {
  key: "status",
  title: "Status",
  single: true,
  options: [
    { value: "", label: "All" },
    { value: "ongoing", label: "Ongoing" },
    { value: "completed", label: "Completed" },
    { value: "on_hold", label: "On hold" },
    { value: "canceled", label: "Canceled" },
  ],
};

const FILTER_DEFAULTS: FilterValue = {
  sort: ["latest"],
  status: [""],
  genres: [],
};

export default function BrainRotMainScreen() {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortOrder>("latest");
  const [status, setStatus] = useState<StatusFilter>("");
  const [genres, setGenres] = useState<string[]>([]);
  const [genreOptions, setGenreOptions] = useState<GenreItem[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [items, setItems] = useState<MangaEntry[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadingRef = useRef(false);

  const params = useLocalSearchParams<{
    genre?: string | string[];
    tagLabel?: string | string[];
  }>();
  useEffect(() => {
    const value = Array.isArray(params.genre) ? params.genre[0] : params.genre;
    if (value) {
      setGenres([value]);
      router.setParams({ genre: undefined, tagLabel: undefined });
    }
  }, [params.genre]);

  const fetchPage = useCallback(
    async (pageNum: number, append: boolean) => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      setLoading(true);
      setError(null);
      try {
        const res = await api.searchManga(query.trim(), pageNum, {
          order: sort,
          status: status || undefined,
          genres: genres.length ? genres : undefined,
        });
        setHasMore(res.hasNextPage);
        setItems((prev) => (append ? [...prev, ...res.mangas] : res.mangas));
        setPage(pageNum);
      } catch (err) {
        console.error("BrainRot fetch failed:", err);
        setError(
          err instanceof Error
            ? err.message
            : "Could not load BrainRot (Cloudflare not cleared yet).",
        );
      } finally {
        loadingRef.current = false;
        setLoading(false);
      }
    },
    [query, sort, status, genres],
  );

  useEffect(() => {
    setItems([]);
    setPage(1);
    setHasMore(true);
    fetchPage(1, false);
  }, [fetchPage]);

  const onSearch = () => {
    Keyboard.dismiss();
    setItems([]);
    setPage(1);
    setHasMore(true);
    fetchPage(1, false);
  };

  const openManga = (entry: MangaEntry) => {
    Keyboard.dismiss();
    openMangaInfo({
      provider: "brainrot",
      id: entry.url,
      thumbnailUrl: entry.thumbnailUrl,
    });
  };

  // Genres come from the Madara sidebar and are only available through the
  // warm bridge, so they load the first time the filter sheet opens.
  useEffect(() => {
    if (!filtersOpen || genreOptions.length > 0) return;
    let cancelled = false;
    api
      .getFilterData()
      .then((data) => {
        if (!cancelled) setGenreOptions(data.genres);
      })
      .catch((err) => console.warn("BrainRot genre load failed:", err));
    return () => {
      cancelled = true;
    };
  }, [filtersOpen, genreOptions.length]);

  const filterValue: FilterValue = {
    sort: [sort],
    status: [status],
    genres,
  };
  const filterActive = hasActiveFilters(filterValue, FILTER_DEFAULTS);

  const applyFilters = (next: FilterValue) => {
    setSort((next.sort?.[0] as SortOrder) ?? "latest");
    setStatus((next.status?.[0] as StatusFilter) ?? "");
    setGenres(next.genres ?? []);
  };

  const sections = useMemo<FilterSection[]>(
    () => [
      SORT_SECTION,
      STATUS_SECTION,
      {
        key: "genres",
        title: "Genres",
        options: genreOptions.map((g) => ({ value: g.id, label: g.name })),
      },
    ],
    [genreOptions],
  );

  const entries = useMemo<SourceEntry[]>(
    () =>
      items.map((item) => ({
        key: item.url,
        title: item.title,
        coverUrl: item.thumbnailUrl,
        onOpen: () => openManga(item),
      })),
    [items],
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.container}>
        <AppHeader
          title="BrainRot"
          accent={accent}
          query={query}
          onQueryChange={setQuery}
          onSearchSubmit={onSearch}
          searchPlaceholder="Search BrainRot"
          onBack={() => router.back()}
          actions={[
            {
              key: "filters",
              icon: SlidersHorizontal,
              active: filterActive,
              onPress: () => setFiltersOpen(true),
            },
          ]}
          menuTitle="Result view"
          menuActions={[
            {
              key: "grid",
              label: "Grid view",
              icon: LayoutGrid,
              selected: viewMode === "grid",
              onPress: () => setViewMode("grid"),
            },
            {
              key: "list",
              label: "Compact list",
              icon: Rows3,
              selected: viewMode === "list",
              onPress: () => setViewMode("list"),
            },
          ]}
        />

        {!query.trim() && genres.length === 0 ? (
          <SourceTabs
            accent={accent}
            tabs={SORT_TABS.map((option) => ({ key: option.value, label: option.label }))}
            activeKey={sort}
            onSelect={(key) => setSort(key as SortOrder)}
          />
        ) : null}

        {loading && items.length === 0 ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator color={accent} size="large" />
          </View>
        ) : (
          <FlatList
            key={viewMode}
            data={entries}
            numColumns={viewMode === "grid" ? 2 : 1}
            keyExtractor={(item) => item.key}
            onEndReached={() => {
              if (hasMore && !loading) fetchPage(page + 1, true);
            }}
            onEndReachedThreshold={0.3}
            contentContainerStyle={styles.listContent}
            columnWrapperStyle={viewMode === "grid" ? styles.gridColumn : undefined}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              <View>
                <DownloadedStrip provider="brainrot" accent={accent} />
                {genres.length > 0 ? (
                  <Text style={styles.genrePill}>Genre / {genres.join(", ")}</Text>
                ) : null}
              </View>
            }
            ListEmptyComponent={
              !loading ? (
                <View style={styles.emptyWrap}>
                  <Text style={error ? styles.emptyError : styles.emptyText}>
                    {error ??
                      "No manga found. Try again once the Cloudflare session is warm."}
                  </Text>
                </View>
              ) : null
            }
            ListFooterComponent={
              loading && items.length > 0 ? (
                <ActivityIndicator color={accent} style={styles.footerLoader} />
              ) : null
            }
            renderItem={({ item }) =>
              viewMode === "grid" ? (
                <MangaGridCard entry={item} />
              ) : (
                <MangaListRow entry={{ ...item, accent }} />
              )
            }
          />
        )}
      </View>

      <SourceFilterOverlay
        visible={filtersOpen}
        accent={accent}
        sections={sections}
        value={filterValue}
        defaults={FILTER_DEFAULTS}
        onClose={() => setFiltersOpen(false)}
        onApply={applyFilters}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, backgroundColor: colors.bg },
  loaderWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  listContent: { paddingHorizontal: 12, paddingTop: 14, paddingBottom: 24 },
  gridColumn: { gap: 14 },
  genrePill: {
    color: accent,
    fontWeight: "800",
    fontSize: 13,
    paddingHorizontal: 12,
    paddingBottom: 8,
    textTransform: "capitalize",
  },
  emptyWrap: { paddingTop: 32 },
  emptyText: {
    color: colors.textMuted,
    textAlign: "center",
    paddingHorizontal: 24,
    paddingVertical: 48,
    fontSize: 15,
  },
  emptyError: {
    color: colors.danger,
    textAlign: "center",
    paddingHorizontal: 24,
    paddingVertical: 32,
    fontSize: 14,
    lineHeight: 21,
  },
  footerLoader: { marginVertical: 16 },
});