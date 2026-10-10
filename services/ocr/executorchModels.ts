/**
 * executorchModels.ts
 * ---------------------------------------------------------------------------
 * Catalog of the on-device ExecuTorch OCR models the reader can download.
 *
 * Metadata only - it never imports `react-native-executorch`, so screens can
 * require this file safely (even in Expo Go where the native module is
 * missing). The actual model constants (OCR_ENGLISH / OCR_JAPANESE / ...) are
 * resolved lazily by `executorchOcr.ts`.
 *
 * Model files are cached by the ExpoResourceFetcher under
 * `<app-documents>/react-native-executorch/`, keyed by the URL file name.
 * The `recognizerFile` below is that cache file name and is used to show
 * "downloaded" state without loading the module.
 * ---------------------------------------------------------------------------
 */
/** Stable ids for the models we expose in the reader dropdown. */
export type LocalModelId =
  | "en"
  | "la"
  | "ja"
  | "ja-vertical"
  | "ko"
  | "zh-sim"
  | "ru";

export interface LocalOcrModelDef {
  id: LocalModelId;
  /** Short display name for the dropdown. */
  label: string;
  /** One-line detail shown under the label. */
  detail: string;
  /** Constant exported by `react-native-executorch` (resolved lazily). */
  constantKey:
    | "OCR_ENGLISH"
    | "OCR_LATIN"
    | "OCR_JAPANESE"
    | "OCR_KOREAN"
    | "OCR_SIMPLIFIED_CHINESE"
    | "OCR_RUSSIAN";
  /** Uses the vertical OCR pipeline (per-character output for tategaki). */
  vertical: boolean;
  /** Vertical modules can treat characters independently. */
  independentCharacters?: boolean;
  /** Recognizer .pte basename used by the resource fetcher cache. */
  recognizerFile: string;
}

/** Every downloadable local OCR model, in dropdown order. */
export const LOCAL_OCR_MODELS: LocalOcrModelDef[] = [
  {
    id: "en",
    label: "English",
    detail: "Latin script (English model)",
    constantKey: "OCR_ENGLISH",
    vertical: false,
    recognizerFile: "crnn_english_xnnpack_fp32.pte",
  },
  {
    id: "la",
    label: "Latin",
    detail: "Wider Latin script (French, German, Spanish, Indonesian, ...)",
    constantKey: "OCR_LATIN",
    vertical: false,
    recognizerFile: "crnn_latin_xnnpack_fp32.pte",
  },
  {
    id: "ko",
    label: "Korean",
    detail: "Hangul (manhwa / webtoon)",
    constantKey: "OCR_KOREAN",
    vertical: false,
    recognizerFile: "crnn_korean_xnnpack_fp32.pte",
  },
  {
    id: "ru",
    label: "Russian / Cyrillic",
    detail: "Cyrillic script (Russian, Ukrainian, ...)",
    constantKey: "OCR_RUSSIAN",
    vertical: false,
    recognizerFile: "crnn_cyrillic_xnnpack_fp32.pte",
  },
];

const MODEL_BY_ID = new Map<LocalModelId, LocalOcrModelDef>(
  LOCAL_OCR_MODELS.map((model) => [model.id, model])
);

export function getLocalModelDef(id: LocalModelId): LocalOcrModelDef | null {
  return MODEL_BY_ID.get(id) ?? null;
}

export const DEFAULT_LOCAL_MODEL: LocalModelId = "en";

/**
 * Best-effort suggestion used only when the user has not picked a model yet.
 * JP manga is normally vertical, hence the ja-vertical default for Japanese.
 */
export function suggestLocalModelIdForLanguage(
  code?: string | null
): LocalModelId {
  const base = String(code ?? "").trim().toLowerCase().split("-")[0];
  switch (base) {
    case "ja":
    case "jp":
      return "ja-vertical";
    case "ko":
      return "ko";
    case "fr":
    case "de":
    case "es":
    case "id":
    case "it":
    case "pt":
    case "nl":
    case "pl":
    case "tr":
    case "ms":
    case "tl":
    case "fil":
    case "vi":
      return "la";
    case "zh":
    case "cn":
    case "tw":
    case "hk":
      return "zh-sim";
    case "ru":
    case "uk":
    case "bg":
    case "be":
    case "sr":
    case "mk":
      return "ru";
    default:
      return "en";
  }
}