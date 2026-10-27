import React from "react";
import { StyleSheet, View } from "react-native";

import { SkeletonBlock, SkeletonPulse } from "@shared/ui";
import { colors } from "@shared/theme";

const PLACEHOLDER_CARDS = 6;

/** First-load placeholder matching the two-column library grid. */
export default function LibrarySkeleton() {
  return (
    <SkeletonPulse style={styles.wrap}>
      <View style={styles.grid}>
        {Array.from({ length: PLACEHOLDER_CARDS }, (_, index) => (
          <View key={index} style={styles.card}>
            <SkeletonBlock style={styles.cover} />
            <SkeletonBlock style={styles.title} />
            <SkeletonBlock style={styles.titleShort} />
            <SkeletonBlock style={styles.meta} />
          </View>
        ))}
      </View>
    </SkeletonPulse>
  );
}

const styles = StyleSheet.create({
  wrap: {},
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  card: { width: "47.7%", marginBottom: 20 },
  cover: { width: "100%", aspectRatio: 0.7, borderRadius: 10 },
  title: { width: "88%", height: 12, marginTop: 10 },
  titleShort: { width: "62%", height: 12, marginTop: 6 },
  meta: { width: "76%", height: 9, marginTop: 8, backgroundColor: colors.border },
});