/**
 * index.ts
 * ---------------------------------------------------------------------------
 * Public surface of the downloader for screens/components.
 * ---------------------------------------------------------------------------
 */

import {
  getDownloadStatusMap,
  listDownloadedManga,
  listDownloads,
  listDownloadsForManga,
  getDownload,
  getDownloadByProviderChapter,
} from "@/services/db/repositories/downloadRepository";
import { getSettings, updateSettings } from "@/services/settings/settingsStore";
import { deleteSafArchive } from "./native";
import { listCachedPages, removeChapterCache } from "./pageFiles";
import { removeDownload } from "./scheduler";
import type { Download } from "@/services/db/schema";

export {
  initDownloadScheduler,
  subscribeDownloads,
  enqueueDownloads,
  retryDownload,
  removeDownload,
  getDownloadSnapshot,
  getDownloadJob,
  isNetworkConnected,
  isNetworkWifi,
  isQueuePaused,
  pauseAllDownloads,
  resumeAllDownloads,
  cancelPendingDownloads,
  retryFailedDownloads,
} from "./scheduler";
export type { EnqueueChapterInput } from "./scheduler";
export { refreshDownloadedMetadata, snapshotDownloadMetadata } from "./metadata";
export {
  loadOfflineChapterViewer,
  loadOfflineGalleryMeta,
  offlineRowDownload,
  openDownloadedReader,
} from "./offline";
export { subscribeDownloadActions } from "./native";
export type { DownloadActionEvent } from "./native";
export { downloadTarget, encodeProviderParam, readerTarget } from "./identity";
export type { DownloadTarget } from "./identity";
export {
  ensureFolder as ensureDownloadFolder,
  hasFolderAccess as hasDownloadFolderAccess,
  pickFolder as pickDownloadFolder,
  getFolderState as getDownloadFolderState,
} from "./storage";
export type { DownloadFolderState } from "./storage";
export type {
  DownloadCandidate,
  DownloadJob,
  DownloadSnapshot,
  DownloadStatus,
} from "./types";
export { requiresForegroundApp } from "./types";
export { getDownloadStatusMap, listDownloadedManga, listDownloads, listDownloadsForManga };

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

/** The stored row for one chapter (null when it was never downloaded). */
export async function getDownloadedChapter(
  chapterId: string,
): Promise<Download | null> {
  return getDownload(chapterId);
}

/**
 * Local page uris for a downloaded chapter, in reading order. Returns an empty
 * array when the chapter is not downloaded (or its cache was cleared).
 */
export async function getDownloadedPageUris(
  chapterId: string,
): Promise<string[]> {
  const row = await getDownload(chapterId);
  if (!row || row.status !== "completed") return [];
  return listCachedPages(row.pagesDirUri ?? null);
}

/**
 * Local page uris for a downloaded chapter found by its provider chapter
 * identity instead of the canonical id. Tolerant of id-encoding drift: tries
 * the raw value plus its encoded/decoded forms, so a downloaded chapter never
 * falls back to the network just because the route param was encoded
 * differently from the id stored at download time.
 */
export async function getDownloadedPageUrisByProviderChapter(
  provider: string,
  providerChapterId: string,
): Promise<string[]> {
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
  let sawCompleted = false;
  for (const variant of variants) {
    const row = await getDownloadByProviderChapter(provider, variant);
    if (row?.status !== "completed") continue;
    sawCompleted = true;
    const pages = listCachedPages(row.pagesDirUri ?? null);
    if (pages.length > 0) return pages;
  }
  if (sawCompleted) {
    console.warn(
      `[downloader] ${provider}:${providerChapterId} is marked downloaded but its page cache is gone; reloading from the network.`,
    );
  }
  return [];
}

/** True when the given chapter has a finished archive on disk. */
export async function isChapterDownloaded(chapterId: string): Promise<boolean> {
  const row = await getDownload(chapterId);
  return row?.status === "completed";
}

/**
 * Deletes one downloaded chapter: the `.cbz` in the picked folder, the cached
 * pages, the live queue entry and the database row. Works for chapters that
 * finished in an earlier session too, because the file uri comes from the row.
 */
export async function deleteDownloadedChapter(id: string): Promise<void> {
  const row = await getDownload(id);
  if (row) {
    if (row.fileUri) await deleteSafArchive(row.fileUri);
    removeChapterCache(row.pagesDirUri ?? null);
  }
  await removeDownload(id);
}
