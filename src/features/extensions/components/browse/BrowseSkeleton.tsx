import React from "react";
import { StyleSheet, View } from "react-native";

import { SkeletonBlock, SkeletonPulse } from "@shared/ui";
import { colors } from "@shared/theme";

/** First-load placeholder for installed source and extension rows. */
export default function BrowseSkeleton() {
  return (
    <SkeletonPulse style={styles.list}>
      {Array.from({ length: 6 }, (_, index) => (
        <View key={index} style={styles.row}>
          <SkeletonBlock style={styles.icon} />
          <View style={styles.body}>
            <SkeletonBlock style={styles.title} />
            <SkeletonBlock style={styles.meta} />
            <SkeletonBlock style={styles.preview} />
          </View>
          <SkeletonBlock style={styles.action} />
        </View>
      ))}
    </SkeletonPulse>
  );
}

const styles = StyleSheet.create({
  list: { padding: 14, paddingBottom: 110, gap: 10 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  icon: { width: 44, height: 44, borderRadius: 10, backgroundColor: colors.accentSoft },
  body: { flex: 1, gap: 7 },
  title: { width: "64%", height: 12 },
  meta: { width: "46%", height: 10 },
  preview: { width: "82%", height: 9, backgroundColor: colors.border },
  action: { width: 72, height: 30, borderRadius: 999, backgroundColor: colors.border },
});