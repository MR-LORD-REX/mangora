import {
  DEFAULT_KATANA_FILTERS,
  SORT_OPTIONS,
  STATUS_OPTIONS,
  type MangaKatanaFilterState,
} from "@/services/mangakatana/mangakatana.filters";
import { GENRES, type GenreMode } from "@/services/mangakatana/mangakatana.types";
import { ChevronDown, ChevronUp } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const COLORS = {
  bg: "#1c1c1e",
  headerBorder: "#374151",
  text: "#f3f4f6",
  textMuted: "#9ca3af",
  textDim: "#d1d5db",
  border: "#374151",
  borderLight: "#4b5563",
  accent: "#6366f1",
  accentLight: "#818cf8",
  rowSelected: "rgba(99, 102, 241, 0.15)",
  chipBg: "#1f2937",
};

type SectionKey = "sort" | "status" | "genreMode" | "includeGenres" | "excludeGenres";

function toggleItem(list: string[], item: string): string[] {
  return list.includes(item) ? list.filter((v) => v !== item) : [...list, item];
}

function CheckboxRow({
  label,
  checked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <Pressable
      onPress={onToggle}
      style={[styles.checkboxRow, checked && styles.checkboxRowSelected]}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
    >
      <View
        style={[
          styles.checkbox,
          checked ? styles.checkboxChecked : styles.checkboxUnchecked,
        ]}
      >
        {checked ? <Text style={styles.checkmark}>✓</Text> : null}
      </View>
      <Text style={styles.checkboxLabel}>{label}</Text>
    </Pressable>
  );
}

function CollapsibleSection({
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
      <Pressable onPress={onToggle} style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {expanded ? (
          <ChevronUp color={COLORS.textDim} size={22} />
        ) : (
          <ChevronDown color={COLORS.textDim} size={22} />
        )}
      </Pressable>
      {expanded ? <View style={styles.sectionBody}>{children}</View> : null}
    </View>
  );
}

function ModePicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: GenreMode;
  onChange: (mode: GenreMode) => void;
}) {
  return (
    <View style={styles.modePicker}>
      <Text style={styles.modeLabel}>{label}</Text>
      <View style={styles.modeRow}>
        {(["and", "or"] as const).map((mode) => (
          <Pressable
            key={mode}
            onPress={() => onChange(mode)}
            style={[styles.modeOption, value === mode && styles.modeOptionActive]}
          >
            <Text
              style={[
                styles.modeOptionText,
                value === mode && styles.modeOptionTextActive,
              ]}
            >
              {mode.toUpperCase()}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export interface MangaKatanaFilterOverlayProps {
  visible: boolean;
  filters: MangaKatanaFilterState;
  onClose: () => void;
  onApply: (filters: MangaKatanaFilterState) => void;
}

export default function MangaKatanaFilterOverlay({
  visible,
  filters,
  onClose,
  onApply,
}: MangaKatanaFilterOverlayProps) {
  const [draft, setDraft] = useState<MangaKatanaFilterState>(filters);
  const [expanded, setExpanded] = useState<Partial<Record<SectionKey, boolean>>>({
    sort: true,
    includeGenres: true,
  });

  useEffect(() => {
    if (visible) setDraft(filters);
  }, [visible, filters]);

  const toggleSection = (key: SectionKey) =>
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="fullScreen"
    >
      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <Pressable onPress={() => setDraft({ ...DEFAULT_KATANA_FILTERS })} hitSlop={8}>
            <Text style={styles.resetText}>Reset</Text>
          </Pressable>
          <Pressable onPress={() => { onApply(draft); onClose(); }} style={styles.applyButton}>
            <Text style={styles.applyText}>Filter</Text>
          </Pressable>
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          <CollapsibleSection
            title="Sort"
            expanded={Boolean(expanded.sort)}
            onToggle={() => toggleSection("sort")}
          >
            {SORT_OPTIONS.map((option) => (
              <CheckboxRow
                key={option.value}
                label={option.label}
                checked={draft.order === option.value}
                onToggle={() => setDraft((prev) => ({ ...prev, order: option.value }))}
              />
            ))}
          </CollapsibleSection>

          <CollapsibleSection
            title="Status"
            expanded={Boolean(expanded.status)}
            onToggle={() => toggleSection("status")}
          >
            {STATUS_OPTIONS.map((option) => (
              <CheckboxRow
                key={option.value || "all"}
                label={option.label}
                checked={draft.status === option.value}
                onToggle={() => setDraft((prev) => ({ ...prev, status: option.value }))}
              />
            ))}
          </CollapsibleSection>

          <CollapsibleSection
            title="Genre mode"
            expanded={Boolean(expanded.genreMode)}
            onToggle={() => toggleSection("genreMode")}
          >
            <ModePicker
              label="Include genres mode"
              value={draft.genreMode}
              onChange={(mode) => setDraft((prev) => ({ ...prev, genreMode: mode }))}
            />
          </CollapsibleSection>

          <CollapsibleSection
            title="Include genres"
            expanded={Boolean(expanded.includeGenres)}
            onToggle={() => toggleSection("includeGenres")}
          >
            {GENRES.map((genre) => (
              <CheckboxRow
                key={genre.id}
                label={genre.name}
                checked={draft.includeGenres.includes(genre.id)}
                onToggle={() =>
                  setDraft((prev) => ({
                    ...prev,
                    includeGenres: toggleItem(prev.includeGenres, genre.id),
                  }))
                }
              />
            ))}
          </CollapsibleSection>

          <CollapsibleSection
            title="Exclude genres"
            expanded={Boolean(expanded.excludeGenres)}
            onToggle={() => toggleSection("excludeGenres")}
          >
            {GENRES.map((genre) => (
              <CheckboxRow
                key={genre.id}
                label={genre.name}
                checked={draft.excludeGenres.includes(genre.id)}
                onToggle={() =>
                  setDraft((prev) => ({
                    ...prev,
                    excludeGenres: toggleItem(prev.excludeGenres, genre.id),
                  }))
                }
              />
            ))}
          </CollapsibleSection>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.headerBorder,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.bg,
  },
  resetText: { color: COLORS.textMuted, fontSize: 16 },
  applyButton: {
    backgroundColor: COLORS.accent,
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  applyText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  scrollView: { flex: 1, backgroundColor: COLORS.bg },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 32 },
  checkboxRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  checkboxRowSelected: {
    backgroundColor: COLORS.rowSelected,
    borderRadius: 8,
    paddingHorizontal: 4,
    marginHorizontal: -4,
  },
  checkbox: {
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 4,
    borderWidth: 1,
  },
  checkboxChecked: { borderColor: COLORS.accentLight, backgroundColor: COLORS.accent },
  checkboxUnchecked: { borderColor: COLORS.borderLight, backgroundColor: "transparent" },
  checkmark: { color: "#fff", fontSize: 12, fontWeight: "700" },
  checkboxLabel: { flex: 1, color: COLORS.text, fontSize: 16 },
  section: { borderBottomWidth: 1, borderBottomColor: COLORS.border },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
  },
  sectionTitle: { color: COLORS.text, fontSize: 18 },
  sectionBody: { paddingBottom: 12 },
  modePicker: { marginBottom: 12 },
  modeLabel: { color: COLORS.textMuted, fontSize: 12, marginBottom: 4 },
  modeRow: {
    flexDirection: "row",
    overflow: "hidden",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  modeOption: { flex: 1, alignItems: "center", paddingVertical: 10, backgroundColor: COLORS.chipBg },
  modeOptionActive: { backgroundColor: COLORS.accent },
  modeOptionText: { color: COLORS.textDim, fontSize: 14 },
  modeOptionTextActive: { color: "#fff" },
});
