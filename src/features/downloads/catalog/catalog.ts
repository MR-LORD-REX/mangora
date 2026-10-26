/**
 * Public download catalog: stored rows, download identity and the per-chapter
 * confirmation policy. No caller needs the downloader barrel for these reads.
 */

import {
  getDownload,
  getDownloadByProviderChapter,
} from "@/services/db/repositories/downloadRepository";
import { getSettings, updateSettings } from "@core/settings";
import type { Download } from "@/services/db/schema";

export {
  getDownloadStatusMap,
  listDownloadedManga,
  listDownloads,
  listDownloadsForManga,
} from "@/services/db/repositories/downloadRepository";
export type { DownloadedMangaSummary } from "@/services/db/repositories/downloadRepository";

/** Today's date key ("YYYY-MM-DD") used by the confirm-suppression setting. */
function todayKey(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** True while the user asked to hide the per-chapter download confirmation. */
export async function isDownloadConfirmSuppressed(): Promise<boolean> {
  const settings = await getSettings();
  return settings.downloadConfirmSuppressedUntil === todayKey();
}

/** Hides the per-chapter confirmation until tomorrow. */
export async function suppressDownloadConfirmForToday(): Promise<void> {
  await updateSettings({ downloadConfirmSuppressedUntil: todayKey() });
}

/** The stored completed row for one chapter (null when it was never downloaded). */
export async function getDownloadedChapter(
  chapterId: string,
  provider?: string,
  providerChapterId?: string,
): Promise<Download | null> {
  const direct = await getDownload(chapterId);
  if (direct?.status === "completed") return direct;
  if (!provider || !providerChapterId) return direct ?? null;
  const variants = new Set<string>([providerChapterId]);
  try {
    variants.add(encodeURIComponent(providerChapterId));
  } catch {
    // Ignore values that cannot be encoded.
  }
  try {
    variants.add(decodeURIComponent(providerChapterId));
  } catch {
    // Ignore values that cannot be decoded.
  }
  for (const variant of variants) {
    const row = await getDownloadByProviderChapter(provider, variant);
    if (row?.status === "completed") return row;
  }
  return direct ?? null;
}

/** True when the given chapter has a finished archive on disk. */
export async function isChapterDownloaded(chapterId: string): Promise<boolean> {
  const row = await getDownload(chapterId);
  return row?.status === "completed";
}

/** Identity helpers shared by actions, the reader and the offline screens. */
export { downloadTarget, encodeProviderParam, readerTarget } from "./identity";
export type { DownloadTarget } from "./identity";
export type { DownloadCandidate } from "./identity";