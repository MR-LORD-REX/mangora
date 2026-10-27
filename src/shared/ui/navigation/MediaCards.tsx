import React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radius, shadows } from "@shared/theme";
import { imageSourceForUrl } from "@shared/net/imageHeaders";

export interface MediaCardEntry {
  key: string;
  title: string;
  coverUrl?: string | null;
  coverHeaders?: Record<string, string>;
  meta?: string;
  accent?: string;
  onOpen: () => void;
}

function CoverImage({ entry, style }: { entry: MediaCardEntry; style: object }) {
  return entry.coverUrl ? (
    <Image
      source={entry.coverHeaders ? { uri: entry.coverUrl, headers: entry.coverHeaders } : imageSourceForUrl(entry.coverUrl)}
      style={style}
      resizeMode="cover"
    />
  ) : (
    <View style={[style, styles.placeholder]}>
      <Text style={styles.placeholderText}>No cover</Text>
    </View>
  );
}

/** Generic grid card for a remote media cover and title. */
export function MediaGridCard({ entry, compact = false }: { entry: MediaCardEntry; compact?: boolean }) {
  return (
    <Pressable
      onPress={entry.onOpen}
      accessibilityRole="button"
      accessibilityLabel={entry.title}
      style={({ pressed }) => [styles.gridCard, compact && styles.gridCardCompact, pressed && styles.pressed]}
    >
      <View style={styles.coverWrap}>
        <CoverImage entry={entry} style={[styles.gridCover, compact && styles.gridCoverCompact]} />
      </View>
      <Text numberOfLines={2} style={[styles.gridTitle, compact && styles.gridTitleCompact]}>
        {entry.title}
      </Text>
    </Pressable>
  );
}

/** Generic compact media row with a thumbnail and optional metadata. */
export function MediaListRow({ entry }: { entry: MediaCardEntry }) {
  const accent = entry.accent ?? colors.accent;
  return (
    <Pressable
      onPress={entry.onOpen}
      accessibilityRole="button"
      accessibilityLabel={entry.title}
      style={({ pressed }) => [styles.listRow, pressed && styles.pressed]}
    >
      <CoverImage entry={entry} style={styles.listCover} />
      <View style={styles.listInfo}>
        <Text numberOfLines={3} style={styles.listTitle}>{entry.title}</Text>
        {entry.meta ? <Text numberOfLines={1} style={styles.listMeta}>{entry.meta}</Text> : null}
      </View>
      <View style={[styles.listArrow, { backgroundColor: accent }]}>
        <Text style={styles.listArrowText}>›</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  gridCard: { flex: 1, marginBottom: 18 },
  gridCardCompact: { marginBottom: 12 },
  coverWrap: { aspectRatio: 0.7, borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.surfaceHigh, ...shadows.card },
  gridCover: { width: "100%", height: "100%" },
  gridCoverCompact: { borderRadius: radius.sm },
  gridTitle: { color: colors.text, fontSize: 13, fontWeight: "600", lineHeight: 18, marginTop: 8 },
  gridTitleCompact: { fontSize: 10, lineHeight: 13, marginTop: 5 },
  placeholder: { backgroundColor: colors.surfaceHigh, alignItems: "center", justifyContent: "center" },
  placeholderText: { color: colors.textFaint, fontSize: 12 },
  pressed: { opacity: 0.75 },
  listRow: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface, borderRadius: radius.md, padding: 10, gap: 14, marginBottom: 10 },
  listCover: { width: 58, height: 82, borderRadius: radius.sm, backgroundColor: colors.surfaceHigh },
  listInfo: { flex: 1 },
  listTitle: { color: colors.text, fontSize: 15, fontWeight: "600", lineHeight: 20 },
  listMeta: { color: colors.textFaint, fontSize: 12, marginTop: 6 },
  listArrow: { width: 26, height: 26, borderRadius: radius.full, alignItems: "center", justifyContent: "center" },
  listArrowText: { color: colors.onAccent, fontSize: 18, lineHeight: 20, fontWeight: "800", marginTop: -2 },
});
