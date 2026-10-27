/**
 * Long-press page actions, mirroring Mihon's page action sheet.
 * All actions operate on the original page URL so translation state and the
 * page cache are untouched.
 */

import { setStringAsync } from "expo-clipboard";
import * as Linking from "expo-linking";
import { Copy, ExternalLink, Eye, EyeOff, RefreshCw, Share2 } from "lucide-react-native";
import React from "react";
import { Pressable, Share, StyleSheet, Text, View } from "react-native";

import {
  READER_PANEL_BG,
  READER_PILL_BG,
  READER_PILL_BORDER,
  READER_TEXT_MUTED,
} from "./readerTheme";

export interface ReaderPageActionsSheetProps {
  pageUrl: string;
  hideTranslated: boolean;
  onClose: () => void;
  onToggleHideTranslated: () => void;
  onRetryTranslation: (url: string) => void;
}

export default function ReaderPageActionsSheet({
  pageUrl,
  hideTranslated,
  onClose,
  onToggleHideTranslated,
  onRetryTranslation,
}: ReaderPageActionsSheetProps) {
  const run = (action: () => void) => () => {
    action();
    onClose();
  };

  return (
    <View style={styles.sheet}>
      <View style={styles.handle} />
      <Text style={styles.title}>Page actions</Text>
      <View style={styles.grid}>
        <Action
          icon={<Copy color="#fff" size={21} />}
          label="Copy link"
          onPress={run(() => {
            void setStringAsync(pageUrl);
          })}
        />
        <Action
          icon={<Share2 color="#fff" size={21} />}
          label="Share"
          onPress={run(() => {
            void Share.share({ message: pageUrl, url: pageUrl });
          })}
        />
        <Action
          icon={<ExternalLink color="#fff" size={21} />}
          label="Open in browser"
          onPress={run(() => {
            void Linking.openURL(pageUrl).catch(() => {});
          })}
        />
        <Action
          icon={<RefreshCw color="#fff" size={21} />}
          label="Retry translation"
          onPress={run(() => onRetryTranslation(pageUrl))}
        />
        <Action
          icon={
            hideTranslated ? (
              <Eye color="#fff" size={21} />
            ) : (
              <EyeOff color="#fff" size={21} />
            )
          }
          label={hideTranslated ? "Show translations" : "Hide translations"}
          onPress={run(onToggleHideTranslated)}
        />
      </View>
      <Pressable onPress={onClose} style={styles.cancel}>
        <Text style={styles.cancelText}>Close</Text>
      </Pressable>
    </View>
  );
}

function Action({
  icon,
  label,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.action}>
      <View style={styles.actionIcon}>{icon}</View>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 80,
    backgroundColor: READER_PANEL_BG,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 24,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#3a3c4d",
    marginBottom: 14,
  },
  title: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 14,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  action: {
    width: "30%",
    minWidth: 96,
    alignItems: "center",
    gap: 7,
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: READER_PILL_BORDER,
    backgroundColor: READER_PILL_BG,
  },
  actionIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#313347",
  },
  actionLabel: {
    color: "#e5e7eb",
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
  },
  cancel: { alignSelf: "center", marginTop: 16, padding: 8 },
  cancelText: { color: READER_TEXT_MUTED, fontSize: 13, fontWeight: "600" },
});
