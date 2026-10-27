/* Reader translation sheet public types and options. */

import type {
  ReaderTranslationEngine,
  ReaderTranslationMode,
} from "@core/settings";
import type { ReaderPipelineMetrics } from "../../../translation/types";
import type { GeminiModelId } from "@features/translation";
import type { ReaderOverlayFont } from "../readerChrome";

export type ReaderTranslationTab =
  | "language"
  | "trMode"
  | "advance"
  | "metrics"
  | "overlay";

export const READER_TRANSLATION_TABS: {
  key: ReaderTranslationTab;
  label: string;
}[] = [
  { key: "language", label: "Language" },
  { key: "trMode", label: "Modes" },
  { key: "advance", label: "Advance" },
  { key: "metrics", label: "Metrics" },
  { key: "overlay", label: "Overlay" },
];

export const ENGINE_OPTIONS: {
  value: ReaderTranslationEngine;
  label: string;
  description: string;
}[] = [
  {
    value: "free",
    label: "Free translation",
    description:
      "No API key needed. Each page is scanned and OCRed once, then every speech bubble is translated by the free Google endpoint as it finishes and pasted over the original text.",
  },
  {
    value: "ai",
    label: "AI translation",
    description:
      "Context-aware Gemini translation. Revisiting an already translated page restores it from the saved cache. Requires a Gemini API key.",
  },
];

export const MODE_OPTIONS: {
  value: ReaderTranslationMode;
  label: string;
  description: string;
}[] = [
  {
    value: "off",
    label: "Off",
    description:
      "Translation is disabled - pages are shown in their original language.",
  },
  {
    value: "single",
    label: "Single page",
    description:
      "A floating TR button translates only the current page. One page is processed at a time.",
  },
  {
    value: "auto",
    label: "Auto",
    description:
      "The current page and look-ahead pages are translated automatically as you read. A page waits for its full OCR pass before translation starts.",
  },
];
export interface ReaderTranslationPanelProps {
  tab: ReaderTranslationTab;
  onTabChange: (tab: ReaderTranslationTab) => void;
  onClose: () => void;

  // Language tab.
  readerLanguage: string;
  ocrLanguage: string;
  autoLanguage: string;
  targetLanguage: string;
  onSelectReaderLanguage: (code: string) => void;
  onSelectTargetLanguage: (code: string) => void;

  // TR mode tab.
  translationEngine: ReaderTranslationEngine;
  onSelectTranslationEngine: (engine: ReaderTranslationEngine) => void;
  translationMode: ReaderTranslationMode;
  onSelectTranslationMode: (mode: ReaderTranslationMode) => void;

  // Advance tab.
  geminiModelId: GeminiModelId;
  onSelectGeminiModel: (model: GeminiModelId) => void;
  autoModelSwitch: boolean;
  onChangeAutoModelSwitch: (value: boolean) => void;
  ocrLookahead: number;
  onChangeLookahead: (value: number) => void;
  onClearTrCache: () => Promise<number>;

  // Metrics tab.
  metrics: ReaderPipelineMetrics;

  // Overlay tab.
  overlayFont: ReaderOverlayFont;
  onChangeOverlayFont: (font: ReaderOverlayFont) => void;
  overlayFontWeight: number;
  onChangeOverlayFontWeight: (weight: number) => void;
  overlayFontScale: number;
  onChangeOverlayFontScale: (scale: number) => void;
  overlayTextColor: string;
  onChangeOverlayTextColor: (color: string) => void;
  showPageStatus: boolean;
  onChangeShowPageStatus: (value: boolean) => void;
  hideTranslated: boolean;
  onChangeHideTranslated: (value: boolean) => void;
}
