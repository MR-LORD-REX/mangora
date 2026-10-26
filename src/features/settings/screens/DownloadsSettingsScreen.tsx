import React from "react";

import SettingsPage from "../components/layout/SettingsPage";
import DownloadsSection from "../components/sections/downloads/DownloadsSection";
import { useAppSettings } from "../hooks/useAppSettings";

export function DownloadsSettingsScreen() {
  const { settings, update } = useAppSettings();

  return (
    <SettingsPage
      title="Downloads"
      subtitle="Wi-Fi only, queue limits and stored chapters"
    >
      <DownloadsSection settings={settings} onChange={update} standalone />
    </SettingsPage>
  );
}
