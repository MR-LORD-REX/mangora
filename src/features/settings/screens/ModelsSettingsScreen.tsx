import React from "react";

import SettingsPage from "../components/layout/SettingsPage";
import OcrModelsSection from "../components/sections/ocr/OcrModelsSection";
import RegionModelsSection from "../components/sections/models/RegionModelsSection";

export function ModelsSettingsScreen() {
  return (
    <SettingsPage
      title="Models"
      subtitle="Region detection and on-device OCR"
    >
      <RegionModelsSection standalone />
      <OcrModelsSection />
    </SettingsPage>
  );
}
