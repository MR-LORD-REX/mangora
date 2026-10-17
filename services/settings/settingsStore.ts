/**
 * settingsStore.ts
 * ---------------------------------------------------------------------------
 * Tiny app settings store.
 *
 * Settings are persisted as JSON in the app's document directory
 * (`.../files/trapp-settings/settings.json`) so they survive restarts and do
 * not need any extra dependency (AsyncStorage etc.). Every write is mirrored
 * into the SQLite `app_settings` table via settingsRepository so the database
 * holds a global copy as well (see spec Â§15). The file remains the source of
 * truth; the DB row is a mirror that is seeded at bootstrap when missing.
 *
 * The reader and home screen both read the same store; the reader subscribes
 * so model/backend changes made anywhere are picked up live.
 * ---------------------------------------------------------------------------
 */

import { Directory, File, Paths } from "expo-file-system";

import {
  getStoredSettingsJson,
  upsertStoredSettingsJson,
} from "@/services/db/repositories/settingsRepository";
import type { LocalModelId } from "@/services/ocr/executorchModels";
import {
  GEMINI_DEFAULT_MODEL,
  isGeminiModelId,
  type GeminiModelId,
} from "@/services/translation/geminiModels";

/** OCR backend used by the reader. */
export type OcrBackend = "local" | "cloud";

/**
 * How the reader translates a page.
 *   off  - no translation
 *   free - free Google endpoint, per-bubble pipeline
 *   ai   - Gemini API; OCRed pages dispatched in groups with past-page
 *          context (RAM per-manga OCR history)
 */
export type ReaderTranslateMode = "off" | "free" | "ai";

export type ReaderReadingMode =
  | "scrollVertical"
  | "scrollHorizontal"
  | "pagedVertical"
  | "pagedHorizontal";

export type ReaderPagedDirection = "ltr" | "rtl";

export type ReaderOrientation =
  | "default"
  | "free"
  | "portrait"
  | "landscape"
  | "lockedPortrait"
  | "lockedLandscape"
  | "reversePortrait";

export type ReaderFitMode = "fit" | "original";

export type ReaderTapZoneLayout = "topBottom" | "leftRight" | "both";

export type ReaderInvertTapZones = "none" | "horizontal" | "vertical" | "both";

export type ReaderBackgroundColor = "black" | "gray" | "white" | "auto";

export interface ExtensionRepoSetting {
  url: string;
  name: string;
  addedAt: number;
}

export interface AppSettings {
  /** OCR.space API key (entered on the home screen). */
  ocrApiKey: string;
  /** Which OCR backend the reader should use. */
  ocrBackend: OcrBackend;
  /** Local ExecuTorch model selected in the reader dropdown. */
  localModelId: LocalModelId | null;
  /**
   * Source language override chosen in Reader Config -> Language.
   * Empty string means "auto" (derive from the chapter's language param).
   */
  readerLanguage: string;
  /** Reader Config -> Translation mode: off / free / AI. */
  readerTranslateMode: ReaderTranslateMode;
  /** Gemini API key used by AI translation ("" = not set). */
  geminiApiKey: string;
  /** Gemini model used by AI translation. */
  geminiModelId: GeminiModelId;
  /**
   * AI translation: how many freshly OCRed pages to wait for before sending
   * one Gemini request (1..10, default 3).
   */
  aiRequestPageInterval: number;
  /** AI translation: maximum concurrent Gemini requests (1..5, default 1). */
  aiRequestFrequency: number;
  /** AI translation: past pages of OCR history attached per request (0..50, default 10). */
  aiMaxContextPages: number;
  /** Reader Config -> Language -> Target: translate-into language code. */
  readerTargetLanguage: string;
  /** Overlay text size multiplier (0.5..2). 1 = auto-fitted default. */
  readerTextScale: number;
  /** Reading modes / orientation / fit & chrome toggles (new reader UI). */
  readerReadingMode: ReaderReadingMode;
  readerPagedDirection: ReaderPagedDirection;
  readerOrientation: ReaderOrientation;
  readerFitMode: ReaderFitMode;
  /** Initial scale for zoomable pages (0.5..1.5, default 1). */
  readerDefaultZoomScale: number;
  /** Repositories the user explicitly added for extension discovery. */
  extensionRepos: ExtensionRepoSetting[];
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
  readerCustomBrightness: number; // 0-100
  readerCustomColorFilterEnabled: boolean;
  readerCustomColorFilter: string;
  readerGrayscale: boolean;
  readerInverted: boolean;
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
  ocrApiKey: "",
  ocrBackend: "local",
  localModelId: null,
  readerLanguage: "",
  readerTranslateMode: "off",
  geminiApiKey: "",
  geminiModelId: GEMINI_DEFAULT_MODEL,
  aiRequestPageInterval: 3,
  aiRequestFrequency: 1,
  aiMaxContextPages: 10,
  readerTargetLanguage: "en",
  readerTextScale: 1,
  readerReadingMode: "scrollVertical",
  readerPagedDirection: "ltr",
  readerOrientation: "default",
  readerFitMode: "fit",
  readerDefaultZoomScale: 1,
  extensionRepos: [],
  extensionTermsAcceptedAt: null,
  safeMode: true,
  ageRestrictedSources: false,
  updateIncludePrereleases: false,
  readerDoubleTapToZoom: true,
  readerDisableZoomOut: true,
  readerSplitWidePages: false,
  readerRotateWidePagesToFit: false,
  readerCropBorders: false,
  readerTapZoneLayout: "topBottom",
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
  readerCustomColorFilter: "#000000",
  readerGrayscale: false,
  readerInverted: false,
  readerScrollSpeed: 1,
  onboardingSeenGuideIds: [],
  onboardingDismissedForever: false,
  downloadSourceConcurrency: 1,
  downloadPageConcurrency: 1,
  downloadWifiOnly: true,
  downloadConfirmSuppressedUntil: null,
  lastBackupAt: null,
};

let cached: AppSettings | null = null;
let writeQueue: Promise<void> = Promise.resolve();
const listeners = new Set<(settings: AppSettings) => void>();

function settingsFile(): File {
  const dir = new Directory(Paths.document, "trapp-settings");
  if (!dir.exists) {
    dir.create({ idempotent: true, intermediates: true });
  }
  return new File(dir, "settings.json");
}

const READING_MODES: ReaderReadingMode[] = [
  "scrollVertical",
  "scrollHorizontal",
  "pagedVertical",
  "pagedHorizontal",
];
const ORIENTATIONS: ReaderOrientation[] = [
  "default",
  "free",
  "portrait",
  "landscape",
  "lockedPortrait",
  "lockedLandscape",
  "reversePortrait",
];
const TAP_ZONES: ReaderTapZoneLayout[] = ["topBottom", "leftRight", "both"];
const INVERTS: ReaderInvertTapZones[] = ["none", "horizontal", "vertical", "both"];
const BACKGROUNDS: ReaderBackgroundColor[] = ["black", "gray", "white", "auto"];

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

function sanitize(raw: unknown): AppSettings {
  const value = (raw ?? {}) as Partial<AppSettings>;
  const backend: OcrBackend = value.ocrBackend === "cloud" ? "cloud" : "local";
  // Legacy perBubble/perPage both collapse into "free": the free engine
  // keeps the per-bubble pipeline and never needs an API key, so no saved
  // preference is ever silently upgraded into key-requiring AI translation.
  // Legacy persisted values are compared as strings because perBubble /
  // perPage are no longer part of the ReaderTranslateMode union.
  const rawMode = value.readerTranslateMode as string | undefined;
  const mode: ReaderTranslateMode =
    rawMode === "ai"
      ? "ai"
      : rawMode === "perBubble" ||
          rawMode === "perPage" ||
          rawMode === "free"
        ? "free"
        : "off";
  const scale = typeof value.readerTextScale === "number" ? value.readerTextScale : 1;
  return {
    ocrApiKey: typeof value.ocrApiKey === "string" ? value.ocrApiKey : "",
    ocrBackend: backend,
    localModelId:
      typeof value.localModelId === "string"
        ? (value.localModelId as LocalModelId)
        : null,
    readerLanguage:
      typeof value.readerLanguage === "string" ? value.readerLanguage : "",
    readerTranslateMode: mode,
    readerTargetLanguage:
      typeof value.readerTargetLanguage === "string"
        ? value.readerTargetLanguage
        : "en",
    geminiApiKey:
      typeof value.geminiApiKey === "string" ? value.geminiApiKey : "",
    geminiModelId: isGeminiModelId(value.geminiModelId)
      ? value.geminiModelId
      : GEMINI_DEFAULT_MODEL,
    aiRequestPageInterval: Math.round(
      num(value.aiRequestPageInterval, 3, 1, 10),
    ),
    aiRequestFrequency: Math.round(
      num(value.aiRequestFrequency, 1, 1, 5),
    ),
    aiMaxContextPages: Math.round(num(value.aiMaxContextPages, 10, 0, 50)),
    readerTextScale: Math.min(2, Math.max(0.5, Number.isFinite(scale) ? scale : 1)),
    readerReadingMode: oneOf(value.readerReadingMode, READING_MODES, "scrollVertical"),
    readerPagedDirection:
      value.readerPagedDirection === "rtl" ? "rtl" : "ltr",
    readerOrientation: oneOf(value.readerOrientation, ORIENTATIONS, "default"),
    readerFitMode: value.readerFitMode === "original" ? "original" : "fit",
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
    readerTapZoneLayout: oneOf(value.readerTapZoneLayout, TAP_ZONES, "topBottom"),
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
    readerCustomBrightness: Math.round(num(value.readerCustomBrightness, 100, 0, 100)),
    readerCustomColorFilterEnabled: bool(value.readerCustomColorFilterEnabled, false),
    readerCustomColorFilter:
      typeof value.readerCustomColorFilter === "string"
        ? value.readerCustomColorFilter
        : "#000000",
    readerGrayscale: bool(value.readerGrayscale, false),
    readerInverted: bool(value.readerInverted, false),
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

/** Loads settings once and caches them in memory. */
export async function getSettings(): Promise<AppSettings> {
  if (cached) return cached;
  try {
    const file = settingsFile();
    if (file.exists) {
      cached = sanitize(JSON.parse(await file.text()));
      return cached;
    }
  } catch (error) {
    console.warn("Failed to read settings, using defaults:", error);
  }
  cached = { ...DEFAULT_SETTINGS };
  return cached;
}

/**
 * Merges `patch` into the current settings, persists them (queued so parallel
 * writes cannot race), mirrors the row into the SQLite app_settings table and
 * notifies subscribers.
 */
export async function updateSettings(
  patch: Partial<AppSettings>,
): Promise<AppSettings> {
  const current = cached ?? (await getSettings());
  const next: AppSettings = { ...current, ...patch };
  cached = next;

  writeQueue = writeQueue.then(async () => {
    try {
      const file = settingsFile();
      file.write(JSON.stringify(next, null, 2));
    } catch (error) {
      console.warn("Failed to persist settings:", error);
    }
  });
  await writeQueue;

  listeners.forEach((listener) => listener(next));

  try {
    await upsertStoredSettingsJson(JSON.stringify(next));
  } catch (error) {
    // The DB mirror is best-effort; never block settings changes on it.
    console.warn("Failed to mirror settings into the app database:", error);
  }
  return next;
}

/** Subscribes to settings changes. Returns an unsubscribe function. */
export function subscribeSettings(
  listener: (settings: AppSettings) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Re-reads the settings mirror that lives inside the SQLite database and makes
 * it the live settings again (file + memory). Used after a backup restore,
 * where the database was replaced under the running app.
 */
export async function reloadSettingsFromMirror(): Promise<AppSettings> {
  const json = await getStoredSettingsJson();
  if (!json) return cached ?? { ...DEFAULT_SETTINGS };
  let next: AppSettings;
  try {
    next = sanitize(JSON.parse(json));
  } catch {
    return cached ?? { ...DEFAULT_SETTINGS };
  }
  cached = next;
  try {
    settingsFile().write(JSON.stringify(next, null, 2));
  } catch (error) {
    console.warn("Failed to rewrite settings after restore:", error);
  }
  listeners.forEach((listener) => listener(next));
  return next;
}
