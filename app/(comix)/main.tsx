import { router, useLocalSearchParams } from "expo-router";
import { openMangaInfo } from "@/components/manga/openMangaInfo";
import type { LucideIcon } from "lucide-react-native";
import {
  Clock,
  Compass,
  ExternalLink,
  Flame,
  LayoutGrid,
  RotateCcw,
  Rows3,
  SlidersHorizontal,
  TrendingUp,
} from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import AppHeader from "@/components/common/AppHeader";
import ComixFilterOverlay, {
  DEFAULT_COMIX_FILTERS,
  comixHasActiveFilters,
  type ComixFilterState,
} from "@/components/comix/ComixFilterOverlay";
import SourceTabs from "@/components/sources/SourceTabs";
import DownloadedStrip from "@/components/downloader/DownloadedStrip";
import {
  MangaGridCard,
  MangaListRow,
  type SourceEntry,
} from "@/components/sources/MangaCards";
import { colors, providerAccent, radius, type ViewMode } from "@/constants/theme";
import { ComixClient } from "@/services/comix/comix";
import { comixBridgeFetchHtml } from "@/services/comix/comixBridge";
import { comixListManga, comixPosterUrl } from "@/services/comix/comix.api";
import type {
  ComixApiManga,
  ComixListMeta,
  ComixListParams,
} from "@/services/comix/comix.api.types";
import type {
  ComixTaxonomyItem,
  FeedSection,
  MangaSummary,
} from "@/services/comix/comix.types";

// SSR pages are fetched through the WebView bridge: Cloudflare serves a
// managed challenge to plain HTTP requests, so the home feed and browse
// vocabulary must come from the browser session that already cleared it.
const ssrApi = new ComixClient({ htmlLoader: comixBridgeFetchHtml });
const accent = providerAccent.comix;

const SECTION_ICONS: Record<string, LucideIcon> = {
  trending: TrendingUp,
  follows: Flame,
  hot: Clock,
  latest: TrendingUp,
};

const SECTION_LABEL: Record<string, string> = {
  trending: "Trending",
  follows: "Most Followed",
  hot: "Hot Updates",
  latest: "New Titles",
};

const TYPE_LABELS: Record<string, string> = {
  manga: "Manga",
  manhwa: "Manhwa",
  manhua: "Manhua",
  other: "Other",
};

const RATING_LABELS: Record<string, string> = {
  safe: "Safe",
  suggestive: "Suggestive",
  erotica: "Erotica",
  pornographic: "Pornographic",
};

/** Converts "field:dir" (the /browse vocabulary) into the API's order param. */
function sortToOrder(sort: string): { [field: string]: "asc" | "desc" } {
  const [field, dir] = sort.split(":");
  return { [field || "chapter_updated_at"]: dir === "asc" ? "asc" : "desc" };
}

function listParams(
  filters: ComixFilterState,
  keyword: string,
  page: number,
): ComixListParams {
  return {
    keyword: keyword.trim() || undefined,
    page,
    limit: 28,
    order: sortToOrder(filters.sort),
    genres_in: filters.genres.length ? filters.genres : undefined,
    types: filters.types.length ? filters.types : undefined,
    statuses: filters.statuses.length ? filters.statuses : undefined,
    content_rating: filters.contentRating.length
      ? filters.contentRating
      : ["safe", "suggestive", "erotica", "pornographic"],
  };
}

function searchEntry(
  item: ComixApiManga,
  onOpen: (item: ComixApiManga) => void,
): SourceEntry {
  const metaParts: string[] = [];
  if (item.latestChapter != null && item.hasChapters) {
    metaParts.push(`Ch. ${item.latestChapter}`);
  }
  if (item.ratedScore != null && item.ratedScore > 0) {
    metaParts.push(`★ ${item.ratedScore}`);
  }
  if (item.type) metaParts.push(TYPE_LABELS[item.type] ?? item.type);
  if (item.contentRating && RATING_LABELS[item.contentRating] !== "Safe") {
    metaParts.push(RATING_LABELS[item.contentRating]);
  }
  return {
    key: item.url,
    title: item.title,
    coverUrl: comixPosterUrl(item),
    meta: metaParts.join("  ·  "),
    onOpen: () => onOpen(item),
  };
}

function feedEntry(
  item: MangaSummary,
  onOpen: (item: MangaSummary) => void,
): SourceEntry {
  const metaParts: string[] = [];
  if (item.latestChapter != null && item.hasChapters) {
    metaParts.push(`Ch. ${item.latestChapter}`);
  }
  if (item.ratedScore != null && item.ratedScore > 0) {
    metaParts.push(`★ ${item.ratedScore}`);
  }
  if (item.updatedLabel) metaParts.push(item.updatedLabel);
  return {
    key: item.url,
    title: item.title,
    coverUrl: item.thumbnailUrl,
    meta: metaParts.join("  ·  "),
    onOpen: () => onOpen(item),
  };
}

export default function ComixMainScreen() {
  const [query, setQuery] = useState("");
  const [sections, setSections] = useState<FeedSection[]>([]);
  const [activeId, setActiveId] = useState("trending");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [mode, setMode] = useState<"feed" | "search">("feed");
  const [filters, setFilters] = useState<ComixFilterState>(
    DEFAULT_COMIX_FILTERS,
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { genre, tagLabel } = useLocalSearchParams<{
    genre?: string | string[];
    tagLabel?: string | string[];
  }>();
  useEffect(() => {
    if (!genre) return;
    const raw = Array.isArray(genre) ? (genre[0] ?? "") : (genre ?? "");
    const parsed = Number(raw);
    if (!Number.isNaN(parsed)) {
      const nextFilters = { ...DEFAULT_COMIX_FILTERS, genres: [parsed] };
      setFilters(nextFilters);
      void runSearch(nextFilters, "", 1, false);
    }
    router.setParams({ genre: undefined, tagLabel: undefined });
  }, [genre]);
  const [genres, setGenres] = useState<ComixTaxonomyItem[]>([]);

  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState<string | null>(null);

  const [results, setResults] = useState<ComixApiManga[]>([]);
  const [meta, setMeta] = useState<ComixListMeta | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [lastKeyword, setLastKeyword] = useState("");
  const [searchPage, setSearchPage] = useState(1);

  const loadFeed = async () => {
    setFeedLoading(true);
    setFeedError(null);
    try {
      const feed = await ssrApi.getHomeFeed();
      setSections(feed.sections);
      const available = feed.sections.filter((s) => s.items.length > 0);
      setActiveId((current) =>
        available.some((s) => s.id === current)
          ? current
          : (available[0]?.id ?? "trending"),
      );
    } catch (error) {
      console.error("Comix feed failed:", error);
      setFeedError(
        error instanceof Error ? error.message : "Could not load Comix.",
      );
    } finally {
      setFeedLoading(false);
    }
  };

  // Cache the /browse genre vocabulary once (used by the filter sheet).
  useEffect(() => {
    let cancelled = false;
    ssrApi
      .getBrowseMeta()
      .then((browse) => {
        if (!cancelled) setGenres(browse.genres);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void loadFeed();
  }, []);

  const runSearch = async (
    forFilters: ComixFilterState,
    forKeyword: string,
    page: number,
    append: boolean,
  ) => {
    setSearchLoading(true);
    setSearchError(null);
    if (!append) setResults([]);
    try {
      const result = await comixListManga(
        listParams(forFilters, forKeyword, page),
      );
      setMeta(result.meta);
      setSearchPage(page);
      setResults((previous) =>
        append ? [...previous, ...result.items] : result.items,
      );
      setMode("search");
      setLastKeyword(forKeyword.trim());
    } catch (error) {
      console.error("Comix search failed:", error);
      setSearchError(
        error instanceof Error ? error.message : "Could not search Comix.",
      );
    } finally {
      setSearchLoading(false);
    }
  };

  const submitSearch = () => {
    Keyboard.dismiss();
    void runSearch(filters, query, 1, false);
  };

  const applyFilters = (next: ComixFilterState) => {
    setFilters(next);
    const meaningful = query.trim().length > 0 || comixHasActiveFilters(next);
    if (mode === "feed" && !meaningful) {
      return;
    }
    void runSearch(next, query, 1, false);
  };

  const resetToFeed = () => {
    Keyboard.dismiss();
    setQuery("");
    setMode("feed");
    setResults([]);
    setSearchError(null);
  };

  const loadMore = () => {
    if (!meta?.hasNext || searchLoading) return;
    void runSearch(filters, query, searchPage + 1, true);
  };

  const openMangaUrl = (url: string, thumbnailUrl: string | null) => {
    Keyboard.dismiss();
    openMangaInfo({ provider: "comix", id: url, thumbnailUrl });
  };

  const openWeb = (url: string, label: string) => {
    Keyboard.dismiss();
    router.push({
      pathname: "/(comix)/web",
      params: { url: encodeURIComponent(url), title: label },
    });
  };

  const availableSections = useMemo(
    () => sections.filter((s) => s.items.length > 0),
    [sections],
  );
  const activeItems = useMemo(() => {
    const section = sections.find((s) => s.id === activeId);
    return section?.items ?? [];
  }, [activeId, sections]);

  const feedEntries = useMemo(
    () => feedEntriesFor(activeItems, openMangaUrl),
    [activeItems],
  );
  const searchEntries = useMemo(
    () => searchEntriesFor(results, openMangaUrl),
    [results],
  );

  const searching = mode === "search";
  const filterActive = comixHasActiveFilters(filters);
  const entries = searching ? searchEntries : feedEntries;
  const loading =
    searching
      ? searchLoading && results.length === 0
      : feedLoading && activeItems.length === 0;
  const errorText = searching ? searchError : feedError;
  const sectionTabs = availableSections.map((section) => ({
    key: section.id,
    label: SECTION_LABEL[section.id] ?? section.title,
    icon: SECTION_ICONS[section.id],
  }));

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.container}>
        <AppHeader
          title="Comix"
          accent={accent}
          query={query}
          onQueryChange={setQuery}
          onSearchSubmit={submitSearch}
          searchPlaceholder="Search Comix..."
          menuTitle="Comix"
          actions={[
            {
              key: "filters",
              icon: SlidersHorizontal,
              active: searching && (filterActive || query.trim().length > 0),
              onPress: () => setFiltersOpen(true),
            },
          ]}
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
            {
              key: "catalog",
              label: searching
                ? "Refresh catalog results"
                : "Browse full catalog",
              icon: Compass,
              onPress: () => {
                if (!searching) setMode("search");
                void runSearch(DEFAULT_COMIX_FILTERS, "", 1, false);
              },
            },
            {
              key: "home",
              label: searching ? "Back to home feed" : "Reload home feed",
              icon: RotateCcw,
              onPress: searching ? resetToFeed : () => void loadFeed(),
            },
            {
              key: "browse",
              label: "Open the site in the web view",
              icon: ExternalLink,
              onPress: () => openWeb(ssrApi.browseUrl(), "Comix Browse"),
            },
          ]}
        />

        {!searching ? (
          <SourceTabs
            accent={accent}
            tabs={sectionTabs}
            activeKey={activeId}
            onSelect={setActiveId}
          />
        ) : null}

        {searching ? (
          <View style={styles.searchBar}>
            <Text style={styles.searchTitle} numberOfLines={1}>
              {lastKeyword
                ? `Results for “${lastKeyword}”`
                : filterActive
                  ? "Filtered browse"
                  : "Comix catalog"}
            </Text>
            <Pressable onPress={resetToFeed} hitSlop={8} style={styles.clearWrap}>
              <Text style={styles.clearText}>Clear</Text>
            </Pressable>
          </View>
        ) : null}

        {loading ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator color={accent} size="large" />
          </View>
        ) : (
          <FlatList
            key={viewMode}
            data={entries}
            numColumns={viewMode === "grid" ? 2 : 1}
            keyExtractor={(item) => item.key}
            contentContainerStyle={styles.listContent}
            columnWrapperStyle={
              viewMode === "grid" ? styles.gridColumn : undefined
            }
            onEndReached={searching ? loadMore : undefined}
            onEndReachedThreshold={0.6}
            ListHeaderComponent={
              <>
                <DownloadedStrip provider="comix" accent={accent} />
                {errorText && entries.length === 0 ? (
                  <View style={styles.errorWrap}>
                    <Text style={styles.errorText}>{errorText}</Text>
                    <Pressable
                      onPress={() =>
                        searching
                          ? void runSearch(filters, query, 1, false)
                          : void loadFeed()
                      }
                      style={({ pressed }) => [
                        styles.errorCta,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={styles.errorCtaText}>Retry</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => openWeb(ssrApi.browseUrl(), "Comix")}
                      style={({ pressed }) => [
                        styles.errorCta,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text style={styles.errorCtaText}>Open in browser</Text>
                    </Pressable>
                  </View>
                ) : null}
              </>
            }
            ListEmptyComponent={
              !errorText && !loading ? (
                <View style={styles.emptyWrap}>
                  <Text style={styles.emptyTitle}>
                    {searching ? "No results" : "No items in this feed"}
                  </Text>
                  <Text style={styles.emptyHint}>
                    {searching
                      ? "Try a different keyword or loosen the filters."
                      : "Search or open the catalog from the three-dot menu."}
                  </Text>
                </View>
              ) : null
            }
            ListFooterComponent={
              searching && searchLoading && results.length > 0 ? (
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

        <ComixFilterOverlay
          visible={filtersOpen}
          filters={filters}
          genres={genres}
          accent={accent}
          onClose={() => setFiltersOpen(false)}
          onApply={applyFilters}
        />

        {searching && !loading ? (
          <Pressable
            onPress={() => openWeb(ssrApi.browseUrl(), "Comix Browse")}
            style={({ pressed }) => [
              styles.webHintBtn,
              pressed && styles.pressed,
            ]}
          >
            <ExternalLink color={accent} size={15} />
            <Text style={styles.webHintText}>Prefer the full site?</Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

// Small helper factories (defined below the component to keep the JSX lean).
function feedEntriesFor(
  items: MangaSummary[],
  onOpen: (url: string, thumbnail: string | null) => void,
): SourceEntry[] {
  return items.map((item) => feedEntry(item, (manga) => onOpen(manga.url, manga.thumbnailUrl)));
}

function searchEntriesFor(
  items: ComixApiManga[],
  onOpen: (url: string, thumbnail: string | null) => void,
): SourceEntry[] {
  return items.map((item) =>
    searchEntry(item, (manga) => onOpen(manga.url, comixPosterUrl(manga))),
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, backgroundColor: colors.bg },
  loaderWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  listContent: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 72 },
  gridColumn: { gap: 14 },
  footerLoader: { marginVertical: 16 },
  errorWrap: { paddingTop: 24, paddingHorizontal: 20, alignItems: "center" },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
  },
  errorCta: {
    marginTop: 14,
    backgroundColor: accent,
    borderRadius: radius.full,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  errorCtaText: { color: colors.onAccent, fontWeight: "800", fontSize: 14 },
  emptyWrap: { alignItems: "center", paddingTop: 56, paddingHorizontal: 20 },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
  emptyHint: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    textAlign: "center",
    marginTop: 8,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 2,
  },
  searchTitle: { color: colors.text, fontSize: 15, fontWeight: "800", flex: 1 },
  clearWrap: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: colors.surfaceHigh,
  },
  clearText: { color: colors.textMuted, fontSize: 13, fontWeight: "700" },
  webHintBtn: {
    position: "absolute",
    bottom: 12,
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.surfaceHigh,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: colors.border,
  },
  webHintText: { color: accent, fontSize: 12.5, fontWeight: "700" },
  pressed: { opacity: 0.7 },
});
