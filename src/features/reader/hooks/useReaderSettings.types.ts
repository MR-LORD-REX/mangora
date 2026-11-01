/**
 * Public settings state returned by useReaderSettings.
 */
import type { AppSettings } from "@core/settings";
import type { RegionDetectorId } from "@features/translation";

import type { ReaderOverlayFont } from "../components/panels/readerChrome";
export type ReaderSettingsValues = Omit<
  ReaderSettingsState,
  | "applySettings"
  | "setAutoModelSwitch"
  | "setDefaultZoomScale"
  | "setOverlayFont"
  | "setOverlayFontWeight"
  | "setOverlayFontScale"
  | "setOverlayTextColor"
  | "setReaderLanguage"
  | "setTargetLanguage"
  | "setTranslationEngine"
  | "setTranslationMode"
  | "setShowPageStatus"
  | "setHideTranslated"
  | "setTranslationModelId"
  | "setRegionDetectorId"
  | "setOcrLookahead"
  | "queueSettingsPatch"
  | "flushSettingsPatch"
>;

export interface ReaderSettingsState {
  readerLanguage: string;
  targetLanguage: string;
  translationEngine: AppSettings["readerTranslationEngine"];
  translationMode: AppSettings["readerTranslationMode"];
  showPageStatus: boolean;
  hideTranslated: boolean;
  overlayFont: ReaderOverlayFont;
  overlayFontWeight: number;
  overlayFontScale: number;
  overlayTextColor: string;
  translationModelId: string;
  regionDetectorId: RegionDetectorId;
  autoModelSwitch: boolean;
  ocrBubbleWorkers: number;
  ocrLookahead: number;
  aiMaxContextPages: number;
  defaultZoomScale: number;
  /** Applies the persisted fields owned by this hook. */
  applySettings: (settings: AppSettings, autoLanguage: string) => void;
  setAutoModelSwitch: (value: boolean) => void;
  setDefaultZoomScale: (scale: number) => void;
  setOverlayFont: (font: ReaderOverlayFont) => void;
  setOverlayFontWeight: (weight: number) => void;
  setOverlayFontScale: (scale: number) => void;
  setOverlayTextColor: (color: string) => void;
  setReaderLanguage: (code: string) => void;
  setTargetLanguage: (code: string) => void;
  setTranslationEngine: (
    engine: AppSettings["readerTranslationEngine"],
  ) => void;
  setTranslationMode: (mode: AppSettings["readerTranslationMode"]) => void;
  setShowPageStatus: (value: boolean) => void;
  setHideTranslated: (value: boolean) => void;
  setTranslationModelId: (model: string) => void;
  setRegionDetectorId: (id: RegionDetectorId) => void;
  setOcrLookahead: (value: number) => void;
  /** Coalesces slider drags into one file/DB write. */
  queueSettingsPatch: (patch: Partial<AppSettings>, delay?: number) => void;
  /** Flushes any pending coalesced write; safe to call on unmount. */
  flushSettingsPatch: () => void;
}
