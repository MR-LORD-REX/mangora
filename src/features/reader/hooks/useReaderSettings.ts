/**
 * Reader settings controller.
 *
 * Owns the persisted reader/translation/overlay preferences that the reader
 * screen and its panels edit. Writes still go through the settings store so
 * its existing subscription remains the single source of truth.
 */
import { useCallback, useEffect, useRef, useState } from "react";

import type { AppSettings } from "@core/settings";
import { updateSettings } from "@core/settings";
import {
  GEMINI_DEFAULT_MODEL,
  type GeminiModelId,
} from "@features/translation";
import {
  clampOcrBubbleWorkers,
  modelIdForLanguage,
} from "@features/vision";

import type { ReaderOverlayFont } from "../components/panels/readerChrome";
import { canonicalChineseForReader } from "../components/panels/readerLanguages";
import type { ReaderSettingsState } from "./useReaderSettings.types";

export function useReaderSettings(): ReaderSettingsState {
  const [readerLanguage, setReaderLanguageState] = useState("");
  const [targetLanguage, setTargetLanguageState] = useState("en");
  const [translationEngine, setTranslationEngineState] =
    useState<AppSettings["readerTranslationEngine"]>("free");
  const [translationMode, setTranslationModeState] =
    useState<AppSettings["readerTranslationMode"]>("off");
  const [showPageStatus, setShowPageStatusState] = useState(true);
  const [hideTranslated, setHideTranslatedState] = useState(false);
  const [overlayFont, setOverlayFontState] =
    useState<ReaderOverlayFont>("default");
  const [overlayFontWeight, setOverlayFontWeightState] = useState(600);
  const [overlayFontScale, setOverlayFontScaleState] = useState(1);
  const [overlayTextColor, setOverlayTextColorState] = useState("#000000");
  const [geminiApiKey, setGeminiApiKeyState] = useState("");
  const [geminiModelId, setGeminiModelIdState] =
    useState<GeminiModelId>(GEMINI_DEFAULT_MODEL);
  const [autoModelSwitch, setAutoModelSwitchState] = useState(false);
  const [ocrBubbleWorkers, setOcrBubbleWorkersState] = useState(8);
  const [ocrLookahead, setOcrLookaheadState] = useState(2);
  const [aiMaxContextPages, setAiMaxContextPagesState] = useState(10);
  const [defaultZoomScale, setDefaultZoomScaleState] = useState(1);
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPatchRef = useRef<Partial<AppSettings>>({});

  const flushSettingsPatch = useCallback(() => {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }
    const pending = pendingPatchRef.current;
    pendingPatchRef.current = {};
    if (Object.keys(pending).length > 0) {
      void updateSettings(pending).catch(console.error);
    }
  }, []);

  const queueSettingsPatch = useCallback(
    (patch: Partial<AppSettings>, delay = 160) => {
      pendingPatchRef.current = {
        ...pendingPatchRef.current,
        ...patch,
      };
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
      }
      persistTimerRef.current = setTimeout(() => {
        persistTimerRef.current = null;
        const pending = pendingPatchRef.current;
        pendingPatchRef.current = {};
        if (Object.keys(pending).length > 0) {
          void updateSettings(pending).catch(console.error);
        }
      }, delay);
    },
    [],
  );

  const setReaderLanguage = useCallback((code: string) => {
    setReaderLanguageState(code);
    void updateSettings({ readerLanguage: code }).catch(console.error);
  }, []);
  const setTargetLanguage = useCallback((code: string) => {
    setTargetLanguageState(code);
    void updateSettings({ readerTargetLanguage: code }).catch(console.error);
    console.log("[reader][settings] target language", code);
  }, []);
  const setTranslationEngine = useCallback(
    (engine: AppSettings["readerTranslationEngine"]) => {
      setTranslationEngineState(engine);
      void updateSettings({ readerTranslationEngine: engine }).catch(
        console.error,
      );
      console.log("[reader][settings] translation engine", engine);
    },
    [],
  );
  const setTranslationMode = useCallback(
    (mode: AppSettings["readerTranslationMode"]) => {
      setTranslationModeState(mode);
      void updateSettings({ readerTranslationMode: mode }).catch(console.error);
      console.log("[reader][settings] translation mode", mode);
    },
    [],
  );
  const setShowPageStatus = useCallback((value: boolean) => {
    setShowPageStatusState(value);
    void updateSettings({ readerShowPageStatus: value }).catch(console.error);
    console.log("[reader][settings] show page status", value);
  }, []);
  const setHideTranslated = useCallback((value: boolean) => {
    setHideTranslatedState(value);
    void updateSettings({ readerHideTranslated: value }).catch(console.error);
    console.log("[reader][settings] hide translated", value);
  }, []);
  const setGeminiModelId = useCallback((model: GeminiModelId) => {
    setGeminiModelIdState(model);
    void updateSettings({ geminiModelId: model }).catch(console.error);
    console.log("[reader][settings] Gemini model", model);
  }, []);
  const setAutoModelSwitch = useCallback((value: boolean) => {
    setAutoModelSwitchState(value);
    void updateSettings({ readerAutoModelSwitch: value }).catch(console.error);
    console.log("[reader][settings] auto model switch", value);
  }, []);
  const setOcrLookahead = useCallback((value: number) => {
    const next = Math.min(5, Math.max(1, Math.round(value)));
    setOcrLookaheadState(next);
    void updateSettings({ ocrLookahead: next }).catch(console.error);
    console.log("[reader][settings] look ahead", next);
  }, []);
  const setOverlayFont = useCallback((font: ReaderOverlayFont) => {
    setOverlayFontState(font);
    void updateSettings({ readerOverlayFont: font }).catch(console.error);
  }, []);
  const setOverlayFontWeight = useCallback(
    (weight: number) => {
      const normalized = Math.min(
        900,
        Math.max(400, Math.round(weight / 100) * 100),
      );
      setOverlayFontWeightState(normalized);
      queueSettingsPatch({ readerOverlayFontWeight: normalized });
    },
    [queueSettingsPatch],
  );
  const setOverlayTextColor = useCallback(
    (color: string) => {
      setOverlayTextColorState(color);
      queueSettingsPatch({ readerOverlayTextColor: color });
    },
    [queueSettingsPatch],
  );
  const setOverlayFontScale = useCallback(
    (scale: number) => {
      const normalized = Math.round(Math.min(1.5, Math.max(0.5, scale)) * 100) / 100;
      setOverlayFontScaleState(normalized);
      queueSettingsPatch({ readerOverlayFontScale: normalized });
    },
    [queueSettingsPatch],
  );
  const setDefaultZoomScale = useCallback((scale: number) => {
    const normalized = Math.min(2, Math.max(0.1, scale));
    setDefaultZoomScaleState(normalized);
    void updateSettings({ readerDefaultZoomScale: normalized }).catch(
      console.error,
    );
  }, []);

  const applySettings = useCallback(
    (settings: AppSettings, autoLanguage: string) => {
      setReaderLanguageState(
        settings.readerLanguage
          ? canonicalChineseForReader(settings.readerLanguage)
          : "",
      );
      setTargetLanguageState(settings.readerTargetLanguage || "en");
      setTranslationEngineState(settings.readerTranslationEngine);
      setTranslationModeState(settings.readerTranslationMode);
      setShowPageStatusState(settings.readerShowPageStatus);
      setHideTranslatedState(settings.readerHideTranslated);
      setGeminiApiKeyState(settings.geminiApiKey || "");
      setGeminiModelIdState(settings.geminiModelId || GEMINI_DEFAULT_MODEL);
      setAutoModelSwitchState(settings.readerAutoModelSwitch);
      const effectiveLanguage = settings.readerLanguage || autoLanguage;
      setOcrBubbleWorkersState(
        clampOcrBubbleWorkers(
          modelIdForLanguage(effectiveLanguage),
          settings.ocrBubbleWorkers,
        ),
      );
      setOcrLookaheadState(settings.ocrLookahead);
      setAiMaxContextPagesState(settings.aiMaxContextPages);
      setOverlayFontState(settings.readerOverlayFont);
      setOverlayFontWeightState(settings.readerOverlayFontWeight);
      setOverlayFontScaleState(settings.readerOverlayFontScale);
      setOverlayTextColorState(settings.readerOverlayTextColor);
      setDefaultZoomScaleState(settings.readerDefaultZoomScale);
    },
    [],
  );

  useEffect(() => flushSettingsPatch, [flushSettingsPatch]);

  return {
    readerLanguage,
    targetLanguage,
    translationEngine,
    translationMode,
    showPageStatus,
    hideTranslated,
    overlayFont,
    overlayFontWeight,
    overlayFontScale,
    overlayTextColor,
    geminiApiKey,
    geminiModelId,
    autoModelSwitch,
    ocrBubbleWorkers,
    ocrLookahead,
    aiMaxContextPages,
    defaultZoomScale,
    applySettings,
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
    queueSettingsPatch,
    flushSettingsPatch,
  };
}
