/**
 * Reader settings bridge.
 *
 * Keeps the screen synchronized with the persisted settings store and exposes
 * the narrow set of settings callbacks the chrome consumes. The settings
 * controller owns the values and persistence; this hook owns the screen
 * adapters that also coordinate chrome, auto-scroll and translation.
 */
import { useCallback, useEffect } from "react";

import type { AppSettings } from "@core/settings";
import {
  getSettings,
  subscribeSettings,
  updateSettings,
} from "@core/settings";
import type { GeminiModelId } from "@features/translation";
import { modelIdForLanguage } from "@features/vision";

import type {
  ReaderChromeSettings,
  ReaderOverlayFont,
} from "../components/panels/readerChrome";
import { canonicalChineseForReader } from "../components/panels/readerLanguages";
import { chromeFromSettings } from "@/utils/reader/readerChromeSettings";
export interface ReaderSettingsControls {
  applySettings: (settings: AppSettings, autoLanguage: string) => void;
  translationEngine: AppSettings["readerTranslationEngine"];
  translationMode: AppSettings["readerTranslationMode"];
  geminiModelId: GeminiModelId;
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
  setGeminiModelId: (model: GeminiModelId) => void;
  setOcrLookahead: (value: number) => void;
  flushSettingsPatch: () => void;
}

export interface ReaderSettingsBridgeOptions {
  settings: ReaderSettingsControls;
  autoLanguage: string;
  setChrome: (chrome: ReaderChromeSettings) => void;
  setAutoScrollSpeed: (speed: number) => void;
  stopTranslationRun: () => void;
  clearTranslationCache: () => Promise<number>;
}

export interface ReaderSettingsBridgeState {
  handleSelectScrollSpeed: (speed: number) => void;
  handleSelectReaderLanguage: (code: string) => void;
  handleSelectTargetLanguage: (code: string) => void;
  handleSelectTranslationEngine: (
    engine: AppSettings["readerTranslationEngine"],
  ) => void;
  handleSelectTranslationMode: (
    mode: AppSettings["readerTranslationMode"],
  ) => void;
  handleChangeShowPageStatus: (value: boolean) => void;
  handleChangeHideTranslated: (value: boolean) => void;
  handleSelectGeminiModel: (model: GeminiModelId) => void;
  handleChangeAutoModelSwitch: (value: boolean) => void;
  handleChangeLookahead: (value: number) => void;
  handleSelectOverlayFont: (font: ReaderOverlayFont) => void;
  handleSelectOverlayFontWeight: (weight: number) => void;
  handleSelectOverlayTextColor: (color: string) => void;
  handleSelectOverlayFontScale: (scale: number) => void;
  handleSelectDefaultZoomScale: (scale: number) => void;
  handleClearTranslationCache: () => Promise<number>;
}

export function useReaderSettingsBridge({
  settings,
  autoLanguage,
  setChrome,
  setAutoScrollSpeed,
  stopTranslationRun,
  clearTranslationCache,
}: ReaderSettingsBridgeOptions): ReaderSettingsBridgeState {
  const {
    applySettings,
    translationEngine,
    translationMode,
    geminiModelId,
    setAutoModelSwitch,
    setDefaultZoomScale,
    setOverlayFont,
    setOverlayFontWeight,
    setOverlayFontScale,
    setOverlayTextColor,
    setReaderLanguage,
    setTargetLanguage,
    setTranslationEngine,
    setTranslationMode,
    setShowPageStatus,
    setHideTranslated,
    setGeminiModelId,
    setOcrLookahead,
    flushSettingsPatch,
  } = settings;

  useEffect(() => {
    const apply = (nextSettings: AppSettings) => {
      applySettings(nextSettings, autoLanguage);
      setChrome(chromeFromSettings(nextSettings));
      setAutoScrollSpeed(nextSettings.readerScrollSpeed || 1);
    };

    getSettings()
      .then(apply)
      .catch(() => {});
    return subscribeSettings(apply);
  }, [applySettings, autoLanguage, setAutoScrollSpeed, setChrome]);

  useEffect(() => flushSettingsPatch, [flushSettingsPatch]);

  const handleSelectScrollSpeed = useCallback(
    (speed: number) => {
      setAutoScrollSpeed(speed);
      void updateSettings({ readerScrollSpeed: speed }).catch(console.error);
    },
    [setAutoScrollSpeed],
  );

  const handleSelectReaderLanguage = useCallback(
    (code: string) => {
      const nextLanguage = code ? canonicalChineseForReader(code) : "";
      setReaderLanguage(nextLanguage);
      const languageToBind = nextLanguage || autoLanguage;
      console.log("[reader][ocr] provider selection", {
        language: languageToBind,
        model: modelIdForLanguage(languageToBind),
      });
    },
    [autoLanguage, setReaderLanguage],
  );

  const handleSelectTargetLanguage = useCallback(
    (code: string) => setTargetLanguage(code),
    [setTargetLanguage],
  );
  const handleSelectTranslationEngine = useCallback(
    (engine: AppSettings["readerTranslationEngine"]) => {
      if (engine !== translationEngine) stopTranslationRun();
      setTranslationEngine(engine);
    },
    [setTranslationEngine, stopTranslationRun, translationEngine],
  );
  const handleSelectTranslationMode = useCallback(
    (mode: AppSettings["readerTranslationMode"]) => {
      if (mode !== translationMode) stopTranslationRun();
      setTranslationMode(mode);
    },
    [setTranslationMode, stopTranslationRun, translationMode],
  );
  const handleSelectGeminiModel = useCallback(
    (model: GeminiModelId) => {
      if (model !== geminiModelId) stopTranslationRun();
      setGeminiModelId(model);
    },
    [geminiModelId, setGeminiModelId, stopTranslationRun],
  );

  const handleChangeShowPageStatus = useCallback(
    (value: boolean) => setShowPageStatus(value),
    [setShowPageStatus],
  );
  const handleChangeHideTranslated = useCallback(
    (value: boolean) => setHideTranslated(value),
    [setHideTranslated],
  );
  const handleChangeAutoModelSwitch = useCallback(
    (value: boolean) => setAutoModelSwitch(value),
    [setAutoModelSwitch],
  );
  const handleChangeLookahead = useCallback(
    (value: number) => setOcrLookahead(value),
    [setOcrLookahead],
  );
  const handleSelectOverlayFont = useCallback(
    (font: ReaderOverlayFont) => setOverlayFont(font),
    [setOverlayFont],
  );
  const handleSelectOverlayFontWeight = useCallback(
    (weight: number) => setOverlayFontWeight(weight),
    [setOverlayFontWeight],
  );
  const handleSelectOverlayTextColor = useCallback(
    (color: string) => setOverlayTextColor(color),
    [setOverlayTextColor],
  );
  const handleSelectOverlayFontScale = useCallback(
    (scale: number) => setOverlayFontScale(scale),
    [setOverlayFontScale],
  );
  const handleSelectDefaultZoomScale = useCallback(
    (scale: number) => setDefaultZoomScale(scale),
    [setDefaultZoomScale],
  );

  return {
    handleSelectScrollSpeed,
    handleSelectReaderLanguage,
    handleSelectTargetLanguage,
    handleSelectTranslationEngine,
    handleSelectTranslationMode,
    handleChangeShowPageStatus,
    handleChangeHideTranslated,
    handleSelectGeminiModel,
    handleChangeAutoModelSwitch,
    handleChangeLookahead,
    handleSelectOverlayFont,
    handleSelectOverlayFontWeight,
    handleSelectOverlayTextColor,
    handleSelectOverlayFontScale,
    handleSelectDefaultZoomScale,
    handleClearTranslationCache: clearTranslationCache,
  };
}