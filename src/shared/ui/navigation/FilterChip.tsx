import React from "react";
import { Pressable, StyleSheet, Text } from "react-native";

import { colors, radius } from "@shared/theme";

interface FilterChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
}

/** Compact selectable pill used by filter sheets. */
export default function FilterChip({ label, selected, onPress }: FilterChipProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  chipSelected: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  label: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
  labelSelected: { color: colors.accent, fontWeight: "800" },
  pressed: { opacity: 0.72 },
});