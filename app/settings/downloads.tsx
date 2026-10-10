/**
 * settings/downloads.tsx
 * ---------------------------------------------------------------------------
 * Download options: connectivity, queue limits and the delete-chapters entry.
 * ---------------------------------------------------------------------------
 */

import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import DownloadsSection from "@/components/settings/DownloadsSection";
import SettingsPage from "@/components/settings/SettingsPage";
import { useAppSettings } from "@/components/settings/useAppSettings";
import { colors } from "@/constants/theme";

export default function DownloadsSettingsScreen() {
  const { settings, update } = useAppSettings();

  return (
    <SettingsPage
      title="Downloads"
      subtitle="Wi-Fi only, queue limits and stored chapters"
    >
      {settings ? (
        <DownloadsSection
          settings={settings}
          onChange={update}
          standalone
        />
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