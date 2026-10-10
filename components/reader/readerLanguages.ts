/**
 * readerLanguages.ts
 * ---------------------------------------------------------------------------
 * Reader-specific language helpers: source language options, NH display-name
 * mapping and the "auto" guess used to pick the OCR backend.
 * ---------------------------------------------------------------------------
 */

import { READER_TARGET_OPTIONS } from "@/services/translation/translationLang";

/** Source-language choices shown in Reader Config -> Language. */
export const READER_LANGUAGE_OPTIONS: {
  code: string;
  label: string;
  detail: string;
}[] = [
  { code: "", label: "Auto (from chapter)", detail: "Best guess from the opened chapter" },
  { code: "zh", label: "Chinese (Simplified)", detail: "Cloud OCR" },
  { code: "zh-TW", label: "Chinese (Traditional)", detail: "Cloud OCR" },
  { code: "nl", label: "Dutch", detail: "Local Latin model" },
  { code: "en", label: "English", detail: "Latin script" },
  { code: "tl", label: "Filipino", detail: "Local Latin model" },
  { code: "fr", label: "French", detail: "Local Latin model" },
  { code: "de", label: "German", detail: "Local Latin model" },
  { code: "id", label: "Indonesian", detail: "Local Latin model" },
  { code: "it", label: "Italian", detail: "Local Latin model" },
  { code: "ja", label: "Japanese", detail: "Cloud OCR" },
  { code: "ko", label: "Korean", detail: "Tesseract Korean / local Korean" },
  { code: "ms", label: "Malay", detail: "Local Latin model" },
  { code: "pl", label: "Polish", detail: "Local Latin model" },
  { code: "pt", label: "Portuguese", detail: "Local Latin model" },
  { code: "ru", label: "Russian", detail: "Cyrillic / local Russian" },
  { code: "es", label: "Spanish", detail: "Local Latin model" },
  { code: "tr", label: "Turkish", detail: "Local Latin model" },
  { code: "vi", label: "Vietnamese", detail: "Local Latin model" },
];

/** NHentai exposes language tags by display name, not by ISO code. */
const NH_LANGUAGE_CODE: Record<string, string> = {
  english: "en",
  japanese: "ja",
  korean: "ko",
  chinese: "zh-TW",
  "chinese (simplified)": "zh",
  "chinese simplified": "zh",
  "chinese-simplified": "zh",
  "chinese (traditional)": "zh-TW",
  "chinese traditional": "zh-TW",
  "chinese-traditional": "zh-TW",
  spanish: "es",
  french: "fr",
  german: "de",
  russian: "ru",
  portuguese: "pt",
  italian: "it",
};

/** Maps Chinese variants to the codes TR_API declares for paddle-ocr. */
export function canonicalChineseForReader(code: string): string {
  const normalized = code.trim().toLowerCase();
  const base = normalized.split("-")[0];
  if (base !== "zh") return code;
  if (
    normalized === "zh-hk" ||
    normalized === "zh-tw" ||
    normalized === "zh-mo" ||
    normalized === "zh-hant" ||
    normalized.includes("hant") ||
    normalized.includes("traditional")
  ) {
    return "zh-TW";
  }
  return "zh";
}

/**
 * Auto language for a chapter, passed through to the OCR backend as-is.
 * No abstraction: MangaDex codes pass through unchanged, NH display names are
 * mapped to their ISO code, and aggregators without a language tag default to
 * English (their pages are pre-translated).
 */
export function autoLanguageForReader(
  source: string,
  raw?: string | string[] | null
): string {
  const value = String(raw ?? "").trim().toLowerCase();
  if (!value) return "en";
  if (source === "mangadex") return canonicalChineseForReader(value);
  if (source === "nh") return NH_LANGUAGE_CODE[value] ?? "en";
  return "en";
}

/** Human label for a source or target language code. */
export function languageLabel(code: string): string {
  const known = [...READER_LANGUAGE_OPTIONS, ...READER_TARGET_OPTIONS].find(
    (option) => option.code === code
  );
  return known?.label ?? code.toUpperCase();
}
