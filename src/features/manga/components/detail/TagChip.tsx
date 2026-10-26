import React, { useRef } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { SharedTag } from "@shared/contracts";
import { colors } from "@shared/theme";

export interface TagChipProps {
  tag: SharedTag;
  onPress: (bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => void;
}

export default function TagChip({ tag, onPress }: TagChipProps) {
  const chipRef = useRef<View>(null);

  return (
    <Pressable
      ref={chipRef}
      onPress={() =>
        chipRef.current?.measureInWindow((x, y, width, height) =>
          onPress({ x, y, width, height }),
        )
      }
      style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
    >
      <Text style={styles.label}>{tag.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceHigh,
  },
  pressed: { opacity: 0.7 },
  label: { color: colors.textMuted, fontSize: 12.5 },
});
