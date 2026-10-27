/**
 * downloads/index.tsx
 * ---------------------------------------------------------------------------
 * Download manager: every manga with downloaded chapters, grouped by source.
 * Mirrors the history screen's row layout so the two lists feel the same.
 * ---------------------------------------------------------------------------
 */

import { router, useFocusEffect } from "expo-router";
import { BookOpen, ChevronRight, HardDriveDownload } from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import AppHeader from "@shared/ui/layout/AppHeader";
import ChipTabBar from "@shared/ui/navigation/ChipTabBar";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, radius } from "@shared/theme";
import {
  listDownloadedManga,
  type DownloadedMangaSummary,
} from "../catalog/catalog";

import { formatBytes } from "@core/settings/storageUsage";
import { openMangaInfo } from "@composition/navigation/manga";
import { imageSourceForUrl } from "@shared/net/imageHeaders";
import { providerLabel } from "@features/extensions";


export default function DownloadManagerScreen() {
  const [entries, setEntries] = useState<DownloadedMangaSummary[]>([]);
  const [provider, setProvider] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setEntries(await listDownloadedManga());
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not read the download library.",
      );
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const tabs = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of entries) {
      counts.set(entry.provider, (counts.get(entry.provider) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([key, count]) => ({
      key,
      label: `${providerLabel(key)} (${count})`,
    }));
  }, [entries]);

  const activeProvider =
    provider && tabs.some((tab) => tab.key === provider)
      ? provider
      : (tabs[0]?.key ?? "");

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return entries.filter(
      (entry) =>
        entry.provider === activeProvider &&
        (!term || entry.title.toLowerCase().includes(term)),
    );
  }, [activeProvider, entries, search]);

  const totalBytes = useMemo(
    () => visible.reduce((sum, entry) => sum + entry.byteSize, 0),
    [visible],
  );

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <AppHeader
        title="Downloaded chapters"
        accent={colors.accent}
        onBack={() => router.back()}
        searchPlaceholder="Search downloads"
        query={search}
        onQueryChange={setSearch}
        showMenu={false}
      />

      {tabs.length > 0 ? (
        <ChipTabBar
          tabs={tabs}
          activeKey={activeProvider}
          onSelect={setProvider}
          accent={colors.accent}
        />
      ) : null}

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <FlatList
        data={visible}
        keyExtractor={(item) => item.mangaId}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          visible.length ? (
            <View style={styles.summaryBlock}>
              <View style={styles.summaryRow}>
                <HardDriveDownload size={14} color={colors.textFaint} />
                <Text style={styles.summaryText}>
                  {visible.length} manga - {formatBytes(totalBytes)}
                </Text>
              </View>
              <Text style={styles.summaryHint}>
                Tap to open - long-press to manage or delete
              </Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>No downloaded chapters</Text>
            <Text style={styles.emptyHint}>
              Download a chapter from a manga page or the reader and it shows up
              here.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() =>
              openMangaInfo({
                provider: item.provider,
                id: item.providerMangaId,
                thumbnailUrl: item.thumbnailPath ?? item.thumbnailUrl ?? null,
                downloadsOnly: true,
              })
            }
            onLongPress={() =>
              router.push({
                pathname: "/downloads/[mangaId]",
                params: { mangaId: item.mangaId },
              })
            }
            style={({ pressed }) => [styles.entryRow, pressed && styles.pressed]}
          >
            {item.thumbnailPath || item.thumbnailUrl ? (
              <Image
                source={imageSourceForUrl(
                  item.thumbnailPath ?? item.thumbnailUrl,
                )}
                style={styles.thumb}
              />
            ) : (
              <View style={[styles.thumb, styles.thumbPlaceholder]}>
                <BookOpen size={20} color={colors.textFaint} />
              </View>
            )}
            <View style={styles.entryInfo}>
              <Text numberOfLines={2} style={styles.entryTitle}>
                {item.title}
              </Text>
              <Text style={styles.entryMeta}>
                {item.chapterCount} chapter{item.chapterCount === 1 ? "" : "s"} -{" "}
                {formatBytes(item.byteSize)}
              </Text>
              <Text style={styles.entryDate}>
                Updated {new Date(item.updatedAt).toLocaleDateString()}
              </Text>
            </View>
            <ChevronRight color={colors.textFaint} size={18} />
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  listContent: { paddingBottom: 32 },
  summaryRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  summaryText: { color: colors.textFaint, fontSize: 12, fontWeight: "600" },
  summaryBlock: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  summaryHint: { color: colors.textFaint, fontSize: 11, marginTop: 3, opacity: 0.8 },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  entryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  pressed: { opacity: 0.7 },
  thumb: {
    width: 54,
    height: 76,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  thumbPlaceholder: { alignItems: "center", justifyContent: "center" },
  entryInfo: { flex: 1 },
  entryTitle: { color: colors.text, fontSize: 14, fontWeight: "700" },
  entryMeta: { color: colors.textMuted, fontSize: 12, marginTop: 3 },
  entryDate: { color: colors.textFaint, fontSize: 11, marginTop: 3 },
  emptyWrap: { paddingTop: 70, paddingHorizontal: 34, alignItems: "center" },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
  emptyHint: {
    color: colors.textFaint,
    fontSize: 13,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 19,
  },
});
