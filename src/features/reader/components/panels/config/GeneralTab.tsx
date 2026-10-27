import { View } from "react-native";

import {
  BACKGROUND_COLOR_OPTIONS,
  type ReaderChromeSettings,
} from "../readerChrome";
import { CheckRow, Pill, SectionLabel } from "../ReaderPanelPrimitives";

import type { ReaderConfigTabProps } from "./types";

const GENERAL_TOGGLES: {
  key: keyof ReaderChromeSettings;
  label: string;
}[] = [
  { key: "showPageNumber", label: "Show page number" },
  { key: "fullscreen", label: "Fullscreen" },
  { key: "showContentInCutout", label: "Show content in cutout area" },
  { key: "keepScreenOn", label: "Keep screen on" },
  { key: "showActionsOnLongTap", label: "Show actions on long tap" },
  { key: "animatePageTransitions", label: "Animate page transitions" },
  { key: "flashOnPageChange", label: "Flash on page change" },
];

export default function GeneralTab({
  chrome,
  onChangeChrome,
}: ReaderConfigTabProps) {
  return (
    <View>
      <SectionLabel>Background color</SectionLabel>
      <View style={styles.pillGrid}>
        {BACKGROUND_COLOR_OPTIONS.map((option) => (
          <Pill
            key={option.key}
            label={option.label}
            selected={chrome.backgroundColor === option.key}
            onPress={() => onChangeChrome({ backgroundColor: option.key })}
          />
        ))}
      </View>
      {GENERAL_TOGGLES.map((toggle) => (
        <CheckRow
          key={toggle.key}
          label={toggle.label}
          checked={chrome[toggle.key] as boolean}
          onToggle={() =>
            onChangeChrome({
              [toggle.key]: !chrome[toggle.key],
            } as Partial<ReaderChromeSettings>)
          }
        />
      ))}
    </View>
  );
}

const styles = {
  pillGrid: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 8,
    marginBottom: 14,
  },
};
