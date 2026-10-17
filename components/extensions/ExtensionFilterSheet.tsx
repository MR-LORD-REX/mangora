import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Check, ChevronDown, RotateCcw, SlidersHorizontal, X } from "lucide-react-native";

import { colors, radius } from "@/constants/theme";
import { getExtensionFilters } from "@/services/extensions/native";
import type {
  ExtensionFilterPatch,
  NativeFilter,
} from "@/services/extensions/types";

type Draft = Record<string, unknown>;

interface ExtensionFilterSheetProps {
  visible: boolean;
  sourceId: string;
  onClose: () => void;
  onApply: (patches: ExtensionFilterPatch[]) => void;
}

function defaultFor(filter: NativeFilter): unknown {
  switch (filter.type) {
    case "select":
      return typeof filter.state === "number" ? filter.state : 0;
    case "tristate":
      return typeof filter.state === "number" ? filter.state : 0;
    case "checkbox":
      return Boolean(filter.state);
    case "text":
      return typeof filter.state === "string" ? filter.state : "";
    case "sort": {
      const state = filter.state as
        | { index?: number; ascending?: boolean }
        | null
        | undefined;
      return {
        index: typeof state?.index === "number" ? state.index : 0,
        ascending: state?.ascending !== false,
      };
    }
    default:
      return undefined;
  }
}

function seedDraft(filters: NativeFilter[], target: Draft) {
  for (const filter of filters) {
    if (filter.type === "group") {
      seedDraft(filter.children ?? [], target);
    } else if (filter.type !== "header" && filter.type !== "separator") {
      target[filter.path] = defaultFor(filter);
    }
  }
}

function collectPatches(
  filters: NativeFilter[],
  draft: Draft,
): ExtensionFilterPatch[] {
  const patches: ExtensionFilterPatch[] = [];
  const walk = (items: NativeFilter[]) => {
    for (const filter of items) {
      if (filter.type === "group") {
        walk(filter.children ?? []);
      } else if (
        filter.type !== "header" &&
        filter.type !== "separator" &&
        filter.path in draft
      ) {
        patches.push({ path: filter.path, state: draft[filter.path] });
      }
    }
  };
  walk(filters);
  return patches;
}

function OptionRow({
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
      style={({ pressed }) => [
        styles.optionRow,
        selected && styles.optionRowSelected,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected ? <Check color={colors.onAccent} size={12} strokeWidth={3} /> : null}
      </View>
      <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

function ToggleRow({
  label,
  value,
  onPress,
}: {
  label: string;
  value: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.toggleRow, pressed && styles.pressed]}
    >
      <Text style={styles.toggleLabel}>{label}</Text>
      <View style={[styles.toggleTrack, value && styles.toggleTrackOn]}>
        <View style={[styles.toggleKnob, value && styles.toggleKnobOn]} />
      </View>
    </Pressable>
  );
}

export default function ExtensionFilterSheet({
  visible,
  sourceId,
  onClose,
  onApply,
}: ExtensionFilterSheetProps) {
  const [filters, setFilters] = useState<NativeFilter[]>([]);
  const [draft, setDraft] = useState<Draft>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!visible || !sourceId) return;
    let active = true;
    setLoading(true);
    setError(null);
    getExtensionFilters(sourceId)
      .then((list) => {
        if (!active) return;
        const next: Draft = {};
        seedDraft(list, next);
        setFilters(list);
        setDraft(next);
      })
      .catch((reason) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : "Could not load filters.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [visible, sourceId]);

  const hasFilters = useMemo(
    () => filters.some((filter) => filter.type !== "header" && filter.type !== "separator"),
    [filters],
  );

  const update = (path: string, value: unknown) =>
    setDraft((current) => ({ ...current, [path]: value }));

  const reset = () => {
    const next: Draft = {};
    seedDraft(filters, next);
    setDraft(next);
    setCollapsed({});
  };

  const apply = () => {
    onApply(collectPatches(filters, draft));
    onClose();
  };

  const renderFilter = (filter: NativeFilter, depth = 0): React.ReactNode => {
    if (filter.type === "header") {
      return (
        <Text key={filter.path} style={styles.sectionHeader}>
          {filter.name}
        </Text>
      );
    }
    if (filter.type === "separator") {
      return <View key={filter.path} style={styles.separator} />;
    }
    if (filter.type === "group") {
      const isCollapsed = collapsed[filter.path];
      return (
        <View key={filter.path} style={[styles.group, depth > 0 && styles.groupNested]}>
          <Pressable
            onPress={() =>
              setCollapsed((current) => ({
                ...current,
                [filter.path]: !current[filter.path],
              }))
            }
            style={styles.groupHeader}
          >
            <Text style={styles.groupTitle}>{filter.name}</Text>
            <ChevronDown
              color={colors.textMuted}
              size={18}
              style={{ transform: [{ rotate: isCollapsed ? "-90deg" : "0deg" }] }}
            />
          </Pressable>
          {!isCollapsed
            ? (filter.children ?? []).map((child) => renderFilter(child, depth + 1))
            : null}
        </View>
      );
    }

    return (
      <View key={filter.path} style={styles.filterBlock}>
        <Text style={styles.filterLabel}>{filter.name}</Text>
        {filter.type === "text" ? (
          <TextInput
            value={String(draft[filter.path] ?? "")}
            onChangeText={(value) => update(filter.path, value)}
            placeholder="Any"
            placeholderTextColor={colors.textFaint}
            style={styles.textInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
        ) : null}

        {filter.type === "select"
          ? (filter.values ?? []).map((value, index) => (
              <OptionRow
                key={`${filter.path}:${index}`}
                label={String(value)}
                selected={Number(draft[filter.path] ?? 0) === index}
                onPress={() => update(filter.path, index)}
              />
            ))
          : null}

        {filter.type === "tristate" ? (
          <View style={styles.segmented}>
            {[
              { value: 0, label: "Ignore" },
              { value: 1, label: "Include" },
              { value: 2, label: "Exclude" },
            ].map((option) => {
              const selected = Number(draft[filter.path] ?? 0) === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => update(filter.path, option.value)}
                  style={[styles.segment, selected && styles.segmentSelected]}
                >
                  <Text
                    style={[
                      styles.segmentLabel,
                      selected && styles.segmentLabelSelected,
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {filter.type === "checkbox" ? (
          <ToggleRow
            label={draft[filter.path] ? "Enabled" : "Disabled"}
            value={Boolean(draft[filter.path])}
            onPress={() => update(filter.path, !draft[filter.path])}
          />
        ) : null}

        {filter.type === "sort"
          ? (() => {
              const state = (draft[filter.path] ?? {
                index: 0,
                ascending: true,
              }) as { index: number; ascending: boolean };
              return (
                <>
                  {(filter.values ?? []).map((value, index) => (
                    <OptionRow
                      key={`${filter.path}:sort:${index}`}
                      label={String(value)}
                      selected={state.index === index}
                      onPress={() =>
                        update(filter.path, { ...state, index })
                      }
                    />
                  ))}
                  <ToggleRow
                    label={state.ascending ? "Ascending" : "Descending"}
                    value={state.ascending}
                    onPress={() =>
                      update(filter.path, {
                        ...state,
                        ascending: !state.ascending,
                      })
                    }
                  />
                </>
              );
            })()
          : null}
      </View>
    );
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
          <Pressable onPress={onClose} hitSlop={8} style={styles.iconButton}>
            <X color={colors.textMuted} size={22} />
          </Pressable>
          <View style={styles.headerTitle}>
            <SlidersHorizontal color={colors.accent} size={18} />
            <Text style={styles.title}>Filters</Text>
          </View>
          <Pressable onPress={reset} hitSlop={8} style={styles.iconButton}>
            <RotateCcw color={colors.textMuted} size={19} />
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : !hasFilters ? (
          <View style={styles.center}>
            <Text style={styles.mutedText}>This source has no filters.</Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {filters.map((filter) => renderFilter(filter))}
          </ScrollView>
        )}

        <View style={styles.footer}>
          <Pressable
            onPress={apply}
            disabled={loading || Boolean(error)}
            style={({ pressed }) => [
              styles.applyButton,
              (loading || Boolean(error)) && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.applyLabel}>Apply filters</Text>
          </Pressable>
        </View>
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
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  headerTitle: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { color: colors.text, fontSize: 18, fontWeight: "800" },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.full,
  },
  content: { padding: 16, paddingBottom: 36, gap: 16 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 30,
    gap: 10,
  },
  mutedText: { color: colors.textMuted, fontSize: 14 },
  errorText: { color: colors.danger, fontSize: 13, lineHeight: 19, textAlign: "center" },
  sectionHeader: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 4,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginVertical: 4,
  },
  filterBlock: { gap: 8 },
  filterLabel: { color: colors.text, fontSize: 14, fontWeight: "700" },
  textInput: {
    color: colors.text,
    fontSize: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  optionRowSelected: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  optionLabel: { color: colors.textMuted, fontSize: 13, flex: 1 },
  optionLabelSelected: { color: colors.text, fontWeight: "700" },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  toggleLabel: { color: colors.textMuted, fontSize: 13, flex: 1 },
  toggleTrack: {
    width: 40,
    height: 24,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceHigh,
    padding: 3,
    justifyContent: "center",
  },
  toggleTrackOn: { backgroundColor: colors.accent },
  toggleKnob: {
    width: 18,
    height: 18,
    borderRadius: radius.full,
    backgroundColor: colors.textMuted,
  },
  toggleKnobOn: { backgroundColor: colors.onAccent, alignSelf: "flex-end" },
  segmented: {
    flexDirection: "row",
    gap: 6,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segment: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    borderRadius: radius.sm,
  },
  segmentSelected: { backgroundColor: colors.accentSoft },
  segmentLabel: { color: colors.textMuted, fontSize: 12, fontWeight: "600" },
  segmentLabelSelected: { color: colors.accent, fontWeight: "800" },
  group: {
    backgroundColor: colors.surfaceHigh,
    borderRadius: radius.lg,
    padding: 12,
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  groupNested: { backgroundColor: colors.surface },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  groupTitle: { color: colors.text, fontSize: 14, fontWeight: "800" },
  footer: {
    padding: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  applyButton: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    paddingVertical: 14,
  },
  applyLabel: { color: colors.onAccent, fontSize: 14, fontWeight: "800" },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.7 },
});