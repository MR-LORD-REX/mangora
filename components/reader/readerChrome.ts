/**
 * readerChrome.ts
 * ---------------------------------------------------------------------------
 * Shared types, option lists and helpers for the new reader chrome (reading
 * modes, orientation, fit mode, and the settings-panel toggles). Kept
 * dependency-light so every chrome component imports from one place.
 * ---------------------------------------------------------------------------
 */

import { OrientationLock } from "expo-screen-orientation";

import type {
  ReaderBackgroundColor,
  ReaderFitMode,
  ReaderImageScaleType,
  ReaderInvertTapZones,
  ReaderOrientation,
  ReaderPagedDirection,
  ReaderReadingMode,
  ReaderTapZoneLayout,
  ReaderOverlayFont,
} from "@core/settings/settingsSchema";
import {
  DEFAULT_READER_CHROME,
  applyFilterExclusivity,
  type ReaderChromeSettings,
} from "@core/settings/readerChrome";
import {
  isGapLessMode,
  isHorizontalMode,
  isLongStripMode,
  isPagedMode,
} from "@features/reader";

export type {
  ReaderBackgroundColor,
  ReaderFitMode,
  ReaderImageScaleType,
  ReaderInvertTapZones,
  ReaderOrientation,
  ReaderPagedDirection,
  ReaderReadingMode,
  ReaderTapZoneLayout,
  ReaderOverlayFont,
};
export type { ReaderChromeSettings };
export { DEFAULT_READER_CHROME, applyFilterExclusivity };

export interface ReaderReadingModeOption {
  id: string;
  key: ReaderReadingMode;
  direction?: ReaderPagedDirection;
  label: string;
  description: string;
}

/**
 * Mihon's reading modes in the same order as its mode picker. LTR and RTL are
 * both the horizontal pager, distinguished by `direction`.
 */
export const READING_MODE_OPTIONS: ReaderReadingModeOption[] = [
  {
    id: "ltr",
    key: "pagedHorizontal",
    direction: "ltr",
    label: "Left to right",
    description: "Paged, swipe left for the next page",
  },
  {
    id: "rtl",
    key: "pagedHorizontal",
    direction: "rtl",
    label: "Right to left",
    description: "Paged, swipe right for the next page",
  },
  {
    id: "vertical",
    key: "pagedVertical",
    label: "Vertical",
    description: "Paged, swipe up for the next page",
  },
  {
    id: "webtoon",
    key: "webtoon",
    label: "Webtoon",
    description: "Continuous long strip with page gaps",
  },
  {
    id: "continuous",
    key: "continuousVertical",
    label: "Continuous vertical",
    description: "Continuous long strip without gaps",
  },
];

export const ORIENTATION_OPTIONS: { key: ReaderOrientation; label: string }[] = [
  { key: "default", label: "Default" },
  { key: "free", label: "Free" },
  { key: "portrait", label: "Portrait" },
  { key: "landscape", label: "Landscape" },
  { key: "lockedPortrait", label: "Locked portrait" },
  { key: "lockedLandscape", label: "Locked landscape" },
  { key: "reversePortrait", label: "Reverse portrait" },
];

export const TAP_ZONE_OPTIONS: { key: ReaderTapZoneLayout; label: string }[] = [
  { key: "l", label: "L-shaped" },
  { key: "kindlish", label: "Kindlish" },
  { key: "edge", label: "Edge" },
  { key: "rightLeft", label: "Right & left" },
  { key: "disabled", label: "Disabled" },
  { key: "topBottom", label: "Top & bottom" },
  { key: "leftRight", label: "Left & right" },
  { key: "both", label: "Both (all sides)" },
];

export const IMAGE_SCALE_OPTIONS: {
  key: ReaderImageScaleType;
  label: string;
}[] = [
  { key: "fitScreen", label: "Fit screen" },
  { key: "fitWidth", label: "Fit width" },
  { key: "fitHeight", label: "Fit height" },
  { key: "original", label: "Original" },
];

export const INVERT_TAP_ZONE_OPTIONS: {
  key: ReaderInvertTapZones;
  label: string;
}[] = [
  { key: "none", label: "None" },
  { key: "horizontal", label: "Horizontal" },
  { key: "vertical", label: "Vertical" },
  { key: "both", label: "Both" },
];

export const BACKGROUND_COLOR_OPTIONS: {
  key: ReaderBackgroundColor;
  label: string;
}[] = [
  { key: "black", label: "Black" },
  { key: "gray", label: "Gray" },
  { key: "white", label: "White" },
  { key: "auto", label: "Auto" },
];

export { isGapLessMode, isHorizontalMode, isLongStripMode, isPagedMode };

export function readingModeOptionFor(
  mode: ReaderReadingMode,
  direction: ReaderPagedDirection,
): ReaderReadingModeOption {
  const match = READING_MODE_OPTIONS.find(
    (option) =>
      option.key === mode &&
      (option.direction ?? direction) === direction,
  );
  return (
    match ??
    READING_MODE_OPTIONS.find((option) => option.key === mode) ??
    READING_MODE_OPTIONS[0]
  );
}

export function orientationToLock(
  orientation: ReaderOrientation,
): OrientationLock {
  switch (orientation) {
    case "free":
      return OrientationLock.ALL;
    case "portrait":
      return OrientationLock.PORTRAIT;
    case "landscape":
      return OrientationLock.LANDSCAPE;
    case "lockedPortrait":
      return OrientationLock.PORTRAIT_UP;
    case "lockedLandscape":
      return OrientationLock.LANDSCAPE_RIGHT;
    case "reversePortrait":
      return OrientationLock.PORTRAIT_DOWN;
    case "default":
    default:
      return OrientationLock.DEFAULT;
  }
}
