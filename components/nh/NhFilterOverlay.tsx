import {
  NH_LANGUAGES,
  NH_TAG_TYPE_LABEL,
  NhTagType,
} from "@/services/nh/nh.constants";
import {
  ensureNhTaxonomy,
  nhTaxonomy as taxonomy,
} from "@/services/nh/nhShared";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export interface NhFilterState {
  includeTags: string[];
  excludeTags: string[];
  includeArtists: string[];
  excludeArtists: string[];
  includeGroups: string[];
  excludeGroups: string[];
  includeParodies: string[];
  excludeParodies: string[];
  includeCharacters: string[];
  excludeCharacters: string[];
  includeCategories: string[];
  excludeCategories: string[];
  languages: string[];
}

export const DEFAULT_NH_FILTERS: NhFilterState = {
  includeTags: [],
  excludeTags: [],
  includeArtists: [],
  excludeArtists: [],
  includeGroups: [],
  excludeGroups: [],
  includeParodies: [],
  excludeParodies: [],
  includeCharacters: [],
  excludeCharacters: [],
  includeCategories: [],
  excludeCategories: [],
  languages: [],
};

type NhFilterTagType = Exclude<NhTagType, "language" | "category">;

function filterKey(
  type: NhFilterTagType,
  mode: "include" | "exclude",
): keyof NhFilterState {
  const keys: Record<NhFilterTagType, string> = {
    tag: "Tags",
    artist: "Artists",
    group: "Groups",
    parody: "Parodies",
    character: "Characters",
  };
  return `${mode}${keys[type]}` as keyof NhFilterState;
}

interface Props {
  visible: boolean;
  filters: NhFilterState;
  onClose: () => void;
  onApply: (filters: NhFilterState) => void;
}

const TagSection = ({
  title,
  type,
  selectedInclude,
  selectedExclude,
  onAddInclude,
  onAddExclude,
  onRemoveInclude,
  onRemoveExclude,
}: {
  title: string;
  type: NhTagType;
  selectedInclude: string[];
  selectedExclude: string[];
  onAddInclude: (tag: string) => void;
  onAddExclude: (tag: string) => void;
  onRemoveInclude: (tag: string) => void;
  onRemoveExclude: (tag: string) => void;
}) => {
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  const refreshSuggestions = useCallback(() => {
    if (!expanded) return;
    if (search.trim()) {
      setSuggestions(taxonomy.find(type, search, 15).map((t) => t.name));
    } else {
      setSuggestions(
        taxonomy
          .get(type)
          .slice(0, 15)
          .map((t) => t.name),
      );
    }
  }, [expanded, search, type]);

  // Taxonomy syncs in the background; live-refresh whenever a snapshot lands
  // so suggestions appear as soon as a section's data finishes loading.
  useEffect(() => {
    return taxonomy.subscribe(() => refreshSuggestions());
  }, [refreshSuggestions]);

  useEffect(() => {
    if (!expanded) return;
    refreshSuggestions();
    // Tags ship with a static seed; artists/groups/parodies/characters are
    // fetched lazily the first time their section is opened.
    if (taxonomy.get(type).length === 0) {
      setLoadingOptions(true);
      void ensureNhTaxonomy(type).finally(() => {
        setLoadingOptions(false);
        refreshSuggestions();
      });
    }
  }, [expanded, type, refreshSuggestions]);

  const handleAdd = (tag: string) => {
    if (!selectedInclude.includes(tag) && !selectedExclude.includes(tag)) {
      onAddInclude(tag);
    }
  };

  const handleExclude = (tag: string) => {
    if (!selectedInclude.includes(tag) && !selectedExclude.includes(tag)) {
      onAddExclude(tag);
    }
  };

  return (
    <View style={styles.section}>
      <Pressable
        style={styles.sectionHeader}
        onPress={() => setExpanded(!expanded)}
      >
        <Text style={styles.sectionTitle}>{title}</Text>
        {expanded ? (
          <ChevronUp color="#9ca3af" size={20} />
        ) : (
          <ChevronDown color="#9ca3af" size={20} />
        )}
      </Pressable>

      {expanded && (
        <View style={styles.sectionContent}>
          {/* Selected Include Tags */}
          {selectedInclude.length > 0 && (
            <View style={styles.chipContainer}>
              {selectedInclude.map((tag) => (
                <Pressable
                  key={`inc-${tag}`}
                  style={[styles.chip, styles.chipInclude]}
                  onPress={() => onRemoveInclude(tag)}
                >
                  <Text style={styles.chipTextInclude}>{tag}</Text>
                  <X color="#fbbf24" size={14} style={{ marginLeft: 4 }} />
                </Pressable>
              ))}
            </View>
          )}

          {/* Selected Exclude Tags */}
          {selectedExclude.length > 0 && (
            <View style={styles.chipContainer}>
              {selectedExclude.map((tag) => (
                <Pressable
                  key={`exc-${tag}`}
                  style={[styles.chip, styles.chipExclude]}
                  onPress={() => onRemoveExclude(tag)}
                >
                  <Text style={styles.chipTextExclude}>{tag}</Text>
                  <X color="#ef4444" size={14} style={{ marginLeft: 4 }} />
                </Pressable>
              ))}
            </View>
          )}

          <View style={styles.searchInputRow}>
            <Search color="#9ca3af" size={18} />
            <TextInput
              style={styles.searchInput}
              placeholder={`Search ${title.toLowerCase()}...`}
              placeholderTextColor="#6b7280"
              value={search}
              onChangeText={setSearch}
              onSubmitEditing={() => {
                if (search.trim()) {
                  handleAdd(search.trim().toLowerCase());
                  setSearch("");
                }
              }}
            />
          </View>

          {loadingOptions && suggestions.length === 0 ? (
            <View style={styles.suggestionsLoading}>
              <ActivityIndicator size="small" color="#fbbf24" />
              <Text style={styles.suggestionsLoadingText}>
                Loading {title.toLowerCase()}...
              </Text>
            </View>
          ) : (
            <View style={styles.suggestionsContainer}>
              {suggestions.map((sug) => (
                <Pressable
                  key={sug}
                  style={styles.suggestionChip}
                  onPress={() => handleAdd(sug)}
                  onLongPress={() => handleExclude(sug)}
                  delayLongPress={300}
                >
                  <Text style={styles.suggestionText}>{sug}</Text>
                </Pressable>
              ))}
            </View>
          )}
          {!loadingOptions && suggestions.length === 0 ? (
            <Text style={styles.suggestionsEmpty}>
              No suggestions yet - type a name and press enter to add it.
            </Text>
          ) : null}
          <Text style={styles.suggestionsHint}>
            Tap to add, long press to exclude
          </Text>
        </View>
      )}
    </View>
  );
};

export default function NhFilterOverlay({
  visible,
  filters,
  onClose,
  onApply,
}: Props) {
  const [localFilters, setLocalFilters] = useState<NhFilterState>(filters);

  useEffect(() => {
    if (visible) {
      setLocalFilters(filters);
      // Ensure taxonomy is ready
      taxonomy.hydrate().catch(console.error);
    }
  }, [visible, filters]);

  const handleApply = () => {
    onApply(localFilters);
    onClose();
  };

  const handleReset = () => {
    setLocalFilters(DEFAULT_NH_FILTERS);
  };

  const addInclude = (tag: string) => {
    setLocalFilters((prev) => ({
      ...prev,
      includeTags: [...prev.includeTags, tag],
    }));
  };

  const updateTypedTag = (
    type: NhFilterTagType,
    mode: "include" | "exclude",
    tag: string,
  ) => {
    const key = filterKey(type, mode);
    setLocalFilters((prev) => ({
      ...prev,
      [key]: [...(prev[key] as string[]), tag],
    }));
  };

  const removeTypedTag = (
    type: NhFilterTagType,
    mode: "include" | "exclude",
    tag: string,
  ) => {
    const key = filterKey(type, mode);
    setLocalFilters((prev) => ({
      ...prev,
      [key]: (prev[key] as string[]).filter((value) => value !== tag),
    }));
  };

  const addExclude = (tag: string) => {
    setLocalFilters((prev) => ({
      ...prev,
      excludeTags: [...prev.excludeTags, tag],
    }));
  };

  const removeInclude = (tag: string) => {
    setLocalFilters((prev) => ({
      ...prev,
      includeTags: prev.includeTags.filter((t) => t !== tag),
    }));
  };

  const removeExclude = (tag: string) => {
    setLocalFilters((prev) => ({
      ...prev,
      excludeTags: prev.excludeTags.filter((t) => t !== tag),
    }));
  };

  const toggleLanguage = (lang: string) => {
    setLocalFilters((prev) => {
      if (prev.languages.includes(lang)) {
        return { ...prev, languages: prev.languages.filter((l) => l !== lang) };
      }
      return { ...prev, languages: [...prev.languages, lang] };
    });
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.modalBg}
      >
        <SafeAreaView style={styles.modalContainer} edges={["top", "bottom"]}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Advanced Filters</Text>
            <Pressable onPress={onClose} hitSlop={8}>
              <X color="white" size={24} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.contentPad}
          >
            {/* Filter Types */}
            {(
              [
                "tag",
                "artist",
                "group",
                "character",
                "parody",
              ] as NhFilterTagType[]
            ).map((type) => (
              <TagSection
                key={type}
                title={NH_TAG_TYPE_LABEL[type]}
                type={type}
                selectedInclude={
                  (localFilters[filterKey(type, "include")] as string[]) ?? []
                }
                selectedExclude={
                  (localFilters[filterKey(type, "exclude")] as string[]) ?? []
                }
                onAddInclude={(tag) =>
                  type === "tag"
                    ? addInclude(tag)
                    : updateTypedTag(type, "include", tag)
                }
                onAddExclude={(tag) =>
                  type === "tag"
                    ? addExclude(tag)
                    : updateTypedTag(type, "exclude", tag)
                }
                onRemoveInclude={(tag) =>
                  type === "tag"
                    ? removeInclude(tag)
                    : removeTypedTag(type, "include", tag)
                }
                onRemoveExclude={(tag) =>
                  type === "tag"
                    ? removeExclude(tag)
                    : removeTypedTag(type, "exclude", tag)
                }
              />
            ))}

            {/* Languages */}
            <View style={styles.section}>
              <Text style={styles.sectionTitleLocked}>
                {NH_TAG_TYPE_LABEL.language}
              </Text>
              <View style={styles.chipContainer}>
                {NH_LANGUAGES.map((lang) => {
                  const active = localFilters.languages.includes(lang.name);
                  return (
                    <Pressable
                      key={lang.name}
                      style={[
                        styles.chip,
                        active ? styles.chipInclude : styles.chipInactive,
                      ]}
                      onPress={() => toggleLanguage(lang.name)}
                    >
                      <Text
                        style={[
                          styles.chipTextInactive,
                          active && styles.chipTextInclude,
                        ]}
                      >
                        {lang.flag} {lang.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <Pressable style={styles.btnReset} onPress={handleReset}>
              <Text style={styles.btnResetText}>Reset</Text>
            </Pressable>
            <Pressable style={styles.btnApply} onPress={handleApply}>
              <Text style={styles.btnApplyText}>Apply</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
    justifyContent: "flex-end",
  },
  modalContainer: {
    backgroundColor: "#111827",
    flex: 0.9,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#374151",
  },
  headerTitle: { color: "#fff", fontSize: 18, fontWeight: "600" },
  content: { flex: 1 },
  contentPad: { padding: 16, gap: 16 },
  section: {
    backgroundColor: "#1f2937",
    borderRadius: 8,
    overflow: "hidden",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
  },
  sectionTitle: { color: "#f3f4f6", fontSize: 16, fontWeight: "500" },
  sectionTitleLocked: {
    color: "#f3f4f6",
    fontSize: 16,
    fontWeight: "500",
    padding: 12,
    paddingBottom: 4,
  },
  sectionContent: { padding: 12, paddingTop: 0, gap: 12 },
  chipContainer: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipInclude: {
    backgroundColor: "rgba(251, 191, 36, 0.1)",
    borderColor: "#fbbf24",
  },
  chipTextInclude: { color: "#fbbf24", fontSize: 14, fontWeight: "500" },
  chipExclude: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
    borderColor: "#ef4444",
  },
  chipTextExclude: { color: "#ef4444", fontSize: 14, fontWeight: "500" },
  chipInactive: {
    backgroundColor: "transparent",
    borderColor: "#4b5563",
  },
  chipTextInactive: { color: "#d1d5db", fontSize: 14 },
  searchInputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#374151",
    borderRadius: 8,
    paddingHorizontal: 10,
    marginTop: 4,
  },
  searchInput: {
    flex: 1,
    color: "#fff",
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  suggestionsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 8,
  },
  suggestionChip: {
    backgroundColor: "#374151",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
  },
  suggestionText: { color: "#d1d5db", fontSize: 13 },
  suggestionsLoading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    paddingVertical: 6,
  },
  suggestionsLoadingText: { color: "#9ca3af", fontSize: 13 },
  suggestionsEmpty: {
    color: "#6b7280",
    fontSize: 12,
    marginTop: 8,
    marginLeft: 4,
  },
  suggestionsHint: {
    color: "#6b7280",
    fontSize: 10,
    marginTop: 4,
    marginLeft: 4,
  },
  footer: {
    flexDirection: "row",
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "#374151",
  },
  btnReset: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    backgroundColor: "#374151",
  },
  btnResetText: { color: "#f3f4f6", fontSize: 16, fontWeight: "600" },
  btnApply: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    backgroundColor: "#fbbf24",
  },
  btnApplyText: { color: "#000", fontSize: 16, fontWeight: "600" },
});
