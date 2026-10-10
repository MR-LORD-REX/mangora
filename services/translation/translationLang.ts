/**
 * translationLang.ts
 * ---------------------------------------------------------------------------
 * Language code helpers for the translation pipeline.
 *
 * The reader works with "reader codes" (en / ja / ko / zh / zh-TW / ru / ...).
 * The current local engine talks to the free Google Translate endpoint and
 * expects Google codes (zh -> zh-CN for simplified Chinese, zh-TW for
 * traditional, ...). A later cloud translator can accept the same reader
 * codes, so callers only ever deal with these.
 * ---------------------------------------------------------------------------
 */

/** Target-language choices shown in Reader Config -> Language. */
export const READER_TARGET_OPTIONS: {
  code: string;
  label: string;
  detail: string;
}[] = [
  { code: "ar", label: "Arabic", detail: "" },
  { code: "zh", label: "Chinese (Simplified)", detail: "zh-CN" },
  { code: "zh-TW", label: "Chinese (Traditional)", detail: "zh-TW" },
  { code: "en", label: "English", detail: "Default target" },
  { code: "fr", label: "French", detail: "" },
  { code: "de", label: "German", detail: "" },
  { code: "hi", label: "Hindi", detail: "" },
  { code: "id", label: "Indonesian", detail: "" },
  { code: "it", label: "Italian", detail: "" },
  { code: "ja", label: "Japanese", detail: "Manga original language" },
  { code: "ko", label: "Korean", detail: "Manhwa / webtoon original language" },
  { code: "pt", label: "Portuguese", detail: "" },
  { code: "ru", label: "Russian", detail: "Cyrillic script" },
  { code: "es", label: "Spanish", detail: "" },
  { code: "th", label: "Thai", detail: "" },
  { code: "vi", label: "Vietnamese", detail: "" },
];

/** Reader / ISO-ish codes -> google engine codes used by the local engine. */
const ENGINE_CODE_MAP: Record<string, string> = {
  "": "auto",
  auto: "auto",
  en: "en",
  ja: "ja",
  jp: "ja",
  ko: "ko",
  kr: "ko",
  zh: "zh-CN",
  "zh-cn": "zh-CN",
  "zh-CN": "zh-CN",
  "zh-sim": "zh-CN",
  "zh-TW": "zh-TW",
  "zh-tw": "zh-TW",
  "zh-hant": "zh-TW",
  ru: "ru",
  fr: "fr",
  de: "de",
  es: "es",
  it: "it",
  pt: "pt",
  id: "id",
  th: "th",
  vi: "vi",
  hi: "hi",
  ar: "ar",
  tr: "tr",
  nl: "nl",
  pl: "pl",
  sv: "sv",
  da: "da",
  no: "no",
  fi: "fi",
  cs: "cs",
  el: "el",
  hu: "hu",
  ro: "ro",
  uk: "uk",
  bg: "bg",
  sr: "sr",
  sk: "sk",
  sl: "sl",
  hr: "hr",
  lt: "lt",
  lv: "lv",
  et: "et",
  ms: "ms",
  tl: "tl",
  fil: "tl",
  iw: "iw",
  he: "iw",
};

/**
 * Maps a reader/ISO language code onto the engine code. Unknown codes pass
 * through (the engine may still accept them); empty -> "auto".
 */
export function toEngineLanguageCode(code: string | null | undefined): string {
  const key = String(code ?? "").trim().toLowerCase();
  const mapped = ENGINE_CODE_MAP[key];
  return mapped ?? (key || "auto");
}

/** True when both sides resolve to the same concrete engine language. */
export function isSameEngineLanguage(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const engineA = toEngineLanguageCode(a);
  const engineB = toEngineLanguageCode(b);
  if (!engineA || !engineB || engineA === "auto" || engineB === "auto") {
    return false;
  }
  return engineA === engineB;
}

/** True for CJK scripts that must be joined without spaces after OCR. */
export function isCjkLanguageCode(code: string | null | undefined): boolean {
  const base = String(code ?? "").trim().toLowerCase().split("-")[0];
  return base === "ja" || base === "ko" || base === "zh";
}
