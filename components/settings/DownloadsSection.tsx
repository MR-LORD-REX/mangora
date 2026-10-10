/**
 * DownloadsSection.tsx
 * ---------------------------------------------------------------------------
 * Settings -> Downloads: connectivity, queue concurrency and the entry point
 * to the downloaded-chapters manager.
 * ---------------------------------------------------------------------------
 */

import { router } from "expo-router";
import { Download, Images, Layers, Trash2, Wifi } from "lucide-react-native";
import React from "react";

import type { AppSettings } from "@/services/settings/settingsStore";

import {
  SettingsRow,
  SettingsSection,
  SliderRow,
  ToggleRow,
} from "./SettingsPrimitives";

export default function DownloadsSection({
  settings,
  onChange,
  standalone,
}: {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
  standalone?: boolean;
}) {
  const sources = settings.downloadSourceConcurrency;
  const pages = settings.downloadPageConcurrency;

  return (
    <SettingsSection
      title="Downloads"
      subtitle="How chapters are fetched and stored."
      icon={Download}
      standalone={standalone}
    >
      <ToggleRow
        icon={Wifi}
        title="Wi-Fi only"
        subtitle="Mobile data is never used for chapter downloads."
        value={settings.downloadWifiOnly}
        onChange={(value) => onChange({ downloadWifiOnly: value })}
      />
      <SliderRow
        icon={Layers}
        title="Chapters per source"
        subtitle={`Download ${sources} chapter${sources === 1 ? "" : "s"} of the same source at once.`}
        value={sources}
        min={1}
        max={5}
        onChange={(value) => onChange({ downloadSourceConcurrency: value })}
      />
      <SliderRow
        icon={Images}
        title="Pages per chapter"
        subtitle={`Fetch ${pages} page${pages === 1 ? "" : "s"} of a chapter in parallel.`}
        value={pages}
        min={1}
        max={10}
        onChange={(value) => onChange({ downloadPageConcurrency: value })}
      />
      <SettingsRow
        icon={Trash2}
        title="Delete downloaded chapters"
        subtitle="Browse downloads by source and remove chapters or whole manga."
        last
        onPress={() => router.push("/downloads")}
      />
    </SettingsSection>
  );
}
