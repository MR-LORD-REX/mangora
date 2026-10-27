import { Check } from "lucide-react-native";
import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radius } from "@shared/theme";
import type { LibrarySummary } from "@core/db/repositories/libraryRepository";

export interface AddLibraryModalProps {
  open: boolean;
  libraries: LibrarySummary[];
  onClose: () => void;
  selectedLibraryIds: Set<string>;
  pendingRemovalLibraryId: string | null;
  saving: boolean;
  onToggle: (library: LibrarySummary) => void;
  onConfirm: () => void;
}

export default function AddLibraryModal({
  open,
  libraries,
  onClose,
  selectedLibraryIds,
  pendingRemovalLibraryId,
  saving,
  onToggle,
  onConfirm,
}: AddLibraryModalProps) {
  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Choose libraries</Text>
          {libraries.map((library) => (
            <Pressable
              key={library.id}
              onPress={() => onToggle(library)}
              style={({ pressed }) => [
                styles.libraryRow,
                pressed && styles.libraryPressed,
              ]}
            >
              <View
                style={[
                  styles.checkbox,
                  selectedLibraryIds.has(library.id) && styles.checkboxSelected,
                  pendingRemovalLibraryId === library.id &&
                    styles.checkboxPending,
                ]}
              >
                {selectedLibraryIds.has(library.id) ? (
                  <Check size={16} color={colors.onAccent} />
                ) : null}
              </View>
              <Text style={styles.libraryName}>{library.name}</Text>
            </Pressable>
          ))}
          {!libraries.length ? (
            <Text style={styles.emptyLibraries}>No libraries yet.</Text>
          ) : null}
          <View style={styles.modalActions}>
            <Pressable
              disabled={saving}
              onPress={onClose}
              style={styles.cancelRow}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              disabled={saving}
              onPress={onConfirm}
              style={styles.confirmButton}
            >
              <Text style={styles.confirmText}>
                {saving ? "Saving..." : "Confirm"}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: colors.scrim,
  },
  modalCard: {
    backgroundColor: colors.surfaceHigh,
    borderRadius: radius.lg,
    padding: 18,
  },
  modalTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 6,
  },
  libraryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
  },
  libraryPressed: { opacity: 0.7 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.text,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accent,
  },
  checkboxPending: { opacity: 0.65 },
  libraryName: { color: colors.text, fontSize: 16 },
  emptyLibraries: { color: colors.textMuted, marginTop: 12 },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: 18,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  cancelRow: { paddingVertical: 10 },
  cancelText: { color: colors.textMuted, fontWeight: "600" },
  confirmButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  confirmText: { color: colors.onAccent, fontWeight: "700" },
});
