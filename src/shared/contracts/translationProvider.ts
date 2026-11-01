import type { TranslationEngine } from "./translationEngine";

/** Gemini's OpenAI-compatible endpoint; the out-of-box configuration. */
export const DEFAULT_TRANSLATION_BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai";

export const DEFAULT_TRANSLATION_MODELS = [
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
];

/** Resolved AI transport metadata for one translation request. */
export interface TranslationProviderConfig {
  engine: TranslationEngine;
  provider: "openai-compatible";
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Every model name configured for this endpoint. */
  models: string[];
  /** Models eligible for automatic rate-limit fallback. */
  fallbackModels: string[];
  /** Stable non-secret identity used by cache and usage rows. */
  endpointKey: string;
}

/** True for Gemini's hosted API, including its OpenAI-compatible root. */
export function isGeminiBaseUrl(baseUrl: string): boolean {
  const normalized = normalizeBaseUrl(baseUrl);
  if (!normalized) return false;
  try {
    const parsed = new URL(
      /^[a-z][a-z0-9+.-]*:\/\//i.test(normalized)
        ? normalized
        : "https://" + normalized,
    );
    return parsed.hostname.toLowerCase() === "generativelanguage.googleapis.com";
  } catch {
    return false;
  }
}

/** Removes trailing slashes so endpoint keys and URL joins are stable. */
export function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

/**
 * Migrates the old native Gemini API root to the OpenAI-compatible path.
 * User-entered custom URLs are otherwise left untouched.
 */
export function normalizeTranslationBaseUrl(value: string): string {
  const normalized = normalizeBaseUrl(value);
  if (
    !/^https?:\/\/generativelanguage\.googleapis\.com\/v1beta$/i.test(
      normalized,
    )
  ) {
    return normalized;
  }
  return normalized + "/openai";
}

/** True for loopback or private-LAN IPv4/IPv6 endpoints. */
export function isLocalTranslationEndpoint(baseUrl: string): boolean {
  let host = "";
  try {
    const raw = normalizeBaseUrl(baseUrl);
    host = new URL(
      /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : "http://" + raw,
    ).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (
    host === "localhost" ||
    host === "::1" ||
    host === "[::1]" ||
    host === "0.0.0.0" ||
    host.endsWith(".local")
  ) {
    return true;
  }
  const octets = host.split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part))) {
    return false;
  }
  return (
    octets[0] === 10 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168) ||
    octets[0] === 127
  );
}

/** True when a keyless request is allowed for a self-hosted endpoint. */
export function allowsKeylessTranslation(baseUrl: string): boolean {
  return isLocalTranslationEndpoint(baseUrl);
}
