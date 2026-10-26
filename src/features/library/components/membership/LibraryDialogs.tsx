import { Check } from "lucide-react-native";
import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import type { LibrarySummary } from "@/services/db/repositories/libraryRepository";
import { colors, radius } from "@shared/theme";

interface CreateLibraryDialogProps {
  visible: boolean;
  name: string;
  onNameChange: (name: string) => void;
  onCancel: () => void;
  onCreate: () => void;
}

export function CreateLibraryDialog({
  visible,
  name,
  onNameChange,
  onCancel,
  onCreate,
}: CreateLibraryDialogProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Create library</Text>
          <TextInput
            autoFocus
            value={name}
            onChangeText={onNameChange}
            placeholder="Library name"
            placeholderTextColor={colors.textFaint}
            onSubmitEditing={onCreate}
            style={styles.input}
          />
          <View style={styles.actions}>
            <Pressable onPress={onCancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={onCreate}>
              <Text style={styles.confirmText}>Create</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

interface BulkDeleteDialogProps {
  visible: boolean;
  libraries: LibrarySummary[];
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export function BulkDeleteLibrariesDialog({
  visible,
  libraries,
  selected,
  onToggle,
  onCancel,
  onConfirm,
}: BulkDeleteDialogProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>Delete libraries</Text>
          <Text style={styles.hint}>
            Choose the libraries to remove. Default and Downloads cannot be deleted.
          </Text>
          <ScrollView style={styles.list} bounces={false}>
            {libraries.map((library) => {
              const checked = selected.has(library.id);
              return (
                <Pressable
                  key={library.id}
                  onPress={() => onToggle(library.id)}
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                >
                  <View style={[styles.checkbox, checked && styles.checkboxOn]}>
                    {checked ? (
                      <Check color={colors.onAccent} size={13} strokeWidth={3} />
                    ) : null}
                  </View>
                  <Text numberOfLines={1} style={styles.rowLabel}>
                    {library.name}
                  </Text>
                </Pressable>
              );
            })}
            {libraries.length === 0 ? (
              <Text style={styles.hint}>You have no custom libraries.</Text>
            ) : null}
          </ScrollView>
          <View style={styles.actions}>
            <Pressable onPress={onCancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={onConfirm} disabled={selected.size === 0}>
              <Text
                style={[styles.confirmText, selected.size === 0 && styles.confirmDisabled]}
              >
                Delete{selected.size > 0 ? ` ${selected.size}` : ""}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: colors.scrim,
  },
  card: { backgroundColor: colors.surfaceHigh, borderRadius: radius.lg, padding: 18 },
  title: { color: colors.text, fontSize: 18, fontWeight: "700" },
  input: {
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginTop: 14,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 18,
    marginTop: 18,
  },
  cancelText: { color: colors.textMuted, fontWeight: "600" },
  confirmText: { color: colors.accent, fontWeight: "700" },
  confirmDisabled: { opacity: 0.4 },
  hint: { color: colors.textMuted, fontSize: 13, lineHeight: 18, marginTop: 8 },
  list: { marginTop: 12, maxHeight: 320 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11 },
  rowLabel: { color: colors.text, fontSize: 15, fontWeight: "600", flex: 1 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  pressed: { opacity: 0.7 },
});