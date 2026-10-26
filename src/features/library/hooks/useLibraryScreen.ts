import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";

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
import { listDownloadedManga } from "@features/downloads";
import { syncLibrary } from "../sync/librarySync";
import { downloadedMangaToLibraryCards } from "../domain/libraryCards";

/** Owns the library screen's data lifecycle and library membership actions. */
export function useLibraryScreen() {
  const [libraries, setLibraries] = useState<LibrarySummary[]>([]);
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(null);
  const [cards, setCards] = useState<LibraryCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<LibrarySort>("addedDesc");
  const [providerFilter, setProviderFilter] = useState("");
  const [chipMenuLibrary, setChipMenuLibrary] = useState<LibrarySummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LibrarySummary | null>(null);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(() => new Set());
  const syncingRef = useRef(false);

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
          const entries = await listDownloadedManga(providerFilter || undefined);
          setCards(downloadedMangaToLibraryCards(entries, search));
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
          loadError instanceof Error ? loadError.message : "Could not load library.",
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
    if (!selectedLibraryId || syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);
    setError(null);
    try {
      await syncLibrary(selectedLibraryId);
      await loadRef.current({ quiet: true });
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Update failed.");
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [selectedLibraryId]);

  useFocusEffect(
    useCallback(() => {
      void load({ quiet: true });
    }, [load]),
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load({ quiet: true });
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const addLibrary = useCallback(
    async (name: string) => {
      try {
        const id = await createLibrary(name);
        setSelectedLibraryId(id);
        await load({ quiet: true });
        return true;
      } catch (createError) {
        setError(
          createError instanceof Error
            ? createError.message
            : "Could not create library.",
        );
        return false;
      }
    },
    [load],
  );

  const openChipMenu = useCallback((library: LibrarySummary) => {
    if (isSystemLibrary(library.id)) return;
    setChipMenuLibrary(library);
  }, []);

  const confirmDeleteLibrary = useCallback(async () => {
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
  }, [deleteTarget, load, selectedLibraryId]);

  const toggleBulk = useCallback((id: string) => {
    setBulkSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const runBulkDelete = useCallback(async () => {
    const ids = Array.from(bulkSelected);
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
  }, [bulkSelected, load, selectedLibraryId]);

  const selectedLibrary = libraries.find(
    (library) => library.id === selectedLibraryId,
  );
  const deletableLibraries = libraries.filter(
    (library) => !isSystemLibrary(library.id),
  );

  return {
    libraries,
    selectedLibrary,
    selectedLibraryId,
    setSelectedLibraryId,
    cards,
    loading,
    refreshing,
    syncing,
    error,
    search,
    setSearch,
    sort,
    setSort,
    providerFilter,
    setProviderFilter,
    chipMenuLibrary,
    setChipMenuLibrary,
    deleteTarget,
    setDeleteTarget,
    bulkSelected,
    deletableLibraries,
    load,
    updateLibrary,
    refresh,
    addLibrary,
    openChipMenu,
    confirmDeleteLibrary,
    toggleBulk,
    runBulkDelete,
  };
}