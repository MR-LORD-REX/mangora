/**
 * ReaderReadingModeSheet.tsx
 * ---------------------------------------------------------------------------
 * Compact bottom sheet opened from the bottom-bar reading-mode button. Stages
 * a selection locally; nothing is committed until Apply (Revert resets to the
 * defaults scrollVertical + ltr). Lifted from demo.tsx.
 * ---------------------------------------------------------------------------
 */

import { Check } from "lucide-react-native";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type {
  ReaderPagedDirection,
  ReaderReadingMode,
} from "./readerChrome";
import { READING_MODE_OPTIONS } from "./readerChrome";
import {
  READER_ACCENT,
  READER_ON_ACCENT,
  READER_PANEL_BG,
  READER_PILL_BORDER,
} from "./readerTheme";
import { Pill, SectionLabel } from "./ReaderPanelPrimitives";

export interface ReaderReadingModeSheetProps {
  value: ReaderReadingMode;
  pagedDirection: ReaderPagedDirection;
  onSelect: (mode: ReaderReadingMode) => void;
  onSelectDirection: (direction: ReaderPagedDirection) => void;
  onApply: () => void;
  onRevert: () => void;
}

export default function ReaderReadingModeSheet({
  value,
  pagedDirection,
  onSelect,
  onSelectDirection,
  onApply,
  onRevert,
}: ReaderReadingModeSheetProps) {
  const showDirection = value === "pagedHorizontal";
  return (
    <View style={styles.sheet}>
      <View style={styles.sheetHandle} />
      <Text style={styles.sheetTitle}>Reading mode</Text>
      <View style={styles.pillGrid}>
        {READING_MODE_OPTIONS.map((option) => (
          <Pill
            key={option.key}
            label={option.label}
            selected={value === option.key}
            onPress={() => onSelect(option.key)}
          />
        ))}
      </View>

      {showDirection && (
        <>
          <SectionLabel>Direction</SectionLabel>
          <View style={styles.pillGrid}>
            <Pill
              label="Left to right"
              selected={pagedDirection === "ltr"}
              onPress={() => onSelectDirection("ltr")}
            />
            <Pill
              label="Right to left"
              selected={pagedDirection === "rtl"}
              onPress={() => onSelectDirection("rtl")}
            />
          </View>
        </>
      )}

      <View style={styles.sheetFooter}>
        <Pressable style={styles.sheetSecondaryBtn} onPress={onRevert}>
          <Text style={styles.sheetSecondaryBtnText}>Revert to default</Text>
        </Pressable>
        <Pressable style={styles.sheetPrimaryBtn} onPress={onApply}>
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
    justifyContent: "space-between",
    marginTop: 8,
  },
  sheetSecondaryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: READER_PILL_BORDER,
  },
  sheetSecondaryBtnText: { color: "#e5e7eb", fontSize: 13, fontWeight: "600" },
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