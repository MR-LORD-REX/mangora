import { router, useLocalSearchParams } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Check,
  Grid2X2,
  Grid3X3,
  List,
  SlidersHorizontal,
} from "lucide-react-native";

import AppHeader from "@/components/common/AppHeader";
import ExtensionFilterSheet from "@/components/extensions/ExtensionFilterSheet";
import { MangaGridCard, MangaListRow } from "@/components/sources/MangaCards";
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
type CardLayout = "grid2" | "grid4" | "list";

const CARD_LAYOUT_OPTIONS: {
  key: CardLayout;
  label: string;
  icon: typeof Grid2X2;
}[] = [
  { key: "grid2", label: "Grid · 2 columns", icon: Grid2X2 },
  { key: "grid4", label: "Grid · 4 columns", icon: Grid3X3 },
  { key: "list", label: "List", icon: List },
];

function paramString(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

const MangaCell = React.memo(function MangaCell({
  item,
  sourceId,
  layout,
}: {
  item: NativeManga;
  sourceId: string;
  layout: CardLayout;
}) {
  const entry = {
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
  };
  if (layout === "list") return <MangaListRow entry={entry} />;
  return <MangaGridCard entry={entry} compact={layout === "grid4"} />;
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
  const [cardLayout, setCardLayout] = useState<CardLayout>("grid2");
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false);
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
      <MangaCell item={item} sourceId={sourceId} layout={cardLayout} />
    ),
    [cardLayout, sourceId],
  );

  const layoutOption = CARD_LAYOUT_OPTIONS.find(
    (option) => option.key === cardLayout,
  )!;
  const LayoutIcon = layoutOption.icon;
  const columns = cardLayout === "grid4" ? 4 : cardLayout === "grid2" ? 2 : 1;

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
            key: "card-layout",
            icon: LayoutIcon,
            active: layoutMenuOpen,
            onPress: () => setLayoutMenuOpen(true),
          },
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
          key={cardLayout}
          data={items}
          keyExtractor={keyExtractor}
          numColumns={columns}
          columnWrapperStyle={columns > 1 ? styles.columns : undefined}
          contentContainerStyle={[
            styles.list,
            columns === 4 && styles.compactGrid,
          ]}
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
      <Modal
        visible={layoutMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setLayoutMenuOpen(false)}
      >
        <Pressable
          style={styles.layoutBackdrop}
          onPress={() => setLayoutMenuOpen(false)}
        >
          <View style={styles.layoutMenu}>
            <Text style={styles.layoutTitle}>Display manga as</Text>
            {CARD_LAYOUT_OPTIONS.map((option) => {
              const Icon = option.icon;
              const selected = cardLayout === option.key;
              return (
                <Pressable
                  key={option.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    setCardLayout(option.key);
                    setLayoutMenuOpen(false);
                  }}
                  style={({ pressed }) => [
                    styles.layoutOption,
                    selected && styles.layoutOptionSelected,
                    pressed && styles.layoutOptionPressed,
                  ]}
                >
                  <Icon
                    color={selected ? colors.accent : colors.textMuted}
                    size={20}
                  />
                  <Text
                    style={[
                      styles.layoutOptionText,
                      selected && styles.layoutOptionTextSelected,
                    ]}
                  >
                    {option.label}
                  </Text>
                  {selected ? <Check color={colors.accent} size={18} /> : null}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  list: { padding: 14, paddingBottom: 80 },
  compactGrid: { paddingHorizontal: 10 },
  columns: { gap: 8 },
  layoutBackdrop: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 28,
    backgroundColor: colors.scrim,
  },
  layoutMenu: {
    width: "100%",
    maxWidth: 340,
    padding: 10,
    borderRadius: 18,
    backgroundColor: colors.surfaceHigh,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  layoutTitle: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "700",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  layoutOption: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  layoutOptionSelected: { backgroundColor: colors.accentSoft },
  layoutOptionPressed: { opacity: 0.7 },
  layoutOptionText: { flex: 1, color: colors.text, fontSize: 15, fontWeight: "600" },
  layoutOptionTextSelected: { color: colors.accent },
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