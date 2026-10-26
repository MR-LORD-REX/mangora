import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { LucideIcon } from "lucide-react-native";

import { colors, radius } from "@shared/theme";

export interface ChipTab {
  key: string;
  label: string;
  icon?: LucideIcon;
}

interface ChipTabBarProps {
  tabs: ChipTab[];
  activeKey: string;
  onSelect: (key: string) => void;
  accent?: string;
}

/** Scrollable pill tabs used by browse and download surfaces. */
export default function ChipTabBar({
  tabs,
  activeKey,
  onSelect,
  accent = colors.accent,
}: ChipTabBarProps) {
  return (
    <View style={styles.bar}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const selected = activeKey === tab.key;
          return (
            <Pressable
              key={tab.key}
              onPress={() => onSelect(tab.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              style={({ pressed }) => [
                styles.chip,
                selected && { backgroundColor: colors.accentSoft, borderColor: accent },
                pressed && styles.pressed,
              ]}
            >
              {Icon ? (
                <Icon size={17} color={selected ? accent : colors.textMuted} strokeWidth={selected ? 2.4 : 2} />
              ) : null}
              <Text style={[styles.chipText, selected && { color: accent, fontWeight: "700" }]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  scroll: { gap: 8, paddingHorizontal: 12, paddingVertical: 10, alignItems: "center" },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
  },
  chipText: { color: colors.textMuted, fontSize: 14, fontWeight: "600" },
  pressed: { opacity: 0.65 },
});