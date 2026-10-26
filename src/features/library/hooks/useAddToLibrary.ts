import { useEffect, useMemo, useState } from "react";
import { Alert } from "react-native";

import type { ProviderId } from "@core/catalog";
import { upsertManga } from "@/services/db/repositories/catalogRepository";
import {
  addMangaToLibrary,
  getMangaLibraryIds,
  listLibraries,
  removeMangaIdentitiesFromLibrary,
  type LibrarySummary,
} from "@/services/db/repositories/libraryRepository";
import { libraryIdentityIds } from "../domain/libraryIdentity";

export interface UseAddToLibraryOptions {
  provider: ProviderId;
  providerMangaId: string;
  title: string;
  thumbnailUrl?: string | null;
  description?: string | null;
  providerMangaAliases?: string[];
  variant: "button" | "icon";
  onAdded?: (added: boolean) => void;
}

/** Owns membership lookup, picker state and confirmation for one manga. */
export function useAddToLibrary({
  provider,
  providerMangaId,
  title,
  thumbnailUrl,
  description,
  providerMangaAliases = [],
  variant,
  onAdded,
}: UseAddToLibraryOptions) {
  const [open, setOpen] = useState(false);
  const [libraries, setLibraries] = useState<LibrarySummary[]>([]);
  const [selectedLibraryIds, setSelectedLibraryIds] = useState<Set<string>>(
    new Set(),
  );
  const [originalLibraryIds, setOriginalLibraryIds] = useState<Set<string>>(
    new Set(),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [added, setAdded] = useState(false);
  const [checking, setChecking] = useState(variant === "icon");
  const [saving, setSaving] = useState(false);
  const [pendingRemovalLibraryId, setPendingRemovalLibraryId] = useState<
    string | null
  >(null);

  const providerMangaAliasesKey = providerMangaAliases.join("\u0000");
  const identityIds = useMemo(
    () =>
      libraryIdentityIds(
        providerMangaId,
        providerMangaAliasesKey
          ? providerMangaAliasesKey.split("\u0000")
          : [],
      ),
    [providerMangaAliasesKey, providerMangaId],
  );

  useEffect(() => {
    if (variant !== "icon") return;
    let cancelled = false;
    getMangaLibraryIds(provider, identityIds)
      .then((libraryIds) => {
        if (!cancelled) setAdded(libraryIds.size > 0);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [identityIds, provider, variant]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const loadLibraries = async () => {
      try {
        const nextLibraries = await listLibraries();
        await upsertManga({
          provider,
          providerMangaId,
          title,
          thumbnailUrl,
          description,
        });
        const current = await getMangaLibraryIds(provider, identityIds);
        if (cancelled) return;
        setLibraries(nextLibraries);
        setOriginalLibraryIds(current);
        setSelectedLibraryIds(new Set(current));
        setAdded(current.size > 0);
        setMessage(null);
      } catch {
        if (!cancelled) setMessage("Could not load libraries.");
      }
    };
    void loadLibraries();
    return () => {
      cancelled = true;
    };
  }, [
    description,
    identityIds,
    open,
    provider,
    providerMangaId,
    thumbnailUrl,
    title,
  ]);

  const openPicker = () => {
    setMessage(null);
    setOpen(true);
  };

  const toggleLibrary = (library: LibrarySummary) => {
    if (selectedLibraryIds.has(library.id)) {
      setPendingRemovalLibraryId(library.id);
      Alert.alert(
        "Remove from library",
        `Remove this item from ${library.name}?`,
        [
          {
            text: "Cancel",
            style: "cancel",
            onPress: () => setPendingRemovalLibraryId(null),
          },
          {
            text: "Remove",
            style: "destructive",
            onPress: () => {
              setPendingRemovalLibraryId(null);
              setSelectedLibraryIds((current) => {
                const next = new Set(current);
                next.delete(library.id);
                return next;
              });
            },
          },
        ],
      );
      return;
    }
    setPendingRemovalLibraryId(null);
    setSelectedLibraryIds((current) => new Set(current).add(library.id));
  };

  const confirmSelection = async () => {
    setSaving(true);
    try {
      const mangaId = await upsertManga({
        provider,
        providerMangaId,
        title,
        thumbnailUrl,
        description,
      });
      for (const library of libraries) {
        if (selectedLibraryIds.has(library.id)) {
          await addMangaToLibrary(library.id, mangaId);
        } else if (originalLibraryIds.has(library.id)) {
          await removeMangaIdentitiesFromLibrary(
            library.id,
            provider,
            identityIds,
          );
        }
      }
      setOriginalLibraryIds(new Set(selectedLibraryIds));
      setAdded(selectedLibraryIds.size > 0);
      setMessage("Library selection saved");
      setOpen(false);
      onAdded?.(selectedLibraryIds.size > 0);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not save library selection.",
      );
    } finally {
      setSaving(false);
    }
  };

  return {
    open,
    setOpen,
    libraries,
    selectedLibraryIds,
    pendingRemovalLibraryId,
    message,
    added,
    checking,
    saving,
    openPicker,
    toggleLibrary,
    confirmSelection,
  };
}
