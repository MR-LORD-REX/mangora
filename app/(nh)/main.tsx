import NhFilterOverlay, {
  DEFAULT_NH_FILTERS,
  NhFilterState,
} from "@/components/nh/NhFilterOverlay";
import { NH_SORT_OPTIONS, NhSort } from "@/services/nh/nh.constants";
import type { NhGalleryPreview } from "@/services/nh/nh.types";
import { parseGalleryCode, toFriendlyMessage } from "@/services/nh/nh.utils";
import { nhClient as api } from "@/services/nh/nhShared";
import { router, useLocalSearchParams } from "expo-router";
import { openMangaInfo } from "@/components/manga/openMangaInfo";
import { LayoutGrid, Rows3 ,SlidersHorizontal } from "lucide-react-native";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import {
  MangaGridCard,
  MangaListRow,
  type SourceEntry,
} from "@/components/sources/MangaCards";
import SourceTabs from "@/components/sources/SourceTabs";
import DownloadedStrip from "@/components/downloader/DownloadedStrip";
import { colors, providerAccent, type ViewMode } from "@/constants/theme";

const Main = () => {
  const params = useLocalSearchParams<{
    filterTag?: string;
  }>();

  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<NhSort>(NH_SORT_OPTIONS[0].value);
  const [filters, setFilters] = useState<NhFilterState>(DEFAULT_NH_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("grid");

  const [result, setResult] = useState<NhGalleryPreview[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);

  const accent = providerAccent.nh;

  useEffect(() => {
    if (params.filterTag) {
      setQuery(params.filterTag);
      router.setParams({ filterTag: undefined });
    }
  }, [params.filterTag]);

  const openManga = (id: string) => {
    Keyboard.dismiss();
    openMangaInfo({ provider: "nh", id });
  };

  const fetchPage = useCallback(
    async (pageNum: number, append: boolean) => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      setLoading(true);
      setError(null);

      try {
        const trimmed = query.trim();
        const hasFilters =
          filters.includeTags.length > 0 ||
          filters.excludeTags.length > 0 ||
          filters.includeArtists.length > 0 ||
          filters.excludeArtists.length > 0 ||
          filters.includeGroups.length > 0 ||
          filters.excludeGroups.length > 0 ||
          filters.includeParodies.length > 0 ||
          filters.excludeParodies.length > 0 ||
          filters.includeCharacters.length > 0 ||
          filters.excludeCharacters.length > 0 ||
          filters.includeCategories.length > 0 ||
          filters.excludeCategories.length > 0 ||
          filters.languages.length > 0;

        if (trimmed || hasFilters || sort !== "") {
          const res = await api.search({
            query: trimmed,
            page: pageNum,
            sort: sort,
            includeTags: filters.includeTags.length
              ? filters.includeTags
              : undefined,
            excludeTags: filters.excludeTags.length
              ? filters.excludeTags
              : undefined,
            includeArtists: filters.includeArtists.length
              ? filters.includeArtists
              : undefined,
            excludeArtists: filters.excludeArtists.length
              ? filters.excludeArtists
              : undefined,
            includeGroups: filters.includeGroups.length
              ? filters.includeGroups
              : undefined,
            excludeGroups: filters.excludeGroups.length
              ? filters.excludeGroups
              : undefined,
            includeParodies: filters.includeParodies.length
              ? filters.includeParodies
              : undefined,
            excludeParodies: filters.excludeParodies.length
              ? filters.excludeParodies
              : undefined,
            includeCharacters: filters.includeCharacters.length
              ? filters.includeCharacters
              : undefined,
            excludeCharacters: filters.excludeCharacters.length
              ? filters.excludeCharacters
              : undefined,
            includeCategories: filters.includeCategories.length
              ? filters.includeCategories
              : undefined,
            excludeCategories: filters.excludeCategories.length
              ? filters.excludeCategories
              : undefined,
            languages: filters.languages.length ? filters.languages : undefined,
          });
          setHasMore(res.hasNextPage);
          setResult((prev) => (append ? [...prev, ...res.items] : res.items));
          setPage(pageNum);
        } else {
          const list = await api.listLatest(pageNum);
          setHasMore(list.hasNextPage);
          setResult((prev) => (append ? [...prev, ...list.items] : list.items));
          setPage(pageNum);
        }
      } catch (error) {
        console.error("NH fetch failed:", error);
        setError(toFriendlyMessage(error));
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

  /** True when the query is a pasted gallery code/URL (not free text). */
  const isGalleryCodePaste = (text: string): boolean => {
    const trimmed = text.trim();
    if (!trimmed) return false;
    if (/^#?\d{2,7}$/.test(trimmed)) return true;
    if (trimmed.includes("/g/")) return !!parseGalleryCode(trimmed);
    return false;
  };

  const onSearch = () => {
    Keyboard.dismiss();
    const trimmed = query.trim();
    const pastedCode = isGalleryCodePaste(trimmed)
      ? parseGalleryCode(trimmed)
      : null;
    // Most users paste a code or /g/ URL instead of typing free text -
    // jump straight to that gallery.
    if (pastedCode) {
      setResult([]);
      setError(null);
      setHasMore(true);
      openManga(pastedCode);
      return;
    }
    setResult([]);
    setPage(1);
    setHasMore(true);
    fetchPage(1, false);
  };

  const onEndReached = () => {
    if (!hasMore || loading) return;
    fetchPage(page + 1, true);
  };

  const onApplyFilters = (next: NhFilterState) => {
    setFilters(next);
  };

  const entries = useMemo<SourceEntry[]>(
    () =>
      result.map((item) => ({
        key: item.id.toString(),
        title: item.title,
        coverUrl: item.thumbUrl,
        meta: `${item.pageCount} pages · ${item.favorites} favs`,
        onOpen: () => openManga(item.id),
      })),
    [result],
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.container}>
        <AppHeader
          title="NHentai"
          accent={accent}
          query={query}
          onQueryChange={setQuery}
          onSearchSubmit={onSearch}
          searchPlaceholder="Search or paste a gallery code (e.g. 177013)"
          onBack={() => router.back()}
                  actions={[
                    {
                      key: "filter",
                      icon: SlidersHorizontal,
                      active: showFilters,
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
          tabs={NH_SORT_OPTIONS.map((opt) => ({
            key: opt.value,
            label: opt.label,
          }))}
          activeKey={sort}
          onSelect={(key) => setSort(key as NhSort)}
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
            onEndReached={onEndReached}
            onEndReachedThreshold={0.3}
            contentContainerStyle={styles.listContent}
            columnWrapperStyle={
              viewMode === "grid" ? styles.gridColumn : undefined
            }
            ListHeaderComponent={
              <DownloadedStrip provider="nh" accent={accent} />
            }
            ListEmptyComponent={
              !loading ? (
                error ? (
                  <View style={styles.emptyWrap}>
                    <Text style={styles.emptyText}>{error}</Text>
                  </View>
                ) : (
                  <Text style={styles.emptyText}>
                    No galleries found. Try a different search or filter.
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

      <NhFilterOverlay
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
  emptyWrap: { paddingTop: 32 },
  emptyText: {
    color: colors.textMuted,
    textAlign: "center",
    paddingHorizontal: 24,
    paddingVertical: 32,
    fontSize: 15,
    lineHeight: 22,
  },
  footerLoader: { marginVertical: 16 },
});

export default Main;
