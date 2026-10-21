/**
 * readerChromeSettings.ts
 * ---------------------------------------------------------------------------
 * Mapping between the reader chrome settings object (used by the chrome UI)
 * and the persisted `reader*` keys of AppSettings. Keeps the field-name
 * convention in one place instead of duplicating it in the reader screen.
 * ---------------------------------------------------------------------------
 */

import type { ReaderChromeSettings } from "@/components/reader/readerChrome";
import type { AppSettings } from "@/services/settings/settingsStore";

/** Reader chrome field names map to reader* settings keys. */
export function chromeToSettingsPatch(
  patch: Partial<ReaderChromeSettings>,
): Partial<AppSettings> {
  const settings: Partial<AppSettings> = {};
  for (const [key, value] of Object.entries(patch)) {
    const settingsKey = "reader" + key.charAt(0).toUpperCase() + key.slice(1);
    (settings as Record<string, unknown>)[settingsKey] = value;
  }
  return settings;
}

/** Reads the persisted chrome settings back into the reader chrome object. */
export function chromeFromSettings(settings: AppSettings): ReaderChromeSettings {
  return {
    readingMode: settings.readerReadingMode,
    pagedDirection: settings.readerPagedDirection,
    orientation: settings.readerOrientation,
    fitMode: settings.readerFitMode,
    imageScaleType: settings.readerImageScaleType,
    doubleTapToZoom: settings.readerDoubleTapToZoom,
    disableZoomOut: settings.readerDisableZoomOut,
    splitWidePages: settings.readerSplitWidePages,
    rotateWidePagesToFit: settings.readerRotateWidePagesToFit,
    cropBorders: settings.readerCropBorders,
    tapZoneLayout: settings.readerTapZoneLayout,
    invertTapZones: settings.readerInvertTapZones,
    sidePadding: settings.readerSidePadding,
    webtoonPageGap: 15,
    backgroundColor: settings.readerBackgroundColor,
    showPageNumber: settings.readerShowPageNumber,
    fullscreen: settings.readerFullscreen,
    showContentInCutout: settings.readerShowContentInCutout,
    keepScreenOn: settings.readerKeepScreenOn,
    showActionsOnLongTap: settings.readerShowActionsOnLongTap,
    alwaysShowChapterTransition: settings.readerAlwaysShowChapterTransition,
    animatePageTransitions: settings.readerAnimatePageTransitions,
    flashOnPageChange: settings.readerFlashOnPageChange,
    customBrightnessEnabled: settings.readerCustomBrightnessEnabled,
    customBrightness: settings.readerCustomBrightness,
    customColorFilterEnabled: settings.readerCustomColorFilterEnabled,
    customColorFilter: settings.readerCustomColorFilter,
    grayscale: settings.readerGrayscale,
    grayscaleAmount: settings.readerGrayscaleAmount,
    inverted: settings.readerInverted,
  };
}
