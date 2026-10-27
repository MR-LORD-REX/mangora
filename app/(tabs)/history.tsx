import { router, useFocusEffect } from "expo-router";
import { BookOpen, RefreshCw, Trash2 } from "lucide-react-native";
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
import { colors, radius } from "@shared/theme";
import {
    clearHistory,
    deleteHistoryEntry,
    listHistory,
    type ReaderParamsSnapshot,
} from "@/services/db/repositories/historyRepository";
import { imageSourceForUrl } from "@shared/net/imageHeaders";

type HistoryEntry = Awaited<ReturnType<typeof listHistory>>[number];

export default function HistoryScreen() {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setEntries(await listHistory(search.trim() || undefined));
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load history.",
      );
    }
  }, [search]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const openEntry = (readerParamsJson: string) => {
    try {
      const params = JSON.parse(readerParamsJson) as ReaderParamsSnapshot;
      if (!params.id || !params.source)
        throw new Error("Invalid history route");
      router.push({
        pathname: "/reader/[id]",
        params: {
          id: params.id,
          source: params.source,
          ...(params.mangaId ? { mangaId: params.mangaId } : {}),
          ...(params.title ? { title: params.title } : {}),
          ...(params.mangaTitle ? { mangaTitle: params.mangaTitle } : {}),
          ...(params.chapterTitle ? { chapterTitle: params.chapterTitle } : {}),
          ...(params.chapterMemo ? { chapterMemo: params.chapterMemo } : {}),
          ...(params.thumbnailUrl ? { thumbnailUrl: params.thumbnailUrl } : {}),
          ...(params.language ? { language: params.language } : {}),
        },
      });
    } catch {
      setError("This history entry cannot be opened.");
    }
  };

  const rows = useMemo(() => {
    const groups = entries.reduce<Record<string, HistoryEntry[]>>(
      (result, entry) => {
        const key = new Date(entry.openedAt).toLocaleDateString();
        (result[key] ??= []).push(entry);
        return result;
      },
      {},
    );
    return Object.entries(groups).flatMap(([date, items]) => [
      { type: "date" as const, id: `date-${date}`, date },
      ...items.map((item) => ({ type: "entry" as const, item })),
    ]);
  }, [entries]);

  const totalReads = entries.length;

  return (
    <View style={styles.screen}>
      <AppHeader
        title="History"
        accent={colors.accent}
        searchPlaceholder="Search history"
        query={search}
        onQueryChange={setSearch}
        onSearchSubmit={() => void load()}
        menuTitle="History"
        menuActions={[
          {
            key: "delete-all",
            label: "Delete all history",
            icon: Trash2,
            destructive: true,
            onPress: () => setConfirmOpen(true),
          },
          {
            key: "refresh",
            label: "Refresh",
            icon: RefreshCw,
            onPress: () => void load(),
            destructive: false,
          },
        ]}
      />

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <FlatList
        data={rows}
        keyExtractor={(item) => (item.type === "date" ? item.id : item.item.id)}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          entries.length ? (
            <View style={styles.summaryRow}>
              <BookOpen size={14} color={colors.textFaint} />
              <Text style={styles.summaryText}>
                {totalReads} {totalReads === 1 ? "read" : "reads"} this list
              </Text>
            </View>
          ) : null
        }
        renderItem={({ item }) =>
          item.type === "date" ? (
            <Text style={styles.dateHeader}>{item.date}</Text>
          ) : (
            <Pressable
              onPress={() => openEntry(item.item.readerParamsJson)}
              style={({ pressed }) => [
                styles.entryRow,
                pressed && styles.pressed,
              ]}
            >
              {item.item.thumbnailSnapshot ? (
                <Image
                  source={imageSourceForUrl(item.item.thumbnailSnapshot)}
                  style={styles.thumb}
                />
              ) : (
                <View style={[styles.thumb, styles.thumbPlaceholder]}>
                  <BookOpen size={20} color={colors.textFaint} />
                </View>
              )}
              <View style={styles.entryInfo}>
                <Text numberOfLines={2} style={styles.entryTitle}>
                  {item.item.mangaTitle}
                </Text>
                <Text numberOfLines={1} style={styles.entryChapter}>
                  {item.item.chapterNumber !== null &&
                  item.item.chapterNumber !== undefined
                    ? `Chapter ${item.item.chapterNumber}`
                    : (item.item.chapterTitle ?? item.item.titleSnapshot)}
                </Text>
                <Text style={styles.entryDate}>
                  {new Date(item.item.openedAt).toLocaleString()}
                </Text>
              </View>
              <Pressable
                onPress={() => void deleteHistoryEntry(item.item.id).then(load)}
                hitSlop={10}
                style={({ pressed }) => [
                  styles.deleteBtn,
                  pressed && styles.pressed,
                ]}
              >
                <Trash2 color={colors.danger} size={18} />
              </Pressable>
            </Pressable>
          )
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <BookOpen size={34} color={colors.textFaint} />
            <Text style={styles.emptyTitle}>No reading history yet</Text>
            <Text style={styles.emptyHint}>
              Chapters you open will show up here.
            </Text>
          </View>
        }
      />

      <DeleteHistoryModal
        visible={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          clearHistory()
            .then(() => {
              setConfirmOpen(false);
              return load();
            })
            .catch((loadError) => {
              setError(
                loadError instanceof Error
                  ? loadError.message
                  : "Could not clear history.",
              );
            });
        }}
      />
    </View>
  );
}

function DeleteHistoryModal({
  visible,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <View>
      {visible ? (
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Delete all history?</Text>
            <Text style={styles.modalHint}>
              This removes every entry from your reading history. This cannot be
              undone.
            </Text>
            <View style={styles.modalActions}>
              <Pressable onPress={onClose} style={styles.modalBtn}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={onConfirm}
                style={[styles.modalBtn, styles.deleteBtnSolid]}
              >
                <Text style={styles.deleteText}>Delete all</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingTop: 44 },
  errorText: { color: colors.danger, paddingHorizontal: 18, paddingTop: 10 },
  listContent: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 130 },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  summaryText: { color: colors.textFaint, fontSize: 13 },
  dateHeader: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "800",
    marginTop: 18,
    marginBottom: 10,
    paddingHorizontal: 8,
  },
  entryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: radius.md,
  },
  thumb: {
    width: 54,
    height: 74,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceHigh,
  },
  thumbPlaceholder: {
    alignItems: "center",
    justifyContent: "center",
  },
  entryInfo: { flex: 1 },
  entryTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 20,
  },
  entryChapter: { color: colors.textMuted, fontSize: 13, marginTop: 3 },
  entryDate: { color: colors.textFaint, fontSize: 11.5, marginTop: 3 },
  deleteBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.full,
    backgroundColor: colors.dangerSoft,
  },
  pressed: { opacity: 0.7 },
  emptyWrap: {
    alignItems: "center",
    paddingTop: 90,
    gap: 6,
    paddingHorizontal: 24,
  },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: "800" },
  emptyHint: { color: colors.textMuted, fontSize: 13, textAlign: "center" },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.scrim,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    backgroundColor: colors.surfaceHigh,
    borderRadius: radius.lg,
    padding: 20,
    width: "100%",
    maxWidth: 400,
  },
  modalTitle: { color: colors.text, fontSize: 18, fontWeight: "800" },
  modalHint: {
    color: colors.textMuted,
    fontSize: 13.5,
    lineHeight: 20,
    marginTop: 8,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 20,
  },
  modalBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  cancelText: { color: colors.textMuted, fontWeight: "700" },
  deleteBtnSolid: { backgroundColor: colors.danger },
  deleteText: { color: "#fff", fontWeight: "800" },
});
