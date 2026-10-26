import React from "react";

import SettingsPage from "../components/layout/SettingsPage";
import TranslationSection from "../components/sections/translation/TranslationSection";
import { useAppSettings } from "../hooks/useAppSettings";

export function TranslationSettingsScreen() {
  const { settings, update } = useAppSettings();

  return (
    <SettingsPage title="Translation" subtitle="Gemini key and cached pages">
      <TranslationSection settings={settings} onChange={update} standalone />
    </SettingsPage>
  );
}
