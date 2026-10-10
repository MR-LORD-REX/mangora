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
  INVERT_TAP_ZONE_OPTIONS,
  ORIENTATION_OPTIONS,
  READING_MODE_OPTIONS,
  TAP_ZONE_OPTIONS,
  isPagedMode,
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
  {
    key: "alwaysShowChapterTransition",
    label: "Always show chapter transition",
  },
  { key: "animatePageTransitions", label: "Animate page transitions" },
  { key: "flashOnPageChange", label: "Flash on page change" },
];

const FILTER_TOGGLES: { key: keyof ReaderChromeSettings; label: string }[] = [
  { key: "customBrightnessEnabled", label: "Custom brightness" },
  { key: "customColorFilterEnabled", label: "Custom color filter" },
  { key: "grayscale", label: "Grayscale" },
  { key: "inverted", label: "Inverted" },
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
  const { readingMode, pagedDirection, orientation, fitMode } = chrome;
  const paged = isPagedMode(readingMode);

  return (
    <View>
      <SectionLabel>Reading mode</SectionLabel>
      <View style={styles.pillGrid}>
        {READING_MODE_OPTIONS.map((option) => (
          <Pill
            key={option.key}
            label={option.label}
            selected={readingMode === option.key}
            onPress={() => onChangeChrome({ readingMode: option.key })}
          />
        ))}
      </View>

      {readingMode === "pagedHorizontal" && (
        <>
          <SectionLabel>Direction</SectionLabel>
          <View style={styles.pillGrid}>
            <Pill
              label="Left to right"
              selected={pagedDirection === "ltr"}
              onPress={() => onChangeChrome({ pagedDirection: "ltr" })}
            />
            <Pill
              label="Right to left"
              selected={pagedDirection === "rtl"}
              onPress={() => onChangeChrome({ pagedDirection: "rtl" })}
            />
          </View>
        </>
      )}

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

      <SectionLabel>Fit</SectionLabel>
      <View style={styles.pillGrid}>
        <Pill
          label="Fit to screen"
          selected={fitMode === "fit"}
          onPress={() => onChangeChrome({ fitMode: "fit" })}
        />
        <Pill
          label="Original size (zoomable)"
          selected={fitMode === "original"}
          onPress={() => onChangeChrome({ fitMode: "original" })}
        />
      </View>

      <SectionLabel>Default zoom scale</SectionLabel>
      <DotSlider
        value={defaultZoomScale}
        min={0.1}
        max={2}
        step={0.01}
        dotCount={21}
        disabled={fitMode === "fit"}
        leftLabel="0.1x"
        rightLabel="2x"
        onChange={onChangeDefaultZoomScale}
      />
      <HelperText>
        Sets the starting scale for pages in Original size mode.
      </HelperText>

      <View style={styles.checkGroup}>
        <CheckRow
          label="Double tap to zoom"
          checked={chrome.doubleTapToZoom}
          onToggle={() =>
            onChangeChrome({ doubleTapToZoom: !chrome.doubleTapToZoom })
          }
        />
        <CheckRow
          label="Disable zoom out"
          checked={chrome.disableZoomOut}
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
  return (
    <View>
      {FILTER_TOGGLES.map((toggle) => (
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
      <HelperText>
        Filter controls are persisted now and will be wired to the page renderer
        in a later pass.
      </HelperText>
    </View>
  );
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
