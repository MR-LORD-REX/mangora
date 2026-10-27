import React from "react";
import { StyleSheet, View } from "react-native";

import { SkeletonBlock, SkeletonPulse } from "@shared/ui";
import { colors } from "@shared/theme";

/** First-load placeholder matching the manga hero and chapter list. */
export default function MangaDetailSkeleton() {
  return (
    <SkeletonPulse style={styles.content}>
      <View style={styles.hero}>
        <SkeletonBlock style={styles.cover} />
        <View style={styles.heroInfo}>
          <SkeletonBlock style={styles.title} />
          <SkeletonBlock style={styles.titleShort} />
          <SkeletonBlock style={styles.meta} />
          <SkeletonBlock style={styles.metaShort} />
          <View style={styles.chips}>
            <SkeletonBlock style={styles.chip} />
            <SkeletonBlock style={styles.chip} />
          </View>
          <SkeletonBlock style={styles.button} />
        </View>
      </View>
      <SkeletonBlock style={styles.description} />
      <SkeletonBlock style={styles.descriptionShort} />
      <View style={styles.chapterHeading}>
        <SkeletonBlock style={styles.heading} />
        <SkeletonBlock style={styles.headingAction} />
      </View>
      {Array.from({ length: 6 }, (_, index) => (
        <View key={index} style={styles.chapterRow}>
          <View style={styles.chapterText}>
            <SkeletonBlock style={styles.chapterTitle} />
            <SkeletonBlock style={styles.chapterMeta} />
          </View>
          <SkeletonBlock style={styles.chapterAction} />
        </View>
      ))}
    </SkeletonPulse>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, paddingBottom: 40 },
  hero: { flexDirection: "row", gap: 14, paddingHorizontal: 16, paddingTop: 14 },
  cover: { width: 128, height: 190, borderRadius: 10 },
  heroInfo: { flex: 1, paddingTop: 2, gap: 8 },
  title: { width: "92%", height: 17 },
  titleShort: { width: "64%", height: 13 },
  meta: { width: "78%", height: 10, marginTop: 4 },
  metaShort: { width: "52%", height: 10 },
  chips: { flexDirection: "row", gap: 6, height: 22 },
  chip: { width: 54, height: 22, borderRadius: 999, backgroundColor: colors.border },
  button: { width: "100%", height: 42, borderRadius: 999, marginTop: 6 },
  description: { height: 12, marginHorizontal: 16, marginTop: 24 },
  descriptionShort: { width: "68%", height: 12, marginHorizontal: 16, marginTop: 8 },
  chapterHeading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginHorizontal: 16,
    marginTop: 28,
    marginBottom: 16,
  },
  heading: { width: 128, height: 20 },
  headingAction: { width: 82, height: 28, borderRadius: 999, backgroundColor: colors.border },
  chapterRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingLeft: 12,
    paddingVertical: 12,
    borderLeftWidth: 2,
    borderLeftColor: colors.border,
  },
  chapterText: { flex: 1, gap: 7 },
  chapterTitle: { width: "72%", height: 13 },
  chapterMeta: { width: "38%", height: 9, backgroundColor: colors.border },
  chapterAction: { width: 24, height: 24, borderRadius: 999, backgroundColor: colors.border },
});