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
  cleanupDownloadedPageSession,
  openDownloadedPageSession,
} from "./readerPageSession";
import type { DownloadedPageSession } from "./readerPageSession";

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
export { cleanupDownloadedPageSession, openDownloadedPageSession };
export { clearAbandonedDownloadedPageSessions } from "./readerPageSession";
export type { DownloadedPageSession };

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

/** Opens download-owned page files or a temporary extraction of its archive. */
export async function openDownloadedPageSessionForChapter(
  chapterId: string,
): Promise<DownloadedPageSession> {
  const row = await getDownload(chapterId);
  if (!row || row.status !== "completed") {
    throw new Error("The downloaded chapter is no longer available.");
  }
  return openDownloadedPageSession(row);
}

/** True when the given chapter has a finished archive on disk. */
export async function isChapterDownloaded(chapterId: string): Promise<boolean> {
  const row = await getDownload(chapterId);
  return row?.status === "completed";
}

/**
 * Deletes one downloaded chapter: the `.cbz` in the picked folder, its
 * downloader-owned page files, the live queue entry and the database row. Works for chapters that
 * finished in an earlier session too, because the scheduler reads the row when
 * the job is no longer in memory.
 */
export async function deleteDownloadedChapter(
  id: string,
): Promise<{ deleted: boolean; warning: string | null }> {
  return removeDownload(id);
}
