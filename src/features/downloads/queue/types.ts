/**
 * Downloader types shared by the scheduler, repositories and UI.
 */

export type DownloadStatus =
  | "queued"
  | "running"
  | "paused"
  | "failed"
  | "completed";

/** Extension downloads run in the foreground service without a WebView gate. */
export function requiresForegroundApp(_provider: string): boolean {
  return false;
}

export interface DownloadJob {
  /** Canonical chapter id (also the `downloads.id` primary key). */
  id: string;
  provider: string;
  mangaId: string;
  providerMangaId: string;
  providerChapterId: string;
  mangaTitle: string;
  thumbnailUrl: string | null;
  thumbnailPath: string | null;
  chapterTitle: string;
  chapterIndex: string | null;
  chapterNumber: number | null;
  scanlationGroup: string | null;
  chapterGroupKey: string | null;
  languageCode: string | null;
  pageCount: number | null;
  pagesDone: number;
  byteSize: number;
  status: DownloadStatus;
  /** Human readable reason for a paused/failed job. */
  reason: string | null;
  fileUri: string | null;
  fileName: string | null;
  folderUri: string | null;
  pagesDirUri: string | null;
  startedAt: number | null;
  finishedAt: number | null;
  /** True while the provider can only download with the app in the foreground. */
  foregroundOnly: boolean;
}

export interface DownloadSnapshot {
  jobs: DownloadJob[];
  /** Jobs currently downloading pages. */
  runningCount: number;
  /** Jobs waiting for a free slot or for Wi-Fi. */
  pendingCount: number;
  /** True while the whole queue is paused from the notification or the app. */
  paused: boolean;
}