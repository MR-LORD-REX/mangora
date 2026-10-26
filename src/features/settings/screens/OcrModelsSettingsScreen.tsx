/**
 * settings/ocr-models.tsx
 * ---------------------------------------------------------------------------
 * Download and remove the on-device OCR model packs.
 * ---------------------------------------------------------------------------
 */

import React from "react";

import OcrModelsSection from "../components/sections/ocr/OcrModelsSection";
import SettingsPage from "../components/layout/SettingsPage";

export function OcrModelsSettingsScreen() {
  return (
    <SettingsPage
      title="OCR models"
      subtitle="On-device recognition, downloaded only when you need it"
    >
      <OcrModelsSection standalone />
    </SettingsPage>
  );
}
