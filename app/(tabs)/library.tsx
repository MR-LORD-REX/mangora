import { useFocusEffect } from "expo-router";
import { openMangaInfo } from "@/components/manga/openMangaInfo";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Check, CirclePlus, RefreshCw, SlidersHorizontal, Trash2 } from "lucide-react-native";

import AppHeader from "@/components/common/AppHeader";
import { ConfirmDialog } from "@/components/common/Dialogs";
import MenuSheet from "@/components/common/MenuSheet";
import LibraryFilterSheet from "@/components/library/LibraryFilterSheet";
import OnboardingOverlay from "@/components/onboarding/OnboardingOverlay";
import { colors, radius } from "@/constants/theme";
import { DOWNLOADS_LIBRARY_ID } from "@/services/db/bootstrap";
import {
  createLibrary,
  deleteLibrary,
  isSystemLibrary,
  listLibraries,
  listLibraryCards,
  type LibraryCard,
  type LibrarySort,
  type LibrarySummary,
} from "@/services/db/repositories/libraryRepository";
import { syncLibrary } from "@/services/library/librarySync";
import { listDownloadedManga } from "@/services/downloader";
import { imageSourceForUrl } from "@/utils/reader/imageHeaders";
import { providerLabel } from "@/utils/providerLabel";


/** Maps downloaded-manga rows into the same card shape the grid renders. */
async function listDownloadCards(
  search: string,
  provider: string,
): Promise<LibraryCard[]> {
  const entries = await listDownloadedManga(provider || undefined);
  const term = search.trim().toLowerCase();
  return entries
    .filter((entry) => !term || entry.title.toLowerCase().includes(term))
    .map((entry) => ({
      id: entry.mangaId,
      provider: entry.provider,
      providerMangaId: entry.providerMangaId,
      title: entry.title,
      thumbnailUrl: entry.thumbnailPath ?? entry.thumbnailUrl,
      addedAt: entry.updatedAt,
      totalChapters: entry.chapterCount,
      unreadChapters: 0,
    }));
}

export default function LibraryScreen() {
  const [libraries, setLibraries] = useState<LibrarySummary[]>([]);
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(
    null,
  );
  const [cards, setCards] = useState<LibraryCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<LibrarySort>("addedDesc");
  const [providerFilter, setProviderFilter] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newLibraryName, setNewLibraryName] = useState("");
  const [chipMenuLibrary, setChipMenuLibrary] = useState<LibrarySummary | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = useState<LibrarySummary | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(
    () => new Set(),
  );

  const load = useCallback(
    async (opts?: { quiet?: boolean }) => {
      if (!opts?.quiet) setLoading(true);
      setError(null);
      try {
        const nextLibraries = await listLibraries();
        setLibraries(nextLibraries);
        const libraryId = selectedLibraryId ?? nextLibraries[0]?.id;
        if (!libraryId) {
          setCards([]);
          return;
        }
        setSelectedLibraryId(libraryId);
        if (libraryId === DOWNLOADS_LIBRARY_ID) {
          setCards(await listDownloadCards(search, providerFilter));
        } else {
          setCards(
            await listLibraryCards(libraryId, {
              search: search.trim() || undefined,
              sort,
              provider: providerFilter || undefined,
            }),
          );
        }
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load library.",
        );
      } finally {
        setLoading(false);
      }
    },
    [providerFilter, search, selectedLibraryId, sort],
  );

  const loadRef = useRef(load);
  loadRef.current = load;

  const updateLibrary = useCallback(async () => {
    if (!selectedLibraryId) return;
    setSyncing(true);
    setError(null);
    try {
      await syncLibrary(selectedLibraryId);
      await loadRef.current({ quiet: true });
    } catch (syncError) {
      setError(
        syncError instanceof Error ? syncError.message : "Update failed.",
      );
    } finally {
      setSyncing(false);
    }
  }, [selectedLibraryId]);

  useFocusEffect(
    useCallback(() => {
      void load({ quiet: true });
    }, [load]),
  );

  useFocusEffect(
    useCallback(() => {
      void updateLibrary();
    }, [updateLibrary]),
  );

  const refresh = async () => {
    setRefreshing(true);
    try {
      await load({ quiet: true });
    } finally {
      setRefreshing(false);
    }
  };

  const addLibrary = async () => {
    try {
      const id = await createLibrary(newLibraryName);
      setNewLibraryName("");
      setCreateOpen(false);
      setSelectedLibraryId(id);
      await load({ quiet: true });
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Could not create library.",
      );
    }
  };

  const openChipMenu = (library: LibrarySummary) => {
    if (isSystemLibrary(library.id)) return;
    setChipMenuLibrary(library);
  };

  const confirmDeleteLibrary = async () => {
    const target = deleteTarget;
    setDeleteTarget(null);
    if (!target) return;
    try {
      await deleteLibrary(target.id);
      if (selectedLibraryId === target.id) setSelectedLibraryId(null);
      await load({ quiet: true });
    } catch (removeError) {
      setError(
        removeError instanceof Error
          ? removeError.message
          : "Could not delete library.",
      );
    }
  };

  const toggleBulk = (id: string) => {
    setBulkSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runBulkDelete = async () => {
    const ids = Array.from(bulkSelected);
    setBulkOpen(false);
    setBulkSelected(new Set());
    if (ids.length === 0) return;
    try {
      for (const id of ids) await deleteLibrary(id);
      if (selectedLibraryId && ids.includes(selectedLibraryId)) {
        setSelectedLibraryId(null);
      }
      await load({ quiet: true });
    } catch (removeError) {
      setError(
        removeError instanceof Error
          ? removeError.message
          : "Could not delete libraries.",
      );
    }
  };

  const hasActiveFilters = providerFilter !== "";

  const openCard = (card: LibraryCard) => {
    if (selectedLibraryId === DOWNLOADS_LIBRARY_ID) {
      // The Downloads library opens the same offline viewer as a normal
      // library card, restricted to the chapters stored on the device.
      openMangaInfo({
        provider: card.provider,
        id: card.providerMangaId,
        thumbnailUrl: card.thumbnailUrl ?? null,
        downloadsOnly: true,
      });
      return;
    }
    openMangaInfo({
      provider: card.provider,
      id: card.providerMangaId,
      thumbnailUrl: card.thumbnailUrl ?? null,
    });
  };

  const filterActive = hasActiveFilters || sort !== "addedDesc";
  const selectedLibrary = libraries.find((lib) => lib.id === selectedLibraryId);

  return (
    <View style={styles.screen}>
      <AppHeader
        title="Library"
        accent={colors.accent}
        searchPlaceholder="Search library"
        query={search}
        onQueryChange={setSearch}
        onSearchSubmit={() => void load({ quiet: true })}
        actions={[
          {
            key: "filter",
            icon: SlidersHorizontal,
            active: filterActive,
            onPress: () => setFilterOpen(true),
          },
        ]}
        menuTitle="Library"
        menuActions={[
          {
            key: "update",
            label: "Update library",
            icon: RefreshCw,
            onPress: () => void updateLibrary(),
          },
          {
            key: "new",
            label: "Create library",
            icon: CirclePlus,
            onPress: () => setCreateOpen(true),
          },
          {
            key: "delete-libraries",
            label: "Delete libraries",
            icon: Trash2,
            destructive: true,
            onPress: () => {
              setBulkSelected(new Set());
              setBulkOpen(true);
            },
          },
          ...(selectedLibrary && !isSystemLibrary(selectedLibrary.id)
            ? [
                {
                  key: "delete",
                  label: `Delete “${selectedLibrary.name}”`,
                  icon: Trash2,
                  destructive: true,
                  onPress: () => setDeleteTarget(selectedLibrary),
                } as const,
              ]
            : []),
        ]}
      />

      {syncing ? (
        <View style={styles.syncBanner}>
          <ActivityIndicator color={colors.accent} size="small" />
          <Text style={styles.syncText}>Updating library…</Text>
        </View>
      ) : null}
      
      <View style={styles.libraryRow}>
        <FlatList
          horizontal
          data={libraries}
          keyExtractor={(item) => item.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.libraryChips}
          renderItem={({ item }) => {
            const active = selectedLibraryId === item.id;
            return (
              <Pressable
                onPress={() => setSelectedLibraryId(item.id)}
                onLongPress={() => openChipMenu(item)}
                delayLongPress={320}
                style={({ pressed }) => [
                  styles.libraryChip,
                  active && styles.libraryChipActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  style={[
                    styles.libraryChipText,
                    active && styles.libraryChipTextActive,
                  ]}
                >
                  {item.name}
                </Text>
              </Pressable>
            );
          }}
        />
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <FlatList
        data={cards}
        numColumns={2}
        key="library-grid"
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
        contentContainerStyle={styles.gridContent}
        columnWrapperStyle={styles.gridColumn}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => openCard(item)}
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
          >
            <View style={styles.coverWrap}>
              {item.thumbnailUrl ? (
                <Image
                  source={imageSourceForUrl(item.thumbnailUrl)}
                  style={styles.cover}
                />
              ) : null}
              {item.unreadChapters > 0 ? (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadBadgeText}>
                    {item.unreadChapters}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text numberOfLines={2} style={styles.cardTitle}>
              {item.title}
            </Text>
            <Text numberOfLines={1} style={styles.cardMeta}>
              {providerLabel(item.provider)} ·{" "}
              {item.unreadChapters} unread of {item.totalChapters}
            </Text>
          </Pressable>
        )}
        ListEmptyComponent={
          loading ? (
            <View style={styles.emptyWrap}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyTitle}>
                {search.trim()
                  ? "No results match your search."
                  : "This library is empty."}
              </Text>
              <Text style={styles.emptyHint}>
                Open a manga from Browse and tap the heart to add it here.
              </Text>
            </View>
          )
        }
      />

      <LibraryFilterSheet
        visible={filterOpen}
        sort={sort}
        provider={providerFilter}
        onClose={() => setFilterOpen(false)}
        onSort={(next) => {
          setSort(next);
          setFilterOpen(false);
        }}
        onProvider={(next) => {
          setProviderFilter(next);
          setFilterOpen(false);
        }}
      />

      <Modal
        visible={createOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCreateOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Create library</Text>
            <TextInput
              autoFocus
              value={newLibraryName}
              onChangeText={setNewLibraryName}
              placeholder="Library name"
              placeholderTextColor={colors.textFaint}
              onSubmitEditing={() => void addLibrary()}
              style={styles.input}
            />
            <View style={styles.modalActions}>
              <Pressable onPress={() => setCreateOpen(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable onPress={() => void addLibrary()}>
                <Text style={styles.confirmText}>Create</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <MenuSheet
        visible={chipMenuLibrary !== null}
        title={chipMenuLibrary?.name}
        options={[
          {
            key: "delete",
            label: "Delete library",
            icon: Trash2,
            destructive: true,
            onPress: () => {
              if (chipMenuLibrary) setDeleteTarget(chipMenuLibrary);
            },
          },
        ]}
        onClose={() => setChipMenuLibrary(null)}
      />

      <ConfirmDialog
        visible={deleteTarget !== null}
        title="Delete library?"
        message={
          deleteTarget
            ? `"${deleteTarget.name}" is removed. Manga saved in it stay in your other libraries and in Downloads.`
            : undefined
        }
        confirmLabel="Delete"
        destructive
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void confirmDeleteLibrary()}
      />

      <Modal
        visible={bulkOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setBulkOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Delete libraries</Text>
            <Text style={styles.modalHint}>
              Choose the libraries to remove. Default and Downloads cannot be
              deleted.
            </Text>
            <ScrollView style={styles.bulkList} bounces={false}>
              {libraries
                .filter((library) => !isSystemLibrary(library.id))
                .map((library) => {
                  const checked = bulkSelected.has(library.id);
                  return (
                    <Pressable
                      key={library.id}
                      onPress={() => toggleBulk(library.id)}
                      style={({ pressed }) => [
                        styles.bulkRow,
                        pressed && styles.pressed,
                      ]}
                    >
                      <View
                        style={[styles.checkbox, checked && styles.checkboxOn]}
                      >
                        {checked ? (
                          <Check
                            color={colors.onAccent}
                            size={13}
                            strokeWidth={3}
                          />
                        ) : null}
                      </View>
                      <Text numberOfLines={1} style={styles.bulkLabel}>
                        {library.name}
                      </Text>
                    </Pressable>
                  );
                })}
              {libraries.filter((library) => !isSystemLibrary(library.id))
                .length === 0 ? (
                <Text style={styles.modalHint}>You have no custom libraries.</Text>
              ) : null}
            </ScrollView>
            <View style={styles.modalActions}>
              <Pressable onPress={() => setBulkOpen(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => void runBulkDelete()}
                disabled={bulkSelected.size === 0}
              >
                <Text
                  style={[
                    styles.confirmText,
                    bulkSelected.size === 0 && styles.confirmTextDisabled,
                  ]}
                >
                  Delete {bulkSelected.size > 0 ? bulkSelected.size : ""}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <OnboardingOverlay />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg, paddingTop: 44 },
  syncBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: colors.accentSoft,
  },
  syncText: { color: colors.accent, fontSize: 13, fontWeight: "700" },
  lastSyncBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 6,
  },
  lastSyncText: { color: colors.textFaint, fontSize: 11 },
  libraryRow: { marginTop: 10 },
  libraryChips: {
    gap: 10,
    paddingHorizontal: 18,
  },
  libraryChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  libraryChipActive: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  libraryChipText: { color: colors.textMuted, fontSize: 15, fontWeight: "600" },
  libraryChipTextActive: { color: colors.accent, fontWeight: "700" },
  pressed: { opacity: 0.7 },
  errorText: { color: colors.danger, paddingHorizontal: 18, paddingTop: 10 },
  gridContent: { paddingHorizontal: 14, paddingTop: 16, paddingBottom: 130 },
  gridColumn: { gap: 14 },
  card: { flex: 1, marginBottom: 20 },
  coverWrap: {
    aspectRatio: 0.7,
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: colors.surfaceHigh,
  },
  cover: { width: "100%", height: "100%" },
  unreadBadge: {
    position: "absolute",
    top: 8,
    left: 8,
    minWidth: 24,
    height: 24,
    paddingHorizontal: 6,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
  },
  unreadBadgeText: {
    color: colors.onAccent,
    fontSize: 12,
    fontWeight: "800",
  },
  cardTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 19,
    marginTop: 8,
  },
  cardMeta: { color: colors.textFaint, fontSize: 11.5, marginTop: 4 },
  emptyWrap: { alignItems: "center", paddingTop: 80, paddingHorizontal: 32 },
  emptyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  emptyHint: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 19,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: colors.scrim,
  },
  modalCard: {
    backgroundColor: colors.surfaceHigh,
    borderRadius: radius.lg,
    padding: 18,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
  },
  input: {
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginTop: 14,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 18,
    marginTop: 18,
  },
  cancelText: { color: colors.textMuted, fontWeight: "600" },
  confirmText: { color: colors.accent, fontWeight: "700" },
  confirmTextDisabled: { opacity: 0.4 },
  modalHint: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
  },
  bulkList: { marginTop: 12, maxHeight: 320 },
  bulkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 11,
  },
  bulkLabel: { color: colors.text, fontSize: 15, fontWeight: "600", flex: 1 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
});
