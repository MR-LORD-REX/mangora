import React from "react";
import { StyleSheet, View } from "react-native";

import { SkeletonBlock, SkeletonPulse } from "./Skeleton";

/** First-load placeholder for the history tab's dated reading rows. */
export default function HistorySkeleton() {
  return (
    <SkeletonPulse style={styles.list}>
      <SkeletonBlock style={styles.date} />
      {Array.from({ length: 6 }, (_, index) => (
        <View key={index} style={styles.row}>
          <SkeletonBlock style={styles.thumb} />
          <View style={styles.info}>
            <SkeletonBlock style={styles.title} />
            <SkeletonBlock style={styles.chapter} />
            <SkeletonBlock style={styles.dateLine} />
          </View>
          <SkeletonBlock style={styles.delete} />
        </View>
      ))}
    </SkeletonPulse>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 16, paddingTop: 18 },
  date: { width: 108, height: 15, marginLeft: 8, marginBottom: 14 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  thumb: { width: 54, height: 74, borderRadius: 6 },
  info: { flex: 1, gap: 7 },
  title: { width: "78%", height: 12 },
  chapter: { width: "54%", height: 10 },
  dateLine: { width: "38%", height: 9 },
  delete: { width: 36, height: 36, borderRadius: 999, marginRight: 2 },
});