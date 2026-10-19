/**
 * readerLanguages.ts
 * ---------------------------------------------------------------------------
 * Reader language helpers shared by extension sources.
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
  { code: "zh", label: "Chinese (Simplified)", detail: "Baberu OCR" },
  { code: "zh-TW", label: "Chinese (Traditional)", detail: "Baberu OCR" },
  { code: "nl", label: "Dutch", detail: "PP-OCRv5 Latin" },
  { code: "en", label: "English", detail: "Baberu OCR" },
  { code: "tl", label: "Filipino", detail: "PP-OCRv5 Latin" },
  { code: "fr", label: "French", detail: "PP-OCRv5 Latin" },
  { code: "de", label: "German", detail: "PP-OCRv5 Latin" },
  { code: "id", label: "Indonesian", detail: "PP-OCRv5 Latin" },
  { code: "it", label: "Italian", detail: "PP-OCRv5 Latin" },
  { code: "ja", label: "Japanese", detail: "Baberu OCR" },
  { code: "ko", label: "Korean", detail: "PP-OCRv5 Korean" },
  { code: "ms", label: "Malay", detail: "PP-OCRv5 Latin" },
  { code: "pl", label: "Polish", detail: "PP-OCRv5 Latin" },
  { code: "pt", label: "Portuguese", detail: "PP-OCRv5 Latin" },
  { code: "es", label: "Spanish", detail: "PP-OCRv5 Latin" },
  { code: "tr", label: "Turkish", detail: "PP-OCRv5 Latin" },
  { code: "vi", label: "Vietnamese", detail: "PP-OCRv5 Latin" },
];

const LANGUAGE_CODES = new Set([
  "en", "ja", "ko", "zh", "zh-tw", "es", "fr", "de", "pt", "it",
  "id", "ms", "pl", "tr", "vi", "tl", "nl",
]);

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
 * Auto language for a chapter. Extension chapters may not expose a language,
 * so a provided ISO code is used when present and English is the fallback.
 */
export function autoLanguageForReader(
  _source: string,
  raw?: string | string[] | null,
): string {
  const value = String(raw ?? "").trim().toLowerCase();
  if (!value) return "en";
  if (LANGUAGE_CODES.has(value)) return canonicalChineseForReader(value);
  return "en";
}

/** Human label for a source or target language code. */
export function languageLabel(code: string): string {
  const known = [...READER_LANGUAGE_OPTIONS, ...READER_TARGET_OPTIONS].find(
    (option) => option.code === code,
  );
  return known?.label ?? code.toUpperCase();
}
