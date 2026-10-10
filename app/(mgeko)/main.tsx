import MgekoFilterOverlay, {
  DEFAULT_MGEKO_FILTERS,
  type MgekoFilterState,
} from "@/components/mgeko/MgekoFilterOverlay";
import { SORT_OPTIONS } from "@/services/mgeko/mgeko.constants";
import { MgekoClient } from "@/services/mgeko/mgeko";
import type {
  MangaSummary,
  SearchFilters,
  SortValue,
} from "@/services/mgeko/mgeko.types";
import { router, useLocalSearchParams } from "expo-router";
import { openMangaInfo } from "@/components/manga/openMangaInfo";
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
import SourceTabs from "@/components/sources/SourceTabs";
import DownloadedStrip from "@/components/downloader/DownloadedStrip";
import {
  MangaGridCard,
  MangaListRow,
  type SourceEntry,
} from "@/components/sources/MangaCards";
import { colors, providerAccent, type ViewMode } from "@/constants/theme";

const api = new MgekoClient();

/** Maps the overlay draft onto the SDK's filter contract. */
function toSearchFilters(f: MgekoFilterState): SearchFilters {
  return {
    includeGenres: f.includeGenres as SearchFilters["includeGenres"],
    excludeGenres: f.excludeGenres as SearchFilters["excludeGenres"],
    status: f.status as SearchFilters["status"],
    type: f.type as SearchFilters["type"],
    minChapters: f.minChapters,
    maxChapters: f.maxChapters,
    minRating: f.minRating,
    tags: f.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    onlyCompletedSeries: f.onlyCompletedSeries,
    onlyWellTranslated: f.onlyWellTranslated,
    hideLongHiatus: f.hideLongHiatus,
    hideNsfw: f.hideNsfw,
  };
}

const Main = () => {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortValue>(SORT_OPTIONS[0].value);
  const [filters, setFilters] = useState<MgekoFilterState>(DEFAULT_MGEKO_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  const [result, setResult] = useState<MangaSummary[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const accent = providerAccent.mgeko;
  const { genre, tagLabel } = useLocalSearchParams<{
    genre?: string | string[];
    tagLabel?: string | string[];
  }>();
  useEffect(() => {
    if (!genre) return;
    const genreValue = Array.isArray(genre) ? (genre[0] ?? "") : (genre ?? "");
    if (genreValue) {
      setFilters((prev) => ({ ...prev, includeGenres: [genreValue] }));
    }
    router.setParams({ genre: undefined, tagLabel: undefined });
  }, [genre]);

  const hasActiveFilters = useMemo(
    () =>
      filters.includeGenres.length > 0 ||
      filters.excludeGenres.length > 0 ||
      filters.status !== "Any" ||
      filters.type !== "Any" ||
      filters.minChapters.trim() !== "" ||
      filters.maxChapters.trim() !== "" ||
      filters.minRating.trim() !== "" ||
      filters.tags.trim() !== "" ||
      filters.onlyCompletedSeries ||
      filters.onlyWellTranslated ||
      filters.hideLongHiatus ||
      filters.hideNsfw,
    [filters],
  );

  const openManga = (url: string, thumbnailUrl?: string | null) => {
    Keyboard.dismiss();
    openMangaInfo({ provider: "mgeko", id: url, thumbnailUrl: thumbnailUrl ?? null });
  };

  const fetchPage = useCallback(
    async (pageNum: number, append: boolean) => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      setLoading(true);
      setError(null);

      try {
        const trimmed = query.trim();
        const filtersForApi = toSearchFilters(filters);
        const res = await api.search(trimmed, pageNum, {
          ...filtersForApi,
          sort,
        });
        setHasMore(res.hasNextPage);
        setResult((prev) => (append ? [...prev, ...res.items] : res.items));
        setPage(pageNum);
      } catch (err) {
        console.error("MangaGeko fetch failed:", err);
        setError(
          err instanceof Error ? err.message : "Could not load MangaGeko.",
        );
      } finally {
        loadingRef.current = false;
        setLoading(false);
      }
    },
    [query, sort, filters],
  );

  useEffect(() => {
    setResult([]);
    setPage(1);
    setHasMore(true);
    fetchPage(1, false);
  }, [fetchPage]);

  const onSearch = () => {
    Keyboard.dismiss();
    setResult([]);
    setPage(1);
    setHasMore(true);
    fetchPage(1, false);
  };

  const onEndReached = () => {
    if (!hasMore || loading) return;
    fetchPage(page + 1, true);
  };

  const onApplyFilters = (next: MgekoFilterState) => {
    // Changing filters re-creates `fetchPage`, whose effect resets the list
    // and loads the first page with the new filters.
    setFilters(next);
  };

  const entries = useMemo<SourceEntry[]>(
    () =>
      result.map((item) => {
        const metaParts: string[] = [];
        if (item.chapterCount != null) metaParts.push(`${item.chapterCount} chapters`);
        if (item.rating != null) metaParts.push(`Rating ${item.rating}`);
        return {
          key: item.url,
          title: item.title,
          coverUrl: item.thumbnailUrl ?? null,
          meta: metaParts.join("  "),
          onOpen: () => openManga(item.url, item.thumbnailUrl),
        };
      }),
    [result],
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.container}>
        <AppHeader
          title="MangaGeko"
          accent={accent}
          query={query}
          onQueryChange={setQuery}
          onSearchSubmit={onSearch}
          searchPlaceholder="Search MangaGeko"
          onBack={() => router.back()}
          actions={[
            {
              key: "filters",
              icon: SlidersHorizontal,
              active: hasActiveFilters,
              onPress: () => setShowFilters(true),
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

        <SourceTabs
          accent={accent}
          tabs={SORT_OPTIONS.map((option) => ({
            key: option.value,
            label: option.label,
          }))}
          activeKey={sort}
          onSelect={(key) => setSort(key as SortValue)}
        />

        {loading && result.length === 0 ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator color={accent} size="large" />
          </View>
        ) : (
          <FlatList
            key={viewMode}
            data={entries}
            numColumns={viewMode === "grid" ? 2 : 1}
            keyExtractor={(item) => item.key}
            onEndReached={onEndReached}
            onEndReachedThreshold={0.3}
            contentContainerStyle={styles.listContent}
            columnWrapperStyle={
              viewMode === "grid" ? styles.gridColumn : undefined
            }
            ListHeaderComponent={
              <DownloadedStrip provider="mgeko" accent={accent} />
            }
            ListEmptyComponent={
              !loading ? (
                error ? (
                  <View style={styles.emptyWrap}>
                    <Text style={styles.emptyError}>{error}</Text>
                  </View>
                ) : (
                  <Text style={styles.emptyText}>
                    No manga found. Try a different search or filter.
                  </Text>
                )
              ) : null
            }
            ListFooterComponent={
              loading && result.length > 0 ? (
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

      <MgekoFilterOverlay
        visible={showFilters}
        filters={filters}
        accent={accent}
        onClose={() => setShowFilters(false)}
        onApply={onApplyFilters}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, backgroundColor: colors.bg },
  loaderWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  listContent: {
    paddingHorizontal: 12,
    paddingTop: 14,
    paddingBottom: 24,
  },
  gridColumn: { gap: 14 },
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

export default Main;
