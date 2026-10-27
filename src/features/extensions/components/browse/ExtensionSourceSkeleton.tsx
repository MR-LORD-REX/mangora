import React from "react";
import { StyleSheet, View } from "react-native";

import { SkeletonBlock, SkeletonPulse } from "@shared/ui";
import { colors } from "@shared/theme";

type CardLayout = "grid2" | "grid4" | "list";

/** First-load placeholder matching the selected source grid or list layout. */
export default function ExtensionSourceSkeleton({
  layout,
}: {
  layout: CardLayout;
}) {
  const columns = layout === "grid4" ? 4 : layout === "grid2" ? 2 : 1;
  const count = layout === "list" ? 6 : layout === "grid4" ? 8 : 6;

  return (
    <SkeletonPulse
      style={[styles.list, layout === "grid4" && styles.compactList]}
    >
      <View style={styles.grid}>
        {Array.from({ length: count }, (_, index) => (
          <View
            key={index}
            style={[
              styles.card,
              layout === "list" && styles.listCard,
              columns === 4 && styles.compactCard,
            ]}
          >
            <SkeletonBlock
              style={[
                styles.cover,
                layout === "list" && styles.listCover,
                layout === "grid4" && styles.compactCover,
              ]}
            />
            {layout === "list" ? (
              <View style={styles.listInfo}>
                <SkeletonBlock style={styles.listTitle} />
                <SkeletonBlock style={styles.listMeta} />
              </View>
            ) : (
              <>
                <SkeletonBlock style={styles.title} />
                {layout === "grid2" ? (
                  <SkeletonBlock style={styles.meta} />
                ) : null}
              </>
            )}
          </View>
        ))}
      </View>
    </SkeletonPulse>
  );
}

const styles = StyleSheet.create({
  list: { padding: 14, paddingBottom: 80 },
  compactList: { paddingHorizontal: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  card: { flexBasis: "47%", flexGrow: 1, marginBottom: 18 },
  compactCard: { flexBasis: "22%", marginBottom: 12 },
  listCard: {
    flexBasis: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    marginBottom: 10,
    padding: 10,
    borderRadius: 10,
    backgroundColor: colors.surface,
  },
  cover: { width: "100%", aspectRatio: 0.7, borderRadius: 10 },
  compactCover: { borderRadius: 6 },
  listCover: { width: 58, height: 82, flexShrink: 0 },
  listInfo: { flex: 1, gap: 7 },
  listTitle: { width: "72%", height: 12 },
  listMeta: { width: "42%", height: 10, backgroundColor: colors.border },
  title: { width: "90%", height: 10, marginTop: 8 },
  meta: { width: "58%", height: 9, marginTop: 5, backgroundColor: colors.border },
});