/**
 * index.ts
 * ---------------------------------------------------------------------------
 * Public surface of the downloader for screens/components.
 * ---------------------------------------------------------------------------
 */

import {
  getDownload,
  getDownloadByProviderChapter,
  getDownloadStatusMap,
  listDownloadedManga,
  listDownloads,
  listDownloadsForManga,
} from "@/services/db/repositories/downloadRepository";
import { getSettings, updateSettings } from "@/services/settings/settingsStore";
import { removeDownload } from "./scheduler";
import type { Download } from "@/services/db/schema";
import {
  materializeDownloadedReaderChapter,
  type ReaderCacheHit,
} from "@/services/reader/readerCache";

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
  deleteAllDownloads,
  MISSING_METADATA_MESSAGE,
  MissingDownloadMetadataError,
  recoverDownloads,
} from "./recovery";
export type {
  DownloadDeletionResult,
  DownloadIssue,
  DownloadProgress,
  DownloadRecoveryResult,
} from "./recovery";
export {
  DOWNLOAD_METADATA_VERSION,
  metadataEntryFromRow,
  readDownloadMetadata,
  resolveMetadataEntryFile,
} from "./catalogMetadata";
export type {
  DownloadMetadataEntry,
  DownloadMetadataFile,
  DownloadMetadataReadResult,
} from "./catalogMetadata";
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

function identityForDownload(row: Download) {
  return {
    provider: row.provider,
    providerMangaId: row.providerMangaId,
    providerChapterId: row.providerChapterId,
    mangaId: row.mangaId,
    chapterId: row.id,
  } as const;
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

/**
 * Materialises a downloaded chapter into the shared reader cache and returns
 * its local page URIs. The reader pins the chapter explicitly for its lifetime;
 * pre-translation uses this snapshot and re-materialises if it was evicted.
 */
export async function getDownloadedPageUris(
  chapterId: string,
): Promise<string[]> {
  const row = await getDownload(chapterId);
  if (!row || row.status !== "completed") return [];
  try {
    const hit: ReaderCacheHit = await materializeDownloadedReaderChapter(
      identityForDownload(row),
      {
        fileUri: row.fileUri ?? null,
        pageCount: row.pageCount ?? null,
        pagesDirUri: row.pagesDirUri ?? null,
      },
      { mangaTitle: row.mangaTitle, chapterTitle: row.chapterTitle },
    );
    return hit.pages;
  } catch (error) {
    // The shared reader cache is the content authority. Legacy page folders
    // are not trusted because they may contain a partial chapter.
    console.warn("[downloader] could not materialise downloaded chapter", error);
    return [];
  }
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
    let pages: string[] = [];
    try {
      const hit = await materializeDownloadedReaderChapter(
        identityForDownload(row),
        {
          fileUri: row.fileUri ?? null,
          pageCount: row.pageCount ?? null,
          pagesDirUri: row.pagesDirUri ?? null,
        },
        { mangaTitle: row.mangaTitle, chapterTitle: row.chapterTitle },
      );
      pages = hit.pages;
    } catch (error) {
      console.warn("[downloader] archive extraction failed", error);
      pages = [];
    }
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
 * finished in an earlier session too, because the scheduler reads the row when
 * the job is no longer in memory.
 */
export async function deleteDownloadedChapter(
  id: string,
): Promise<{ deleted: boolean; warning: string | null }> {
  return removeDownload(id);
}
