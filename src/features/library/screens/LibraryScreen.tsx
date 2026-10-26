import {
  CirclePlus,
  RefreshCw,
  SlidersHorizontal,
  Trash2,
} from "lucide-react-native";
import React, { useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";

import AppHeader from "@shared/ui/layout/AppHeader";
import { ConfirmDialog } from "@shared/ui/overlays";
import MenuSheet from "@shared/ui/overlays/MenuSheet";
import OnboardingOverlay from "@/components/onboarding/OnboardingOverlay";
import { colors, radius } from "@shared/theme";
import { DOWNLOADS_LIBRARY_ID } from "@/services/db/bootstrap";
import { isSystemLibrary, type LibraryCard as LibraryCardRow } from "@/services/db/repositories/libraryRepository";
import LibraryCard from "../components/cards/LibraryCard";
import {
  BulkDeleteLibrariesDialog,
  CreateLibraryDialog,
} from "../components/membership/LibraryDialogs";
import LibraryFilterSheet from "../components/filters/LibraryFilterSheet";
import { hasActiveLibraryFilters } from "../domain/libraryCards";
import { useLibraryScreen } from "../hooks/useLibraryScreen";

export interface LibraryScreenProps {
  onOpenManga: (target: {
    provider: string;
    id: string;
    thumbnailUrl?: string | null;
    downloadsOnly?: boolean;
  }) => void;
}

/** Library grid, membership controls and source filters. */
export default function LibraryScreen({ onOpenManga }: LibraryScreenProps) {
  const state = useLibraryScreen();
  const [filterOpen, setFilterOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newLibraryName, setNewLibraryName] = useState("");
  const [bulkOpen, setBulkOpen] = useState(false);

  const closeChipMenu = () => state.setChipMenuLibrary(null);

  const openCard = (card: LibraryCardRow) => {
    onOpenManga({
      provider: card.provider,
      id: card.providerMangaId,
      thumbnailUrl: card.thumbnailUrl ?? null,
      ...(state.selectedLibraryId === DOWNLOADS_LIBRARY_ID
        ? { downloadsOnly: true }
        : {}),
    });
  };

  const createLibrary = async () => {
    const name = newLibraryName;
    setNewLibraryName("");
    setCreateOpen(false);
    await state.addLibrary(name);
  };

  const filterActive = hasActiveLibraryFilters(
    state.providerFilter,
    state.sort,
  );

  return (
    <View style={styles.screen}>
      <AppHeader
        title="Library"
        accent={colors.accent}
        searchPlaceholder="Search library"
        query={state.search}
        onQueryChange={state.setSearch}
        onSearchSubmit={() => void state.load({ quiet: true })}
        actions={[
          {
            key: "update",
            label: "Update library",
            icon: RefreshCw,
            active: state.syncing,
            onPress: () => void state.updateLibrary(),
          },
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
            onPress: () => setBulkOpen(true),
          },
          ...(state.selectedLibrary && !isSystemLibrary(state.selectedLibrary.id)
            ? [
                {
                  key: "delete",
                  label: `Delete “${state.selectedLibrary.name}”`,
                  icon: Trash2,
                  destructive: true,
                  onPress: () => state.setDeleteTarget(state.selectedLibrary ?? null),
                } as const,
              ]
            : []),
        ]}
      />

      {state.syncing ? (
        <View style={styles.syncBanner}>
          <ActivityIndicator color={colors.accent} size="small" />
          <Text style={styles.syncText}>Updating library...</Text>
        </View>
      ) : null}

      <View style={styles.libraryRow}>
        <FlatList
          horizontal
          data={state.libraries}
          keyExtractor={(item) => item.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.libraryChips}
          renderItem={({ item }) => {
            const active = state.selectedLibraryId === item.id;
            return (
              <Pressable
                onPress={() => state.setSelectedLibraryId(item.id)}
                onLongPress={() => state.openChipMenu(item)}
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

      {state.error ? <Text style={styles.errorText}>{state.error}</Text> : null}

      <FlatList
        data={state.cards}
        numColumns={2}
        key="library-grid"
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={state.refreshing}
            onRefresh={() => void state.refresh()}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
        contentContainerStyle={styles.gridContent}
        columnWrapperStyle={styles.gridColumn}
        renderItem={({ item }) => <LibraryCard item={item} onOpen={openCard} />}
        ListEmptyComponent={
          state.loading ? (
            <View style={styles.emptyWrap}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : (
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyTitle}>
                {state.search.trim()
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
        sort={state.sort}
        provider={state.providerFilter}
        onClose={() => setFilterOpen(false)}
        onSort={(next) => {
          state.setSort(next);
          setFilterOpen(false);
        }}
        onProvider={(next) => {
          state.setProviderFilter(next);
          setFilterOpen(false);
        }}
      />

      <CreateLibraryDialog
        visible={createOpen}
        name={newLibraryName}
        onNameChange={setNewLibraryName}
        onCancel={() => setCreateOpen(false)}
        onCreate={() => void createLibrary()}
      />

      <MenuSheet
        visible={state.chipMenuLibrary !== null}
        title={state.chipMenuLibrary?.name}
        options={[
          {
            key: "delete",
            label: "Delete library",
            icon: Trash2,
            destructive: true,
            onPress: () => {
              if (state.chipMenuLibrary) state.setDeleteTarget(state.chipMenuLibrary);
              closeChipMenu();
            },
          },
        ]}
        onClose={closeChipMenu}
      />

      <ConfirmDialog
        visible={state.deleteTarget !== null}
        title="Delete library?"
        message={
          state.deleteTarget
            ? `"${state.deleteTarget.name}" is removed. Manga saved in it stay in your other libraries and in Downloads.`
            : undefined
        }
        confirmLabel="Delete"
        destructive
        onCancel={() => state.setDeleteTarget(null)}
        onConfirm={() => void state.confirmDeleteLibrary()}
      />

      <BulkDeleteLibrariesDialog
        visible={bulkOpen}
        libraries={state.deletableLibraries}
        selected={state.bulkSelected}
        onToggle={state.toggleBulk}
        onCancel={() => setBulkOpen(false)}
        onConfirm={() => {
          setBulkOpen(false);
          void state.runBulkDelete();
        }}
      />

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
  libraryRow: { marginTop: 10 },
  libraryChips: { gap: 10, paddingHorizontal: 18 },
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
});
