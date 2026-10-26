/**
 * settings/about.tsx
 * ---------------------------------------------------------------------------
 * Branding, version, the updater and the outbound links, plus the content
 * policy toggle (plan S9/S14.4).
 * ---------------------------------------------------------------------------
 */

import { Eye } from "lucide-react-native";
import React from "react";

import AboutSection from "../components/sections/about/AboutSection";
import SettingsPage from "../components/layout/SettingsPage";
import {
  SettingsSection,
  ToggleRow,
} from "../components/primitives/SettingsPrimitives";
import { useAppSettings } from "../hooks/useAppSettings";

export function AboutSettingsScreen() {
  const { settings, update } = useAppSettings();

  return (
    <SettingsPage title="About" subtitle="Version, updates, links and content">
      <AboutSection standalone />
      <SettingsSection title="Content" icon={Eye}>
        <ToggleRow
          icon={Eye}
          title="Allow adult-source links"
          subtitle="Permit share and deep links that target providers marked mature."
          value={settings.ageRestrictedSources}
          onChange={(value) => update({ ageRestrictedSources: value })}
          last
        />
      </SettingsSection>
    </SettingsPage>
  );
}