/**
 * Persisted Gemini model identifiers. This module has no UI or engine imports
 * so the settings store can validate stored values without depending on the
 * translation feature.
 */

export const GEMINI_MODEL_IDS = [
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
] as const;

export type GeminiModelId = (typeof GEMINI_MODEL_IDS)[number];

export const GEMINI_DEFAULT_MODEL: GeminiModelId = "gemini-3.5-flash-lite";

export function isGeminiModelId(id: unknown): id is GeminiModelId {
  return (
    typeof id === "string" &&
    (GEMINI_MODEL_IDS as readonly string[]).includes(id)
  );
}
