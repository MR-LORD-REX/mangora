import { ChevronRight } from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useAppMotion } from "@shared/motion";
import { motion } from "@shared/motion/tokens";
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

function CoverImage({
  entry,
  style,
  imageStyle,
}: {
  entry: MediaCardEntry;
  style: object;
  imageStyle?: object;
}) {
  const { reduceMotion } = useAppMotion();
  const opacity = useRef(new Animated.Value(0)).current;
  const [loaded, setLoaded] = useState(false);
  const url = entry.coverUrl ?? null;

  useEffect(() => {
    opacity.stopAnimation();
    setLoaded(false);
    opacity.setValue(0);
  }, [opacity, url]);

  const onLoad = () => {
    setLoaded(true);
    if (reduceMotion) {
      opacity.setValue(1);
      return;
    }
    Animated.timing(opacity, {
      toValue: 1,
      duration: motion.durations.fade,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  };

  if (!url) {
    return (
      <View
        accessibilityLabel={`${entry.title}, no cover`}
        style={[style, styles.placeholder]}
      >
        <Text style={styles.placeholderText}>No cover</Text>
      </View>
    );
  }

  return (
    <View style={[style, styles.coverSurface]}>
      <Animated.Image
        accessible={false}
        source={
          entry.coverHeaders
            ? { uri: url, headers: entry.coverHeaders }
            : imageSourceForUrl(url)
        }
        onLoad={onLoad}
        onError={() => {
          opacity.stopAnimation();
          opacity.setValue(0);
          setLoaded(false);
        }}
        resizeMode="cover"
        style={[
          styles.coverImage,
          imageStyle,
          { opacity },
        ]}
      />
      {!loaded ? <View pointerEvents="none" style={styles.coverShade} /> : null}
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
        <CoverImage
          entry={entry}
          style={styles.gridCoverBox}
          imageStyle={compact ? styles.gridCoverCompact : undefined}
        />
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
        <ChevronRight color={colors.onAccent} size={18} strokeWidth={2.6} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  gridCard: { flex: 1, marginBottom: 18 },
  gridCardCompact: { marginBottom: 12 },
  coverWrap: { aspectRatio: 0.7, borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.surfaceHigh, ...shadows.card },
  gridCoverBox: { width: "100%", height: "100%" },
  coverSurface: { overflow: "hidden", backgroundColor: colors.surfaceHigh },
  coverShade: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.surfaceHigh },
  coverImage: { width: "100%", height: "100%" },
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
});
