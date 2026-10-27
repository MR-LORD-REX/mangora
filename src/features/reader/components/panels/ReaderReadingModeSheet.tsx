/**
 * ReaderReadingModeSheet.tsx
 * ---------------------------------------------------------------------------
 * Reading-mode picker with three rows and a paged-direction selector.
 * ---------------------------------------------------------------------------
 */

import { Check } from "lucide-react-native";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import type {
  ReaderPagedDirection,
  ReaderReadingMode,
} from "./readerChrome";
import { READING_MODE_OPTIONS } from "./readerChrome";
import ReaderModeIcon from "../chrome/ReaderModeIcon";
import {
  READER_ACCENT,
  READER_ON_ACCENT,
  READER_PANEL_BG,
  READER_PILL_BG,
  READER_PILL_BORDER,
  READER_TEXT_MUTED,
} from "./readerTheme";

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
  return (
    <View style={styles.sheet}>
      <View style={styles.sheetHandle} />
      <Text style={styles.sheetTitle}>Reading mode</Text>
      <ScrollView
        style={styles.modeScroll}
        contentContainerStyle={styles.modeList}
        showsVerticalScrollIndicator={false}
      >
        {READING_MODE_OPTIONS.map((option) => {
          const selected = value === option.key;
          return (
            <Pressable
              key={option.id}
              onPress={() => onSelect(option.key)}
              style={[styles.modeRow, selected && styles.modeRowSelected]}
            >
              <View
                style={[
                  styles.modeIconBox,
                  selected && styles.modeIconBoxSelected,
                ]}
              >
                <ReaderModeIcon
                  id={
                    option.key === "pagedHorizontal"
                      ? pagedDirection
                      : option.key === "continuousVertical"
                        ? "continuous"
                        : "webtoon"
                  }
                  size={24}
                  color={selected ? READER_ON_ACCENT : "#e5e7eb"}
                />
              </View>
              <View style={styles.modeText}>
                <Text
                  style={[
                    styles.modeLabel,
                    selected && styles.modeLabelSelected,
                  ]}
                >
                  {option.label}
                </Text>
                <Text style={styles.modeDescription}>
                  {option.description}
                </Text>
              </View>
              {selected ? (
                <Check color={READER_ACCENT} size={20} />
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>

      {value === "pagedHorizontal" ? (
        <View style={styles.directionRow}>
          <Text style={styles.directionLabel}>Page direction</Text>
          {(["ltr", "rtl"] as const).map((direction) => (
            <Pressable
              key={direction}
              onPress={() => onSelectDirection(direction)}
              style={[
                styles.directionPill,
                pagedDirection === direction && styles.directionPillSelected,
              ]}
            >
              <Text style={styles.directionPillText}>
                {direction === "ltr" ? "Left to right" : "Right to left"}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

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
    maxHeight: "78%",
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
  modeScroll: { flexGrow: 0 },
  modeList: { gap: 8, paddingBottom: 12 },
  modeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: READER_PILL_BORDER,
    backgroundColor: READER_PILL_BG,
  },
  modeRowSelected: {
    borderColor: READER_ACCENT,
    backgroundColor: "rgba(251,191,36,0.10)",
  },
  modeIconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#313347",
  },
  modeIconBoxSelected: { backgroundColor: READER_ACCENT },
  modeText: { flex: 1, minWidth: 0 },
  modeLabel: { color: "#f1f5f9", fontSize: 14, fontWeight: "700" },
  modeLabelSelected: { color: "#fff" },
  modeDescription: {
    color: READER_TEXT_MUTED,
    fontSize: 11,
    marginTop: 2,
  },
  directionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  directionLabel: { color: "#e5e7eb", fontSize: 12, marginRight: "auto" },
  directionPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: READER_PILL_BORDER,
  },
  directionPillSelected: {
    borderColor: READER_ACCENT,
    backgroundColor: "rgba(251,191,36,0.10)",
  },
  directionPillText: { color: "#f1f5f9", fontSize: 11, fontWeight: "600" },
  sheetFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
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
