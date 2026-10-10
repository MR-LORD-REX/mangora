/**
 * geminiUsage.ts
 * ---------------------------------------------------------------------------
 * Usage tracking for the Gemini translation engine.
 *
 * Every Gemini API attempt is persisted to the `translation_usage` table
 * (model, timestamp, success, tokens) and the UI meters are derived from
 * those rows:
 *   - RPM: requests in the last 60 seconds
 *   - TPM: input tokens in the last 60 seconds
 *   - RPD: requests since midnight Pacific (Google resets daily quotas at
 *          midnight America/Los_Angeles)
 *
 * US DST is handled with the standard "second Sunday in March / first Sunday
 * in November" rule so day buckets do not drift.
 * ---------------------------------------------------------------------------
 */

import type { GeminiModelId } from "./geminiModels";
import { geminiModelInfo } from "./geminiModels";
import {
  countTranslationUsageSince,
  insertTranslationUsage,
  sumTranslationInputTokensSince,
} from "@/services/db/repositories/translationRepository";

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;

type UsageListener = () => void;
const listeners = new Set<UsageListener>();

/** Subscribes to usage changes (fires after every recorded request). */
export function subscribeGeminiUsage(listener: UsageListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Returns the UTC ms of the nth Sunday (1-based) of a month in `year`. */
function nthSundayUtcMs(year: number, monthIndex: number, nth: number): number {
  const first = Date.UTC(year, monthIndex, 1);
  const firstDay = new Date(first).getUTCDay();
  const firstSunday = first + ((7 - firstDay) % 7) * DAY_MS;
  return firstSunday + (nth - 1) * 7 * DAY_MS;
}

/** UTC offset (ms) of America/Los_Angeles at `utcMs`. */
function laOffsetUtcMs(utcMs: number): number {
  const date = new Date(utcMs);
  const year = date.getUTCFullYear();
  // DST starts 02:00 PST on the second Sunday of March (= 10:00 UTC).
  const dstStart = nthSundayUtcMs(year, 2, 2) + 10 * 3_600_000;
  // DST ends 02:00 PDT on the first Sunday of November (= 09:00 UTC).
  const dstEnd = nthSundayUtcMs(year, 10, 1) + 9 * 3_600_000;
  return utcMs >= dstStart && utcMs < dstEnd ? 7 * 3_600_000 : 8 * 3_600_000;
}

/** Midnight Pacific (ms) for the LA day that contains `ts`. */
export function pacificDayStartMs(ts: number): number {
  const magnitudeMs = laOffsetUtcMs(ts);
  const local = new Date(ts - magnitudeMs);
  let start =
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) +
    magnitudeMs;
  // Snap onto the true LA midnight - the offset can change mid-day around
  // DST transitions, so re-derive the boundary with the offset at the guess.
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

export interface GeminiUsageSnapshot {
  model: GeminiModelId;
  label: string;
  rpmUsed: number;
  rpmLimit: number;
  tpmUsed: number;
  tpmLimit: number;
  rpdUsed: number;
  rpdLimit: number;
}

export interface GeminiUsageRecordInput {
  model: GeminiModelId;
  success: boolean;
  inputTokens?: number;
  outputTokens?: number;
  errorCode?: string;
}

/**
 * Persists one Gemini attempt (best effort) and notifies the meters. This is
 * the single write path for quota rows so RPM/TPM/RPD always come from the
 * same source of truth.
 */
export async function recordGeminiUsage(
  input: GeminiUsageRecordInput,
): Promise<void> {
  try {
    await insertTranslationUsage({
      model: input.model,
      occurredAt: Date.now(),
      success: input.success,
      inputTokens: input.inputTokens,
      outputTokens: input.outputTokens,
      errorCode: input.errorCode,
    });
  } catch (error) {
    console.warn("Failed to persist Gemini usage:", error);
  }
  listeners.forEach((listener) => listener());
}

/**
 * Blocks until the model has a free RPM slot (rolling 60s window). Waits at
 * most one minute so a fast reader cannot hammer the free tier; if the limit
 * is still exhausted afterwards the API's own 429 handling takes over.
 */
export async function waitForRpmCapacity(model: GeminiModelId): Promise<void> {
  const info = geminiModelInfo(model);
  const deadline = Date.now() + 60_000;
  for (;;) {
    const used = await countTranslationUsageSince(model, Date.now() - MINUTE_MS);
    if (used < info.rpm) return;
    if (Date.now() >= deadline) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 1200));
  }
}

/**
 * Loads the current used/limit snapshot for one model from the usage table.
 * Used by the quota meters in the translation options panel.
 */
export async function getGeminiUsageSnapshot(
  model: GeminiModelId,
): Promise<GeminiUsageSnapshot> {
  const info = geminiModelInfo(model);
  const now = Date.now();
  const [rpmUsed, tpmUsed, rpdUsed] = await Promise.all([
    countTranslationUsageSince(model, now - MINUTE_MS),
    sumTranslationInputTokensSince(model, now - MINUTE_MS),
    countTranslationUsageSince(model, pacificDayStartMs(now)),
  ]);
  return {
    model,
    label: info.label,
    rpmUsed,
    rpmLimit: info.rpm,
    tpmUsed,
    tpmLimit: info.tpm,
    rpdUsed,
    rpdLimit: info.rpd,
  };
}
