/**
 * SourceFilterOverlay.tsx
 * ---------------------------------------------------------------------------
 * Generic extension filter sheet shared by extension browse screens. Each section is either multi-select (genres/statuses) or a single
 * choice (sort). Values are string arrays so a section can drive one query
 * param (`sort`) or many (`genres`, `statuses`).
 * ---------------------------------------------------------------------------
 */

import React, { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  Check,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react-native";

import { colors, radius } from "@/constants/theme";

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterSection {
  key: string;
  title: string;
  options: FilterOption[];
  /** Single-select (radio) section, e.g. sort order. */
  single?: boolean;
}

export type FilterValue = Record<string, string[]>;

export function toggleFilterValue(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function arraysEqual(a: string[] | undefined, b: string[] | undefined): boolean {
  const left = [...(a ?? [])].sort();
  const right = [...(b ?? [])].sort();
  return left.length === right.length && left.every((v, i) => v === right[i]);
}

/** True when any section differs from its default selection. */
export function hasActiveFilters(
  value: FilterValue,
  defaults: FilterValue,
): boolean {
  return Object.keys(defaults).some((key) => !arraysEqual(value[key], defaults[key]));
}

function Chip({
  label,
  selected,
  onPress,
  accent,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  accent: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        selected
          ? { ...styles.chipSelected, borderColor: accent, backgroundColor: accent }
          : styles.chipIdle,
      ]}
    >
      {selected ? <Check color={colors.onAccent} size={14} /> : null}
      <Text style={selected ? styles.chipTextSelected : styles.chipTextIdle}>
        {label}
      </Text>
    </Pressable>
  );
}

function Section({
  title,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Pressable style={styles.sectionHeader} onPress={onToggle}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {expanded ? (
          <ChevronUp color={colors.textMuted} size={20} />
        ) : (
          <ChevronDown color={colors.textMuted} size={20} />
        )}
      </Pressable>
      {expanded ? <View style={styles.sectionBody}>{children}</View> : null}
    </View>
  );
}

interface Props {
  visible: boolean;
  accent: string;
  sections: FilterSection[];
  value: FilterValue;
  defaults: FilterValue;
  onClose: () => void;
  onApply: (value: FilterValue) => void;
}

export default function SourceFilterOverlay({
  visible,
  accent,
  sections,
  value,
  defaults,
  onClose,
  onApply,
}: Props) {
  const [draft, setDraft] = useState<FilterValue>(value);
  const [openSection, setOpenSection] = useState<string>(sections[0]?.key ?? "");

  useEffect(() => {
    if (visible) setDraft(value);
  }, [value, visible]);

  const setSingle = (key: string, option: string) =>
    setDraft((d) => ({ ...d, [key]: [option] }));

  const toggle = (key: string, option: string) =>
    setDraft((d) => ({ ...d, [key]: toggleFilterValue(d[key] ?? [], option) }));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <SlidersHorizontal size={18} color={accent} />
            <Text style={styles.headerText}>Filters</Text>
            <Pressable onPress={() => setDraft(defaults)} style={styles.resetBtn}>
              <RotateCcw color={colors.textMuted} size={15} />
              <Text style={styles.resetText}>Reset</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            {sections.map((section) => {
              const selected = new Set(draft[section.key] ?? []);
              return (
                <Section
                  key={section.key}
                  title={section.title}
                  expanded={openSection === section.key}
                  onToggle={() =>
                    setOpenSection(openSection === section.key ? "" : section.key)
                  }
                >
                  <View style={styles.choiceWrap}>
                    {section.options.map((option) => (
                      <Chip
                        key={option.value}
                        label={option.label}
                        accent={accent}
                        selected={selected.has(option.value)}
                        onPress={() =>
                          section.single
                            ? setSingle(section.key, option.value)
                            : toggle(section.key, option.value)
                        }
                      />
                    ))}
                  </View>
                </Section>
              );
            })}
          </ScrollView>

          <View style={styles.actions}>
            <Pressable onPress={onClose} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                onApply(draft);
                onClose();
              }}
              style={[styles.applyBtn, { backgroundColor: accent }]}
            >
              <Text style={styles.applyText}>Show results</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: colors.scrim },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: "88%",
  },
  handle: {
    alignSelf: "center",
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginTop: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  headerText: { color: colors.text, fontSize: 17, fontWeight: "800", flex: 1 },
  resetBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
  resetText: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
  body: { paddingBottom: 18 },
  section: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  sectionTitle: { color: colors.text, fontSize: 15, fontWeight: "700" },
  sectionBody: { paddingHorizontal: 18, paddingBottom: 14 },
  choiceWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipSelected: { borderWidth: 1 },
  chipIdle: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceHigh },
  chipTextSelected: { color: colors.onAccent, fontSize: 13, fontWeight: "700" },
  chipTextIdle: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
  actions: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 22,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  cancelBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelText: { color: colors.textMuted, fontWeight: "700", fontSize: 15 },
  applyBtn: {
    flex: 1.6,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
    borderRadius: radius.full,
  },
  applyText: { color: colors.onAccent, fontWeight: "800", fontSize: 15 },
});