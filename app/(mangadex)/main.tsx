import Mangadex, { Manga } from "../../services/mangadex/mangaDex";
import {
  DEFAULT_MANGA_FILTERS,
  filtersToSearchParams,
  tabToSort,
  type MangaFilterState,
} from "../../services/mangadex/mangadex.filters";
import MangaFilterOverlay from "../../components/mangadex/MangaFilterOverlay";
import {
  View,
  FlatList,
  Keyboard,
  StyleSheet,
  Text,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Heart,
  LayoutGrid,
  Rows3,
} from "lucide-react-native";
import { router, useLocalSearchParams } from "expo-router";
import { openMangaInfo } from "@/components/manga/openMangaInfo";

import AppHeader from "@/components/common/AppHeader";
import SourceTabs from "@/components/sources/SourceTabs";
import DownloadedStrip from "@/components/downloader/DownloadedStrip";
import {
  MangaGridCard,
  MangaListRow,
  type SourceEntry,
} from "@/components/sources/MangaCards";
import { colors, providerAccent, type ViewMode } from "@/constants/theme";

const api = new Mangadex();

const Main = () => {
  const [mangaName, setMangaName] = useState<string>("");
  const [result, setResult] = useState<Manga[]>([]);
  const [activeTab, setActiveTab] = useState<"latest" | "popular">("popular");
  const [filters, setFilters] = useState<MangaFilterState>(DEFAULT_MANGA_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [loading, setLoading] = useState(true);

  const accent = providerAccent.mangadex;
  const { tag, tagLabel } = useLocalSearchParams<{
    tag?: string | string[];
    tagLabel?: string | string[];
  }>();
  useEffect(() => {
    if (!tag) return;
    const tagValue = Array.isArray(tag) ? (tag[0] ?? "") : (tag ?? "");
    if (tagValue) {
      setFilters({
        ...DEFAULT_MANGA_FILTERS,
        includedTags: [tagValue],
      });
    }
    router.setParams({ tag: undefined, tagLabel: undefined });
  }, [tag]);

  const fetchManga = useCallback(
    async (offset = 0, append = false) => {
      const params = filtersToSearchParams(filters, {
        title: mangaName,
        offset: append ? offset : 0,
      });

      try {
        const res = await api.search(params);
        if (!res) return;
        setResult((prev) => (append ? [...prev, ...res.items] : res.items));
      } finally {
        setLoading(false);
      }
    },
    [filters, mangaName],
  );

  useEffect(() => {
    setLoading(true);
    setResult([]);
    fetchManga();
  }, [fetchManga]);

  const onTabChange = (tab: "latest" | "popular") => {
    setActiveTab(tab);
    setFilters((prev) => ({ ...prev, ...tabToSort(tab) }));
  };

  const onBottom = async () => {
    Keyboard.dismiss();
    await fetchManga(result.length, true);
  };

  const onEnter = async () => {
    Keyboard.dismiss();
    setLoading(true);
    await fetchManga();
  };

  const onApplyFilters = (next: MangaFilterState) => {
    setFilters(next);
    const latestSort = tabToSort("latest");
    const popularSort = tabToSort("popular");
    if (
      next.sortKey === latestSort.sortKey &&
      next.sortDirection === latestSort.sortDirection
    ) {
      setActiveTab("latest");
    } else if (
      next.sortKey === popularSort.sortKey &&
      next.sortDirection === popularSort.sortDirection
    ) {
      setActiveTab("popular");
    }
  };

  const handleTap = (id: string) => {
    Keyboard.dismiss();
    openMangaInfo({ provider: "mangadex", id });
  };

  const entries = useMemo<SourceEntry[]>(
    () =>
      result.map((item) => ({
        key: item.id,
        title: item.title ?? item.altTitles?.[0] ?? "Untitled",
        coverUrl: item.cover?.url ?? null,
        meta:
          item.authors[0]?.name ??
          item.artists[0]?.name ??
          (item.year ? String(item.year) : undefined),
        onOpen: () => handleTap(item.id),
      })),
    [result],
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.container}>
        <AppHeader
          title="MangaDex"
          accent={accent}
          query={mangaName}
          onQueryChange={setMangaName}
          onSearchSubmit={() => void onEnter()}
          searchPlaceholder="Search MangaDex"
          onBack={() => router.back()}
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
          onFilterPress={() => setShowFilters(true)}
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
            onEndReached={onBottom}
            onEndReachedThreshold={0.3}
            contentContainerStyle={styles.listContent}
            columnWrapperStyle={
              viewMode === "grid" ? styles.gridColumn : undefined
            }
            ListHeaderComponent={
              <DownloadedStrip provider="mangadex" accent={accent} />
            }
            ListEmptyComponent={
              <Text style={styles.emptyText}>
                No manga found. Try a different search or filter.
              </Text>
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

      <MangaFilterOverlay
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
});

export default Main;
