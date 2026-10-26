/**
 * engines/gemini/geminiFallback.ts
 * ---------------------------------------------------------------------------
 * Shared Gemini model fallback used by the reader and the pre-translate queue.
 *
 * A page is always attempted on the selected model. When that request is rate
 * limited and auto-switch is on, the other catalogue model is tried once. Two
 * consecutive switch attempts that cannot rescue the request disable auto
 * switching until the user enables it again.
 * ---------------------------------------------------------------------------
 */

import { GeminiApiError } from "./geminiClient";
import {
  GEMINI_MODELS,
  type GeminiModelId,
} from "./geminiModels";

export const AUTO_MODEL_SWITCH_FAILURE_LIMIT = 2;

export function isGeminiRateLimitError(error: unknown): boolean {
  return (
    error instanceof GeminiApiError &&
    (error.status === 429 ||
      error.code === "RESOURCE_EXHAUSTED" ||
      error.code === "RATE_LIMIT_EXCEEDED" ||
      error.code === "429")
  );
}

/** Primary model, plus its fallback when auto-switch is enabled. */
export function fallbackModelChain(
  primary: GeminiModelId,
  autoSwitch: boolean,
): GeminiModelId[] {
  const secondary = GEMINI_MODELS.find((model) => model.id !== primary)?.id;
  return autoSwitch && secondary ? [primary, secondary] : [primary];
}

export interface ModelFallbackOutcome<T> {
  value: T | null;
  usedModel: GeminiModelId;
  lastError: unknown;
  /** True when at least one fallback model was attempted. */
  switched: boolean;
  /** True when the request succeeded on a fallback model. */
  switchSucceeded: boolean;
}

/**
 * Runs one request with an optional fallback. Only rate-limit errors trigger a
 * switch; any other failure stops immediately.
 */
export async function requestWithModelFallback<T>(input: {
  models: GeminiModelId[];
  request: (model: GeminiModelId) => Promise<T>;
  onSwitch?: (from: GeminiModelId, to: GeminiModelId) => void;
}): Promise<ModelFallbackOutcome<T>> {
  const models = input.models.length > 0 ? input.models : [];
  let usedModel: GeminiModelId = models[0] ?? GEMINI_MODELS[0].id;
  let lastError: unknown = null;
  let switched = false;
  for (let index = 0; index < models.length; index += 1) {
    const model = models[index];
    usedModel = model;
    try {
      const value = await input.request(model);
      return {
        value,
        usedModel,
        lastError: null,
        switched,
        switchSucceeded: switched,
      };
    } catch (error) {
      lastError = error;
      const canSwitch =
        isGeminiRateLimitError(error) && index < models.length - 1;
      if (!canSwitch) break;
      input.onSwitch?.(model, models[index + 1]);
      switched = true;
    }
  }
  return {
    value: null,
    usedModel,
    lastError,
    switched,
    switchSucceeded: false,
  };
}

export interface AutoSwitchFailureState {
  failures: number;
  disable: boolean;
}

/**
 * Updates the consecutive switch-failure counter. Any successful request
 * resets it; a page that never needed a switch leaves it unchanged.
 */
export function nextAutoSwitchFailureState(
  previous: number,
  outcome: Pick<
    ModelFallbackOutcome<unknown>,
    "value" | "switched" | "switchSucceeded"
  >,
): AutoSwitchFailureState {
  if (outcome.value !== null) return { failures: 0, disable: false };
  if (!outcome.switched) return { failures: previous, disable: false };
  const failures = previous + 1;
  return {
    failures,
    disable: failures >= AUTO_MODEL_SWITCH_FAILURE_LIMIT,
  };
}
