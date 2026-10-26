import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Minus,
  RotateCcw,
  Search,
  X,
} from "lucide-react-native";

import { colors, radius } from "@shared/theme";
import {
  buildFilterSelection,
  createFilterDraft,
  editableFilters,
  filterBlocks,
  filterDefault,
  filterGroupLabel,
  filterSchema,
  filterValueLabel,
  type ExtensionFilterSelection,
  type FilterBlock,
  type FilterDraft,
} from "../../filters/filters";
import { getExtensionFilters } from "@platform/extensions";
import type { NativeFilter } from "@platform/extensions/types";

interface ExtensionFilterSheetProps {
  visible: boolean;
  sourceId: string;
  sourceName?: string;
  value?: ExtensionFilterSelection;
  initialView?: "overview" | "active";
  onClose: () => void;
  onApply: (value: ExtensionFilterSelection) => void;
}

interface PickerItem {
  key: string;
  label: string;
  index?: number;
  block?: FilterBlock;
}

function Choice({
  label,
  selected,
  onPress,
  disabled = false,
  role = "radio",
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
  role?: "radio" | "checkbox";
}) {
  return (
    <Pressable
      accessibilityRole={role}
      aria-checked={selected}
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        selected && styles.choiceSelected,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      {selected ? <Check size={15} color={colors.accent} /> : null}
      <Text style={[styles.choiceText, selected && styles.selectedText]}>
        {label}
      </Text>
    </Pressable>
  );
}

function SummaryRow({
  label,
  detail,
  onPress,
}: {
  label: string;
  detail: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${detail}`}
      onPress={onPress}
      style={({ pressed }) => [styles.summaryRow, pressed && styles.pressed]}
    >
      <View style={styles.rowText}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.detail} numberOfLines={2}>
          {detail}
        </Text>
      </View>
      <ChevronRight size={20} color={colors.textMuted} />
    </Pressable>
  );
}

function CheckRow({
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
      accessibilityRole="checkbox"
      aria-checked={selected}
      accessibilityLabel={label}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.optionRow, pressed && styles.pressed]}
    >
      <View style={[styles.checkBox, selected && styles.checkBoxSelected]}>
        {selected ? <Check size={16} color={colors.onAccent} /> : null}
      </View>
      <Text style={styles.optionText}>{label}</Text>
      <Text style={styles.detail}>
        {selected ? "Selected" : "Not selected"}
      </Text>
    </Pressable>
  );
}

export default function ExtensionFilterSheet({
  visible,
  sourceId,
  sourceName,
  value,
  initialView = "overview",
  onClose,
  onApply,
}: ExtensionFilterSheetProps) {
  const { width, height, fontScale } = useWindowDimensions();
  const [filters, setFilters] = useState<NativeFilter[]>([]);
  const [draft, setDraft] = useState<FilterDraft>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [panel, setPanel] = useState<"overview" | "more" | "active">(
    "overview",
  );
  const [trail, setTrail] = useState<NativeFilter[]>([]);
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [includeMode, setIncludeMode] = useState<1 | 2>(1);

  useEffect(() => {
    if (!visible || !sourceId) return;
    let active = true;
    setLoading(true);
    setError(null);
    setNotice(null);
    setTrail([]);
    setPanel(initialView);
    setQuery("");
    setSearchFocused(false);
    setSelectedOnly(false);
    getExtensionFilters(sourceId)
      .then((list) => {
        if (!active) return;
        const compatible = !value || value.schema === filterSchema(list);
        setFilters(list);
        setDraft(createFilterDraft(list, compatible ? value?.patches : []));
        if (!compatible && value.patches.length)
          setNotice(
            "This source's options or defaults changed. Previous selections could not be restored safely. Review the current defaults before applying.",
          );
      })
      .catch((reason) => {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : "Could not load filters.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [visible, sourceId, value, initialView, attempt]);

  const selection = useMemo(
    () => buildFilterSelection(filters, draft),
    [filters, draft],
  );
  const blocks = useMemo(() => filterBlocks(filters), [filters]);
  const hasFilters = editableFilters(filters).length > 0;
  const moveTextFields =
    blocks.filter((block) => block.filter.type !== "header").length > 4;
  const moreBlocks = moveTextFields
    ? blocks.filter((block) => block.filter.type === "text")
    : [];
  const overviewBlocks = moveTextFields
    ? blocks.filter((block) => block.filter.type !== "text")
    : blocks;
  const current = trail[trail.length - 1];
  const directChildren = (current?.children ?? []).filter(
    (child) => child.type !== "header" && child.type !== "separator",
  );
  const triGroup =
    current?.type === "group" &&
    directChildren.length > 0 &&
    directChildren.every((child) => child.type === "tristate");
  const checkGroup =
    current?.type === "group" &&
    directChildren.length > 0 &&
    directChildren.every((child) => child.type === "checkbox");
  const multiGroup = triGroup || checkGroup;
  const compactPicker = searchFocused || height < 640 || fontScale > 1.3;
  const parentFilters = trail.length > 1 ? trail[trail.length - 2].children ?? [] : filters;
  const pickerNotes = [...new Set([
    ...(filterBlocks(parentFilters).find((block) => block.filter.path === current?.path)?.notes ?? []),
    ...(multiGroup ? (current?.children ?? []).filter((child) => child.type === "header").map((child) => child.name) : []),
  ])];
  const selectedChildren = directChildren.filter((child) =>
    child.type === "checkbox"
      ? Boolean(draft[child.path])
      : child.type === "tristate" && Number(draft[child.path] ?? 0) !== 0,
  );
  const canApply = !loading && !error && hasFilters;
  const selectedPaths = new Set(selectedChildren.map((child) => child.path));

  const update = (path: string, state: unknown) =>
    setDraft((previous) => ({ ...previous, [path]: state }));
  const resetAll = () => setDraft(createFilterDraft(filters));
  const resetNode = (filter: NativeFilter) =>
    setDraft((previous) => ({ ...previous, ...createFilterDraft([filter]) }));
  const removePath = (path: string) => {
    const filter = editableFilters(filters).find(
      (entry) => entry.path === path,
    );
    if (filter) update(path, filterDefault(filter));
  };
  const back = () => {
    Keyboard.dismiss();
    setSearchFocused(false);
    if (current) {
      setTrail((previous) => previous.slice(0, -1));
      setQuery("");
      setSelectedOnly(false);
    } else if (panel !== "overview") setPanel("overview");
    else onClose();
  };
  const openPicker = (filter: NativeFilter) => {
    Keyboard.dismiss();
    setSearchFocused(false);
    setTrail((previous) => [...previous, filter]);
    setQuery("");
    setSelectedOnly(false);
    setIncludeMode(1);
  };
  const apply = () => {
    Keyboard.dismiss();
    onApply(selection);
    onClose();
  };

  const pickerItems: PickerItem[] =
    current?.type === "select" || current?.type === "sort"
      ? (current.values ?? []).map((option, index) => ({
          key: `${current.path}:${index}`,
          label: String(option),
          index,
        }))
      : filterBlocks(current?.children ?? []).map((block) => ({
          key: block.filter.path,
          label: block.filter.name,
          block,
        }));
  const searchTerm = query.trim().toLocaleLowerCase();
  const visibleItems = pickerItems.filter((item) => {
    const matchesSearch =
      !searchTerm ||
      `${item.label} ${item.block?.notes.join(" ") ?? ""}`
        .toLocaleLowerCase()
        .includes(searchTerm);
    const matchesSelection =
      !selectedOnly ||
      (item.block && selectedPaths.has(item.block.filter.path));
    return matchesSearch && matchesSelection;
  });

  const renderNotes = (block: FilterBlock) =>
    block.notes.map((note, index) => (
      <Text key={`${block.filter.path}:note:${index}`} style={styles.note}>
        {note}
      </Text>
    ));

  const renderControl = (filter: NativeFilter): React.ReactNode => {
    if (filter.type === "header" || filter.type === "separator") return null;
    if (filter.type === "text")
      return (
        <View style={styles.field}>
          <Text style={styles.label}>{filter.name}</Text>
          <TextInput
            accessibilityLabel={filter.name}
            value={String(draft[filter.path] ?? "")}
            onChangeText={(text) => update(filter.path, text)}
            placeholder="Any"
            placeholderTextColor={colors.textFaint}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      );
    if (filter.type === "checkbox")
      return (
        <CheckRow
          label={filter.name}
          selected={Boolean(draft[filter.path])}
          onPress={() => update(filter.path, !draft[filter.path])}
        />
      );
    if (filter.type === "tristate")
      return (
        <View style={styles.field}>
          <Text style={styles.label}>{filter.name}</Text>
          <View
            accessibilityRole="radiogroup"
            accessibilityLabel={filter.name}
            style={styles.choices}
          >
            {["Any", "Include", "Exclude"].map((label, index) => (
              <Choice
                key={label}
                label={label}
                selected={Number(draft[filter.path] ?? 0) === index}
                onPress={() => update(filter.path, index)}
              />
            ))}
          </View>
        </View>
      );
    if (filter.type === "group") {
      const children = filter.children ?? [];
      const shortCheckboxGroup =
        children.length > 0 &&
        children.length <= 4 &&
        children.every((child) => child.type === "checkbox") &&
        fontScale <= 1.3 &&
        children.reduce(
          (total, child) => total + child.name.length * 8 * fontScale + 54,
          0,
        ) <=
          (width - 56) * 2;
      if (shortCheckboxGroup)
        return (
          <View style={styles.field}>
            <Text style={styles.label}>{filter.name}</Text>
            <View style={styles.choices}>
              {children.map((child) => (
                <Choice
                  key={child.path}
                  role="checkbox"
                  label={child.name}
                  selected={Boolean(draft[child.path])}
                  onPress={() => update(child.path, !draft[child.path])}
                />
              ))}
            </View>
          </View>
        );
      return (
        <SummaryRow
          label={filter.name}
          detail={filterGroupLabel(filter, draft)}
          onPress={() => openPicker(filter)}
        />
      );
    }
    if (filter.type === "select") {
      const options = filter.values ?? [];
      const shortOptions =
        options.length > 0 &&
        options.length <= 4 &&
        fontScale <= 1.3 &&
        options.reduce<number>(
          (total, option) => total + String(option).length * 8 * fontScale + 54,
          0,
        ) <=
          (width - 56) * 2;
      if (shortOptions)
        return (
          <View style={styles.field}>
            <Text style={styles.label}>{filter.name}</Text>
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel={filter.name}
              style={styles.choices}
            >
              {options.map((option, index) => (
                <Choice
                  key={`${filter.path}:${index}`}
                  label={String(option)}
                  selected={draft[filter.path] === index}
                  onPress={() => update(filter.path, index)}
                />
              ))}
            </View>
          </View>
        );
    }
    if (filter.type === "select" || filter.type === "sort")
      return (
        <SummaryRow
          label={filter.name}
          detail={filterValueLabel(filter, draft)}
          onPress={() => openPicker(filter)}
        />
      );
    return (
      <View style={styles.field}>
        <Text style={styles.label}>{filter.name || "Unknown filter"}</Text>
        <Text style={styles.note}>
          This control is not supported by this build.
        </Text>
      </View>
    );
  };

  const renderBlock = (block: FilterBlock) => (
    <View key={block.filter.path} style={styles.field}>
      {renderNotes(block)}
      {renderControl(block.filter)}
    </View>
  );

  const renderPickerItem = ({ item }: { item: PickerItem }) => {
    if (!current) return null;
    if (item.index !== undefined) {
      const sort = draft[current.path] as {
        index: number;
        ascending: boolean;
      } | null;
      const selected =
        current.type === "sort"
          ? sort?.index === item.index
          : draft[current.path] === item.index;
      return (
        <Pressable
          accessibilityRole="radio"
          aria-checked={selected}
          accessibilityLabel={item.label}
          accessibilityState={{ checked: selected }}
          onPress={() => {
            update(
              current.path,
              current.type === "sort"
                ? { index: item.index, ascending: sort?.ascending ?? true }
                : item.index,
            );
            if (current.type === "select") back();
            else {
              Keyboard.dismiss();
              setSearchFocused(false);
            }
          }}
          style={({ pressed }) => [styles.optionRow, pressed && styles.pressed]}
        >
          <View style={[styles.radio, selected && styles.checkBoxSelected]}>
            {selected ? <Check size={14} color={colors.onAccent} /> : null}
          </View>
          <Text style={styles.optionText}>{item.label}</Text>
        </Pressable>
      );
    }
    if (!item.block) return null;
    const filter = item.block.filter;
    if (triGroup && filter.type === "tristate") {
      const state = Number(draft[filter.path] ?? 0);
      const label = state === 1 ? "Included" : state === 2 ? "Excluded" : "Any";
      return (
        <View>
          {renderNotes(item.block)}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${filter.name}, ${label}`}
            accessibilityState={{ selected: state !== 0 }}
            accessibilityHint={`Tap to ${state === includeMode ? "clear this selection" : includeMode === 1 ? "include" : "exclude"}.`}
            onPress={() =>
              update(filter.path, state === includeMode ? 0 : includeMode)
            }
            style={({ pressed }) => [
              styles.optionRow,
              pressed && styles.pressed,
            ]}
          >
            <View
              style={[
                styles.checkBox,
                state === 1 && styles.checkBoxSelected,
                state === 2 && styles.excludedBox,
              ]}
            >
              {state === 1 ? (
                <Check size={16} color={colors.onAccent} />
              ) : state === 2 ? (
                <Minus size={16} color={colors.danger} />
              ) : null}
            </View>
            <Text style={styles.optionText}>{filter.name}</Text>
            <Text
              style={[
                styles.detail,
                state === 1 && styles.selectedText,
                state === 2 && styles.excludedText,
              ]}
            >
              {label}
            </Text>
          </Pressable>
        </View>
      );
    }
    return renderBlock(item.block);
  };

  const title =
    current?.name ||
    (panel === "more"
      ? "More filters"
      : panel === "active"
        ? "Active filters"
        : "Filters");
  const sortState =
    current?.type === "sort"
      ? (draft[current.path] as { index: number; ascending: boolean } | null)
      : null;
  const nested = Boolean(current) || panel !== "overview";

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={back}
      presentationStyle="fullScreen"
    >
      <SafeAreaView
        style={styles.safeArea}
        edges={["top", "bottom", "left", "right"]}
      >
        <KeyboardAvoidingView
          style={styles.safeArea}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={styles.header}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                nested ? "Back to filters" : "Close filters without applying"
              }
              onPress={back}
              style={styles.iconButton}
            >
              {nested ? (
                <ArrowLeft color={colors.text} size={23} />
              ) : (
                <X color={colors.text} size={23} />
              )}
            </Pressable>
            <View style={styles.rowText}>
              <Text
                accessibilityRole="header"
                style={styles.title}
                numberOfLines={2}
              >
                {title}
              </Text>
              {sourceName ? (
                <Text style={styles.detail} numberOfLines={1}>
                  {sourceName}
                </Text>
              ) : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                current
                  ? `Reset ${current.name} to source defaults`
                  : "Reset all filters to source defaults"
              }
              disabled={!canApply}
              onPress={() => (current ? resetNode(current) : resetAll())}
              style={[styles.resetButton, !canApply && styles.disabled]}
            >
              <RotateCcw color={colors.textMuted} size={16} />
              <Text style={styles.resetText}>Reset{current ? "" : " all"}</Text>
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.accent} />
              <Text style={styles.detail}>Loading filters for this source...</Text>
            </View>
          ) : error ? (
            <View style={styles.center}>
              <Text style={styles.errorText}>{error}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => setAttempt((previous) => previous + 1)}
                style={styles.choice}
              >
                <Text style={styles.label}>Retry</Text>
              </Pressable>
            </View>
          ) : !hasFilters ? (
            <ScrollView contentContainerStyle={styles.content}>
              <Text style={styles.label}>
                {filters.some((filter) => filter.type === "unknown")
                  ? "This source uses filters that this build does not support."
                  : "This source has no editable filters."}
              </Text>
              {blocks.map(renderBlock)}
            </ScrollView>
          ) : current ? (
            <>
              <View style={styles.pickerHeader}>
                {current.type === "select" || current.type === "sort" ? (
                  <Text style={styles.selectionPreview} numberOfLines={2}>
                    {filterValueLabel(current, draft)}
                  </Text>
                ) : null}
                <View style={styles.searchRow}>
                  <Search size={18} color={colors.textMuted} />
                  <TextInput
                    accessibilityLabel={`Search ${current.name} options`}
                    value={query}
                    onChangeText={setQuery}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setSearchFocused(false)}
                    placeholder="Search options"
                    placeholderTextColor={colors.textFaint}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={styles.searchInput}
                  />
                  {query ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Clear option search"
                      onPress={() => setQuery("")}
                      style={styles.iconButton}
                    >
                      <X size={19} color={colors.textMuted} />
                    </Pressable>
                  ) : null}
                </View>
                {triGroup ? (
                  <>
                    <View
                      accessibilityRole="radiogroup"
                accessibilityLabel={`Selection mode for ${current.name}`}
                      style={styles.choices}
                    >
                      <Choice
                        label="Include"
                        selected={includeMode === 1}
                        onPress={() => setIncludeMode(1)}
                      />
                      <Choice
                        label="Exclude"
                        selected={includeMode === 2}
                        onPress={() => setIncludeMode(2)}
                      />
                    </View>
                    {!compactPicker ? <Text style={styles.note}>
                      Tap an option to{" "}
                      {includeMode === 1 ? "include" : "exclude"} it. Tap again
                      in the same mode to clear.
                    </Text> : null}
                  </>
                ) : null}
                {multiGroup ? (
                  <>
                    <View style={styles.between}>
                      <Pressable
                      accessibilityRole="checkbox"
                      aria-checked={selectedOnly}
                        accessibilityState={{ checked: selectedOnly }}
                        onPress={() => {
                          setSelectedOnly((previous) => !previous);
                          setQuery("");
                        }}
                        style={[
                          styles.choice,
                          selectedOnly && styles.choiceSelected,
                        ]}
                      >
                        <Text style={styles.choiceText}>
                          Selected only ({selectedChildren.length})
                        </Text>
                      </Pressable>
                    </View>
                    {selectedChildren.length ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`View selected options. ${filterGroupLabel(current, draft)}`}
                        style={styles.selectionSummary}
                        onPress={() => {
                          setSelectedOnly(true);
                          setQuery("");
                          Keyboard.dismiss();
                          setSearchFocused(false);
                        }}
                      >
                        <Text style={styles.selectionPreview} numberOfLines={compactPicker ? 1 : 2}>
                          {selectedChildren.length} selected · {filterGroupLabel(current, draft)}
                        </Text>
                      </Pressable>
                    ) : (
                      <Text style={styles.note}>No options selected.</Text>
                    )}
                  </>
                ) : null}
                {current.type === "sort" && !searchFocused ? (
                  <View style={styles.field}>
                    <Text style={styles.label}>Direction</Text>
                    <View
                      accessibilityRole="radiogroup"
                      accessibilityLabel="Sort direction"
                      style={styles.choices}
                    >
                      {[true, false].map((ascending) => (
                        <Choice
                          key={String(ascending)}
                          label={ascending ? "Ascending" : "Descending"}
                          selected={Boolean(
                            sortState && sortState.ascending === ascending,
                          )}
                          disabled={!sortState}
                          onPress={() => {
                            if (sortState)
                              update(current.path, {
                                index: sortState.index,
                                ascending,
                              });
                          }}
                        />
                      ))}
                    </View>
                    {!sortState ? (
                      <Text style={styles.note}>
                        Using the source default. Choose a sort field to set its
                        direction.
                      </Text>
                    ) : null}
                  </View>
                ) : null}
              </View>
              <FlatList
                key={current.path}
                ListHeaderComponent={pickerNotes.length ? (
                  <View style={styles.field}>
                    {pickerNotes.map((note, index) => <Text key={index} style={styles.note}>{note}</Text>)}
                  </View>
                ) : null}
                data={visibleItems}
                renderItem={renderPickerItem}
                keyExtractor={(item) => item.key}
                extraData={[draft, includeMode]}
                contentContainerStyle={styles.pickerContent}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                initialNumToRender={16}
                maxToRenderPerBatch={16}
                windowSize={7}
                ListEmptyComponent={
                  <View style={styles.center}>
                    <Text style={styles.detail}>
                      {query || selectedOnly
                        ? "No options match this view."
                        : "The source supplied no options for this category."}
                    </Text>
                    {query || selectedOnly ? (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => {
                          setQuery("");
                          setSelectedOnly(false);
                        }}
                        style={styles.choice}
                      >
                        <Text style={styles.label}>Show all options</Text>
                      </Pressable>
                    ) : null}
                  </View>
                }
              />
            </>
          ) : (
            <ScrollView
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
            >
              {notice ? (
                <Text accessibilityRole="alert" style={styles.notice}>
                  {notice}
                </Text>
              ) : null}
              {panel === "active" ? (
                <>
                  <Text style={styles.note}>
                    Remove a selection to restore its source default.
                    Apply to update results.
                  </Text>
                  {selection.chips.length ? (
                    selection.chips.map((chip) => (
                      <Pressable
                        key={chip.path}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${chip.label}`}
                        onPress={() => removePath(chip.path)}
                        style={styles.activeRow}
                      >
                        <Text style={styles.activeText}>{chip.label}</Text>
                        <X size={18} color={colors.accent} />
                      </Pressable>
                    ))
                  ) : (
                    <Text style={styles.label}>
                      No changes from source defaults.
                    </Text>
                  )}
                </>
              ) : panel === "more" ? (
                moreBlocks.map(renderBlock)
              ) : (
                <>
                  {selection.chips.length ? (
                    <View style={styles.activePreview}>
                      <View style={styles.between}>
                        <Text style={styles.label}>Your selections</Text>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => setPanel("active")}
                          style={styles.resetButton}
                        >
                          <Text style={styles.link}>
                            View all ({selection.chips.length})
                          </Text>
                        </Pressable>
                      </View>
                      {selection.chips.slice(0, 2).map((chip) => (
                        <Pressable
                          key={chip.path}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${chip.label}`}
                          onPress={() => removePath(chip.path)}
                          style={styles.activeRow}
                        >
                          <Text style={styles.activeText} numberOfLines={2}>
                            {chip.label}
                          </Text>
                          <X size={17} color={colors.accent} />
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                  {overviewBlocks.map(renderBlock)}
                  {moreBlocks.length ? (
                    <View style={styles.field}>
                      {moreBlocks
                        .filter((block) => block.notes.length)
                        .map((block) => (
                          <View key={block.filter.path} style={styles.field}>
                            <Text style={styles.note}>{block.filter.name}</Text>
                            {renderNotes(block)}
                          </View>
                        ))}
                      <SummaryRow
                        label="More filters"
                        detail={moreBlocks
                          .map(
                            ({ filter }) =>
                              `${filter.name}${String(draft[filter.path] ?? "").trim() ? `: ${String(draft[filter.path])}` : ""}`,
                          )
                          .join(" · ")}
                        onPress={() => setPanel("more")}
                      />
                    </View>
                  ) : null}
                </>
              )}
            </ScrollView>
          )}

          <View style={styles.footer}>
            {!loading && !error && hasFilters && !(current && compactPicker) ? (
              <Text accessibilityLiveRegion="polite" style={styles.footerNote}>
                {selection.summaries.length
                  ? `${selection.summaries.length} ${selection.summaries.length === 1 ? "category" : "categories"} changed from source defaults`
                  : "Using source defaults"}
              </Text>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ disabled: !canApply }}
              disabled={!canApply}
              onPress={nested ? back : apply}
              style={({ pressed }) => [
                styles.applyButton,
                !canApply && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.applyText}>
                {nested ? "Done" : "Apply filters"}
              </Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  title: { color: colors.text, fontSize: 18, fontWeight: "800" },
  iconButton: {
    minWidth: 48,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  resetButton: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 8,
    flexShrink: 1,
  },
  resetText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "600",
    flexShrink: 1,
  },
  rowText: { flex: 1, minWidth: 0, gap: 5 },
  content: { padding: 16, paddingBottom: 28, gap: 20, flexGrow: 1 },
  field: { gap: 8 },
  label: { color: colors.text, fontSize: 14, fontWeight: "700", flexShrink: 1 },
  detail: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    flexShrink: 1,
  },
  note: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  notice: {
    color: colors.gold,
    backgroundColor: colors.goldSoft,
    padding: 12,
    borderRadius: radius.md,
    fontSize: 13,
    lineHeight: 20,
  },
  summaryRow: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: {
    minHeight: 48,
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
  },
  choiceSelected: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accent,
  },
  choiceText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: "600",
    flexShrink: 1,
  },
  selectedText: { color: colors.accent },
  excludedText: { color: colors.danger },
  input: {
    minHeight: 48,
    color: colors.text,
    fontSize: 15,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  optionRow: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  optionText: { flex: 1, color: colors.text, fontSize: 14, lineHeight: 21 },
  checkBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.textFaint,
    justifyContent: "center",
    alignItems: "center",
  },
  checkBoxSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  excludedBox: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.danger,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.textFaint,
    justifyContent: "center",
    alignItems: "center",
  },
  between: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
  },
  pickerHeader: {
    padding: 16,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  searchRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 12,
    gap: 8,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    minHeight: 48,
    flex: 1,
    color: colors.text,
    fontSize: 15,
    paddingVertical: 10,
  },
  pickerContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 8,
    flexGrow: 1,
  },
  selectionPreview: { color: colors.accent, fontSize: 13, lineHeight: 19 },
  selectionSummary: { minHeight: 48, justifyContent: "center" },
  activePreview: { gap: 8 },
  activeRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
  },
  activeText: { flex: 1, color: colors.accent, fontSize: 13, lineHeight: 20 },
  link: { color: colors.accent, fontSize: 13, fontWeight: "700" },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
    gap: 14,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
  },
  footer: {
    padding: 14,
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  footerNote: { color: colors.textMuted, fontSize: 12, textAlign: "center" },
  applyButton: {
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    padding: 14,
  },
  applyText: { color: colors.onAccent, fontSize: 15, fontWeight: "800" },
  disabled: { opacity: 0.4 },
  pressed: { opacity: 0.65 },
});
