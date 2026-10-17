import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SlidersHorizontal } from "lucide-react-native";

import AppHeader from "@/components/common/AppHeader";
import ExtensionFilterSheet from "@/components/extensions/ExtensionFilterSheet";
import { MangaGridCard } from "@/components/sources/MangaCards";
import SourceTabs from "@/components/sources/SourceTabs";
import { openMangaInfo } from "@/components/manga/openMangaInfo";
import { colors } from "@/constants/theme";
import {
  getExtensionLatest,
  getExtensionPopular,
  hasNativeExtensions,
  searchExtension,
} from "@/services/extensions/native";
import {
  cachedExtensionSource,
  extensionProviderFor,
  subscribeExtensionRegistry,
} from "@/services/extensions/registry";
import type {
  ExtensionFilterPatch,
  NativeManga,
} from "@/services/extensions/types";

type FeedMode = "popular" | "latest";

function paramString(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

const MangaCell = React.memo(function MangaCell({
  item,
  sourceId,
}: {
  item: NativeManga;
  sourceId: string;
}) {
  return (
    <MangaGridCard
      entry={{
        key: item.url,
        title: item.title,
        coverUrl: item.thumbnailUrl,
        meta: item.author ?? undefined,
        onOpen: () =>
          openMangaInfo({
            provider: extensionProviderFor(sourceId),
            id: item.url,
            thumbnailUrl: item.thumbnailUrl,
          }),
      }}
    />
  );
});

export default function ExtensionSourceScreen() {
  const params = useLocalSearchParams<{ sourceId?: string | string[] }>();
  const sourceId = paramString(params.sourceId);
  const [, refreshTick] = useState(0);
  const source = cachedExtensionSource(sourceId);

  const [mode, setMode] = useState<FeedMode>("popular");
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [filters, setFilters] = useState<ExtensionFilterPatch[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [items, setItems] = useState<NativeManga[]>([]);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(
    () => subscribeExtensionRegistry(() => refreshTick((value) => value + 1)),
    [],
  );

  const searching = submittedQuery.trim().length > 0 || filters.length > 0;

  const fetchPage = useCallback(
    async (nextPage: number, replace: boolean) => {
      if (!sourceId) return;
      if (replace) {
        setLoading(true);
        setError(null);
      } else {
        setLoadingMore(true);
      }
      const id = ++requestId.current;
      try {
        const result =
          submittedQuery.trim() || filters.length > 0
            ? await searchExtension(
                sourceId,
                nextPage,
                submittedQuery.trim(),
                filters,
              )
            : mode === "latest"
              ? await getExtensionLatest(sourceId, nextPage)
              : await getExtensionPopular(sourceId, nextPage);
        if (id !== requestId.current) return;
        setItems((current) =>
          replace ? result.mangas : [...current, ...result.mangas],
        );
        setPage(nextPage);
        setHasNext(result.hasNextPage);
      } catch (reason) {
        if (id !== requestId.current) return;
        setError(
          reason instanceof Error ? reason.message : "Could not load this source.",
        );
        if (replace) setItems([]);
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [sourceId, submittedQuery, mode, filters],
  );

  useEffect(() => {
    void fetchPage(1, true);
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (!hasNext || loading || loadingMore) return;
    void fetchPage(page + 1, false);
  }, [hasNext, loading, loadingMore, fetchPage, page]);

  const renderItem = useCallback(
    ({ item }: { item: NativeManga }) => (
      <MangaCell item={item} sourceId={sourceId} />
    ),
    [sourceId],
  );

  const keyExtractor = useCallback((item: NativeManga) => item.url, []);

  const onQueryChange = useCallback((value: string) => {
    setQuery(value);
    if (!value.trim()) setSubmittedQuery("");
  }, []);

  if (!hasNativeExtensions()) {
    return (
      <SafeAreaView style={styles.screen} edges={["top"]}>
        <AppHeader
          title={source?.name ?? "Extension source"}
          onBack={() => router.back()}
          query={query}
          onQueryChange={onQueryChange}
        />
        <View style={styles.center}>
          <Text style={styles.errorText}>
            The extension host is not available in this build.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <AppHeader
        title={source?.name ?? "Extension source"}
        onBack={() => router.back()}
        query={query}
        onQueryChange={onQueryChange}
        onSearchSubmit={() => setSubmittedQuery(query)}
        searchPlaceholder="Search this source"
        actions={[
          {
            key: "filters",
            icon: SlidersHorizontal,
            active: filters.length > 0,
            onPress: () => setFilterOpen(true),
          },
        ]}
      />
      <SourceTabs
        tabs={[
          { key: "popular", label: "Popular" },
          { key: "latest", label: "Latest" },
        ]}
        activeKey={searching ? "" : mode}
        onSelect={(key) => {
          setSubmittedQuery("");
          setFilters([]);
          setMode(key as FeedMode);
        }}
      />
      {filters.length > 0 ? (
        <View style={styles.filterBanner}>
          <Text style={styles.filterBannerText} numberOfLines={1}>
            {filters.length} filter{filters.length === 1 ? "" : "s"} applied
          </Text>
          <Text
            style={styles.filterClear}
            onPress={() => setFilters([])}
            suppressHighlighting
          >
            Clear
          </Text>
        </View>
      ) : null}
      {error ? (
        <View style={styles.errorBar}>
          <Text style={styles.errorText} numberOfLines={2}>
            {error}
          </Text>
        </View>
      ) : null}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={keyExtractor}
          numColumns={2}
          columnWrapperStyle={styles.columns}
          contentContainerStyle={styles.list}
          renderItem={renderItem}
          onEndReached={loadMore}
          onEndReachedThreshold={0.6}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          updateCellsBatchingPeriod={40}
          windowSize={7}
          removeClippedSubviews
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.mutedText}>No results.</Text>
            </View>
          }
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator
                color={colors.accent}
                style={styles.footerLoader}
              />
            ) : null
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      <ExtensionFilterSheet
        visible={filterOpen}
        sourceId={sourceId}
        onClose={() => setFilterOpen(false)}
        onApply={(patches) => {
          setFilters(patches);
          setPage(1);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { padding: 14, paddingBottom: 80 },
  columns: { gap: 12 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 30,
  },
  mutedText: { color: colors.textMuted, fontSize: 14 },
  errorText: { color: colors.danger, fontSize: 13, lineHeight: 19 },
  errorBar: { paddingHorizontal: 16, paddingVertical: 10 },
  filterBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.accentSoft,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  filterBannerText: { color: colors.accent, fontSize: 12, fontWeight: "700", flex: 1 },
  filterClear: { color: colors.accent, fontSize: 12, fontWeight: "800" },
  footerLoader: { paddingVertical: 20 },
});