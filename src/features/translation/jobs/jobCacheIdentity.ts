import type { AppSettings } from "@core/settings";
import type { RegionDetectorId } from "@shared/contracts/regionDetector";
import type { TranslationEngine } from "@shared/contracts/translationEngine";

import { resolveTranslationProvider } from "../provider";
import { pageCacheIdentity, translationCacheKey } from "../pipeline/cacheIdentity";

export interface JobCacheConfig {
  engine: TranslationEngine;
  regionDetectorId: RegionDetectorId;
  translationModelId: string;
  translationBaseUrl?: string;
  translationModels?: string[];
  autoModelSwitch: boolean;
}

/** The current credential is used, but endpoint and model identity stay frozen. */
export function settingsForJob(job: JobCacheConfig, settings: AppSettings): AppSettings {
  return {
    ...settings,
    readerTranslationEngine: job.engine,
    translationBaseUrl: job.translationBaseUrl ?? settings.translationBaseUrl,
    translationModels: job.translationModels ?? settings.translationModels,
    translationModelId: job.translationModelId,
    readerAutoModelSwitch: job.autoModelSwitch,
  };
}

/** One key for lookup and save, independent of the model used by fallback. */
export function cacheVersionForJob(job: JobCacheConfig, settings: AppSettings): string {
  const provider = job.engine === "free"
    ? null
    : resolveTranslationProvider(settingsForJob(job, settings), job.engine);
  return translationCacheKey(pageCacheIdentity({
    engine: job.engine,
    provider,
    model: job.engine === "free" ? "free-google" : provider?.model ?? null,
    detectorId: job.regionDetectorId,
  }));
}
