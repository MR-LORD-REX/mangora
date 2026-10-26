import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import type { LibraryCard as LibraryCardRow } from "@/services/db/repositories/libraryRepository";
import { colors, radius } from "@shared/theme";
import { imageSourceForUrl } from "@/utils/reader/imageHeaders";
import { providerLabel } from "@/utils/providerLabel";

interface LibraryCardProps {
  item: LibraryCardRow;
  onOpen: (card: LibraryCardRow) => void;
}

/** Grid card for one manga in a library. */
export default function LibraryCard({ item, onOpen }: LibraryCardProps) {
  return (
    <Pressable
      onPress={() => onOpen(item)}
      accessibilityRole="button"
      accessibilityLabel={item.title}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.coverWrap}>
        {item.thumbnailUrl ? (
          <Image source={imageSourceForUrl(item.thumbnailUrl)} style={styles.cover} />
        ) : null}
        {item.unreadChapters > 0 ? (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadBadgeText}>{item.unreadChapters}</Text>
          </View>
        ) : null}
      </View>
      <Text numberOfLines={2} style={styles.title}>
        {item.title}
      </Text>
      <Text numberOfLines={1} style={styles.meta}>
        {providerLabel(item.provider)} · {item.unreadChapters} unread of {item.totalChapters}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
  unreadBadgeText: { color: colors.onAccent, fontSize: 12, fontWeight: "800" },
  title: {
    color: colors.text,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 19,
    marginTop: 8,
  },
  meta: { color: colors.textFaint, fontSize: 11.5, marginTop: 4 },
  pressed: { opacity: 0.7 },
});