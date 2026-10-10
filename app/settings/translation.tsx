/**
 * settings/translation.tsx
 * ---------------------------------------------------------------------------
 * Gemini credentials and the cached translated pages.
 * ---------------------------------------------------------------------------
 */

import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import SettingsPage from "@/components/settings/SettingsPage";
import TranslationSection from "@/components/settings/TranslationSection";
import { useAppSettings } from "@/components/settings/useAppSettings";
import { colors } from "@/constants/theme";

export default function TranslationSettingsScreen() {
  const { settings, update } = useAppSettings();

  return (
    <SettingsPage
      title="Translation"
      subtitle="Gemini key and cached pages"
    >
      {settings ? (
        <TranslationSection settings={settings} onChange={update} standalone />
      ) : (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.accent} />
        </View>
      )}
    </SettingsPage>
  );
}

const styles = StyleSheet.create({
  loading: { paddingTop: 80, alignItems: "center" },
});