/**
 * settings/storage.tsx
 * ---------------------------------------------------------------------------
 * Storage location, database backup / restore and the usage breakdown.
 * ---------------------------------------------------------------------------
 */

import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import SettingsPage from "@/components/settings/SettingsPage";
import StorageSection from "@/components/settings/StorageSection";
import { useAppSettings } from "@/components/settings/useAppSettings";
import { colors } from "@/constants/theme";

export default function StorageSettingsScreen() {
  const { settings, update } = useAppSettings();

  return (
    <SettingsPage
      title="Data and storage"
      subtitle="Folder, backups and space usage"
    >
      {settings ? (
        <StorageSection settings={settings} onChange={update} standalone />
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