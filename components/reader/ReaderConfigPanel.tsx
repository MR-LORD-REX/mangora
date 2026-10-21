/**
 * ReaderConfigPanel.tsx
 * ---------------------------------------------------------------------------
 * Tabbed settings panel for the reader. Slides up from the bottom (covers
 * ~72% of the screen) and is fully scrollable. Tabs:
 *
 *   Reading   - reading mode, auto-scroll speed, rotation, fit, tap zones,
 *               invert tap zones, side padding, crop borders
 *   General   - background color + general toggles
 *   Filter    - custom filter toggles (persisted, inert this pass)
 *
 * Translation options (language / translation mode / overlay settings) live
 * in ReaderTranslationPanel, opened from the header sliders icon.
 *
 * ---------------------------------------------------------------------------
 */

import { X } from "lucide-react-native";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import DotSlider from "./DotSlider";
import {
  BACKGROUND_COLOR_OPTIONS,
  IMAGE_SCALE_OPTIONS,
  INVERT_TAP_ZONE_OPTIONS,
  ORIENTATION_OPTIONS,
  READING_MODE_OPTIONS,
  TAP_ZONE_OPTIONS,
  isPagedMode,
  isLongStripMode,
  type ReaderChromeSettings,
} from "./readerChrome";
import {
  CheckRow,
  HelperText,
  Pill,
  SectionLabel,
  TabBar,
} from "./ReaderPanelPrimitives";
import { READER_PANEL_BG, READER_PILL_BORDER } from "./readerTheme";

export type ReaderConfigTab = "reading" | "general" | "filter";

export const READER_CONFIG_TABS: { key: ReaderConfigTab; label: string }[] = [
  { key: "reading", label: "Reading" },
  { key: "general", label: "General" },
  { key: "filter", label: "Filter" },
];

const GENERAL_TOGGLES: { key: keyof ReaderChromeSettings; label: string }[] = [
  { key: "showPageNumber", label: "Show page number" },
  { key: "fullscreen", label: "Fullscreen" },
  { key: "showContentInCutout", label: "Show content in cutout area" },
  { key: "keepScreenOn", label: "Keep screen on" },
  { key: "showActionsOnLongTap", label: "Show actions on long tap" },
  { key: "animatePageTransitions", label: "Animate page transitions" },
  { key: "flashOnPageChange", label: "Flash on page change" },
];

const FILTER_TOGGLES: { key: keyof ReaderChromeSettings; label: string }[] = [
  // { key: "customBrightnessEnabled", label: "Custom brightness" },
  { key: "customColorFilterEnabled", label: "Custom color filter" },
  // { key: "grayscale", label: "Grayscale" },
  // { key: "inverted", label: "Inverted" },
];

export interface ReaderConfigPanelProps {
  tab: ReaderConfigTab;
  onTabChange: (tab: ReaderConfigTab) => void;
  onClose: () => void;

  // New reader chrome settings (persisted via AppSettings).
  chrome: ReaderChromeSettings;
  onChangeChrome: (patch: Partial<ReaderChromeSettings>) => void;
  defaultZoomScale: number;
  onChangeDefaultZoomScale: (scale: number) => void;
  scrollSpeed: number;
  onSelectScrollSpeed: (speed: number) => void;

}

export default function ReaderConfigPanel(props: ReaderConfigPanelProps) {
  const { tab, onTabChange, onClose, chrome } = props;
  const { readingMode } = chrome;
  const paged = isPagedMode(readingMode);

  return (
    <View style={styles.panel}>
      <View style={styles.handle} />
      <View style={styles.header}>
        <TabBar tabs={READER_CONFIG_TABS} active={tab} onChange={onTabChange} />
        <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={10}>
          <X color="#fff" size={20} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        {tab === "reading" && <ReadingTab {...props} />}
        {tab === "general" && <GeneralTab {...props} />}
        {tab === "filter" && <FilterTab {...props} />}
        <Text style={styles.footerNote}>
          {paged && tab === "reading"
            ? "Auto-scroll is only available in Scroll reading modes."
            : ""}
        </Text>
      </ScrollView>
    </View>
  );
}


function ReadingTab(props: ReaderConfigPanelProps) {
  const {
    chrome,
    onChangeChrome,
    defaultZoomScale,
    onChangeDefaultZoomScale,
    scrollSpeed,
    onSelectScrollSpeed,
  } = props;
  const { readingMode, pagedDirection, orientation } = chrome;
  const paged = isPagedMode(readingMode);
  const longStrip = isLongStripMode(readingMode);

  return (
    <View>
      <SectionLabel>Reading mode</SectionLabel>
      <View style={styles.pillGrid}>
        {READING_MODE_OPTIONS.map((option) => (
          <Pill
            key={option.id}
            label={option.label}
            selected={
              readingMode === option.key &&
              (option.key !== "pagedHorizontal" ||
                pagedDirection === (option.direction ?? pagedDirection))
            }
            onPress={() =>
              onChangeChrome({
                readingMode: option.key,
                ...(option.direction
                  ? { pagedDirection: option.direction }
                  : {}),
              })
            }
          />
        ))}
      </View>

      <SectionLabel>Auto-scroll speed</SectionLabel>
      <DotSlider
        value={scrollSpeed}
        min={1}
        max={5}
        step={1}
        dotCount={20}
        disabled={paged}
        leftLabel="Slow"
        rightLabel="Fast"
        onChange={onSelectScrollSpeed}
      />
      {paged && (
        <HelperText>
          Auto-scroll is only available in Scroll reading modes.
        </HelperText>
      )}

      <SectionLabel>Rotation</SectionLabel>
      <View style={styles.pillGrid}>
        {ORIENTATION_OPTIONS.map((option) => (
          <Pill
            key={option.key}
            label={option.label}
            selected={orientation === option.key}
            onPress={() => onChangeChrome({ orientation: option.key })}
          />
        ))}
      </View>

      <SectionLabel>Image scale</SectionLabel>
      {longStrip ? (
        <HelperText>
          Webtoon and continuous modes always fit the page to the strip width,
          matching Mihon&apos;s long-strip viewer.
        </HelperText>
      ) : (
        <View style={styles.pillGrid}>
          {IMAGE_SCALE_OPTIONS.map((option) => (
            <Pill
              key={option.key}
              label={option.label}
              selected={chrome.imageScaleType === option.key}
              onPress={() => onChangeChrome({ imageScaleType: option.key })}
            />
          ))}
        </View>
      )}

      {!longStrip && (
        <>
          <SectionLabel>Default zoom scale</SectionLabel>
          <DotSlider
            value={defaultZoomScale}
            min={0.1}
            max={2}
            step={0.01}
            dotCount={21}
            disabled={chrome.imageScaleType !== "original"}
            leftLabel="0.1x"
            rightLabel="2x"
            onChange={onChangeDefaultZoomScale}
          />
          <HelperText>
            Sets the starting scale for pages in Original size mode.
          </HelperText>
        </>
      )}

      {longStrip && (
        <>
          <SectionLabel>Webtoon side padding</SectionLabel>
          <DotSlider
            value={chrome.sidePadding}
            min={0}
            max={25}
            step={1}
            dotCount={16}
            leftLabel="0%"
            rightLabel="25%"
            onChange={(sidePadding) => onChangeChrome({ sidePadding })}
          />
          <HelperText>
            Margins around the strip. Overlays move with the page because both
            use the same fitted image rectangle.
          </HelperText>
        </>
      )}

      <View style={styles.checkGroup}>
        <CheckRow
          label="Double tap to zoom"
          checked={chrome.doubleTapToZoom}
          disabled={longStrip}
          onToggle={() =>
            onChangeChrome({ doubleTapToZoom: !chrome.doubleTapToZoom })
          }
        />
        <CheckRow
          label="Disable zoom out"
          checked={chrome.disableZoomOut}
          disabled={longStrip}
          onToggle={() =>
            onChangeChrome({ disableZoomOut: !chrome.disableZoomOut })
          }
        />
        <CheckRow
          label="Split wide pages"
          checked={chrome.splitWidePages}
          onToggle={() =>
            onChangeChrome({ splitWidePages: !chrome.splitWidePages })
          }
        />
        <CheckRow
          label="Rotate wide pages to fit"
          checked={chrome.rotateWidePagesToFit}
          onToggle={() =>
            onChangeChrome({
              rotateWidePagesToFit: !chrome.rotateWidePagesToFit,
            })
          }
        />
        <CheckRow
          label="Crop borders"
          checked={chrome.cropBorders}
          onToggle={() => onChangeChrome({ cropBorders: !chrome.cropBorders })}
        />
      </View>

      <SectionLabel>Tap zones</SectionLabel>
      <View style={styles.pillGrid}>
        {TAP_ZONE_OPTIONS.map((option) => (
          <Pill
            key={option.key}
            label={option.label}
            selected={chrome.tapZoneLayout === option.key}
            onPress={() => onChangeChrome({ tapZoneLayout: option.key })}
          />
        ))}
      </View>

      <SectionLabel>Invert tap zones</SectionLabel>
      <View style={styles.pillGrid}>
        {INVERT_TAP_ZONE_OPTIONS.map((option) => (
          <Pill
            key={option.key}
            label={option.label}
            selected={chrome.invertTapZones === option.key}
            onPress={() => onChangeChrome({ invertTapZones: option.key })}
          />
        ))}
      </View>
    </View>
  );
}

function GeneralTab(props: ReaderConfigPanelProps) {
  const { chrome, onChangeChrome } = props;
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

function FilterTab(props: ReaderConfigPanelProps) {
  const { chrome, onChangeChrome } = props;
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
            {enabled && toggle.key === "customBrightnessEnabled" && (
              <FilterSlider
                label="Brightness"
                value={chrome.customBrightness}
                min={0}
                max={200}
                step={5}
                leftLabel="0%"
                rightLabel="200%"
                valueLabel={`${chrome.customBrightness}%`}
                onChange={(customBrightness) =>
                  onChangeChrome({ customBrightness })
                }
              />
            )}
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
            {enabled && toggle.key === "grayscale" && (
              <FilterSlider
                label="Amount"
                value={chrome.grayscaleAmount}
                min={0}
                max={100}
                step={5}
                leftLabel="0%"
                rightLabel="100%"
                valueLabel={`${chrome.grayscaleAmount}%`}
                onChange={(grayscaleAmount) =>
                  onChangeChrome({ grayscaleAmount })
                }
              />
            )}
          </View>
        );
      })}
      {/* <HelperText>
        Brightness, grayscale and invert use the page image filter. Custom color
        is an overlay tint (Android 10+). Grayscale, inverted and custom color
        are mutually exclusive; enabling one turns the other two off.
      </HelperText> */}
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

function FilterSlider({
  label,
  value,
  min,
  max,
  step,
  leftLabel,
  rightLabel,
  valueLabel,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  leftLabel: string;
  rightLabel: string;
  valueLabel: string;
  onChange: (value: number) => void;
}) {
  return (
    <View style={styles.filterControl}>
      <View style={styles.filterHeader}>
        <Text style={styles.filterChannel}>{label}</Text>
        <Text style={styles.filterValue}>{valueLabel}</Text>
      </View>
      <DotSlider
        value={value}
        min={min}
        max={max}
        step={step}
        leftLabel={leftLabel}
        rightLabel={rightLabel}
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
  panel: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "72%",
    backgroundColor: READER_PANEL_BG,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    zIndex: 60,
    overflow: "hidden",
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#3a3c4d",
    marginTop: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 12,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: READER_PILL_BORDER,
  },
  closeBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  body: { flex: 1, paddingHorizontal: 18, paddingTop: 14 },
  bodyContent: { paddingBottom: 40 },
  footerNote: { color: "#9ca3af", fontSize: 12, marginTop: 12 },
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

  pillGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
  },
  checkGroup: { marginBottom: 4 },

  modelRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "transparent",
    gap: 10,
  },
  modelRowActive: { backgroundColor: "#262838", borderColor: "#fbbf24" },
  modelRowText: { flex: 1, minWidth: 0 },
  modelLabel: { color: "#f1f5f9", fontSize: 13, fontWeight: "600" },
  modelDetail: { color: "#94a3b8", fontSize: 11, marginTop: 1 },
  modelStatus: { color: "#fbbf24", fontSize: 11, fontWeight: "700" },
  modelBusy: { flexDirection: "row", alignItems: "center", gap: 6 },
  languageColumns: { flexDirection: "row", gap: 10 },
  languageColumn: { flex: 1, minWidth: 0 },
  languagePicker: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 52,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#33354a",
    backgroundColor: "#262838",
    gap: 8,
  },
  languageList: { maxHeight: 250 },
  columnCaption: { color: "#94a3b8", fontSize: 11, marginBottom: 6 },
  modeRow: { flexDirection: "row", gap: 6 },
  modeChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#33354a",
    backgroundColor: "#262838",
    alignItems: "center",
  },
  modeChipActive: { backgroundColor: "#0ea5e9", borderColor: "#0ea5e9" },
  modeChipText: { color: "#cbd5e1", fontSize: 12, fontWeight: "600" },
  modeChipTextActive: { color: "#fff" },
  scaleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingVertical: 4,
  },
  scaleButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#262838",
    borderWidth: 1,
    borderColor: "#33354a",
    alignItems: "center",
    justifyContent: "center",
  },
  scaleValue: {
    color: "#f8fafc",
    fontSize: 16,
    fontWeight: "700",
    minWidth: 52,
    textAlign: "center",
  },
});
