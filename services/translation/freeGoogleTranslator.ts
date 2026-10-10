/**
 * freeGoogleTranslator.ts
 * ---------------------------------------------------------------------------
 * Local (no API key) translation engine.
 *
 * react-native-translator scrapes the Google Translate DOM through a hidden
 * WebView with a hard-coded selector; Google changed the page layout so the
 * scraper now returns header chrome ("Website / Clear URL / Enter a URL")
 * instead of the translation. This engine calls Google's free translation
 * JSON endpoints directly instead - no WebView, no provider, no API key -
 * while keeping the identical TranslateTextFn seam so a TR_API cloud
 * translator can replace it later.
 *
 * Primary endpoint: translate.googleapis.com/translate_a/single?client=gtx
 * Fallback:          clients5.google.com/translate_a/t?client=dict-chrome-ex
 * ---------------------------------------------------------------------------
 */

import type { TranslateTextFn } from "./translation.types";
import { toEngineLanguageCode } from "./translationLang";

const GTX_URL = "https://translate.googleapis.com/translate_a/single";
const CHROME_EX_URL = "https://clients5.google.com/translate_a/t";
const DEFAULT_TIMEOUT_MS = 15000;
const REQUEST_HEADERS = {
  Accept: "application/json",
  "User-Agent":
    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36",
};

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Translate request timed out"));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Extracts the translated string from either endpoint response shape:
 *  - gtx:        [[["Hello","こんにちは",...],...], null, "ja", ...]
 *  - chrome-ex:  ["Hello, how are you?"]
 */
function extractTranslation(payload: unknown): string | null {
  if (!Array.isArray(payload) || payload.length === 0) return null;

  if (typeof payload[0] === "string") {
    const text = payload[0].trim();
    return text || null;
  }

  const rows = payload[0];
  if (!Array.isArray(rows)) return null;
  const parts = rows
    .map((row) => (Array.isArray(row) && typeof row[0] === "string" ? row[0] : ""))
    .join("");
  return parts.trim() || null;
}

async function requestTranslation(
  url: string,
  timeoutMs: number,
): Promise<string | null> {
  const response = await withTimeout(
    fetch(url, { headers: REQUEST_HEADERS }),
    timeoutMs,
  );
  if (!response.ok) {
    console.warn(`Google translate endpoint failed (HTTP ${response.status})`);
    return null;
  }
  const payload = (await response.json()) as unknown;
  return extractTranslation(payload);
}

async function translateWithFreeGoogle(
  from: string,
  to: string,
  text: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<string> {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return "";

  const source = toEngineLanguageCode(from);
  const target = toEngineLanguageCode(to);
  const query = encodeURIComponent(trimmed);

  const primary = `${GTX_URL}?client=gtx&sl=${encodeURIComponent(source)}&tl=${encodeURIComponent(target)}&dt=t&q=${query}`;
  const primaryResult = await requestTranslation(primary, timeoutMs);
  if (primaryResult != null) return primaryResult;

  const fallback = `${CHROME_EX_URL}?client=dict-chrome-ex&sl=${encodeURIComponent(source)}&tl=${encodeURIComponent(target)}&q=${query}`;
  const fallbackResult = await requestTranslation(fallback, timeoutMs);
  if (fallbackResult != null) return fallbackResult;

  throw new Error("Google translate is unavailable right now - check your connection and try again.");
}

/** Engine-agnostic translate implementation used by the reader for now. */
export const localTranslate: TranslateTextFn = async (from, to, text, options) =>
  translateWithFreeGoogle(from, to, text, options?.timeout);
