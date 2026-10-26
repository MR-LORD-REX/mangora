import type {
  ReaderBackgroundColor,
  ReaderFitMode,
  ReaderImageScaleType,
  ReaderInvertTapZones,
  ReaderOrientation,
  ReaderPagedDirection,
  ReaderReadingMode,
  ReaderTapZoneLayout,
} from "./settingsSchema";

export interface ReaderChromeSettings {
  readingMode: ReaderReadingMode;
  pagedDirection: ReaderPagedDirection;
  orientation: ReaderOrientation;
  fitMode: ReaderFitMode;
  imageScaleType: ReaderImageScaleType;
  doubleTapToZoom: boolean;
  disableZoomOut: boolean;
  splitWidePages: boolean;
  rotateWidePagesToFit: boolean;
  cropBorders: boolean;
  tapZoneLayout: ReaderTapZoneLayout;
  invertTapZones: ReaderInvertTapZones;
  sidePadding: number;
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
  customBrightness: number;
  customColorFilterEnabled: boolean;
  customColorFilter: string;
  grayscale: boolean;
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
