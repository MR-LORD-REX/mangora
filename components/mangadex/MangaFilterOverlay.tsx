import {
  CONTENT_RATINGS,
  DEFAULT_MANGA_FILTERS,
  DEMOGRAPHICS,
  FILTER_SECTIONS,
  PUBLICATION_STATUSES,
  SORT_OPTIONS,
  TAG_GROUPS,
  sortOptionId,
  type MangaFilterState,
  type TagMode,
} from "@/services/mangadex/mangadex.filters";
import { LANGUAGES } from "@/services/mangadex/mangadex.constants";
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

type SectionKey = keyof typeof FILTER_SECTIONS;

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

const LANGUAGE_OPTIONS = Object.values(LANGUAGES)
  .filter((lang) => !lang.romanized)
  .sort((a, b) => a.name.localeCompare(b.name));

const CONTENT_RATING_LABELS: Record<(typeof CONTENT_RATINGS)[number], string> = {
  safe: "Safe",
  suggestive: "Suggestive",
  erotica: "Erotica",
  pornographic: "Pornographic",
};

const STATUS_LABELS: Record<(typeof PUBLICATION_STATUSES)[number], string> = {
  ongoing: "Ongoing",
  completed: "Completed",
  hiatus: "Hiatus",
  cancelled: "Cancelled",
};

const DEMOGRAPHIC_LABELS: Record<(typeof DEMOGRAPHICS)[number], string> = {
  shounen: "Shounen",
  shoujo: "Shoujo",
  josei: "Josei",
  seinen: "Seinen",
  none: "None",
};

function toggleItem<T>(list: T[], item: T): T[] {
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

function TagModePicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: TagMode;
  onChange: (mode: TagMode) => void;
}) {
  return (
    <View style={styles.tagModePicker}>
      <Text style={styles.tagModeLabel}>{label}</Text>
      <View style={styles.tagModeRow}>
        {(["AND", "OR"] as const).map((mode) => (
          <Pressable
            key={mode}
            onPress={() => onChange(mode)}
            style={[
              styles.tagModeOption,
              value === mode && styles.tagModeOptionActive,
            ]}
          >
            <Text
              style={[
                styles.tagModeOptionText,
                value === mode && styles.tagModeOptionTextActive,
              ]}
            >
              {mode}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export interface MangaFilterOverlayProps {
  visible: boolean;
  filters: MangaFilterState;
  onClose: () => void;
  onApply: (filters: MangaFilterState) => void;
}

export default function MangaFilterOverlay({
  visible,
  filters,
  onClose,
  onApply,
}: MangaFilterOverlayProps) {
  const [draft, setDraft] = useState<MangaFilterState>(filters);
  const [expanded, setExpanded] = useState<Partial<Record<SectionKey, boolean>>>({
    tagsMode: true,
    content: true,
    format: true,
  });

  useEffect(() => {
    if (visible) setDraft(filters);
  }, [visible, filters]);

  const toggleSection = (key: SectionKey) =>
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  const toggleTag = (tag: string) =>
    setDraft((prev) => ({
      ...prev,
      includedTags: toggleItem(prev.includedTags, tag),
    }));

  const currentSortId = sortOptionId(draft.sortKey, draft.sortDirection);

  const handleReset = () => {
    setDraft({ ...DEFAULT_MANGA_FILTERS });
  };

  const handleApply = () => {
    onApply(draft);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="fullScreen"
    >
      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <Pressable onPress={handleReset} hitSlop={8}>
            <Text style={styles.resetText}>Reset</Text>
          </Pressable>
          <Pressable onPress={handleApply} style={styles.applyButton}>
            <Text style={styles.applyText}>Filter</Text>
          </Pressable>
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <CheckboxRow
            label="Has available chapters"
            checked={draft.hasAvailableChapters}
            onToggle={() =>
              setDraft((prev) => ({
                ...prev,
                hasAvailableChapters: !prev.hasAvailableChapters,
              }))
            }
          />

          <CollapsibleSection
            title={FILTER_SECTIONS.originalLanguage}
            expanded={Boolean(expanded.originalLanguage)}
            onToggle={() => toggleSection("originalLanguage")}
          >
            {LANGUAGE_OPTIONS.map((lang) => (
              <CheckboxRow
                key={lang.code}
                label={`${lang.flag} ${lang.name}`}
                checked={draft.originalLanguage.includes(lang.code)}
                onToggle={() =>
                  setDraft((prev) => ({
                    ...prev,
                    originalLanguage: toggleItem(prev.originalLanguage, lang.code),
                  }))
                }
              />
            ))}
          </CollapsibleSection>

          <CollapsibleSection
            title={FILTER_SECTIONS.contentRating}
            expanded={Boolean(expanded.contentRating)}
            onToggle={() => toggleSection("contentRating")}
          >
            {CONTENT_RATINGS.map((rating) => (
              <CheckboxRow
                key={rating}
                label={CONTENT_RATING_LABELS[rating]}
                checked={draft.contentRating.includes(rating)}
                onToggle={() =>
                  setDraft((prev) => ({
                    ...prev,
                    contentRating: toggleItem(prev.contentRating, rating),
                  }))
                }
              />
            ))}
          </CollapsibleSection>

          <CollapsibleSection
            title={FILTER_SECTIONS.publicationDemographic}
            expanded={Boolean(expanded.publicationDemographic)}
            onToggle={() => toggleSection("publicationDemographic")}
          >
            {DEMOGRAPHICS.map((demo) => (
              <CheckboxRow
                key={demo}
                label={DEMOGRAPHIC_LABELS[demo]}
                checked={draft.publicationDemographic.includes(demo)}
                onToggle={() =>
                  setDraft((prev) => ({
                    ...prev,
                    publicationDemographic: toggleItem(prev.publicationDemographic, demo),
                  }))
                }
              />
            ))}
          </CollapsibleSection>

          <CollapsibleSection
            title={FILTER_SECTIONS.status}
            expanded={Boolean(expanded.status)}
            onToggle={() => toggleSection("status")}
          >
            {PUBLICATION_STATUSES.map((status) => (
              <CheckboxRow
                key={status}
                label={STATUS_LABELS[status]}
                checked={draft.status.includes(status)}
                onToggle={() =>
                  setDraft((prev) => ({
                    ...prev,
                    status: toggleItem(prev.status, status),
                  }))
                }
              />
            ))}
          </CollapsibleSection>

          <CollapsibleSection
            title={FILTER_SECTIONS.sort}
            expanded={Boolean(expanded.sort)}
            onToggle={() => toggleSection("sort")}
          >
            {SORT_OPTIONS.map((option) => {
              const id = sortOptionId(option.key, option.direction);
              return (
                <CheckboxRow
                  key={id}
                  label={option.label}
                  checked={currentSortId === id}
                  onToggle={() =>
                    setDraft((prev) => ({
                      ...prev,
                      sortKey: option.key,
                      sortDirection: option.direction,
                    }))
                  }
                />
              );
            })}
          </CollapsibleSection>

          <CollapsibleSection
            title={FILTER_SECTIONS.genre}
            expanded={Boolean(expanded.genre)}
            onToggle={() => toggleSection("genre")}
          >
            {TAG_GROUPS.genre.map((tag) => (
              <CheckboxRow
                key={tag}
                label={tag}
                checked={draft.includedTags.includes(tag)}
                onToggle={() => toggleTag(tag)}
              />
            ))}
          </CollapsibleSection>

          <CollapsibleSection
            title={FILTER_SECTIONS.theme}
            expanded={Boolean(expanded.theme)}
            onToggle={() => toggleSection("theme")}
          >
            {TAG_GROUPS.theme.map((tag) => (
              <CheckboxRow
                key={tag}
                label={tag}
                checked={draft.includedTags.includes(tag)}
                onToggle={() => toggleTag(tag)}
              />
            ))}
          </CollapsibleSection>

          <CollapsibleSection
            title={FILTER_SECTIONS.tagsMode}
            expanded={Boolean(expanded.tagsMode)}
            onToggle={() => toggleSection("tagsMode")}
          >
            <TagModePicker
              label="Included tags mode"
              value={draft.includedTagsMode}
              onChange={(mode) =>
                setDraft((prev) => ({ ...prev, includedTagsMode: mode }))
              }
            />
            <TagModePicker
              label="Excluded tags mode"
              value={draft.excludedTagsMode}
              onChange={(mode) =>
                setDraft((prev) => ({ ...prev, excludedTagsMode: mode }))
              }
            />
          </CollapsibleSection>

          <CollapsibleSection
            title={FILTER_SECTIONS.content}
            expanded={Boolean(expanded.content)}
            onToggle={() => toggleSection("content")}
          >
            {TAG_GROUPS.content.map((tag) => (
              <CheckboxRow
                key={tag}
                label={tag}
                checked={draft.includedTags.includes(tag)}
                onToggle={() => toggleTag(tag)}
              />
            ))}
          </CollapsibleSection>

          <CollapsibleSection
            title={FILTER_SECTIONS.format}
            expanded={Boolean(expanded.format)}
            onToggle={() => toggleSection("format")}
          >
            {TAG_GROUPS.format.map((tag) => (
              <CheckboxRow
                key={tag}
                label={tag}
                checked={draft.includedTags.includes(tag)}
                onToggle={() => toggleTag(tag)}
              />
            ))}
          </CollapsibleSection>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
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
  resetText: {
    color: COLORS.textMuted,
    fontSize: 16,
  },
  applyButton: {
    backgroundColor: COLORS.accent,
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  applyText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  scrollView: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
  },
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
  checkboxChecked: {
    borderColor: COLORS.accentLight,
    backgroundColor: COLORS.accent,
  },
  checkboxUnchecked: {
    borderColor: COLORS.borderLight,
    backgroundColor: "transparent",
  },
  checkmark: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "700",
  },
  checkboxLabel: {
    flex: 1,
    color: COLORS.text,
    fontSize: 16,
  },
  section: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 16,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 18,
  },
  sectionBody: {
    paddingBottom: 12,
  },
  tagModePicker: {
    marginBottom: 12,
  },
  tagModeLabel: {
    color: COLORS.textMuted,
    fontSize: 12,
    marginBottom: 4,
  },
  tagModeRow: {
    flexDirection: "row",
    overflow: "hidden",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  tagModeOption: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    backgroundColor: COLORS.chipBg,
  },
  tagModeOptionActive: {
    backgroundColor: COLORS.accent,
  },
  tagModeOptionText: {
    color: COLORS.textDim,
    fontSize: 14,
  },
  tagModeOptionTextActive: {
    color: "#fff",
  },
});
