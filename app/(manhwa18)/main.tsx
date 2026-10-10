import { Manhwa18Source } from "@/services/manhwa18/Manhwa18";
import type { MangaEntry } from "@/services/manhwa18/types";
import { router, useLocalSearchParams } from "expo-router";
import { openMangaInfo } from "@/components/manga/openMangaInfo";
import {
  AlertCircle,
  Flame,
  LayoutGrid,
  Rows3,
  X,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import SourceTabs from "@/components/sources/SourceTabs";
import DownloadedStrip from "@/components/downloader/DownloadedStrip";
import {
  MangaGridCard,
  MangaListRow,
  type SourceEntry,
} from "@/components/sources/MangaCards";
import { colors, providerAccent, type ViewMode } from "@/constants/theme";

const api = new Manhwa18Source();

const REFERER = "https://manhwa18.cc/";

const Main = () => {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<MangaEntry[]>([]);
  const [activeTab, setActiveTab] = useState<"latest" | "trending">("latest");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);

  const accent = providerAccent.manhwa18;
  const { genre, tagLabel } = useLocalSearchParams<{
    genre?: string | string[];
    tagLabel?: string | string[];
  }>();
  const [activeGenre, setActiveGenre] = useState<{
    slug: string;
    label: string;
  } | null>(null);
  useEffect(() => {
    if (!genre) return;
    const slug = Array.isArray(genre) ? (genre[0] ?? "") : (genre ?? "");
    const label = Array.isArray(tagLabel) ? (tagLabel[0] ?? "") : (tagLabel ?? "");
    if (slug) {
      setActiveGenre({ slug, label: label || slug });
    }
    router.setParams({ genre: undefined, tagLabel: undefined });
  }, [genre, tagLabel]);

  const openManga = (url: string, thumbnailUrl?: string) => {
    Keyboard.dismiss();
    openMangaInfo({ provider: "manhwa18", id: url, thumbnailUrl: thumbnailUrl ?? null });
  };

  const fetchPage = useCallback(
    async (pageNum: number, append: boolean) => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      setLoading(true);

      try {
        const trimmed = query.trim();

        if (trimmed) {
          const res = await api.searchManga(trimmed, pageNum);
          setHasMore(res.hasNextPage);
          setResult((prev) =>
            append ? [...prev, ...res.mangas] : res.mangas,
          );
          setPage(pageNum);
          return;
        }

        if (!trimmed && activeGenre) {
          const res = await api.searchManga("", pageNum, {
            genreSlug: activeGenre.slug,
          });
          setHasMore(res.hasNextPage);
          setResult((prev) =>
            append ? [...prev, ...res.mangas] : res.mangas,
          );
          setPage(pageNum);
          return;
        }

        const list =
          activeTab === "latest"
            ? await api.getLatestUpdates(pageNum)
            : await api.getPopularManga(pageNum);

        setHasMore(list.hasNextPage);
        setResult((prev) => (append ? [...prev, ...list.mangas] : list.mangas));
        setPage(pageNum);
      } catch (error) {
        console.error("Manhwa18 fetch failed:", error);
      } finally {
        loadingRef.current = false;
        setLoading(false);
      }
    },
    [activeTab, query, activeGenre],
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

  const onTabChange = (tab: "latest" | "trending") => {
    setActiveTab(tab);
    setQuery("");
    setActiveGenre(null);
  };

  const onEndReached = () => {
    if (!hasMore || loading) return;
    fetchPage(page + 1, true);
  };

  const entries = useMemo<SourceEntry[]>(
    () =>
      result.map((item) => ({
        key: item.url,
        title: item.title,
        coverUrl: item.thumbnailUrl ?? null,
        coverHeaders: { Referer: REFERER },
        onOpen: () => openManga(item.url, item.thumbnailUrl),
      })),
    [result],
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={["top"]}>
      <View style={styles.container}>
        <AppHeader
          title="Manhwa18"
          accent={accent}
          query={query}
          onQueryChange={setQuery}
          onSearchSubmit={onSearch}
          searchPlaceholder="Search Manhwa18"
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
            { key: "trending", label: "Trending", icon: Flame },
          ]}
          activeKey={activeTab}
          onSelect={(key) => onTabChange(key as "latest" | "trending")}
        />

        {activeGenre ? (
          <View style={styles.activeTagRow}>
            <Text style={styles.activeTagText}>
              Genre: {activeGenre.label}
            </Text>
            <Pressable
              hitSlop={8}
              onPress={() => {
                setActiveGenre(null);
                setResult([]);
                setPage(1);
                setHasMore(true);
                void fetchPage(1, false);
              }}
            >
              <X color={colors.textMuted} size={16} />
            </Pressable>
          </View>
        ) : null}

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
              <DownloadedStrip provider="manhwa18" accent={accent} />
            }
            ListEmptyComponent={
              !loading ? (
                <Text style={styles.emptyText}>
                  No manga found. Try a different search.
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
  activeTagRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: 8,
    backgroundColor: colors.surfaceHigh,
    borderWidth: 1,
    borderColor: providerAccent.manhwa18,
    borderRadius: 999,
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 6,
    marginTop: 10,
  },
  activeTagText: { color: colors.text, fontSize: 13, fontWeight: "700" },
});

export default Main;
