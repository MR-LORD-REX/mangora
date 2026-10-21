import { Bookmark, Check, Heart } from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import { Alert, Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radius } from "@/constants/theme";
import {
    upsertManga,
    type ProviderId,
} from "@/services/db/repositories/catalogRepository";
import {
    addMangaToLibrary,
    getMangaLibraryIds,
    listLibraries,
    removeMangaIdentitiesFromLibrary,
    type LibrarySummary,
} from "@/services/db/repositories/libraryRepository";

interface AddToLibraryButtonProps {
  provider: ProviderId;
  providerMangaId: string;
  title: string;
  thumbnailUrl?: string | null;
  description?: string | null;
  /** Alternate ids the same manga may be stored under (encoded urls, etc.). */
  providerMangaAliases?: string[];
  /** "button" renders a full width CTA, "icon" renders a heart icon button. */
  variant?: "button" | "icon";
  /** Icon used by the compact variant. */
  iconVariant?: "heart" | "bookmark";
  accent?: string;
  onAdded?: (added: boolean) => void;
}

function buildIdentityIds(providerMangaId: string, aliasesKey: string): string[] {
  const aliases = aliasesKey ? aliasesKey.split("\u0000") : [];
  return [providerMangaId, ...aliases].filter((id): id is string => Boolean(id));
}

export default function AddToLibraryButton({
  provider,
  providerMangaId,
  title,
  thumbnailUrl,
  description,
  providerMangaAliases = [],
  variant = "button",
  iconVariant = "heart",
  accent = colors.accent,
  onAdded,
}: AddToLibraryButtonProps) {
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
    () => buildIdentityIds(providerMangaId, providerMangaAliasesKey),
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
        const mangaId = await upsertManga({
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
        void mangaId;
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

  if (variant === "icon") {
    return (
      <>
        <Pressable
          onPress={() => {
            setMessage(null);
            setOpen(true);
          }}
          disabled={checking}
          hitSlop={10}
          style={({ pressed }) => [
            styles.iconButton,
            added && styles.iconButtonAdded,
            pressed && styles.iconPressed,
          ]}
        >
          {iconVariant === "bookmark" ? (
            <Bookmark
              size={20}
              color={added ? colors.accent : "#fff"}
              fill={added ? colors.accent : "transparent"}
            />
          ) : (
            <Heart
              size={24}
              color={added ? colors.heart : colors.textMuted}
              fill={added ? colors.heart : "transparent"}
            />
          )}
        </Pressable>
        {message ? <Text style={styles.iconMessage}>{message}</Text> : null}
        <AddLibraryModal
          open={open}
          libraries={libraries}
          selectedLibraryIds={selectedLibraryIds}
          pendingRemovalLibraryId={pendingRemovalLibraryId}
          saving={saving}
          onClose={() => setOpen(false)}
          onToggle={toggleLibrary}
          onConfirm={() => void confirmSelection()}
        />
      </>
    );
  }

  return (
    <>
      <Pressable
        onPress={() => {
          setMessage(null);
          setOpen(true);
        }}
        style={({ pressed }) => [
          styles.ctaButton,
          { backgroundColor: accent },
          pressed && styles.iconPressed,
        ]}
      >
        <Heart size={18} color={colors.onAccent} />
        <Text style={styles.ctaText}>Add to library</Text>
      </Pressable>
      {message ? <Text style={styles.ctaMessage}>{message}</Text> : null}
      <AddLibraryModal
        open={open}
        libraries={libraries}
        selectedLibraryIds={selectedLibraryIds}
        pendingRemovalLibraryId={pendingRemovalLibraryId}
        saving={saving}
        onClose={() => setOpen(false)}
        onToggle={toggleLibrary}
        onConfirm={() => void confirmSelection()}
      />
    </>
  );
}

function AddLibraryModal({
  open,
  libraries,
  onClose,
  selectedLibraryIds,
  pendingRemovalLibraryId,
  saving,
  onToggle,
  onConfirm,
}: {
  open: boolean;
  libraries: LibrarySummary[];
  onClose: () => void;
  selectedLibraryIds: Set<string>;
  pendingRemovalLibraryId: string | null;
  saving: boolean;
  onToggle: (library: LibrarySummary) => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Choose libraries</Text>
          {libraries.map((library) => (
            <Pressable
              key={library.id}
              onPress={() => onToggle(library)}
              style={({ pressed }) => [
                styles.libraryRow,
                pressed && styles.iconPressed,
              ]}
            >
              <View
                style={[
                  styles.checkbox,
                  selectedLibraryIds.has(library.id) && styles.checkboxSelected,
                  pendingRemovalLibraryId === library.id &&
                    styles.checkboxPending,
                ]}
              >
                {selectedLibraryIds.has(library.id) ? (
                  <Check size={16} color={colors.onAccent} />
                ) : null}
              </View>
              <Text style={styles.libraryName}>{library.name}</Text>
            </Pressable>
          ))}
          {!libraries.length ? (
            <Text style={styles.emptyLibraries}>No libraries yet.</Text>
          ) : null}
          <View style={styles.modalActions}>
            <Pressable
              disabled={saving}
              onPress={onClose}
              style={styles.cancelRow}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              disabled={saving}
              onPress={onConfirm}
              style={styles.confirmButton}
            >
              <Text style={styles.confirmText}>
                {saving ? "Saving..." : "Confirm"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  iconButton: {
    width: 30,
    height: 30,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceHigh,
  },
  iconButtonAdded: {
    borderColor: colors.heart,
    backgroundColor: colors.heartSoft,
  },
  iconPressed: { opacity: 0.7 },
  iconMessage: { color: colors.success, fontSize: 12, marginTop: 6 },
  ctaButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  ctaText: { color: colors.onAccent, fontWeight: "700", fontSize: 15 },
  ctaMessage: { color: colors.success, marginTop: 8 },
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
    marginBottom: 6,
  },
  libraryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.textMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  checkboxPending: { opacity: 0.65 },
  libraryName: { color: colors.text, fontSize: 16 },
  emptyLibraries: { color: colors.textMuted, marginTop: 12 },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 18,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  cancelRow: { paddingVertical: 10 },
  cancelText: { color: colors.textMuted, fontWeight: "600" },
  confirmButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  confirmText: { color: colors.onAccent, fontWeight: "700" },
});
