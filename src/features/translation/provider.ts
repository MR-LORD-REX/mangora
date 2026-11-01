/**
 * Resolves persisted translation settings into the single OpenAI-compatible
 * transport configuration. Gemini is just the default endpoint.
 */

import type { AppSettings } from "@core/settings";
import type {
  TranslationEngine,
  TranslationProviderConfig,
} from "@shared/contracts";
import {
  allowsKeylessTranslation,
  isGeminiBaseUrl,
  normalizeTranslationBaseUrl,
} from "@shared/contracts";

function uniqueModels(models: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of models) {
    const model = value.trim();
    if (!model || seen.has(model)) continue;
    seen.add(model);
    result.push(model);
  }
  return result;
}

export function resolveTranslationProvider(
  settings: AppSettings,
  engine: TranslationEngine = settings.readerTranslationEngine,
): TranslationProviderConfig {
  const baseUrl = normalizeTranslationBaseUrl(settings.translationBaseUrl);
  const models = uniqueModels(settings.translationModels);
  const model = models.includes(settings.translationModelId)
    ? settings.translationModelId
    : (models[0] ?? "");
  return {
    engine,
    provider: "openai-compatible",
    baseUrl,
    apiKey: settings.translationApiKey.trim(),
    model,
    models,
    fallbackModels: settings.readerAutoModelSwitch ? models : [model].filter(Boolean),
    endpointKey: baseUrl,
  };
}

/** Human label used by reader/settings status copy. */
export function translationProviderLabel(
  config: TranslationProviderConfig,
): string {
  return isGeminiBaseUrl(config.baseUrl) ? "Gemini" : "OpenAI-compatible";
}

/**
 * Returns the user-facing reason a provider cannot run, or null when ready.
 * This is the single policy used by the reader, pretranslate and endpoint
 * setup so keyless LAN access cannot be mistaken for a missing hosted key.
 */
export function translationProviderReadinessError(
  config: TranslationProviderConfig,
): string | null {
  if (!config.baseUrl) {
    return "Set the translation API base URL in Settings > Translation.";
  }
  if (!config.model.trim()) {
    return "OpenAI-compatible translation needs a model - set it in Settings > Translation.";
  }
  if (!config.apiKey && !allowsKeylessTranslation(config.baseUrl)) {
    return "This translation endpoint needs an API key - set it in Settings > Translation.";
  }
  return null;
}
