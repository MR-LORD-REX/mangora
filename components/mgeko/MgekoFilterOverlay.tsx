import React, { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Check,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  SlidersHorizontal,
  Star,
} from "lucide-react-native";

import { colors, radius } from "@/constants/theme";
import {
  EXTRA_FILTERS,
  GENRES,
  STATUS_OPTIONS,
  TYPE_OPTIONS,
} from "@/services/mgeko/mgeko.constants";

export interface MgekoFilterState {
  includeGenres: string[];
  excludeGenres: string[];
  status: string;
  type: string;
  minChapters: string;
  maxChapters: string;
  minRating: string;
  tags: string;
  onlyCompletedSeries: boolean;
  onlyWellTranslated: boolean;
  hideLongHiatus: boolean;
  hideNsfw: boolean;
}

export const DEFAULT_MGEKO_FILTERS: MgekoFilterState = {
  includeGenres: [],
  excludeGenres: [],
  status: "Any",
  type: "Any",
  minChapters: "",
  maxChapters: "",
  minRating: "",
  tags: "",
  onlyCompletedSeries: false,
  onlyWellTranslated: false,
  hideLongHiatus: false,
  hideNsfw: false,
};

interface Props {
  visible: boolean;
  filters: MgekoFilterState;
  accent: string;
  onClose: () => void;
  onApply: (filters: MgekoFilterState) => void;
}

const toggleItem = (list: string[], item: string): string[] =>
  list.includes(item) ? list.filter((v) => v !== item) : [...list, item];

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, selected ? styles.chipSelected : styles.chipIdle]}
    >
      {selected ? <Check color={colors.onAccent} size={14} /> : null}
      <Text style={selected ? styles.chipTextSelected : styles.chipTextIdle}>
        {label}
      </Text>
    </Pressable>
  );
}

function SingleChoiceRow({
  options,
  value,
  onChange,
}: {
  options: readonly string[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.choiceWrap}>
      {options.map((option) => (
        <Chip
          key={option}
          label={option}
          selected={value === option}
          onPress={() => onChange(option)}
        />
      ))}
    </View>
  );
}

function NumberField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (text: string) => void;
  placeholder: string;
}) {
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.fieldInput}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textFaint}
        keyboardType="numeric"
        returnKeyType="done"
      />
    </View>
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

function ToggleRow({
  label,
  detail,
  value,
  onValueChange,
  accent,
}: {
  label: string;
  detail?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  accent: string;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={styles.toggleInfo}>
        <Text style={styles.toggleLabel}>{label}</Text>
        {detail ? <Text style={styles.toggleDetail}>{detail}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: colors.border, true: accent }}
        thumbColor={colors.text}
      />
    </View>
  );
}

export default function MgekoFilterOverlay({
  visible,
  filters,
  accent,
  onClose,
  onApply,
}: Props) {
  const [draft, setDraft] = useState<MgekoFilterState>(filters);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    includeGenres: true,
    excludeGenres: false,
    status: true,
    type: false,
    numbers: false,
    extras: false,
  });

  useEffect(() => {
    if (visible) setDraft(filters);
  }, [visible, filters]);

  const toggleSection = (key: string) =>
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  const activeCount =
    draft.includeGenres.length +
    draft.excludeGenres.length +
    (draft.status !== "Any" ? 1 : 0) +
    (draft.type !== "Any" ? 1 : 0) +
    (draft.minChapters.trim() ? 1 : 0) +
    (draft.maxChapters.trim() ? 1 : 0) +
    (draft.minRating.trim() ? 1 : 0) +
    (draft.tags.trim() ? 1 : 0) +
    (draft.onlyCompletedSeries ? 1 : 0) +
    (draft.onlyWellTranslated ? 1 : 0) +
    (draft.hideLongHiatus ? 1 : 0);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <View style={styles.headerTitleWrap}>
            <SlidersHorizontal color={accent} size={18} />
            <Text style={styles.headerTitle}>Filter</Text>
            {activeCount > 0 ? (
              <View style={[styles.badge, { backgroundColor: accent }]}>
                <Text style={styles.badgeText}>{activeCount}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => setDraft({ ...DEFAULT_MGEKO_FILTERS })}
              hitSlop={8}
              style={styles.resetBtn}
            >
              <RotateCcw color={colors.textMuted} size={16} />
              <Text style={styles.resetText}>Reset</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                onApply(draft);
                onClose();
              }}
              style={[styles.applyBtn, { backgroundColor: accent }]}
            >
              <Text style={styles.applyText}>Apply</Text>
            </Pressable>
          </View>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Section
            title="Status"
            expanded={Boolean(expanded.status)}
            onToggle={() => toggleSection("status")}
          >
            <SingleChoiceRow
              options={STATUS_OPTIONS}
              value={draft.status}
              onChange={(value) => setDraft((prev) => ({ ...prev, status: value }))}
            />
          </Section>

          <Section
            title="Content type"
            expanded={Boolean(expanded.type)}
            onToggle={() => toggleSection("type")}
          >
            <SingleChoiceRow
              options={TYPE_OPTIONS}
              value={draft.type}
              onChange={(value) => setDraft((prev) => ({ ...prev, type: value }))}
            />
          </Section>

          <Section
            title="Include genres"
            expanded={Boolean(expanded.includeGenres)}
            onToggle={() => toggleSection("includeGenres")}
          >
            <View style={styles.chipWrap}>
              {GENRES.map((genre) => (
                <Chip
                  key={genre}
                  label={genre}
                  selected={draft.includeGenres.includes(genre)}
                  onPress={() =>
                    setDraft((prev) => ({
                      ...prev,
                      includeGenres: toggleItem(prev.includeGenres, genre),
                      excludeGenres: prev.excludeGenres.filter((g) => g !== genre),
                    }))
                  }
                />
              ))}
            </View>
          </Section>

          <Section
            title="Exclude genres"
            expanded={Boolean(expanded.excludeGenres)}
            onToggle={() => toggleSection("excludeGenres")}
          >
            <View style={styles.chipWrap}>
              {GENRES.map((genre) => (
                <Chip
                  key={genre}
                  label={genre}
                  selected={draft.excludeGenres.includes(genre)}
                  onPress={() =>
                    setDraft((prev) => ({
                      ...prev,
                      excludeGenres: toggleItem(prev.excludeGenres, genre),
                      includeGenres: prev.includeGenres.filter((g) => g !== genre),
                    }))
                  }
                />
              ))}
            </View>
          </Section>

          <Section
            title="Size & rating"
            expanded={Boolean(expanded.numbers)}
            onToggle={() => toggleSection("numbers")}
          >
            <NumberField
              label="Min chapters"
              value={draft.minChapters}
              onChange={(text) =>
                setDraft((prev) => ({ ...prev, minChapters: text }))
              }
              placeholder="e.g. 20"
            />
            <NumberField
              label="Max chapters"
              value={draft.maxChapters}
              onChange={(text) =>
                setDraft((prev) => ({ ...prev, maxChapters: text }))
              }
              placeholder="e.g. 500"
            />
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Min rating</Text>
              <View style={styles.ratingWrap}>
                <Star color={colors.textFaint} size={16} fill={colors.textFaint} />
                <TextInput
                  style={[styles.fieldInput, styles.ratingInput]}
                  value={draft.minRating}
                  onChangeText={(text) =>
                    setDraft((prev) => ({ ...prev, minRating: text }))
                  }
                  placeholder="4.5"
                  placeholderTextColor={colors.textFaint}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                />
                <Text style={styles.ratingSuffix}>/ 5</Text>
              </View>
            </View>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Tags</Text>
              <TextInput
                style={styles.fieldInput}
                value={draft.tags}
                onChangeText={(text) =>
                  setDraft((prev) => ({ ...prev, tags: text }))
                }
                placeholder="comma separated, e.g. system, dungeon"
                placeholderTextColor={colors.textFaint}
                autoCapitalize="none"
                returnKeyType="done"
              />
            </View>
          </Section>

          <Section
            title="Extras"
            expanded={Boolean(expanded.extras)}
            onToggle={() => toggleSection("extras")}
          >
            <ToggleRow
              label={EXTRA_FILTERS[0].label}
              value={draft.onlyCompletedSeries}
              onValueChange={(value) =>
                setDraft((prev) => ({ ...prev, onlyCompletedSeries: value }))
              }
              accent={accent}
            />
            <ToggleRow
              label={EXTRA_FILTERS[1].label}
              value={draft.onlyWellTranslated}
              onValueChange={(value) =>
                setDraft((prev) => ({ ...prev, onlyWellTranslated: value }))
              }
              accent={accent}
            />
            <ToggleRow
              label={EXTRA_FILTERS[2].label}
              value={draft.hideLongHiatus}
              onValueChange={(value) =>
                setDraft((prev) => ({ ...prev, hideLongHiatus: value }))
              }
              accent={accent}
            />
            <ToggleRow
              label="Safe mode"
              detail="Hide NSFW / mature titles"
              value={draft.hideNsfw}
              onValueChange={(value) =>
                setDraft((prev) => ({ ...prev, hideNsfw: value }))
              }
              accent={accent}
            />
          </Section>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  headerTitleWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerTitle: { color: colors.text, fontSize: 20, fontWeight: "800" },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  badgeText: { color: colors.onAccent, fontSize: 12, fontWeight: "800" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  resetBtn: { flexDirection: "row", alignItems: "center", gap: 5, padding: 4 },
  resetText: { color: colors.textMuted, fontSize: 14, fontWeight: "600" },
  applyBtn: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: radius.full,
  },
  applyText: { color: colors.onAccent, fontSize: 15, fontWeight: "800" },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40, gap: 12 },
  section: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    overflow: "hidden",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  sectionTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
  sectionBody: { paddingHorizontal: 14, paddingBottom: 14, gap: 10 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choiceWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  chipSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  chipIdle: {
    backgroundColor: colors.surfaceHigh,
    borderColor: colors.border,
  },
  chipTextSelected: { color: colors.onAccent, fontSize: 14, fontWeight: "700" },
  chipTextIdle: { color: colors.textMuted, fontSize: 14 },
  fieldRow: { gap: 6 },
  fieldLabel: { color: colors.textMuted, fontSize: 13, fontWeight: "600" },
  fieldInput: {
    backgroundColor: colors.surfaceHigh,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 15,
  },
  ratingWrap: { flexDirection: "row", alignItems: "center", gap: 8 },
  ratingInput: { flex: 1 },
  ratingSuffix: { color: colors.textFaint, fontSize: 13 },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  toggleInfo: { flex: 1, gap: 2 },
  toggleLabel: { color: colors.text, fontSize: 15, fontWeight: "600" },
  toggleDetail: { color: colors.textFaint, fontSize: 12 },
});
