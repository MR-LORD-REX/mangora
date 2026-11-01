/**
 * Usage tracking for every OpenAI-compatible endpoint.
 *
 * Rows are scoped by provider, endpoint and model so two servers that use the
 * same model name cannot share counters. Gemini's published free-tier limits
 * are shown only for the default Gemini endpoint.
 */

import type { TranslationProviderConfig } from "@shared/contracts/translationProvider";
import { isGeminiBaseUrl } from "@shared/contracts/translationProvider";
import {
  countTranslationUsageSince,
  insertTranslationUsage,
  sumTranslationInputTokensSince,
} from "@core/db/repositories/translationRepository";

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
const GEMINI_HOSTED_LIMITS: Record<
  string,
  { rpm: number; tpm: number; rpd: number }
> = {
  "gemini-3.5-flash-lite": { rpm: 15, tpm: 250_000, rpd: 500 },
  "gemini-3.1-flash-lite": { rpm: 15, tpm: 250_000, rpd: 500 },
};

type UsageListener = () => void;
const listeners = new Set<UsageListener>();

export function subscribeTranslationUsage(listener: UsageListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function nthSundayUtcMs(year: number, monthIndex: number, nth: number): number {
  const first = Date.UTC(year, monthIndex, 1);
  const firstDay = new Date(first).getUTCDay();
  const firstSunday = first + ((7 - firstDay) % 7) * DAY_MS;
  return firstSunday + (nth - 1) * 7 * DAY_MS;
}

function laOffsetUtcMs(utcMs: number): number {
  const date = new Date(utcMs);
  const year = date.getUTCFullYear();
  const dstStart = nthSundayUtcMs(year, 2, 2) + 10 * 3_600_000;
  const dstEnd = nthSundayUtcMs(year, 10, 1) + 9 * 3_600_000;
  return utcMs >= dstStart && utcMs < dstEnd ? 7 * 3_600_000 : 8 * 3_600_000;
}

export function pacificDayStartMs(ts: number): number {
  const magnitudeMs = laOffsetUtcMs(ts);
  const local = new Date(ts - magnitudeMs);
  let start =
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) +
    magnitudeMs;
  for (let pass = 0; pass < 2; pass += 1) {
    const offsetAtGuess = laOffsetUtcMs(start);
    const localAtGuess = new Date(start - offsetAtGuess);
    start =
      Date.UTC(
        localAtGuess.getUTCFullYear(),
        localAtGuess.getUTCMonth(),
        localAtGuess.getUTCDate(),
      ) + offsetAtGuess;
  }
  while (start + DAY_MS <= ts) start += DAY_MS;
  while (start > ts) start -= DAY_MS;
  return start;
}

export interface TranslationUsageRecordInput {
  provider: "openai-compatible";
  endpointKey: string;
  model: string;
  success: boolean;
  inputTokens?: number;
  outputTokens?: number;
  errorCode?: string;
}

export async function recordTranslationUsage(
  input: TranslationUsageRecordInput,
): Promise<void> {
  try {
    await insertTranslationUsage({
      provider: input.provider,
      endpointKey: input.endpointKey,
      model: input.model,
      occurredAt: Date.now(),
      success: input.success,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      errorCode: input.errorCode,
    });
  } catch (error) {
    console.warn("Failed to persist translation usage:", error);
  }
  listeners.forEach((listener) => listener());
}

export interface TranslationUsageSnapshot {
  provider: "openai-compatible";
  endpointKey: string;
  model: string;
  label: string;
  rpmUsed: number;
  tpmUsed: number;
  rpdUsed: number;
  /** Present only for the default Gemini endpoint. */
  limits: { rpm: number; tpm: number; rpd: number } | null;
}

export async function getTranslationsUsageSnapshot(
  provider: TranslationProviderConfig,
  model: string,
): Promise<TranslationUsageSnapshot> {
  const now = Date.now();
  const endpoint = {
    provider: provider.provider,
    endpointKey: provider.endpointKey,
  };
  const [rpmUsed, tpmUsed, rpdUsed] = await Promise.all([
    countTranslationUsageSince(model, now - MINUTE_MS, endpoint),
    sumTranslationInputTokensSince(model, now - MINUTE_MS, endpoint),
    countTranslationUsageSince(model, pacificDayStartMs(now), endpoint),
  ]);
  if (isGeminiBaseUrl(provider.baseUrl)) {
    const limits = GEMINI_HOSTED_LIMITS[model] ?? null;
    return {
      provider: "openai-compatible",
      endpointKey: provider.endpointKey,
      model,
      label: model,
      rpmUsed,
      tpmUsed,
      rpdUsed,
      limits,
    };
  }
  return {
    provider: "openai-compatible",
    endpointKey: provider.endpointKey,
    model,
    label: model,
    rpmUsed,
    tpmUsed,
    rpdUsed,
    limits: null,
  };
}
