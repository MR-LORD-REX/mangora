import { router } from "expo-router";
import { ArrowLeft, ArrowUp, ListFilter, Search, X } from "lucide-react-native";
import React from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";

import { SeriesDownloadButton, type DownloadCandidate, type DownloadContext } from "@features/downloads";
import type { ChapterMeta, ViewerChapterRow } from "@shared/contracts";
import { colors, radius } from "@shared/theme";

export interface MangaChapterListProps {
  meta: ChapterMeta;
  accent: string;
  downloadCandidates: DownloadCandidate[];
  downloadContext: DownloadContext;
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  submitSearch: () => void;
  searchInputRef: React.RefObject<TextInput | null>;
  setOverlayVisible: (visible: boolean) => void;
  listRef: React.RefObject<FlatList<ViewerChapterRow> | null>;
  listData: ViewerChapterRow[];
  renderRow: ({ item }: { item: ViewerChapterRow }) => React.ReactElement;
  listHeader: React.ReactElement;
  loading: boolean;
  loadError: string | null;
  isNumericQuery: boolean;
  load: () => Promise<void>;
  handleScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onScrollToIndexFailed: (info: {
    index: number;
    highestMeasuredFrameIndex: number;
    averageItemLength: number;
  }) => void;
  showFab: boolean;
  scrollToTop: () => void;
}

export default function MangaChapterList({
  meta,
  accent,
  downloadCandidates,
  downloadContext,
  searchOpen,
  setSearchOpen,
  searchQuery,
  setSearchQuery,
  submitSearch,
  searchInputRef,
  setOverlayVisible,
  listRef,
  listData,
  renderRow,
  listHeader,
  loading,
  loadError,
  isNumericQuery,
  load,
  handleScroll,
  onScrollToIndexFailed,
  showFab,
  scrollToTop,
}: MangaChapterListProps) {
  return (
<View style={styles.container}>
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={8}
            style={styles.iconBtn}
          >
            <ArrowLeft color={colors.text} size={24} />
          </Pressable>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {meta.title}
            </Text>
          </View>
          <View style={styles.headerActions}>
            {downloadCandidates.length > 0 ? (
              <SeriesDownloadButton
                candidates={downloadCandidates}
                context={downloadContext}
                accent={accent}
              />
            ) : null}
            {searchOpen ? (
              <TextInput
                ref={searchInputRef}
                style={styles.searchInput}
                placeholder="Number = jump · text = filter"
                placeholderTextColor={colors.textFaint}
                value={searchQuery}
                onChangeText={setSearchQuery}
                onSubmitEditing={submitSearch}
                returnKeyType="search"
                autoFocus
              />
            ) : null}
            <Pressable
              onPress={() => {
                const next = !searchOpen;
                setSearchOpen(next);
                setSearchQuery("");
                if (next) {
                  setTimeout(() => searchInputRef.current?.focus(), 60);
                }
              }}
              hitSlop={8}
              style={styles.iconBtn}
            >
              {searchOpen ? (
                <X color={colors.textMuted} size={20} />
              ) : (
                <Search color={colors.textMuted} size={20} />
              )}
            </Pressable>
            <Pressable
              onPress={() => setOverlayVisible(true)}
              hitSlop={8}
              style={styles.iconBtn}
            >
              <ListFilter color={accent} size={20} />
            </Pressable>
          </View>
        </View>

        <FlatList
          ref={listRef}
          data={listData}
          keyExtractor={(row) => row.key}
          renderItem={renderRow}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            !loading ? (
              <View style={styles.emptyBox}>
                <Text style={styles.errorText}>
                  {searchQuery.trim() && !isNumericQuery
                    ? "No chapters match your search."
                    : (loadError ??
                      "No chapters available for this series yet.")}
                </Text>
                {loadError ? (
                  <Pressable
                    onPress={() => void load()}
                    style={[styles.primaryBtn, { backgroundColor: accent }]}
                  >
                    <Text style={styles.primaryBtnText}>Retry</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null
          }
          initialNumToRender={Math.min(listData.length || 1, 100)}
          maxToRenderPerBatch={80}
          windowSize={15}
          onScrollToIndexFailed={onScrollToIndexFailed}
          onScroll={handleScroll}
          scrollEventThrottle={32}
        />

        {showFab ? (
          <Pressable
            onPress={scrollToTop}
            style={[styles.fab, { backgroundColor: accent }]}
          >
            <ArrowUp color={colors.onAccent} size={22} strokeWidth={3} />
          </Pressable>
        ) : null}
      </View>

  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  list: { flex: 1 },
  listContent: { paddingBottom: 44 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
    gap: 4,
  },
  iconBtn: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.full,
  },
  headerTitleWrap: { flex: 1 },
  headerTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 2 },
  searchInput: {
    backgroundColor: colors.surfaceHigh,
    color: colors.text,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
    width: 172,
    fontSize: 12.5,
  },
  emptyBox: {
    alignItems: "center",
    paddingVertical: 28,
    paddingHorizontal: 20,
  },
  errorText: {
    color: colors.textMuted,
    textAlign: "center",
    fontSize: 15,
    lineHeight: 22,
  },
  primaryBtn: {
    marginTop: 18,
    paddingHorizontal: 26,
    paddingVertical: 10,
    borderRadius: radius.full,
  },
  primaryBtnText: { color: colors.onAccent, fontSize: 15, fontWeight: "800" },
  fab: {
    position: "absolute",
    right: 18,
    bottom: 24,
    width: 52,
    height: 52,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
