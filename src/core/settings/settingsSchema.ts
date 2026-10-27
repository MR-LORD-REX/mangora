import {
  GEMINI_DEFAULT_MODEL,
  isGeminiModelId,
  type GeminiModelId,
} from "./geminiModelId";
import type { TranslationEngine } from "@shared/contracts/translationEngine";

/** Translation backend used when a reader page is translated. */
export type ReaderTranslationEngine = TranslationEngine;

/** When translation runs in the reader. */
export type ReaderTranslationMode = "off" | "single" | "auto";

export type ReaderReadingMode =
  | "webtoon"
  | "continuousVertical"
  | "pagedHorizontal";

export type ReaderPagedDirection = "ltr" | "rtl";

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

export type ReaderOverlayFont = "default" | "comicNeue" | "bangers" | "chewy";

export interface ExtensionRepoSetting {
  url: string;
  name: string;
  addedAt: number;
}

export interface AppSettings {
  /**
   * Source language override chosen in Reader Config -> Language.
   * Empty string means "auto" (derive from the chapter's language param).
   */
  readerLanguage: string;
  /** Translation engine: free Google endpoint or Gemini. */
  readerTranslationEngine: ReaderTranslationEngine;
  /** Translation mode: off / single page / auto. */
  readerTranslationMode: ReaderTranslationMode;
  /** Gemini API key used by AI translation ("" = not set). */
  geminiApiKey: string;
  /** Gemini model used by AI translation. */
  geminiModelId: GeminiModelId;
  /** OCR pipeline: PP-OCR recognition batch size (1..8, default 8). */
  ocrBubbleWorkers: number;
  /** Pages queued ahead of the visible page (1..5, default 2). */
  ocrLookahead: number;
  /** AI TR: past OCRed pages attached to each request (1..50, default 10). */
  aiMaxContextPages: number;
  /** AI TR: retry a rate-limited request with the next model (default off). */
  readerAutoModelSwitch: boolean;
  /** Reader Config -> Language -> Target: translate-into language code. */
  readerTargetLanguage: string;
  /** Reading modes / orientation / fit & chrome toggles (new reader UI). */
  readerReadingMode: ReaderReadingMode;
  readerPagedDirection: ReaderPagedDirection;
  readerOrientation: ReaderOrientation;
  readerFitMode: ReaderFitMode;
  readerImageScaleType: ReaderImageScaleType;
  /** Initial scale for zoomable pages (0.5..1.5, default 1). */
  readerDefaultZoomScale: number;
  /** Repositories the user explicitly added for extension discovery. */
  extensionRepos: ExtensionRepoSetting[];
  /** Source ids pinned above every other section in Browse > Sources. */
  pinnedSourceIds: string[];
  /** Last time each source was opened, keyed by source id. */
  sourceLastUsedAt: Record<string, number>;
  /** Epoch millis when the user accepted the extension install terms. */
  extensionTermsAcceptedAt: number | null;
  /** Hide providers marked mature from source discovery. */
  safeMode: boolean;
  /**
   * Whether share / deep links may target providers marked mature. Off by
   * default so an unopened link never lands on an adult source (plan S9/S14.4).
   */
  ageRestrictedSources: boolean;
  /** Updater: include GitHub prereleases when checking for updates. */
  updateIncludePrereleases: boolean;
  readerDoubleTapToZoom: boolean;
  readerDisableZoomOut: boolean;
  readerSplitWidePages: boolean;
  readerRotateWidePagesToFit: boolean;
  readerCropBorders: boolean;
  readerTapZoneLayout: ReaderTapZoneLayout;
  readerInvertTapZones: ReaderInvertTapZones;
  readerSidePadding: number; // 0-100 (%)
  readerBackgroundColor: ReaderBackgroundColor;
  readerShowPageNumber: boolean;
  readerFullscreen: boolean;
  readerShowContentInCutout: boolean;
  readerKeepScreenOn: boolean;
  readerShowActionsOnLongTap: boolean;
  readerAlwaysShowChapterTransition: boolean;
  readerAnimatePageTransitions: boolean;
  readerFlashOnPageChange: boolean;
  readerCustomBrightnessEnabled: boolean;
  readerCustomBrightness: number; // 0-200 (100 = original image brightness)
  readerCustomColorFilterEnabled: boolean;
  readerCustomColorFilter: string;
  readerGrayscale: boolean;
  readerGrayscaleAmount: number; // 0-100
  readerInverted: boolean;
  /** Overlay paste font + typography (target-language text only). */
  readerOverlayFont: ReaderOverlayFont;
  readerOverlayFontWeight: number; // 400-900
  /** Multiplier applied to the auto-fitted overlay font size (0.5-1.5). */
  readerOverlayFontScale: number;
  readerOverlayTextColor: string; // #rrggbb
  /** Show the per-page TR status badge while translation is active. */
  readerShowPageStatus: boolean;
  /** Hide translated overlays while keeping page status visible. */
  readerHideTranslated: boolean;
  /** Auto-scroll speed multiplier (1..5). */
  readerScrollSpeed: number;
  /**
   * Onboarding: ids of the guides the user has already finished. Adding a
   * new guide id resurfaces the overlay until that guide has been seen too.
   */
  onboardingSeenGuideIds: string[];
  /** Onboarding: user chose "Close forever" in the exit dialog. */
  onboardingDismissedForever: boolean;
  /** Downloads: concurrent chapter downloads per provider (1..5). */
  downloadSourceConcurrency: number;
  /** Downloads: concurrent page downloads per chapter (1..10). */
  downloadPageConcurrency: number;
  /** Downloads: only download over Wi-Fi / ethernet. */
  downloadWifiOnly: boolean;
  /** Downloads: "hide the confirmation until today" marker (YYYY-MM-DD). */
  downloadConfirmSuppressedUntil: string | null;
  /** Data & storage: epoch millis of the last successful backup. */
  lastBackupAt: number | null;
}

export const DEFAULT_SETTINGS: AppSettings = {
  readerLanguage: "",
  readerTranslationEngine: "free",
  readerTranslationMode: "off",
  geminiApiKey: "",
  geminiModelId: GEMINI_DEFAULT_MODEL,
  ocrBubbleWorkers: 8,
  ocrLookahead: 2,
  aiMaxContextPages: 10,
  readerAutoModelSwitch: false,
  readerTargetLanguage: "en",
  readerReadingMode: "webtoon",
  readerPagedDirection: "ltr",
  readerOrientation: "default",
  readerFitMode: "fit",
  readerImageScaleType: "fitScreen",
  readerDefaultZoomScale: 1,
  extensionRepos: [],
  pinnedSourceIds: [],
  sourceLastUsedAt: {},
  extensionTermsAcceptedAt: null,
  safeMode: true,
  ageRestrictedSources: false,
  updateIncludePrereleases: false,
  readerDoubleTapToZoom: true,
  readerDisableZoomOut: true,
  readerSplitWidePages: false,
  readerRotateWidePagesToFit: false,
  readerCropBorders: false,
  readerTapZoneLayout: "l",
  readerInvertTapZones: "none",
  readerSidePadding: 0,
  readerBackgroundColor: "black",
  readerShowPageNumber: true,
  readerFullscreen: false,
  readerShowContentInCutout: false,
  readerKeepScreenOn: false,
  readerShowActionsOnLongTap: true,
  readerAlwaysShowChapterTransition: false,
  readerAnimatePageTransitions: true,
  readerFlashOnPageChange: false,
  readerCustomBrightnessEnabled: false,
  readerCustomBrightness: 100,
  readerCustomColorFilterEnabled: false,
  readerCustomColorFilter: "#808080",
  readerGrayscale: false,
  readerGrayscaleAmount: 100,
  readerInverted: false,
  readerOverlayFont: "default",
  readerOverlayFontWeight: 600,
  readerOverlayFontScale: 1,
  readerOverlayTextColor: "#000000",
  readerShowPageStatus: true,
  readerHideTranslated: false,
  readerScrollSpeed: 1,
  onboardingSeenGuideIds: [],
  onboardingDismissedForever: false,
  downloadSourceConcurrency: 1,
  downloadPageConcurrency: 1,
  downloadWifiOnly: true,
  downloadConfirmSuppressedUntil: null,
  lastBackupAt: null,
};

const READING_MODES: ReaderReadingMode[] = [
  "webtoon",
  "continuousVertical",
  "pagedHorizontal",
];
const LEGACY_READING_MODES: Record<string, ReaderReadingMode> = {
  scrollVertical: "webtoon",
  scrollHorizontal: "pagedHorizontal",
  pagedVertical: "pagedHorizontal",
};
const ORIENTATIONS: ReaderOrientation[] = [
  "default",
  "free",
  "portrait",
  "landscape",
  "lockedPortrait",
  "lockedLandscape",
  "reversePortrait",
];
const TAP_ZONES: ReaderTapZoneLayout[] = [
  "l",
  "kindlish",
  "edge",
  "rightLeft",
  "disabled",
  "topBottom",
  "leftRight",
  "both",
];
const IMAGE_SCALES: AppSettings["readerImageScaleType"][] = [
  "fitWidth",
  "fitHeight",
  "fitScreen",
  "original",
];
const INVERTS: ReaderInvertTapZones[] = ["none", "horizontal", "vertical", "both"];
const BACKGROUNDS: ReaderBackgroundColor[] = ["black", "gray", "white", "auto"];
const OVERLAY_FONTS: ReaderOverlayFont[] = [
  "default",
  "comicNeue",
  "bangers",
  "chewy",
];

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function num(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function sanitizeSettings(raw: unknown): AppSettings {
  const value = (raw ?? {}) as Partial<AppSettings>;
  // Legacy `readerTranslateMode` bundled engine + off state. Split it into
  // an engine preference and an explicit flow mode during migration.
  const legacy = value as Partial<AppSettings> & {
    readerTranslateMode?: string;
  };
  const rawLegacy = legacy.readerTranslateMode;
  const engine: ReaderTranslationEngine =
    value.readerTranslationEngine === "ai" || rawLegacy === "ai"
      ? "ai"
      : "free";
  const rawMode = value.readerTranslationMode as string | undefined;
  const mode: ReaderTranslationMode =
    rawMode === "single" || rawMode === "auto" || rawMode === "off"
      ? rawMode
      : rawMode === "autoBubbles"
        ? "auto"
        : rawLegacy === "free" ||
          rawLegacy === "ai" ||
          rawLegacy === "perBubble" ||
          rawLegacy === "perPage"
        ? "auto"
        : "off";
  return {
    readerLanguage:
      typeof value.readerLanguage === "string" &&
      value.readerLanguage.trim().toLowerCase() !== "ru"
        ? value.readerLanguage
        : "",
    readerTranslationEngine: engine,
    readerTranslationMode: mode,
    readerTargetLanguage:
      typeof value.readerTargetLanguage === "string"
        ? value.readerTargetLanguage
        : "en",
    geminiApiKey:
      typeof value.geminiApiKey === "string" ? value.geminiApiKey : "",
    geminiModelId: isGeminiModelId(value.geminiModelId)
      ? value.geminiModelId
      : GEMINI_DEFAULT_MODEL,
    ocrBubbleWorkers: Math.round(num(value.ocrBubbleWorkers, 8, 1, 8)),
    ocrLookahead: Math.round(num(value.ocrLookahead, 2, 1, 5)),
    aiMaxContextPages: Math.round(num(value.aiMaxContextPages, 10, 1, 50)),
    readerAutoModelSwitch: bool(value.readerAutoModelSwitch, false),
    readerReadingMode:
      LEGACY_READING_MODES[String(value.readerReadingMode)] ??
      oneOf(value.readerReadingMode, READING_MODES, "webtoon"),
    readerPagedDirection:
      value.readerPagedDirection === "rtl" ? "rtl" : "ltr",
    readerOrientation: oneOf(value.readerOrientation, ORIENTATIONS, "default"),
    readerFitMode: value.readerFitMode === "original" ? "original" : "fit",
    readerImageScaleType: oneOf(
      value.readerImageScaleType,
      IMAGE_SCALES,
      "fitScreen",
    ),
    readerDefaultZoomScale: num(value.readerDefaultZoomScale, 1, 0.5, 1.5),
    extensionRepos: Array.isArray(value.extensionRepos)
      ? value.extensionRepos.filter(
          (entry): entry is ExtensionRepoSetting =>
            Boolean(entry) &&
            typeof entry === "object" &&
            typeof (entry as ExtensionRepoSetting).url === "string" &&
            (entry as ExtensionRepoSetting).url.length > 0,
        )
      : [],
    pinnedSourceIds: Array.isArray(value.pinnedSourceIds)
      ? value.pinnedSourceIds.filter(
          (id): id is string => typeof id === "string" && id.length > 0,
        )
      : [],
    sourceLastUsedAt:
      value.sourceLastUsedAt && typeof value.sourceLastUsedAt === "object"
        ? Object.fromEntries(
            Object.entries(value.sourceLastUsedAt).filter(
              (entry): entry is [string, number] =>
                typeof entry[1] === "number" && Number.isFinite(entry[1]),
            ),
          )
        : {},
    extensionTermsAcceptedAt:
      typeof value.extensionTermsAcceptedAt === "number" &&
      Number.isFinite(value.extensionTermsAcceptedAt)
        ? value.extensionTermsAcceptedAt
        : null,
    safeMode: bool(value.safeMode, true),
    ageRestrictedSources: bool(value.ageRestrictedSources, false),
    updateIncludePrereleases: bool(value.updateIncludePrereleases, false),
    readerDoubleTapToZoom: bool(value.readerDoubleTapToZoom, true),
    readerDisableZoomOut: bool(value.readerDisableZoomOut, true),
    readerSplitWidePages: bool(value.readerSplitWidePages, false),
    readerRotateWidePagesToFit: bool(value.readerRotateWidePagesToFit, false),
    readerCropBorders: bool(value.readerCropBorders, false),
    readerTapZoneLayout: oneOf(value.readerTapZoneLayout, TAP_ZONES, "l"),
    readerInvertTapZones: oneOf(value.readerInvertTapZones, INVERTS, "none"),
    readerSidePadding: Math.round(num(value.readerSidePadding, 0, 0, 100)),
    readerBackgroundColor: oneOf(
      value.readerBackgroundColor,
      BACKGROUNDS,
      "black",
    ),
    readerShowPageNumber: bool(value.readerShowPageNumber, true),
    readerFullscreen: bool(value.readerFullscreen, false),
    readerShowContentInCutout: bool(value.readerShowContentInCutout, false),
    readerKeepScreenOn: bool(value.readerKeepScreenOn, false),
    readerShowActionsOnLongTap: bool(value.readerShowActionsOnLongTap, true),
    readerAlwaysShowChapterTransition: bool(
      value.readerAlwaysShowChapterTransition,
      false,
    ),
    readerAnimatePageTransitions: bool(value.readerAnimatePageTransitions, true),
    readerFlashOnPageChange: bool(value.readerFlashOnPageChange, false),
    readerCustomBrightnessEnabled: bool(value.readerCustomBrightnessEnabled, false),
    readerCustomBrightness: Math.round(num(value.readerCustomBrightness, 100, 0, 200)),
    readerCustomColorFilterEnabled: bool(value.readerCustomColorFilterEnabled, false),
    readerCustomColorFilter:
      typeof value.readerCustomColorFilter === "string" &&
      /^#[0-9a-f]{6}$/i.test(value.readerCustomColorFilter)
        ? value.readerCustomColorFilter === "#000000"
          ? "#808080"
          : value.readerCustomColorFilter
        : "#808080",
    readerGrayscale: bool(value.readerGrayscale, false),
    readerGrayscaleAmount: Math.round(
      num(value.readerGrayscaleAmount, 100, 0, 100),
    ),
    readerInverted: bool(value.readerInverted, false),
    readerOverlayFont: oneOf(value.readerOverlayFont, OVERLAY_FONTS, "default"),
    readerOverlayFontWeight: Math.round(
      num(value.readerOverlayFontWeight, 600, 400, 900) / 100,
    ) * 100,
    readerOverlayFontScale:
      Math.round(num(value.readerOverlayFontScale, 1, 0.5, 1.5) * 100) / 100,
    readerOverlayTextColor:
      typeof value.readerOverlayTextColor === "string" &&
      /^#[0-9a-f]{6}$/i.test(value.readerOverlayTextColor)
        ? value.readerOverlayTextColor
        : "#000000",
    readerShowPageStatus: bool(value.readerShowPageStatus, true),
    readerHideTranslated: bool(value.readerHideTranslated, false),
    readerScrollSpeed: Math.round(num(value.readerScrollSpeed, 1, 1, 5)),
    onboardingSeenGuideIds: Array.isArray(value.onboardingSeenGuideIds)
      ? value.onboardingSeenGuideIds.filter(
          (id): id is string => typeof id === "string",
        )
      : [],
    onboardingDismissedForever: bool(value.onboardingDismissedForever, false),
    downloadSourceConcurrency: Math.round(
      num(value.downloadSourceConcurrency, 1, 1, 5),
    ),
    downloadPageConcurrency: Math.round(
      num(value.downloadPageConcurrency, 1, 1, 10),
    ),
    downloadWifiOnly: bool(value.downloadWifiOnly, true),
    downloadConfirmSuppressedUntil:
      typeof value.downloadConfirmSuppressedUntil === "string"
        ? value.downloadConfirmSuppressedUntil
        : null,
    lastBackupAt:
      typeof value.lastBackupAt === "number" && Number.isFinite(value.lastBackupAt)
        ? value.lastBackupAt
        : null,
  };
}

