/**
 * Provider-neutral AI batch runner shared by the reader and pretranslate queue.
 *
 * Both callers need the same model fallback, usage recording and error
 * classification. Keeping that policy here keeps every OpenAI-compatible
 * endpoint on one code path.
 */

import {
  nextAutoSwitchFailureState,
  requestWithModelFallback,
} from "../engines/shared/modelFallback";
import {
  OpenAiCompatibleError,
  translateOpenAiCompatibleBatch,
} from "../engines/openai/openaiClient";
import {
  resolveTranslationProvider,
  translationProviderReadinessError,
  translationProviderLabel,
} from "../provider";
import type { OpenAiBatchResponse } from "../engines/openai/openaiClient";
import type { TranslationPagePayload } from "../engines/shared/batchPrompt";
import type { AppSettings } from "@core/settings";
import { recordTranslationUsage } from "./translationUsage";

export interface AiBatchContext {
  settings: AppSettings;
  sourceCode: string;
  targetCode: string;
  history: TranslationPagePayload[];
  batch: TranslationPagePayload[];
  autoSwitch: boolean;
  /** Reader-owned failure counter; callers persist the returned value. */
  previousFailures: number;
  /** Optional override for settings.readerTranslationEngine. */
  engine?: AppSettings["readerTranslationEngine"];
  onSwitch?: (from: string, to: string) => void;
  onRateLimited?: () => void;
}

export interface AiBatchOutcome {
  response: OpenAiBatchResponse | null;
  usedModel: string;
  usedProvider: "openai-compatible";
  providerLabel: string;
  lastError: unknown;
  failures: number;
  disableAutoSwitch: boolean;
  switched: boolean;
}

function errorCode(error: unknown): string {
  if (error instanceof OpenAiCompatibleError) {
    return String(error.code ?? error.status ?? "error");
  }
  return "network";
}

/**
 * Executes one translation batch with provider-correct fallback and usage.
 * No provider-specific quota assumptions are applied to the request.
 */
export async function runAiTranslationBatch(
  context: AiBatchContext,
): Promise<AiBatchOutcome> {
  const provider = resolveTranslationProvider(
    context.settings,
    context.engine ?? context.settings.readerTranslationEngine,
  );
  const providerLabel = translationProviderLabel(provider);
  const readinessError = translationProviderReadinessError(provider);
  if (readinessError) throw new Error(readinessError);
  const models =
    context.autoSwitch && provider.fallbackModels.length > 0
      ? provider.fallbackModels
      : [provider.model];
  let hasRateLimited = false;
  const outcome = await requestWithModelFallback({
    models,
    request: async (model) => {
      return translateOpenAiCompatibleBatch({
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        model,
        sourceCode: context.sourceCode,
        targetCode: context.targetCode,
        history: context.history,
        batch: context.batch,
      });
    },
    onSwitch: (from, to) => {
      hasRateLimited = true;
      context.onRateLimited?.();
      context.onSwitch?.(from, to);
    },
  });
  const response = outcome.value;
  const failureState = nextAutoSwitchFailureState(
    context.previousFailures,
    outcome,
  );
  await recordTranslationUsage({
    provider: provider.provider,
    endpointKey: provider.endpointKey,
    model: outcome.usedModel,
    success: response !== null,
    inputTokens: response?.usage.inputTokens,
    outputTokens: response?.usage.outputTokens,
    errorCode: response ? undefined : errorCode(outcome.lastError),
  });
  return {
    response,
    usedModel: outcome.usedModel,
    usedProvider: provider.provider,
    providerLabel,
    lastError: outcome.lastError,
    failures: failureState.failures,
    disableAutoSwitch: failureState.disable,
    switched: outcome.switched || hasRateLimited,
  };
}

