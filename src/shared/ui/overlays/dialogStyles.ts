import { StyleSheet } from "react-native";

import { colors, radius } from "@shared/theme";

/** Layout shared by the confirm and prompt dialogs. */
export const dialogStyles = StyleSheet.create({
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
