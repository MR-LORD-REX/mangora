import React, { useMemo } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  ArrowDownUp,
  ArrowUpAZ,
  BookOpen,
  Check,
  LibraryBig,
  SlidersHorizontal,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";

import { colors, radius } from "@shared/theme";
import type { LibrarySort } from "@/services/db/repositories/libraryRepository";
import {
  cachedInstalledExtensions,
  extensionProviderFor,
} from "@features/extensions/registry/registry";


const SORTS: { value: LibrarySort; label: string; icon: LucideIcon }[] = [
  { value: "addedDesc", label: "Date added · newest", icon: ArrowDownUp },
  { value: "addedAsc", label: "Date added · oldest", icon: ArrowDownUp },
  { value: "readDesc", label: "Most unread first", icon: ArrowDownUp },
  { value: "readAsc", label: "Fewest unread first", icon: ArrowDownUp },
  { value: "provider", label: "Source A-Z", icon: ArrowUpAZ },
];

interface LibraryFilterSheetProps {
  visible: boolean;
  sort: LibrarySort;
  provider: string;
  onClose: () => void;
  onSort: (sort: LibrarySort) => void;
  onProvider: (provider: string) => void;
}

export default function LibraryFilterSheet({
  visible,
  sort,
  provider,
  onClose,
  onSort,
  onProvider,
}: LibraryFilterSheetProps) {
  const providers = useMemo(() => {
    const entries = cachedInstalledExtensions().flatMap((extension) =>
      extension.sources.map((source) => ({
        value: extensionProviderFor(source.id),
        label: `${extension.name} · ${source.name}`,
        icon: BookOpen,
      })),
    );
    return [
      { value: "", label: "All sources", icon: LibraryBig },
      ...entries,
    ];
  }, []);

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
            <SlidersHorizontal size={18} color={colors.accent} />
            <Text style={styles.headerText}>Sort & filter library</Text>
          </View>

          <ScrollView bounces={false} contentContainerStyle={styles.body}>
            <Text style={styles.sectionTitle}>Sort</Text>
            {SORTS.map((item) => {
              const Icon = item.icon;
              const selected = sort === item.value;
              return (
                <Pressable
                  key={item.value}
                  onPress={() => onSort(item.value)}
                  style={({ pressed }) => [
                    styles.row,
                    selected && styles.rowSelected,
                    pressed && styles.rowPressed,
                  ]}
                >
                  <Icon
                    size={18}
                    color={selected ? colors.accent : colors.textMuted}
                  />
                  <Text
                    style={[
                      styles.rowLabel,
                      selected && styles.rowLabelSelected,
                    ]}
                  >
                    {item.label}
                  </Text>
                  {selected ? <Check size={17} color={colors.accent} /> : null}
                </Pressable>
              );
            })}

            <Text style={[styles.sectionTitle, styles.secondSection]}>
              Source
            </Text>
            {providers.map((item) => {
              const Icon = item.icon;
              const selected = provider === item.value;
              return (
                <Pressable
                  key={item.value || "all"}
                  onPress={() => onProvider(item.value)}
                  style={({ pressed }) => [
                    styles.row,
                    selected && styles.rowSelected,
                    pressed && styles.rowPressed,
                  ]}
                >
                  <Icon
                    size={18}
                    color={selected ? colors.accent : colors.textMuted}
                  />
                  <Text
                    style={[
                      styles.rowLabel,
                      selected && styles.rowLabelSelected,
                    ]}
                  >
                    {item.label}
                  </Text>
                  {selected ? <Check size={17} color={colors.accent} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surfaceHigh,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingBottom: 28,
    maxHeight: "80%",
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.border,
    marginTop: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  headerText: {
    color: colors.text,
    fontSize: 17,
    fontWeight: "800",
  },
  body: { paddingHorizontal: 12, paddingBottom: 12 },
  sectionTitle: {
    color: colors.textFaint,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    paddingHorizontal: 10,
    marginTop: 4,
    marginBottom: 4,
  },
  secondSection: { marginTop: 18 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: radius.md,
  },
  rowSelected: { backgroundColor: colors.accentSoft },
  rowPressed: { opacity: 0.7 },
  rowLabel: { color: colors.textMuted, fontSize: 15, flex: 1, fontWeight: "600" },
  rowLabelSelected: { color: colors.accent },
});
