import { Grid2X2, Grid3X3, LayoutGrid, List } from "lucide-react-native";
import React from "react";

import type { AppSettings, SourceCardLayout } from "@core/settings";

import {
  ChoiceRow,
  SettingsSection,
  type ChoiceOption,
} from "../../primitives/SettingsPrimitives";

const CARD_LAYOUT_OPTIONS: readonly ChoiceOption<SourceCardLayout>[] = [
  { value: "grid2", label: "2 columns", icon: Grid2X2 },
  { value: "grid4", label: "4 columns", icon: Grid3X3 },
  { value: "list", label: "List", icon: List },
];

export default function DisplaySection({
  settings,
  onChange,
  standalone,
}: {
  settings: AppSettings;
  onChange: (patch: Partial<AppSettings>) => void;
  standalone?: boolean;
}) {
  return (
    <SettingsSection
      title="Display"
      subtitle="Choose how catalog content is presented."
      icon={LayoutGrid}
      standalone={standalone}
    >
      <ChoiceRow
        icon={LayoutGrid}
        title="Extension source layout"
        subtitle="Used every time you open an extension feed. You can still override it from the source header."
        value={settings.sourceCardLayout}
        options={CARD_LAYOUT_OPTIONS}
        onChange={(sourceCardLayout) => onChange({ sourceCardLayout })}
        last
      />
    </SettingsSection>
  );
}
