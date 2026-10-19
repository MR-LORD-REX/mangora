/**
 * settings/ocr-models.tsx
 * ---------------------------------------------------------------------------
 * Download and remove the on-device OCR model packs.
 * ---------------------------------------------------------------------------
 */

import React from "react";

import OcrModelsSection from "@/components/settings/OcrModelsSection";
import SettingsPage from "@/components/settings/SettingsPage";

export default function OcrModelsSettingsScreen() {
  return (
    <SettingsPage
      title="OCR models"
      subtitle="On-device recognition, downloaded only when you need it"
    >
      <OcrModelsSection standalone />
    </SettingsPage>
  );
}
