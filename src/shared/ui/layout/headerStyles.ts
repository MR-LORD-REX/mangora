import { StyleSheet } from "react-native";

import { colors, radius } from "@shared/theme";

export const headerStyles = StyleSheet.create({
  header: {
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 54,
    paddingHorizontal: 10,
    gap: 2,
  },
  titleWrap: { flex: 1, paddingHorizontal: 6 },
  title: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  searchArea: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surfaceHigh,
    borderRadius: radius.full,
    paddingHorizontal: 14,
    gap: 8,
    height: 38,
    marginHorizontal: 6,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 15,
    paddingVertical: 0,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.full,
  },
  iconBtnActive: {
    backgroundColor: colors.accentSoft,
  },
  actionBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    minWidth: 17,
    minHeight: 17,
    paddingHorizontal: 3,
    borderRadius: radius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBadgeText: { color: colors.onAccent, fontSize: 10, fontWeight: "800" },
  pressed: { opacity: 0.6 },
});
