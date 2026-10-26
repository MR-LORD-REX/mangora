import { Bookmark, Heart } from "lucide-react-native";
import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { colors, radius } from "@shared/theme";
import type { ProviderId } from "@core/catalog";
import { useAddToLibrary } from "../../hooks/useAddToLibrary";
import AddLibraryModal from "./AddLibraryModal";

export interface AddToLibraryButtonProps {
  provider: ProviderId;
  providerMangaId: string;
  title: string;
  thumbnailUrl?: string | null;
  description?: string | null;
  providerMangaAliases?: string[];
  variant?: "button" | "icon";
  iconVariant?: "heart" | "bookmark";
  accent?: string;
  onAdded?: (added: boolean) => void;
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
  const state = useAddToLibrary({
    provider,
    providerMangaId,
    title,
    thumbnailUrl,
    description,
    providerMangaAliases,
    variant,
    onAdded,
  });

  const modal = (
    <AddLibraryModal
      open={state.open}
      libraries={state.libraries}
      selectedLibraryIds={state.selectedLibraryIds}
      pendingRemovalLibraryId={state.pendingRemovalLibraryId}
      saving={state.saving}
      onClose={() => state.setOpen(false)}
      onToggle={state.toggleLibrary}
      onConfirm={() => void state.confirmSelection()}
    />
  );

  if (variant === "icon") {
    return (
      <>
        <Pressable
          onPress={state.openPicker}
          disabled={state.checking}
          hitSlop={10}
          style={({ pressed }) => [
            styles.iconButton,
            state.added && styles.iconButtonAdded,
            pressed && styles.pressed,
          ]}
        >
          {iconVariant === "bookmark" ? (
            <Bookmark
              size={20}
              color={state.added ? colors.accent : "#fff"}
              fill={state.added ? colors.accent : "transparent"}
            />
          ) : (
            <Heart
              size={24}
              color={state.added ? colors.heart : colors.textMuted}
              fill={state.added ? colors.heart : "transparent"}
            />
          )}
        </Pressable>
        {state.message ? (
          <Text style={styles.iconMessage}>{state.message}</Text>
        ) : null}
        {modal}
      </>
    );
  }

  return (
    <>
      <Pressable
        onPress={state.openPicker}
        style={({ pressed }) => [
          styles.ctaButton,
          { backgroundColor: accent },
          pressed && styles.pressed,
        ]}
      >
        <Heart size={18} color={colors.onAccent} />
        <Text style={styles.ctaText}>Add to library</Text>
      </Pressable>
      {state.message ? (
        <Text style={styles.ctaMessage}>{state.message}</Text>
      ) : null}
      {modal}
    </>
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
  pressed: { opacity: 0.7 },
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
});
