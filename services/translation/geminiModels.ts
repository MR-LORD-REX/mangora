/**
 * geminiModels.ts
 * ---------------------------------------------------------------------------
 * Gemini model catalogue used by the AI translation engine.
 *
 * The free-tier caps mirror what Google AI Studio shows for a project
 * ("used / limit" columns). Google changes quotas over time, so the limits
 * live here as editable constants instead of being scattered through the
 * pipeline.
 * ---------------------------------------------------------------------------
 */

export type GeminiModelId = "gemini-3.5-flash-lite" | "gemini-3.1-flash-lite";

export interface GeminiModelInfo {
  id: GeminiModelId;
  label: string;
  /** Requests per minute. */
  rpm: number;
  /** Input tokens per minute. */
  tpm: number;
  /** Requests per day (resets at midnight Pacific). */
  rpd: number;
}

export const GEMINI_MODELS: GeminiModelInfo[] = [
  {
    id: "gemini-3.5-flash-lite",
    label: "Gemini 3.5 Flash Lite",
    rpm: 15,
    tpm: 250_000,
    rpd: 500,
  },
  {
    id: "gemini-3.1-flash-lite",
    label: "Gemini 3.1 Flash Lite",
    rpm: 15,
    tpm: 250_000,
    rpd: 500,
  },
];

export const GEMINI_DEFAULT_MODEL: GeminiModelId = "gemini-3.5-flash-lite";

export function geminiModelInfo(id: string): GeminiModelInfo {
  return GEMINI_MODELS.find((model) => model.id === id) ?? GEMINI_MODELS[0];
}

export function isGeminiModelId(id: unknown): id is GeminiModelId {
  return GEMINI_MODELS.some((model) => model.id === id);
}
