/**
 * TranslationStatusChip.tsx
 * ---------------------------------------------------------------------------
 * Floating pill shown while a page has a translation overlay: current mode /
 * progress, an eye toggle to hide the pasted text and an X to remove the
 * translation for this page.
 * ---------------------------------------------------------------------------
 */

import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Eye, EyeOff, X } from "lucide-react-native";

import type { PageTranslationState } from "@/services/translation/translation.types";

export interface TranslationStatusChipProps {
  translation: PageTranslationState;
  targetLanguageLabel: string;
  onToggle: () => void;
  onClear: () => void;
}

export default function TranslationStatusChip({
  translation,
  targetLanguageLabel,
  onToggle,
  onClear,
}: TranslationStatusChipProps) {
  const done = translation.regions.filter((region) => region.status === "done").length;
  const failed = translation.regions.filter((region) => region.status === "error").length;
  const total = translation.regions.length;

  let label: string;
  if (translation.busy) {
    label = translation.message ?? "Working\u2026";
  } else {
    const modeLabel =
      translation.mode === "ai"
        ? "AI"
        : translation.mode === "free"
          ? "free"
          : "off";
    const parts = [`${done}/${total}`, modeLabel, targetLanguageLabel];
    if (failed > 0) parts.push(`${failed} failed`);
    label = parts.join(" \u00b7 ");
  }

  return (
    <View style={styles.chip}>
      {translation.busy ? (
        <ActivityIndicator color="#7dd3fc" size="small" style={{ marginRight: 6 }} />
      ) : (
        <Text style={[styles.text, failed > 0 && { color: "#fda4af" }]}>
          {translation.visible ? "Tr" : "Tr (hidden)"}
        </Text>
      )}
      <Text style={styles.text} numberOfLines={1}>
        {label}
      </Text>
      <Pressable onPress={onToggle} hitSlop={8} style={{ paddingHorizontal: 6 }}>
        {translation.visible ? (
          <EyeOff color="#e2e8f0" size={18} />
        ) : (
          <Eye color="#e2e8f0" size={18} />
        )}
      </Pressable>
      <View style={styles.divider} />
      <Pressable onPress={onClear} hitSlop={8} style={{ paddingHorizontal: 6 }}>
        <X color="#f87171" size={18} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    position: "absolute",
    bottom: 96,
    alignSelf: "center",
    zIndex: 25,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(15,23,42,0.95)",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#38bdf8",
    paddingHorizontal: 10,
    paddingVertical: 5,
    maxWidth: 320,
  },
  text: { color: "#bae6fd", fontSize: 11, marginHorizontal: 3 },
  divider: { width: 1, height: 16, backgroundColor: "#475569", marginHorizontal: 4 },
});
