import { StyleSheet, Text, View } from "react-native";

import DotSlider from "../DotSlider";
import type { ReaderChromeSettings } from "../readerChrome";
import { CheckRow } from "../ReaderPanelPrimitives";

import type { ReaderConfigTabProps } from "./types";

const FILTER_TOGGLES: {
  key: keyof ReaderChromeSettings;
  label: string;
}[] = [
  { key: "customColorFilterEnabled", label: "Custom color filter" },
];

export default function FilterTab({
  chrome,
  onChangeChrome,
}: ReaderConfigTabProps) {
  const rgb = hexToRgb(chrome.customColorFilter);
  const setChannel = (channel: "r" | "g" | "b", value: number) => {
    onChangeChrome({
      customColorFilter: rgbToHex({ ...rgb, [channel]: Math.round(value) }),
    });
  };

  return (
    <View>
      {FILTER_TOGGLES.map((toggle) => {
        const enabled = chrome[toggle.key] as boolean;
        return (
          <View key={toggle.key}>
            <CheckRow
              label={toggle.label}
              checked={enabled}
              onToggle={() =>
                onChangeChrome({
                  [toggle.key]: !enabled,
                } as Partial<ReaderChromeSettings>)
              }
            />
            {enabled && toggle.key === "customColorFilterEnabled" && (
              <View>
                <RGBSlider
                  channel="R"
                  value={rgb.r}
                  onChange={(value) => setChannel("r", value)}
                />
                <RGBSlider
                  channel="G"
                  value={rgb.g}
                  onChange={(value) => setChannel("g", value)}
                />
                <RGBSlider
                  channel="B"
                  value={rgb.b}
                  onChange={(value) => setChannel("b", value)}
                />
                <View style={styles.tintPreviewRow}>
                  <View
                    style={[
                      styles.tintPreview,
                      { backgroundColor: chrome.customColorFilter },
                    ]}
                  />
                  <Text style={styles.filterValue}>
                    {chrome.customColorFilter}
                  </Text>
                </View>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

function RGBSlider({
  channel,
  value,
  onChange,
}: {
  channel: "R" | "G" | "B";
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <View style={styles.filterControl}>
      <View style={styles.filterHeader}>
        <Text style={styles.filterChannel}>{channel}</Text>
        <Text style={styles.filterValue}>{Math.round(value)}</Text>
      </View>
      <DotSlider
        value={value}
        min={0}
        max={255}
        step={5}
        leftLabel="0"
        rightLabel="255"
        onChange={onChange}
      />
    </View>
  );
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) return { r: 128, g: 128, b: 128 };
  return {
    r: parseInt(match[1], 16),
    g: parseInt(match[2], 16),
    b: parseInt(match[3], 16),
  };
}

function rgbToHex({ r, g, b }: { r: number; g: number; b: number }): string {
  const channel = (value: number) =>
    Math.min(255, Math.max(0, Math.round(value)))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

const styles = StyleSheet.create({
  filterControl: {
    marginLeft: 34,
    marginTop: 2,
    marginBottom: 10,
  },
  filterHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  filterChannel: {
    color: "#cbd5e1",
    fontSize: 12,
    fontWeight: "700",
  },
  filterValue: { color: "#94a3b8", fontSize: 12 },
  tintPreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  tintPreview: {
    width: 26,
    height: 18,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#565b6e",
  },
});
