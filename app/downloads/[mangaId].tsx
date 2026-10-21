/**
 * downloads/[mangaId].tsx
 * ---------------------------------------------------------------------------
 * One manga's downloaded chapters with per-chapter delete plus a "delete all"
 * action that also removes the manga entry and its folder.
 * ---------------------------------------------------------------------------
 */

import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { BookOpen, RotateCcw, Trash2 } from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import AppHeader from "@/components/common/AppHeader";
import { ConfirmDialog } from "@/components/common/Dialogs";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, radius } from "@/constants/theme";
import {
  deleteDownloadsForManga,
  listDownloadsForManga,
} from "@/services/db/repositories/downloadRepository";
import type { Download } from "@/services/db/schema";
import {
  deleteDownloadedChapter,
  getDownloadFolderState,
  retryDownload,
} from "@/services/downloader";
import { removeMangaFolder } from "@/services/downloader/storage";
import { formatBytes } from "@/services/settings/storageUsage";
import { imageSourceForUrl } from "@/utils/reader/imageHeaders";

type DownloadRow = Download;

function statusLabel(row: DownloadRow): { text: string; color: string } {
  if (row.status === "completed") {
    if (row.error) {
      return {
        text: `Downloaded - ${formatBytes(row.byteSize ?? 0)} - ${row.error}`,
        color: colors.gold,
      };
    }
    return { text: `Downloaded - ${formatBytes(row.byteSize ?? 0)}`, color: colors.success };
  }
  if (row.status === "failed") {
    return { text: row.error ?? "Failed", color: colors.danger };
  }
  if (row.status === "running" || row.status === "queued") {
    return { text: "Downloading...", color: colors.accent };
  }
  return { text: row.error ?? "Paused", color: colors.gold };
}

export default function DownloadedMangaScreen() {
  const params = useLocalSearchParams<{ mangaId?: string | string[] }>();
  const mangaId =
    typeof params.mangaId === "string"
      ? params.mangaId
      : (params.mangaId?.[0] ?? "");

  const [rows, setRows] = useState<DownloadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<DownloadRow | null>(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);

  const load = useCallback(async () => {
    if (!mangaId) return;
    try {
      setRows(await listDownloadsForManga(mangaId));
    } finally {
      setLoading(false);
    }
  }, [mangaId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const header = useMemo(() => rows[0] ?? null, [rows]);
  const totalBytes = useMemo(
    () => rows.reduce((sum, row) => sum + (row.byteSize ?? 0), 0),
    [rows],
  );

  const onDeleteChapter = async (row: DownloadRow) => {
    setPendingDelete(null);
    setBusy(true);
    try {
      const result = await deleteDownloadedChapter(row.id);
      if (result.warning) {
        Alert.alert(
          result.deleted ? "Delete incomplete" : "Could not delete chapter",
          result.warning,
        );
      }
      await load();
      if (result.deleted && rows.length <= 1) router.back();
    } finally {
      setBusy(false);
    }
  };

  const onDeleteAll = async () => {
    setConfirmDeleteAll(false);
    setBusy(true);
    try {
      const first = rows[0];
      const warnings: string[] = [];
      for (const row of rows) {
        const result = await deleteDownloadedChapter(row.id);
        if (result.warning) warnings.push(result.warning);
      }
      if (warnings.length > 0) {
        Alert.alert(
          "Some chapters were not deleted",
          warnings.slice(0, 5).join("\n\n"),
        );
        await load();
        return;
      }
      await deleteDownloadsForManga(mangaId);
      if (first) {
        try {
          const state = await getDownloadFolderState();
          if (state) {
            await removeMangaFolder(state, {
              provider: first.provider,
              mangaTitle: first.mangaTitle,
              providerMangaId: first.providerMangaId,
            });
          }
        } catch {
          // The folder may still hold unrelated files; leaving it is fine.
        }
      }
      router.back();
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <AppHeader
        title={header?.mangaTitle ?? "Downloads"}
        accent={colors.accent}
        onBack={() => router.back()}
        query=""
        onQueryChange={() => {}}
        showMenu
        menuTitle="Downloaded chapters"
        menuActions={[
          {
            key: "delete-all",
            label: "Delete all chapters",
            icon: Trash2,
            destructive: true,
            onPress: () => setConfirmDeleteAll(true),
          },
        ]}
      />

      <FlatList
        data={rows}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          header ? (
            <View style={styles.head}>
              {header.thumbnailPath || header.thumbnailUrl ? (
                <Image
                  source={imageSourceForUrl(
                    header.thumbnailPath ?? header.thumbnailUrl,
                  )}
                  style={styles.cover}
                />
              ) : (
                <View style={[styles.cover, styles.coverPlaceholder]}>
                  <BookOpen size={22} color={colors.textFaint} />
                </View>
              )}
              <View style={styles.headInfo}>
                <Text numberOfLines={2} style={styles.headTitle}>
                  {header.mangaTitle}
                </Text>
                <Text style={styles.headMeta}>
                  {rows.length} chapter{rows.length === 1 ? "" : "s"} -{" "}
                  {formatBytes(totalBytes)}
                </Text>
                <Pressable
                  disabled={busy}
                  onPress={() => setConfirmDeleteAll(true)}
                  style={({ pressed }) => [
                    styles.deleteAllBtn,
                    pressed && styles.pressed,
                    busy && styles.disabled,
                  ]}
                >
                  {busy ? (
                    <ActivityIndicator color={colors.danger} size="small" />
                  ) : (
                    <>
                      <Trash2 color={colors.danger} size={14} />
                      <Text style={styles.deleteAllLabel}>Delete all</Text>
                    </>
                  )}
                </Pressable>
              </View>
            </View>
          ) : null
        }
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyTitle}>No chapters left</Text>
              <Text style={styles.emptyHint}>
                Every chapter of this manga has been deleted.
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const status = statusLabel(item);
          return (
            <View style={styles.row}>
              <View style={styles.rowInfo}>
                <Text numberOfLines={2} style={styles.rowTitle}>
                  {item.chapterTitle}
                </Text>
                <Text numberOfLines={1} style={styles.rowSubtitle}>
                  {[
                    item.chapterIndex ? `#${item.chapterIndex}` : null,
                    item.scanlationGroup,
                  ]
                    .filter(Boolean)
                    .join(" - ") || item.provider}
                </Text>
                <Text style={[styles.rowStatus, { color: status.color }]}>
                  {status.text}
                </Text>
              </View>
              {item.status === "failed" ? (
                <Pressable
                  hitSlop={8}
                  style={styles.iconBtn}
                  onPress={() => void retryDownload(item.id)}
                >
                  <RotateCcw color={colors.accent} size={18} />
                </Pressable>
              ) : null}
              <Pressable
                hitSlop={8}
                style={styles.iconBtn}
                onPress={() => setPendingDelete(item)}
              >
                <Trash2 color={colors.danger} size={18} />
              </Pressable>
            </View>
          );
        }}
      />

      <ConfirmDialog
        visible={pendingDelete !== null}
        title="Delete this chapter?"
        message={
          pendingDelete
            ? `"${pendingDelete.chapterTitle}" is removed from the device.`
            : undefined
        }
        confirmLabel="Delete"
        destructive
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => {
          if (pendingDelete) void onDeleteChapter(pendingDelete);
        }}
      />
      <ConfirmDialog
        visible={confirmDeleteAll}
        title="Delete every chapter?"
        message={
          header
            ? `All ${rows.length} downloaded chapter${rows.length === 1 ? "" : "s"} of "${header.mangaTitle}" are removed and the manga entry is deleted.`
            : undefined
        }
        confirmLabel="Delete all"
        destructive
        busy={busy}
        onCancel={() => setConfirmDeleteAll(false)}
        onConfirm={() => void onDeleteAll()}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  listContent: { paddingBottom: 32 },
  head: {
    flexDirection: "row",
    gap: 14,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  cover: { width: 76, height: 108, borderRadius: radius.md, backgroundColor: colors.surface },
  coverPlaceholder: { alignItems: "center", justifyContent: "center" },
  headInfo: { flex: 1 },
  headTitle: { color: colors.text, fontSize: 16, fontWeight: "800" },
  headMeta: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  deleteAllBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.dangerSoft,
  },
  deleteAllLabel: { color: colors.danger, fontSize: 12, fontWeight: "700" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowInfo: { flex: 1 },
  rowTitle: { color: colors.text, fontSize: 14, fontWeight: "700" },
  rowSubtitle: { color: colors.textFaint, fontSize: 12, marginTop: 3 },
  rowStatus: { fontSize: 12, fontWeight: "700", marginTop: 4 },
  iconBtn: { padding: 4 },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.5 },
  emptyWrap: { paddingTop: 60, alignItems: "center" },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
  emptyHint: { color: colors.textFaint, fontSize: 13, marginTop: 8 },
});
