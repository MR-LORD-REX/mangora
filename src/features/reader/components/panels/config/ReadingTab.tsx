import { StyleSheet, View } from "react-native";

import DotSlider from "../DotSlider";
import {
  IMAGE_SCALE_OPTIONS,
  INVERT_TAP_ZONE_OPTIONS,
  ORIENTATION_OPTIONS,
  READING_MODE_OPTIONS,
  TAP_ZONE_OPTIONS,
  isLongStripMode,
  isPagedMode,
} from "../readerChrome";
import {
  CheckRow,
  HelperText,
  Pill,
  SectionLabel,
} from "../ReaderPanelPrimitives";

import type { ReaderConfigTabProps } from "./types";

export default function ReadingTab({
  chrome,
  onChangeChrome,
  defaultZoomScale,
  onChangeDefaultZoomScale,
  scrollSpeed,
  onSelectScrollSpeed,
}: ReaderConfigTabProps) {
  const { readingMode, orientation } = chrome;
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
            selected={readingMode === option.key}
            onPress={() => onChangeChrome({ readingMode: option.key })}
          />
        ))}
      </View>

      <SectionLabel>Auto-scroll speed</SectionLabel>
      <DotSlider
        value={scrollSpeed}
        min={1}
        max={5}
        step={1}
        dotCount={5}
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

      {!longStrip && (
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
            Margins around the strip.
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

const styles = StyleSheet.create({
  pillGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
  },
  checkGroup: { marginBottom: 4 },
});
