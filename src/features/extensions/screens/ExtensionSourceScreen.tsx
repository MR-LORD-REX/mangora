import { router } from "expo-router";
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
import { Check, SlidersHorizontal, X } from "lucide-react-native";

import AppHeader from "@shared/ui/layout/AppHeader";
import ExtensionFilterSheet from "../components/catalog/ExtensionFilterSheet";
import ExtensionSourceSkeleton from "../components/browse/ExtensionSourceSkeleton";
import { MediaGridCard, MediaListRow } from "@shared/ui/navigation/MediaCards";
import ChipTabBar from "@shared/ui/navigation/ChipTabBar";
import AnimatedBanner from "@shared/ui/motion/AnimatedBanner";
import FadeInView from "@shared/ui/motion/FadeInView";
import type { SourceCardLayout } from "@core/settings";
import { useAppSettings } from "@features/settings";
import {
  SOURCE_CARD_LAYOUT_OPTIONS,
  sourceCardLayoutOption,
} from "../domain/cardLayout";
import type { OpenMangaInfo } from "../types/navigation";
import { colors } from "@shared/theme";
import { removeFilterPath, type ExtensionFilterSelection } from "../filters/filters";
import {
  getExtensionLatest,
  getExtensionPopular,
  hasNativeExtensions,
  searchExtension,
} from "@platform/extensions";
import { cachedExtensionSource, extensionProviderFor, subscribeExtensionRegistry } from "../registry/registry";
import type {
  ExtensionFilterPatch,
  NativeManga,
} from "@platform/extensions/types";

type FeedMode = "popular" | "latest";

const EMPTY_FILTER_PATCHES: ExtensionFilterPatch[] = [];


const MangaCell = React.memo(function MangaCell({
  item,
  sourceId,
  layout,
  onOpenManga,
}: {
  item: NativeManga;
  sourceId: string;
  layout: SourceCardLayout;
  onOpenManga: OpenMangaInfo;
}) {
  const entry = {
    key: item.url,
    title: item.title,
    coverUrl: item.thumbnailUrl,
    meta: item.author ?? undefined,
    onOpen: () =>
      onOpenManga({
        provider: extensionProviderFor(sourceId),
        id: item.url,
        thumbnailUrl: item.thumbnailUrl,
      }),
  };
  if (layout === "list") return <MediaListRow entry={entry} />;
  return <MediaGridCard entry={entry} compact={layout === "grid4"} />;
});

export interface ExtensionSourceScreenProps {
  sourceId: string;
  onOpenManga: OpenMangaInfo;
}

export default function ExtensionSourceScreen({
  sourceId,
  onOpenManga,
}: ExtensionSourceScreenProps) {
  const [, refreshTick] = useState(0);
  const source = cachedExtensionSource(sourceId);
  const [mode, setMode] = useState<FeedMode>("popular");
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [filterSelections, setFilterSelections] = useState<
    Record<string, ExtensionFilterSelection | undefined>
  >({});
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterView, setFilterView] = useState<"overview" | "active">("overview");
  const { settings, update } = useAppSettings();
  const cardLayout = settings.sourceCardLayout;
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false);
  const [items, setItems] = useState<NativeManga[]>([]);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultRevision, setResultRevision] = useState(0);
  const requestId = useRef(0);
  const filterSelection = filterSelections[sourceId];
  const filters = filterSelection?.patches ?? EMPTY_FILTER_PATCHES;

  const clearFilters = () =>
    setFilterSelections((current) => ({ ...current, [sourceId]: undefined }));

  const removeFilter = (path: string) =>
    setFilterSelections((current) => {
      const selection = current[sourceId];
      return selection
        ? { ...current, [sourceId]: removeFilterPath(selection, path) }
        : current;
    });

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
        if (replace) setResultRevision((current) => current + 1);
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
      <MangaCell
        item={item}
        sourceId={sourceId}
        layout={cardLayout}
        onOpenManga={onOpenManga}
      />
    ),
    [cardLayout, onOpenManga, sourceId],
  );

  const layoutOption = sourceCardLayoutOption(cardLayout);
  const LayoutIcon = layoutOption.icon;
  const columns = layoutOption.columns;

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
        onSearchSubmit={(value) => setSubmittedQuery(value.trim())}
        searchPlaceholder="Search this source"
        actions={[
          {
            key: "card-layout",
            label: "Change manga layout",
            icon: LayoutIcon,
            active: layoutMenuOpen,
            onPress: () => setLayoutMenuOpen(true),
          },
          {
            key: "filters",
            label: `Filters, ${filterSelection?.summaries.length ?? 0} active categories`,
            icon: SlidersHorizontal,
            active: filters.length > 0,
            badge: filterSelection?.summaries.length,
            onPress: () => {
              setFilterView("overview");
              setFilterOpen(true);
            },
          },
        ]}
      />
      <ChipTabBar
        tabs={[
          { key: "popular", label: "Popular" },
          { key: "latest", label: "Latest" },
        ]}
        activeKey={searching ? "" : mode}
        onSelect={(key) => {
          setSubmittedQuery("");
          clearFilters();
          setMode(key as FeedMode);
        }}
      />
      {filters.length > 0 ? (
        <View style={styles.filterBanner}>
          {filterSelection?.chips.slice(0, 2).map((chip) => (
            <Pressable
              key={chip.path}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${chip.label}`}
              onPress={() => removeFilter(chip.path)}
              style={({ pressed }) => [styles.filterChip, pressed && styles.layoutOptionPressed]}
            >
              <Text style={styles.filterBannerText} numberOfLines={1}>{chip.label}</Text>
              <X size={15} color={colors.accent} />
            </Pressable>
          ))}
          {(filterSelection?.chips.length ?? 0) > 2 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="View all active filters"
              onPress={() => {
                setFilterView("active");
                setFilterOpen(true);
              }}
              style={styles.filterClearButton}
            >
              <Text style={styles.filterClear}>+{(filterSelection?.chips.length ?? 0) - 2} more</Text>
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="button" accessibilityLabel="Clear all filters" onPress={clearFilters} style={styles.filterClearButton}>
            <Text style={styles.filterClear}>Clear all</Text>
          </Pressable>
        </View>
      ) : null}
      {error ? (
        <View style={styles.errorBar}>
          <Text style={styles.errorText} numberOfLines={2}>
            {error}
          </Text>
        </View>
      ) : null}
      {loading && items.length === 0 ? (
        <ExtensionSourceSkeleton layout={cardLayout} />
      ) : (
        <View style={styles.listArea}>
          {loading ? (
            <View pointerEvents="none" style={styles.refreshBanner}>
              <AnimatedBanner
                message="Updating results..."
                accessibilityRole="none"
              />
            </View>
          ) : null}
          <FadeInView
            style={styles.listArea}
            key={cardLayout}
            transitionKey={`${cardLayout}:${resultRevision}`}
          >
            <FlatList
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
          </FadeInView>
        </View>
      )}

      <ExtensionFilterSheet
        key={sourceId}
        visible={filterOpen}
        sourceId={sourceId}
        sourceName={source?.name}
        value={filterSelection}
        initialView={filterView}
        onClose={() => setFilterOpen(false)}
        onApply={(selection) => {
          setFilterSelections((current) => ({ ...current, [sourceId]: selection }));
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
            {SOURCE_CARD_LAYOUT_OPTIONS.map((option) => {
              const Icon = option.icon;
              const selected = cardLayout === option.key;
              return (
                <Pressable
                  key={option.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    update({ sourceCardLayout: option.key });
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
  listArea: { flex: 1 },
  columns: { gap: 8 },
  refreshBanner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
    elevation: 1,
  },
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
    flexWrap: "wrap",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  filterBannerText: { color: colors.accent, fontSize: 12, fontWeight: "700", flexShrink: 1 },
  filterClear: { color: colors.accent, fontSize: 12, fontWeight: "800" },
  filterChip: {
    minHeight: 48,
    maxWidth: "100%",
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: colors.accentSoft,
  },
  filterClearButton: { minHeight: 48, justifyContent: "center", paddingHorizontal: 8 },
  footerLoader: { paddingVertical: 20 },
});
