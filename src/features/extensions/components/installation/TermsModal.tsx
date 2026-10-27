import { Check, ExternalLink } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import * as WebBrowser from "expo-web-browser";

import { colors, radius } from "@shared/theme";
import { SITE_ORIGIN } from "@shared/links/mangaLinks";

interface TermsModalProps {
  visible: boolean;
  extensionName: string;
  onCancel: () => void;
  onAccept: () => void;
}

/**
 * One-time extension install consent. Deliberately a React modal rather than
 * the native alert so the checkbox, hyperlink and copy can be laid out
 * together.
 */
export default function TermsModal({
  visible,
  extensionName,
  onCancel,
  onAccept,
}: TermsModalProps) {
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (visible) setChecked(false);
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.scrim} onPress={onCancel}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>Before installing {extensionName}</Text>
          <Text style={styles.body}>
            Extensions are third-party packages. Mangora only provides the
            reader and translation tools; it does not host, package or endorse
            extension content. Install only repositories you trust.
          </Text>

          <Pressable
            onPress={() =>
              void WebBrowser.openBrowserAsync(`${SITE_ORIGIN}/terms`)
            }
            style={({ pressed }) => [styles.linkRow, pressed && styles.pressed]}
          >
            <Text style={styles.link}>Read the terms of service</Text>
            <ExternalLink color={colors.accent} size={15} />
          </Pressable>

          <Pressable
            onPress={() => setChecked((value) => !value)}
            style={({ pressed }) => [styles.checkRow, pressed && styles.pressed]}
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
          >
            <View style={[styles.box, checked && styles.boxChecked]}>
              {checked ? <Check color={colors.onAccent} size={15} strokeWidth={3} /> : null}
            </View>
            <Text style={styles.checkLabel}>
              I have read the terms of service and agree
            </Text>
          </Pressable>

          <View style={styles.actions}>
            <Pressable
              onPress={onCancel}
              style={({ pressed }) => [styles.button, styles.cancel, pressed && styles.pressed]}
            >
              <Text style={styles.cancelLabel}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={onAccept}
              disabled={!checked}
              style={({ pressed }) => [
                styles.button,
                styles.primary,
                !checked && styles.disabled,
                pressed && checked && styles.pressed,
              ]}
            >
              <Text style={styles.confirmLabel}>Confirm</Text>
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
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: 20,
  },
  title: { color: colors.text, fontSize: 18, fontWeight: "800" },
  body: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 10,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    marginTop: 14,
  },
  link: { color: colors.accent, fontSize: 13, fontWeight: "700" },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 18,
    paddingVertical: 4,
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  boxChecked: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkLabel: { color: colors.text, fontSize: 13, flex: 1, lineHeight: 18 },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 22,
  },
  button: {
    minWidth: 104,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  cancel: { backgroundColor: colors.surfaceHigh },
  primary: { backgroundColor: colors.accent },
  disabled: { opacity: 0.4 },
  cancelLabel: { color: colors.textMuted, fontSize: 13, fontWeight: "700" },
  confirmLabel: { color: colors.onAccent, fontSize: 13, fontWeight: "800" },
  pressed: { opacity: 0.75 },
});