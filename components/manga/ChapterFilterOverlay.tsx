import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  ListFilter,
  RotateCcw,
  Users,
} from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { colors, radius } from "@/constants/theme";
import type {
  ChapterSortField,
  SortDirection,
} from "@/components/manga/types";

const SORT_OPTIONS: { field: ChapterSortField; label: string }[] = [
  { field: "number", label: "By chapter number" },
  { field: "date", label: "By upload date" },
  { field: "alpha", label: "Alphabetically" },
];

export interface ScanGroupOption {
  name: string;
  count: number;
}

interface ChapterFilterOverlayProps {
  visible: boolean;
  showRead: boolean;
  showUnread: boolean;
  readCount: number;
  unreadCount: number;
  sortField: ChapterSortField;
  sortDir: SortDirection;
  /** Scanlation groups available in this series (Groups tab). */
  groups?: ScanGroupOption[];
  /** null = every group shown; otherwise the groups explicitly shown. */
  selectedGroups?: string[] | null;
  accent?: string;
  onClose: () => void;
  onToggleRead: () => void;
  onToggleUnread: () => void;
  onPickSort: (field: ChapterSortField, dir: SortDirection) => void;
  onToggleGroup?: (name: string) => void;
  onSelectAllGroups?: () => void;
  onReset: () => void;
}

export default function ChapterFilterOverlay({
  visible,
  showRead,
  showUnread,
  readCount,
  unreadCount,
  sortField,
  sortDir,
  groups = [],
  selectedGroups = null,
  accent = colors.accent,
  onClose,
  onToggleRead,
  onToggleUnread,
  onPickSort,
  onToggleGroup,
  onSelectAllGroups,
  onReset,
}: ChapterFilterOverlayProps) {
  const [tab, setTab] = useState<"filter" | "groups" | "sort">("filter");
  const translateY = useRef(new Animated.Value(420)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setTab("filter");
      translateY.setValue(420);
      opacity.setValue(0);
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: 240,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [opacity, translateY, visible]);

  const pickSort = (field: ChapterSortField) => {
    if (field === sortField) {
      onPickSort(field, sortDir === "asc" ? "desc" : "asc");
    } else {
      onPickSort(field, field === "alpha" ? "asc" : "desc");
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Animated.View
          style={[styles.sheet, { opacity, transform: [{ translateY }] }]}
        >
          <Pressable onPress={() => {}} style={{ width: "100%" }}>
            <View style={styles.handle} />
            <View style={styles.segmented}>
              <Pressable
                onPress={() => setTab("filter")}
                style={[styles.segmentBtn, tab === "filter" && styles.segmentActive]}
              >
                <ListFilter
                  size={16}
                  color={tab === "filter" ? accent : colors.textMuted}
                />
                <Text
                  style={[
                    styles.segmentText,
                    tab === "filter" && styles.segmentTextActive,
                  ]}
                >
                  Filter
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setTab("groups")}
                style={[styles.segmentBtn, tab === "groups" && styles.segmentActive]}
              >
                <Users
                  size={16}
                  color={tab === "groups" ? accent : colors.textMuted}
                />
                <Text
                  style={[
                    styles.segmentText,
                    tab === "groups" && styles.segmentTextActive,
                  ]}
                >
                  Groups
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setTab("sort")}
                style={[styles.segmentBtn, tab === "sort" && styles.segmentActive]}
              >
                <ArrowUpDown
                  size={16}
                  color={tab === "sort" ? accent : colors.textMuted}
                />
                <Text
                  style={[
                    styles.segmentText,
                    tab === "sort" && styles.segmentTextActive,
                  ]}
                >
                  Sort
                </Text>
              </Pressable>
            </View>

            {tab === "filter" ? (
              <View style={styles.body}>
                <Text style={styles.hint}>
                  Only chapters matching a checked state are shown.
                </Text>
                <FilterCheck
                  label="Read"
                  detail={`${readCount} chapter${readCount === 1 ? "" : "s"} finished`}
                  checked={showRead}
                  onPress={onToggleRead}
                  accent={accent}
                />
                <FilterCheck
                  label="Unread"
                  detail={`${unreadCount} chapter${unreadCount === 1 ? "" : "s"} remaining`}
                  checked={showUnread}
                  onPress={onToggleUnread}
                  accent={accent}
                />
                <Pressable onPress={onReset} style={styles.resetRow}>
                  <RotateCcw color={colors.textFaint} size={15} />
                  <Text style={styles.resetText}>Show every chapter</Text>
                </Pressable>
              </View>
            ) : tab === "groups" ? (
              <View style={styles.body}>
                <Text style={styles.hint}>
                  Pick which scanlation groups are shown. Unchecking a group
                  hides its uploads inside each chapter.
                </Text>
                {groups.length > 0 ? (
                  <ScrollView
                    style={styles.groupScroll}
                    bounces={false}
                    nestedScrollEnabled
                  >
                    <Pressable
                      onPress={onSelectAllGroups}
                      style={({ pressed }) => [
                        styles.checkRow,
                        pressed && styles.pressed,
                      ]}
                    >
                      <View
                        style={[
                          styles.checkbox,
                          selectedGroups === null && {
                            borderColor: accent,
                            backgroundColor: accent,
                          },
                        ]}
                      >
                        {selectedGroups === null ? (
                          <Check size={15} color={colors.onAccent} strokeWidth={3} />
                        ) : null}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.checkLabel}>All groups</Text>
                        <Text style={styles.checkDetail}>
                          {groups.length} scanlation group
                          {groups.length === 1 ? "" : "s"}
                        </Text>
                      </View>
                    </Pressable>
                    {groups.map((group) => {
                      const checked =
                        selectedGroups === null ||
                        selectedGroups.includes(group.name);
                      return (
                        <FilterCheck
                          key={group.name}
                          label={group.name}
                          detail={`${group.count} chapter${group.count === 1 ? "" : "s"}`}
                          checked={checked}
                          onPress={() => onToggleGroup?.(group.name)}
                          accent={accent}
                        />
                      );
                    })}
                  </ScrollView>
                ) : (
                  <Text style={styles.noGroups}>
                    No scanlation groups found for this series.
                  </Text>
                )}
              </View>
            ) : (
              <View style={styles.body}>
                <Text style={styles.hint}>
                  Tap a sort row to toggle its direction.
                </Text>
                {SORT_OPTIONS.map((option) => {
                  const active = option.field === sortField;
                  const DirIcon = sortDir === "asc" ? ArrowUp : ArrowDown;
                  return (
                    <Pressable
                      key={option.field}
                      onPress={() => pickSort(option.field)}
                      style={({ pressed }) => [
                        styles.sortRow,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.sortLabel,
                          active && styles.sortLabelActive,
                        ]}
                      >
                        {option.label}
                      </Text>
                      <View style={styles.sortRight}>
                        <Text style={styles.sortDirHint}>
                          {active
                            ? sortDir === "asc"
                              ? "Oldest / A-Z first"
                              : "Newest / Z-A first"
                            : "Tap to sort"}
                        </Text>
                        {active ? (
                          <View style={[styles.dirChip, { borderColor: accent }]}>
                            <DirIcon color={accent} size={17} />
                          </View>
                        ) : (
                          <View style={styles.dirChipIdle}>
                            <ArrowUpDown color={colors.textFaint} size={16} />
                          </View>
                        )}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}

            <View style={styles.footer}>
              <Pressable onPress={onClose} style={[styles.doneBtn, { backgroundColor: accent }]}>
                <Text style={styles.doneText}>Done</Text>
              </Pressable>
            </View>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

function FilterCheck({
  label,
  detail,
  checked,
  onPress,
  accent,
}: {
  label: string;
  detail: string;
  checked: boolean;
  onPress: () => void;
  accent: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.checkRow, pressed && styles.pressed]}
    >
      <View style={[styles.checkbox, checked && { borderColor: accent, backgroundColor: accent }]}>
        {checked ? <Check size={15} color={colors.onAccent} strokeWidth={3} /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.checkLabel}>{label}</Text>
        <Text style={styles.checkDetail}>{detail}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: colors.scrim,
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 22,
    maxHeight: "82%",
  },
  handle: {
    alignSelf: "center",
    width: 44,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.border,
    marginBottom: 10,
  },
  segmented: {
    flexDirection: "row",
    backgroundColor: colors.surfaceHigh,
    borderRadius: radius.md,
    padding: 3,
    marginBottom: 6,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 9,
    borderRadius: radius.sm + 2,
  },
  segmentActive: { backgroundColor: colors.accentSoft },
  segmentText: { color: colors.textMuted, fontWeight: "700", fontSize: 14 },
  segmentTextActive: { color: colors.text, fontWeight: "800" },
  body: { paddingVertical: 10 },
  hint: { color: colors.textFaint, fontSize: 12, marginBottom: 10 },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: colors.textMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  checkLabel: { color: colors.text, fontSize: 15.5, fontWeight: "700" },
  checkDetail: { color: colors.textFaint, fontSize: 12.5, marginTop: 2 },
  groupScroll: { maxHeight: 320, marginTop: 4 },
  noGroups: {
    color: colors.textFaint,
    fontSize: 13.5,
    lineHeight: 20,
    paddingVertical: 18,
  },
  resetRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 16,
  },
  resetText: { color: colors.textFaint, fontSize: 13.5, fontWeight: "700" },
  sortRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  pressed: { opacity: 0.6 },
  sortLabel: { color: colors.textMuted, fontSize: 15, fontWeight: "600" },
  sortLabelActive: { color: colors.text, fontWeight: "800" },
  sortRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  sortDirHint: { color: colors.textFaint, fontSize: 11.5 },
  dirChip: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  dirChipIdle: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceHigh,
    alignItems: "center",
    justifyContent: "center",
  },
  footer: {
    alignItems: "center",
    paddingTop: 10,
  },
  doneBtn: {
    alignSelf: "stretch",
    alignItems: "center",
    borderRadius: radius.full,
    paddingVertical: 13,
  },
  doneText: { color: colors.onAccent, fontSize: 15, fontWeight: "800" },
});