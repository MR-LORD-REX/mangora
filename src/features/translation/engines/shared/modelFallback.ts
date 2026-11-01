/**
 * Provider-neutral model fallback policy.
 *
 * A rate limit can retry with the next configured model. Two consecutive
 * switch attempts that cannot rescue a request disable auto-switching until
 * the user enables it again.
 */

import { isOpenAiRateLimitError } from "../openai/openaiClient";

export const AUTO_MODEL_SWITCH_FAILURE_LIMIT = 2;

export interface ModelFallbackOutcome<T> {
  value: T | null;
  usedModel: string;
  lastError: unknown;
  switched: boolean;
  switchSucceeded: boolean;
}

export async function requestWithModelFallback<T>(input: {
  models: string[];
  request: (model: string) => Promise<T>;
  onSwitch?: (from: string, to: string) => void;
}): Promise<ModelFallbackOutcome<T>> {
  const models = input.models.filter((model) => model.trim());
  let usedModel = models[0] ?? "";
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
        isOpenAiRateLimitError(error) && index < models.length - 1;
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
