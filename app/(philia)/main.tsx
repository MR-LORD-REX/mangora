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
import { PhiliaScansClient } from "@/services/philia/philia";
import {
  PHILIA_GENRES,
  PHILIA_SORTS,
  PHILIA_STATUSES,
  PHILIA_TYPES,
  type PhiliaMangaSummary,
  type PhiliaSortOrder,
  type PhiliaContentType,
  type PhiliaMangaStatus,
} from "@/services/philia/philia.types";

const accent = providerAccent.philia;
const api = new PhiliaScansClient();

const SORT_TABS: { value: PhiliaSortOrder; label: string }[] = [
  { value: "recently_updated", label: "Recent" },
  { value: "trending", label: "Trending" },
  { value: "views", label: "Most Viewed" },
  { value: "rating", label: "Top Rated" },
  { value: "title", label: "A-Z" },
];

const FILTER_SECTIONS: FilterSection[] = [
  { key: "sort", title: "Sort by", single: true, options: PHILIA_SORTS },
  { key: "types", title: "Type", options: PHILIA_TYPES },
  { key: "statuses", title: "Status", options: PHILIA_STATUSES },
  {
    key: "genres",
    title: "Genres",
    options: PHILIA_GENRES.map((g) => ({ value: g.slug, label: g.name })),
  },
];

const FILTER_DEFAULTS: FilterValue = {
  sort: ["recently_updated"],
  types: [],
  statuses: [],
  genres: [],
};

export default function PhiliaMainScreen() {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<PhiliaSortOrder>("recently_updated");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [types, setTypes] = useState<PhiliaContentType[]>([]);
  const [statuses, setStatuses] = useState<PhiliaMangaStatus[]>([]);
  const [genres, setGenres] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [items, setItems] = useState<PhiliaMangaSummary[]>([]);
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
        const res = await api.searchManga({
          page: pageNum,
          perPage: 24,
          q: query.trim() || undefined,
          orderby: query.trim() ? undefined : sort,
          types: types.length ? types : undefined,
          statuses: statuses.length ? statuses : undefined,
          genres: genres.length ? genres : undefined,
        });
        setHasMore(res.page < res.totalPages);
        setItems((prev) => (append ? [...prev, ...res.items] : res.items));
        setPage(pageNum);
      } catch (err) {
        console.error("Philia fetch failed:", err);
        setError(err instanceof Error ? err.message : "Could not load Philia Scans.");
      } finally {
        loadingRef.current = false;
        setLoading(false);
      }
    },
    [query, sort, types, statuses, genres],
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

  const openManga = (item: PhiliaMangaSummary) => {
    Keyboard.dismiss();
    openMangaInfo({
      provider: "philia",
      id: item.slug,
      thumbnailUrl: item.coverImageUrl,
    });
  };

  const filterValue: FilterValue = {
    sort: [sort],
    types,
    statuses,
    genres,
  };
  const filterActive = hasActiveFilters(filterValue, FILTER_DEFAULTS);

  const applyFilters = (next: FilterValue) => {
    setSort((next.sort?.[0] as PhiliaSortOrder) ?? "recently_updated");
    setTypes((next.types ?? []) as PhiliaContentType[]);
    setStatuses((next.statuses ?? []) as PhiliaMangaStatus[]);
    setGenres(next.genres ?? []);
  };

  const entries = useMemo<SourceEntry[]>(
    () =>
      items.map((item) => {
        const parts: string[] = [];
        if (item.chapterCount != null) parts.push(`${item.chapterCount} ch`);
        if (item.ratingAvg != null && item.ratingAvg > 0)
          parts.push(`* ${item.ratingAvg.toFixed(1)}`);
        if (item.type) parts.push(item.type);
        return {
          key: item.slug,
          title: item.title,
          coverUrl: item.coverImageUrl,
          meta: parts.join("  /  "),
          onOpen: () => openManga(item),
        };
      }),
    [items],
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.container}>
        <AppHeader
          title="Philia Scans"
          accent={accent}
          query={query}
          onQueryChange={setQuery}
          onSearchSubmit={onSearch}
          searchPlaceholder="Search Philia Scans"
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
            onSelect={(key) => setSort(key as PhiliaSortOrder)}
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
                <DownloadedStrip provider="philia" accent={accent} />
                {genres.length > 0 ? (
                  <Text style={styles.genrePill}>Genre / {genres.join(", ")}</Text>
                ) : null}
              </View>
            }
            ListEmptyComponent={
              !loading ? (
                <View style={styles.emptyWrap}>
                  <Text style={error ? styles.emptyError : styles.emptyText}>
                    {error ?? "No manga found."}
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
        sections={FILTER_SECTIONS}
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