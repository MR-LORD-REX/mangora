import MangaKatanaFilterOverlay from "@/components/mangakatana/MangaKatanaFilterOverlay";
import { MangaKatana } from "@/services/mangakatana/mangakatana";
import {
  DEFAULT_KATANA_FILTERS,
  filtersToSearchOptions,
  hasActiveFilters,
  type MangaKatanaFilterState,
} from "@/services/mangakatana/mangakatana.filters";
import type { MangaEntry } from "@/services/mangakatana/mangakatana.types";
import { encodePath } from "@/services/mangakatana/mangakatana.utils";
import { router, useLocalSearchParams } from "expo-router";
import { openMangaInfo } from "@/components/manga/openMangaInfo";
import {
  AlertCircle,
  Heart,
  LayoutGrid,
  Rows3,
  SlidersHorizontal,
} from "lucide-react-native";
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

const api = new MangaKatana();

const Main = () => {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<MangaEntry[]>([]);
  const [activeTab, setActiveTab] = useState<"latest" | "popular">("latest");
  const [filters, setFilters] = useState<MangaKatanaFilterState>(
    DEFAULT_KATANA_FILTERS,
  );
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);

  const accent = providerAccent.mangakatana;
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

  const openManga = (url: string, thumbnailUrl?: string) => {
    Keyboard.dismiss();
    openMangaInfo({ provider: "mangakatana", id: url, thumbnailUrl: thumbnailUrl ?? null });
  };

  const fetchPage = useCallback(
    async (pageNum: number, append: boolean) => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      setLoading(true);

      try {
        const trimmed = query.trim();

        if (trimmed) {
          try {
            const res = await api.searchManga(trimmed, pageNum);
            if (res.kind === "details") {
              openManga(res.data.url, res.data.coverUrl);
              return;
            }
            setHasMore(res.data.hasNextPage);
            setResult((prev) =>
              append ? [...prev, ...res.data.mangas] : res.data.mangas,
            );
            setPage(pageNum);
            return;
          } catch (error) {
            console.error("MangaKatana search failed:", error);
          }
        }

        if (hasActiveFilters(filters)) {
          try {
            const res = await api.searchManga(
              "",
              pageNum,
              filtersToSearchOptions(filters),
            );
            if (res.kind === "details") {
              openManga(res.data.url, res.data.coverUrl);
              return;
            }
            setHasMore(res.data.hasNextPage);
            setResult((prev) =>
              append ? [...prev, ...res.data.mangas] : res.data.mangas,
            );
            setPage(pageNum);
            return;
          } catch (error) {
            console.error("MangaKatana search failed:", error);
          }
        }

        const list =
          activeTab === "latest"
            ? await api.getLatestUpdates(pageNum)
            : await api.getPopularManga(pageNum);

        setHasMore(list.hasNextPage);
        setResult((prev) => (append ? [...prev, ...list.mangas] : list.mangas));
        setPage(pageNum);
      } catch (error) {
        console.error("MangaKatana fetch failed:", error);
      } finally {
        loadingRef.current = false;
        setLoading(false);
      }
    },
    [activeTab, filters, query],
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

  const onTabChange = (tab: "latest" | "popular") => {
    setActiveTab(tab);
    setQuery("");
  };

  const onEndReached = () => {
    if (!hasMore || loading) return;
    fetchPage(page + 1, true);
  };

  const onApplyFilters = (next: MangaKatanaFilterState) => {
    setFilters(next);
    setQuery("");
  };

  const entries = useMemo<SourceEntry[]>(
    () =>
      result.map((item) => ({
        key: item.url,
        title: item.title,
        coverUrl: item.thumbnailUrl ?? null,
        onOpen: () => openManga(item.url, item.thumbnailUrl),
      })),
    [result],
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.container}>
        <AppHeader
          title="MangaKatana"
          accent={accent}
          query={query}
          onQueryChange={setQuery}
          onSearchSubmit={onSearch}
          searchPlaceholder="Search MangaKatana"
          onBack={() => router.back()}
          actions={[
            {
              key: "filters",
              icon: SlidersHorizontal,
              active: hasActiveFilters(filters),
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
          tabs={[
            { key: "latest", label: "Latest", icon: AlertCircle },
            { key: "popular", label: "Popular", icon: Heart },
          ]}
          activeKey={activeTab}
          onSelect={(key) => onTabChange(key as "latest" | "popular")}
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
              <DownloadedStrip provider="mangakatana" accent={accent} />
            }
            ListEmptyComponent={
              !loading ? (
                <Text style={styles.emptyText}>
                  No manga found. Try a different search or filter.
                </Text>
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

      <MangaKatanaFilterOverlay
        visible={showFilters}
        filters={filters}
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
  emptyText: {
    color: colors.textMuted,
    textAlign: "center",
    paddingHorizontal: 24,
    paddingVertical: 48,
    fontSize: 15,
  },
  footerLoader: { marginVertical: 16 },
});

export default Main;
