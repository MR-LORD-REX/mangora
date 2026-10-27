import React from "react";
import { StyleSheet, View } from "react-native";

import { SkeletonBlock, SkeletonPulse } from "@shared/ui";
import { colors } from "@shared/theme";

/** First-load placeholder for the downloaded-manga list. */
export default function DownloadsSkeleton() {
  return (
    <SkeletonPulse style={styles.list}>
      {Array.from({ length: 7 }, (_, index) => (
        <View key={index} style={styles.row}>
          <SkeletonBlock style={styles.thumb} />
          <View style={styles.info}>
            <SkeletonBlock style={styles.title} />
            <SkeletonBlock style={styles.meta} />
            <SkeletonBlock style={styles.date} />
          </View>
          <SkeletonBlock style={styles.chevron} />
        </View>
      ))}
    </SkeletonPulse>
  );
}

/** First-load placeholder for one manga's downloaded chapter rows. */
export function DownloadChaptersSkeleton() {
  return (
    <SkeletonPulse style={styles.list}>
      <View style={styles.head}>
        <SkeletonBlock style={styles.headCover} />
        <View style={styles.info}>
          <SkeletonBlock style={styles.headTitle} />
          <SkeletonBlock style={styles.meta} />
          <SkeletonBlock style={styles.deleteButton} />
        </View>
      </View>
      {Array.from({ length: 6 }, (_, index) => (
        <View key={index} style={styles.chapterRow}>
          <View style={styles.info}>
            <SkeletonBlock style={styles.title} />
            <SkeletonBlock style={styles.meta} />
            <SkeletonBlock style={styles.date} />
          </View>
          <SkeletonBlock style={styles.trash} />
        </View>
      ))}
    </SkeletonPulse>
  );
}

const styles = StyleSheet.create({
  list: { paddingBottom: 32 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  thumb: { width: 54, height: 76, borderRadius: 10, backgroundColor: colors.surfaceHigh },
  info: { flex: 1, gap: 7 },
  title: { width: "72%", height: 12 },
  meta: { width: "58%", height: 10 },
  date: { width: "42%", height: 9, backgroundColor: colors.border },
  chevron: { width: 16, height: 16, borderRadius: 999, backgroundColor: colors.border },
  head: {
    flexDirection: "row",
    gap: 14,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headCover: { width: 76, height: 108, borderRadius: 10 },
  headTitle: { width: "78%", height: 15 },
  deleteButton: { width: 92, height: 28, borderRadius: 999, marginTop: 4, backgroundColor: colors.border },
  chapterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  trash: { width: 18, height: 18, borderRadius: 999, backgroundColor: colors.dangerSoft },
});