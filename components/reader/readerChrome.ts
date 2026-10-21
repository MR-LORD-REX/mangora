/**
 * readerChrome.ts
 * ---------------------------------------------------------------------------
 * Shared types, option lists and helpers for the new reader chrome (reading
 * modes, orientation, fit mode, and the settings-panel toggles). Kept
 * dependency-light so every chrome component imports from one place.
 * ---------------------------------------------------------------------------
 */

import { OrientationLock } from "expo-screen-orientation";

export type ReaderReadingMode =
  | "webtoon"
  | "continuousVertical"
  | "scrollVertical"
  | "scrollHorizontal"
  | "pagedVertical"
  | "pagedHorizontal";

export type ReaderPagedDirection = "ltr" | "rtl";

/** Mihon's image scale choices for paged readers. */
export type ReaderImageScaleType =
  | "fitWidth"
  | "fitHeight"
  | "fitScreen"
  | "original";

export type ReaderOrientation =
  | "default"
  | "free"
  | "portrait"
  | "landscape"
  | "lockedPortrait"
  | "lockedLandscape"
  | "reversePortrait";

export type ReaderFitMode = "fit" | "original";

/**
 * Mihon navigation presets. The legacy names (`topBottom`, `leftRight`,
 * `both`) stay valid so older settings keep working.
 */
export type ReaderTapZoneLayout =
  | "l"
  | "kindlish"
  | "edge"
  | "rightLeft"
  | "disabled"
  | "topBottom"
  | "leftRight"
  | "both";

export type ReaderInvertTapZones = "none" | "horizontal" | "vertical" | "both";

export type ReaderBackgroundColor = "black" | "gray" | "white" | "auto";

/** Overlay paste fonts. "default" keeps the system font. */
export type ReaderOverlayFont = "default" | "comicNeue" | "bangers" | "chewy";

export interface ReaderChromeSettings {
  readingMode: ReaderReadingMode;
  pagedDirection: ReaderPagedDirection;
  orientation: ReaderOrientation;
  fitMode: ReaderFitMode;
  /** Paged-viewer image scale, mirroring Mihon's image scale type. */
  imageScaleType: ReaderImageScaleType;
  doubleTapToZoom: boolean;
  disableZoomOut: boolean;
  splitWidePages: boolean;
  rotateWidePagesToFit: boolean;
  cropBorders: boolean;
  tapZoneLayout: ReaderTapZoneLayout;
  invertTapZones: ReaderInvertTapZones;
  sidePadding: number;
  /** Webtoon spacing between pages in dp; 0 for continuous vertical. */
  webtoonPageGap: number;
  backgroundColor: ReaderBackgroundColor;
  showPageNumber: boolean;
  fullscreen: boolean;
  showContentInCutout: boolean;
  keepScreenOn: boolean;
  showActionsOnLongTap: boolean;
  alwaysShowChapterTransition: boolean;
  animatePageTransitions: boolean;
  flashOnPageChange: boolean;
  customBrightnessEnabled: boolean;
  /** Percent of the original image brightness (0-200, 100 = neutral). */
  customBrightness: number;
  customColorFilterEnabled: boolean;
  /** `#rrggbb` tint composited over the page (128,128,128 = neutral). */
  customColorFilter: string;
  grayscale: boolean;
  /** Grayscale strength in percent (0-100). */
  grayscaleAmount: number;
  inverted: boolean;
}

export const DEFAULT_READER_CHROME: ReaderChromeSettings = {
  readingMode: "webtoon",
  pagedDirection: "ltr",
  orientation: "default",
  fitMode: "fit",
  imageScaleType: "fitScreen",
  doubleTapToZoom: true,
  disableZoomOut: true,
  splitWidePages: false,
  rotateWidePagesToFit: false,
  cropBorders: false,
  tapZoneLayout: "l",
  invertTapZones: "none",
  sidePadding: 0,
  webtoonPageGap: 15,
  backgroundColor: "black",
  showPageNumber: true,
  fullscreen: false,
  showContentInCutout: false,
  keepScreenOn: false,
  showActionsOnLongTap: true,
  alwaysShowChapterTransition: false,
  animatePageTransitions: true,
  flashOnPageChange: false,
  customBrightnessEnabled: false,
  customBrightness: 100,
  customColorFilterEnabled: false,
  customColorFilter: "#808080",
  grayscale: false,
  grayscaleAmount: 100,
  inverted: false,
};

/**
 * Grayscale, inverted and custom color are mutually exclusive (Mihon's
 * single color-filter mode). Enabling one disables the other two; brightness
 * stacks on top of whichever mode is active.
 */
export function applyFilterExclusivity(
  patch: Partial<ReaderChromeSettings>,
): Partial<ReaderChromeSettings> {
  const next = { ...patch };
  if (patch.customColorFilterEnabled === true) {
    next.grayscale = false;
    next.inverted = false;
  }
  if (patch.grayscale === true) {
    next.customColorFilterEnabled = false;
    next.inverted = false;
  }
  if (patch.inverted === true) {
    next.customColorFilterEnabled = false;
    next.grayscale = false;
  }
  return next;
}

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

export function isPagedMode(mode: ReaderReadingMode): boolean {
  return mode === "pagedVertical" || mode === "pagedHorizontal";
}

export function isHorizontalMode(mode: ReaderReadingMode): boolean {
  return mode === "scrollHorizontal" || mode === "pagedHorizontal";
}

/** Long-strip modes render pages top-to-bottom in one continuous column. */
export function isLongStripMode(mode: ReaderReadingMode): boolean {
  return (
    mode === "webtoon" ||
    mode === "continuousVertical" ||
    mode === "scrollVertical"
  );
}

/** Webtoon keeps a Mihon-style gap; continuous vertical removes it. */
export function isGapLessMode(mode: ReaderReadingMode): boolean {
  return mode === "continuousVertical";
}

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
