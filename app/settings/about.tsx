/**
 * settings/about.tsx
 * ---------------------------------------------------------------------------
 * Branding, version, update check and the outbound links.
 * ---------------------------------------------------------------------------
 */

import React from "react";

import AboutSection from "@/components/settings/AboutSection";
import SettingsPage from "@/components/settings/SettingsPage";

export default function AboutSettingsScreen() {
  return (
    <SettingsPage title="About" subtitle="Version, links and community">
      <AboutSection standalone />
    </SettingsPage>
  );
}