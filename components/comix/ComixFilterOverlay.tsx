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
import type {
  ComixMangaStatus,
  ComixMangaType,
  ComixRating,
  ComixSortValue,
} from "@/services/comix/comix.api.types";
import type { ComixTaxonomyItem } from "@/services/comix/comix.types";

export const COMIX_SORTS: { value: ComixSortValue; label: string }[] = [
  { value: "relevance:desc", label: "Best match" },
  { value: "chapter_updated_at:desc", label: "Latest update" },
  { value: "created_at:desc", label: "Recently added" },
  { value: "score:desc", label: "Highest rated" },
  { value: "follows_total:desc", label: "Most followed" },
  { value: "views_30d:desc", label: "Viewed · 30 days" },
  { value: "title:asc", label: "Title (A–Z)" },
  { value: "year:desc", label: "Year (newest)" },
];

export const COMIX_TYPES: { value: ComixMangaType; label: string }[] = [
  { value: "manga", label: "Manga" },
  { value: "manhwa", label: "Manhwa" },
  { value: "manhua", label: "Manhua" },
  { value: "other", label: "Other" },
];

export const COMIX_STATUSES: { value: ComixMangaStatus; label: string }[] = [
  { value: "releasing", label: "Releasing" },
  { value: "finished", label: "Finished" },
  { value: "on_hiatus", label: "On hiatus" },
  { value: "discontinued", label: "Discontinued" },
  { value: "not_yet_released", label: "Not yet released" },
];

export const COMIX_RATINGS: { value: ComixRating; label: string }[] = [
  { value: "safe", label: "Safe" },
  { value: "suggestive", label: "Suggestive" },
  { value: "erotica", label: "Erotica" },
  { value: "pornographic", label: "Pornographic" },
];

export interface ComixFilterState {
  sort: ComixSortValue;
  genres: number[];
  types: ComixMangaType[];
  statuses: ComixMangaStatus[];
  contentRating: ComixRating[];
}

export const DEFAULT_COMIX_FILTERS: ComixFilterState = {
  sort: "chapter_updated_at:desc",
  genres: [],
  types: [],
  statuses: [],
  contentRating: ["safe", "suggestive"],
};

export function comixHasActiveFilters(f: ComixFilterState): boolean {
  return (
    f.genres.length > 0 ||
    f.types.length > 0 ||
    f.statuses.length > 0 ||
    f.contentRating.length !== 2 ||
    f.contentRating[0] !== "safe" ||
    f.contentRating[1] !== "suggestive"
  );
}

const toggleValue = <T,>(list: T[], value: T): T[] =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

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
      style={[styles.chip, selected ? { ...styles.chipSelected, borderColor: accent, backgroundColor: accent } : styles.chipIdle]}
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
  filters: ComixFilterState;
  genres: ComixTaxonomyItem[];
  accent: string;
  onClose: () => void;
  onApply: (filters: ComixFilterState) => void;
}

export default function ComixFilterOverlay({
  visible,
  filters,
  genres,
  accent,
  onClose,
  onApply,
}: Props) {
  const [draft, setDraft] = useState<ComixFilterState>(filters);
  const [openSection, setOpenSection] = useState<string>("sort");

  useEffect(() => {
    if (visible) setDraft(filters);
  }, [filters, visible]);

  const reset = () => {
    setDraft(DEFAULT_COMIX_FILTERS);
  };

  const activeGenreIds = new Set(draft.genres);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <SlidersHorizontal size={18} color={accent} />
            <Text style={styles.headerText}>Filters</Text>
            <Pressable onPress={reset} hitSlop={8} style={styles.resetBtn}>
              <RotateCcw color={colors.textMuted} size={16} />
              <Text style={styles.resetText}>Reset</Text>
            </Pressable>
          </View>

          <ScrollView bounces={false} contentContainerStyle={styles.body}>
            <Section
              title="Sort by"
              expanded={openSection === "sort"}
              onToggle={() =>
                setOpenSection(openSection === "sort" ? "" : "sort")
              }
            >
              <View style={styles.choiceWrap}>
                {COMIX_SORTS.map((option) => (
                  <Chip
                    key={option.value}
                    label={option.label}
                    accent={accent}
                    selected={draft.sort === option.value}
                    onPress={() =>
                      setDraft((d) => ({ ...d, sort: option.value }))
                    }
                  />
                ))}
              </View>
            </Section>

            <Section
              title="Content rating"
              expanded={openSection === "rating"}
              onToggle={() =>
                setOpenSection(openSection === "rating" ? "" : "rating")
              }
            >
              <View style={styles.choiceWrap}>
                {COMIX_RATINGS.map((option) => (
                  <Chip
                    key={option.value}
                    label={option.label}
                    accent={accent}
                    selected={draft.contentRating.includes(option.value)}
                    onPress={() =>
                      setDraft((d) => ({
                        ...d,
                        contentRating: toggleValue(d.contentRating, option.value),
                      }))
                    }
                  />
                ))}
              </View>
            </Section>

            <Section
              title="Format / type"
              expanded={openSection === "type"}
              onToggle={() =>
                setOpenSection(openSection === "type" ? "" : "type")
              }
            >
              <View style={styles.choiceWrap}>
                {COMIX_TYPES.map((option) => (
                  <Chip
                    key={option.value}
                    label={option.label}
                    accent={accent}
                    selected={draft.types.includes(option.value)}
                    onPress={() =>
                      setDraft((d) => ({
                        ...d,
                        types: toggleValue(d.types, option.value),
                      }))
                    }
                  />
                ))}
              </View>
            </Section>

            <Section
              title="Status"
              expanded={openSection === "status"}
              onToggle={() =>
                setOpenSection(openSection === "status" ? "" : "status")
              }
            >
              <View style={styles.choiceWrap}>
                {COMIX_STATUSES.map((option) => (
                  <Chip
                    key={option.value}
                    label={option.label}
                    accent={accent}
                    selected={draft.statuses.includes(option.value)}
                    onPress={() =>
                      setDraft((d) => ({
                        ...d,
                        statuses: toggleValue(d.statuses, option.value),
                      }))
                    }
                  />
                ))}
              </View>
            </Section>

            {genres.length > 0 ? (
              <Section
                title="Genres"
                expanded={openSection === "genres"}
                onToggle={() =>
                  setOpenSection(openSection === "genres" ? "" : "genres")
                }
              >
                <View style={styles.choiceWrap}>
                  {genres.map((genre) => (
                    <Chip
                      key={genre.id}
                      label={genre.title}
                      accent={accent}
                      selected={activeGenreIds.has(genre.id)}
                      onPress={() =>
                        setDraft((d) => ({
                          ...d,
                          genres: toggleValue(d.genres, genre.id),
                        }))
                      }
                    />
                  ))}
                </View>
              </Section>
            ) : null}
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
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: colors.scrim,
  },
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
  chipSelected: {
    borderWidth: 1,
  },
  chipIdle: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceHigh,
  },
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
