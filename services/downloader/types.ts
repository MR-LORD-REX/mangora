/**
 * Downloader types shared by the scheduler, the repositories and the UI.
 */

import type { DownloadTarget } from "./identity";

export type DownloadStatus =
  | "queued"
  | "running"
  | "paused"
  | "failed"
  | "completed";

/** Providers whose page list needs the in-app Comix bridge to be alive. */
export const FOREGROUND_ONLY_PROVIDERS = ["comix"] as const;

export function requiresForegroundApp(provider: string): boolean {
  return (FOREGROUND_ONLY_PROVIDERS as readonly string[]).includes(provider);
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

/** One chapter offered in the download picker. */
export interface DownloadCandidate {
  target: DownloadTarget;
  chapterTitle: string;
  /** Chapter number / upload index shown in the file name. */
  chapterIndex: string | null;
  chapterNumber: number | null;
  scanlationGroup: string | null;
  chapterGroupKey: string | null;
  languageCode: string | null;
  pageCount: number | null;
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
