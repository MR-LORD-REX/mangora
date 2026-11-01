import type { RegionDetectorId } from "@shared/contracts/regionDetector";
import type { TranslationProviderConfig } from "@shared/contracts/translationProvider";

/** Bump when geometry, prompt or validation semantics change. */
export const TRANSLATION_CACHE_PROMPT_VERSION = "v4";

export interface TranslationCacheIdentity {
  engine: "free" | "openai";
  provider: TranslationProviderConfig["provider"] | "free";
  endpointKey: string;
  model: string;
  detectorId: RegionDetectorId;
  promptVersion?: string;
}

/** Narrow identity passed by cache callers that already resolved the provider. */
export function cacheIdentityForPage(input: {
  settings: {
    readerTranslationEngine: "free" | "openai";
    regionDetectorId: RegionDetectorId;
  };
  provider: TranslationProviderConfig | null;
  model?: string | null;
}): TranslationCacheIdentity {
  return pageCacheIdentity({
    engine: input.settings.readerTranslationEngine,
    provider: input.provider,
    model: input.model ?? input.provider?.model ?? null,
    detectorId: input.settings.regionDetectorId,
  });
}

/**
 * Full persisted cache key. The database has one materialized identity field
 * (prompt_version), so provider/endpoint/model/detector are encoded there.
 * This keeps old rows readable while making cross-provider reuse impossible.
 */
export function translationCacheKey(identity: TranslationCacheIdentity): string {
  const base = identity.promptVersion ?? TRANSLATION_CACHE_PROMPT_VERSION;
  const endpoint = identity.endpointKey
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "_")
    .slice(0, 120);
  const model = identity.model
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "_")
    .slice(0, 100);
  return [
    base,
    identity.engine,
    identity.provider,
    endpoint || "default",
    model || "default",
    identity.detectorId,
  ].join("|");
}

/** Identity used by one translated reader page. */
export function pageCacheIdentity(input: {
  engine: "free" | "openai";
  provider: TranslationProviderConfig | null;
  model: string | null;
  detectorId: RegionDetectorId;
}): TranslationCacheIdentity {
  if (input.engine === "free" || !input.provider) {
    return {
      engine: "free",
      provider: "free",
      endpointKey: "google-translate",
      model: input.model || "free-google",
      detectorId: input.detectorId,
    };
  }
  return {
    engine: input.engine,
    provider: input.provider.provider,
    endpointKey: input.provider.endpointKey,
    model: input.model || input.provider.model,
    detectorId: input.detectorId,
  };
}
