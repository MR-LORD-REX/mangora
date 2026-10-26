import React from "react";

import SettingsPage from "../components/layout/SettingsPage";
import StorageSection from "../components/sections/storage/StorageSection";
import { useAppSettings } from "../hooks/useAppSettings";

export function StorageSettingsScreen() {
  const { settings, update } = useAppSettings();

  return (
    <SettingsPage
      title="Data and storage"
      subtitle="Folder, backups and space usage"
    >
      <StorageSection settings={settings} onChange={update} standalone />
    </SettingsPage>
  );
}
