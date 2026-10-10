/**
 * Dialogs.tsx
 * ---------------------------------------------------------------------------
 * Small app-themed modal dialogs: a confirm card (with an optional destructive
 * action) and a single-field text prompt. Used by Settings and the download
 * manager instead of the platform Alert so styling stays consistent.
 * ---------------------------------------------------------------------------
 */

import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { colors, radius } from "@/constants/theme";

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  busy = false,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <Pressable style={styles.scrim} onPress={onCancel}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <View style={styles.actions}>
            <Pressable
              onPress={onCancel}
              disabled={busy}
              style={({ pressed }) => [
                styles.button,
                styles.cancel,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.cancelLabel}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              disabled={busy}
              style={({ pressed }) => [
                styles.button,
                destructive ? styles.danger : styles.primary,
                pressed && styles.pressed,
              ]}
            >
              {busy ? (
                <ActivityIndicator color={colors.onAccent} size="small" />
              ) : (
                <Text style={styles.confirmLabel}>{confirmLabel}</Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function PromptDialog({
  visible,
  title,
  message,
  placeholder,
  initialValue = "",
  confirmLabel = "Save",
  secure = false,
  busy = false,
  keyboardType,
  onCancel,
  onSubmit,
}: {
  visible: boolean;
  title: string;
  message?: string;
  placeholder?: string;
  initialValue?: string;
  confirmLabel?: string;
  secure?: boolean;
  busy?: boolean;
  keyboardType?: "default" | "url" | "numeric";
  onCancel: () => void;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState(initialValue);

  // Re-seed whenever the dialog opens so it always shows the stored value.
  useEffect(() => {
    if (visible) setValue(initialValue);
  }, [visible, initialValue]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <Pressable style={styles.scrim} onPress={onCancel}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <TextInput
            value={value}
            onChangeText={setValue}
            placeholder={placeholder}
            placeholderTextColor={colors.textFaint}
            secureTextEntry={secure}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType={keyboardType ?? "default"}
            style={styles.input}
          />
          <View style={styles.actions}>
            <Pressable
              onPress={onCancel}
              disabled={busy}
              style={({ pressed }) => [
                styles.button,
                styles.cancel,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.cancelLabel}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => onSubmit(value.trim())}
              disabled={busy}
              style={({ pressed }) => [
                styles.button,
                styles.primary,
                pressed && styles.pressed,
              ]}
            >
              {busy ? (
                <ActivityIndicator color={colors.onAccent} size="small" />
              ) : (
                <Text style={styles.confirmLabel}>{confirmLabel}</Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: colors.scrim,
    alignItems: "center",
    justifyContent: "center",
    padding: 26,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 18,
  },
  title: { color: colors.text, fontSize: 16, fontWeight: "800" },
  message: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 8,
  },
  input: {
    marginTop: 14,
    backgroundColor: colors.bg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 18,
  },
  button: {
    minWidth: 96,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  cancel: { backgroundColor: colors.surfaceHigh },
  primary: { backgroundColor: colors.accent },
  danger: { backgroundColor: colors.danger },
  cancelLabel: { color: colors.textMuted, fontSize: 13, fontWeight: "700" },
  confirmLabel: { color: colors.onAccent, fontSize: 13, fontWeight: "800" },
  pressed: { opacity: 0.75 },
});
