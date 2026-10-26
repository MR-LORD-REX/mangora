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

import {
  GEMINI_DEFAULT_MODEL,
  GEMINI_MODEL_IDS,
  isGeminiModelId,
  type GeminiModelId,
} from "@core/settings/geminiModelId";

export { GEMINI_DEFAULT_MODEL, GEMINI_MODEL_IDS, isGeminiModelId };
export type { GeminiModelId };

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

export function geminiModelInfo(id: string): GeminiModelInfo {
  return GEMINI_MODELS.find((model) => model.id === id) ?? GEMINI_MODELS[0];
}

