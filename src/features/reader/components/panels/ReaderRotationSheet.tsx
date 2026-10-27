/**
 * ReaderRotationSheet.tsx
 * ---------------------------------------------------------------------------
 * Compact bottom sheet opened from the bottom-bar rotation button. Stages a
 * selection locally; commits on Apply. Lifted from demo.tsx.
 * ---------------------------------------------------------------------------
 */

import { Check } from "lucide-react-native";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { ReaderOrientation } from "./readerChrome";
import { ORIENTATION_OPTIONS } from "./readerChrome";
import {
  READER_ACCENT,
  READER_ON_ACCENT,
  READER_PANEL_BG,
} from "./readerTheme";
import { Pill } from "./ReaderPanelPrimitives";

export interface ReaderRotationSheetProps {
  value: ReaderOrientation;
  onSelect: (orientation: ReaderOrientation) => void;
  onApply: () => void;
}

export default function ReaderRotationSheet({
  value,
  onSelect,
  onApply,
}: ReaderRotationSheetProps) {
  return (
    <View style={styles.sheet}>
      <View style={styles.sheetHandle} />
      <Text style={styles.sheetTitle}>Rotation</Text>
      <View style={styles.pillGrid}>
        {ORIENTATION_OPTIONS.map((option) => (
          <Pill
            key={option.key}
            label={option.label}
            selected={value === option.key}
            onPress={() => onSelect(option.key)}
          />
        ))}
      </View>
      <View style={styles.sheetFooter}>
        <Pressable style={[styles.sheetPrimaryBtn, { marginLeft: "auto" }]} onPress={onApply}>
          <Check color={READER_ON_ACCENT} size={16} />
          <Text style={styles.sheetPrimaryBtnText}>Apply</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: READER_PANEL_BG,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 24,
    maxHeight: "70%",
    zIndex: 70,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#3a3c4d",
    marginBottom: 14,
  },
  sheetTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 12,
  },
  pillGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
  },
  sheetFooter: {
    flexDirection: "row",
    marginTop: 8,
  },
  sheetPrimaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 18,
    backgroundColor: READER_ACCENT,
  },
  sheetPrimaryBtnText: {
    color: READER_ON_ACCENT,
    fontSize: 13,
    fontWeight: "700",
  },
});
