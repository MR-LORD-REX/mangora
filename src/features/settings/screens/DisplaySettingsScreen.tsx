import React from "react";

import SettingsPage from "../components/layout/SettingsPage";
import DisplaySection from "../components/sections/display/DisplaySection";
import { useAppSettings } from "../hooks/useAppSettings";

export function DisplaySettingsScreen() {
  const { settings, update } = useAppSettings();

  return (
    <SettingsPage
      title="Display"
      subtitle="Catalog card layout and presentation"
    >
      <DisplaySection settings={settings} onChange={update} standalone />
    </SettingsPage>
  );
}
