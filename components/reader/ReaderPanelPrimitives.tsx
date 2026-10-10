/**
 * ReaderPanelPrimitives.tsx
 * ---------------------------------------------------------------------------
 * Low-level UI building blocks shared by the reader's quick sheets and the
 * tabbed settings panel (Pill, CheckRow, SectionLabel, TabBar). Lifted from
 * demo.tsx.
 * ---------------------------------------------------------------------------
 */

import { Check } from "lucide-react-native";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  READER_ACCENT,
  READER_ON_ACCENT,
  READER_PILL_BG,
  READER_PILL_BG_SELECTED,
  READER_PILL_BORDER,
  READER_TEXT_MUTED,
} from "./readerTheme";

export function Pill({
  label,
  selected,
  disabled,
  onPress,
}: {
  label: string;
  selected?: boolean;
  disabled?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.pill,
        selected && styles.pillSelected,
        disabled && styles.pillDisabled,
      ]}
    >
      <Text style={[styles.pillText, selected && styles.pillTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function CheckRow({
  label,
  checked,
  disabled,
  onToggle,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      style={[styles.checkRow, disabled && styles.pillDisabled]}
      onPress={onToggle}
      disabled={disabled}
    >
      <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
        {checked && (
          <Check color={READER_ON_ACCENT} size={14} strokeWidth={3} />
        )}
      </View>
      <Text style={styles.checkRowLabel}>{label}</Text>
    </Pressable>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

export function HelperText({ children }: { children: React.ReactNode }) {
  return <Text style={styles.helperText}>{children}</Text>;
}

export function TabBar<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: T; label: string }[];
  active: T;
  onChange: (tab: T) => void;
}) {
  return (
    <View style={styles.tabBar}>
      {tabs.map((tab) => (
        <Pressable
          key={tab.key}
          style={styles.tabItem}
          onPress={() => onChange(tab.key)}
        >
          <Text
            style={[
              styles.tabLabel,
              active === tab.key && styles.tabLabelActive,
            ]}
            numberOfLines={1}
          >
            {tab.label}
          </Text>
          {active === tab.key && <View style={styles.tabUnderline} />}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  pillGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
  },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 18,
    backgroundColor: READER_PILL_BG,
    borderWidth: 1,
    borderColor: READER_PILL_BORDER,
  },
  pillSelected: {
    backgroundColor: READER_PILL_BG_SELECTED,
    borderColor: "#565b8c",
  },
  pillDisabled: { opacity: 0.35 },
  pillText: { color: "#e5e7eb", fontSize: 13, fontWeight: "600" },
  pillTextSelected: { color: "#fff" },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: "#565b6e",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  checkboxChecked: {
    backgroundColor: READER_ACCENT,
    borderColor: READER_ACCENT,
  },
  checkRowLabel: { color: "#e5e7eb", fontSize: 14 },
  sectionLabel: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
    marginTop: 18,
    marginBottom: 10,
  },
  helperText: { color: READER_TEXT_MUTED, fontSize: 12, marginBottom: 10 },
  tabBar: { flex: 1, flexDirection: "row" },
  tabItem: { flex: 1, alignItems: "center", paddingBottom: 12 },
  tabLabel: { color: READER_TEXT_MUTED, fontSize: 13, fontWeight: "600" },
  tabLabelActive: { color: "#fff" },
  tabUnderline: {
    marginTop: 8,
    height: 2,
    width: "70%",
    borderRadius: 1,
    backgroundColor: READER_ACCENT,
  },
});