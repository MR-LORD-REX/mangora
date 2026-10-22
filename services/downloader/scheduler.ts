/**
 * scheduler.ts
 * ---------------------------------------------------------------------------
 * The global download queue.
 *
 * Policy (defaults, configurable from Settings later):
 *   - `downloadSourceConcurrency` chapters per provider (default 1),
 *   - `downloadPageConcurrency` pages per chapter (default 1),
 *   - `downloadWifiOnly` pauses the queue while the phone is on mobile data.
 *
 * Every state change is mirrored into the `downloads` table and broadcast to
 * subscribers, so the readers/viewers can show live badges. An Android
 * foreground service keeps the process (and therefore the queue) alive while
 * the app is backgrounded.
 * ---------------------------------------------------------------------------
 */

import { AppState, type AppStateStatus } from "react-native";
import { File } from "expo-file-system";

import {
  deleteDownload as deleteDownloadRow,
  getDownload,
  listDownloads,
  queueDownload,
  resetInterruptedDownloads,
  updateDownload,
  type DownloadRecordInput,
} from "@/services/db/repositories/downloadRepository";
import { getSettings, subscribeSettings } from "@/services/settings/settingsStore";
import { notifyDownloadsFinished } from "@/services/notifications/notifications";
import { assertDecodableImageUri } from "@/services/images/decode";
import { snapshotDownloadMetadata } from "./metadata";
import { resolveChapterPageUrls } from "./chapterPages";
import { validateArchiveFile, validateSafArchive } from "./archive";
import {
  metadataEntryFromDownload,
  removeDownloadMetadataEntries,
  upsertDownloadMetadataEntry,
} from "./catalogMetadata";

import { chapterFileName } from "./naming";
import {
  buildArchive,
  deleteSafDocumentStrict,
  getNetworkState,
  startDownloadNotification,
  subscribeDownloadActions,
  stopDownloadNotification,
  updateDownloadNotification,
  writeArchiveToFolder,
} from "./native";
import {
  cacheMangaThumbnail,
  chapterCacheDirectory,
  DownloadCancelledError,
  DownloadPausedError,
  downloadChapterPages,
  prepareChapterDirectory,
  removeChapterCache,
} from "./pageFiles";
import {
  ensureFolder,
  ensureMangaFolder,
  getFolderState,
  type DownloadFolderState,
} from "./storage";
import {
  requiresForegroundApp,
  type DownloadJob,
  type DownloadSnapshot,
  type DownloadStatus,
} from "./types";

const NETWORK_POLL_MS = 15_000;
const WIFI_WAIT_REASON = "Waiting for Wi-Fi";
const FOREGROUND_WAIT_REASON = "Open Mangora to continue this download.";
const MANUAL_PAUSE_REASON = "Paused";

let appActive = AppState.currentState === "active";
let initialized = false;
let folderState: DownloadFolderState | null = null;
let networkWifi = true;
let networkConnected = true;

const jobs = new Map<string, DownloadJob>();
/** Chapter ids waiting for a free slot, in enqueue order. */
let waiting: string[] = [];
const running = new Map<string, { cancel: boolean }>();
const listeners = new Set<(snapshot: DownloadSnapshot) => void>();

let settings = {
  sourceConcurrency: 1,
  pageConcurrency: 1,
  wifiOnly: true,
};
let networkTimer: ReturnType<typeof setInterval> | null = null;
let pumping = false;
let notificationVisible = false;
let pausedAll = false;
let completedSinceIdle = 0;
const metadataSyncedThisSession = new Set<string>();

function snapshot(): DownloadSnapshot {
  const all = Array.from(jobs.values()).sort(
    (a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0),
  );
  return {
    jobs: all,
    runningCount: all.filter((job) => job.status === "running").length,
    pendingCount: all.filter(
      (job) => job.status === "queued" || job.status === "paused",
    ).length,
    paused: pausedAll,
  };
}

function emit(): void {
  const next = snapshot();
  listeners.forEach((listener) => listener(next));
}

/** Subscribes to queue changes; fires immediately with the current snapshot. */
export function subscribeDownloads(
  listener: (snapshot: DownloadSnapshot) => void,
): () => void {
  listeners.add(listener);
  listener(snapshot());
  return () => {
    listeners.delete(listener);
  };
}

export function getDownloadSnapshot(): DownloadSnapshot {
  return snapshot();
}

export function getDownloadJob(id: string): DownloadJob | null {
  return jobs.get(id) ?? null;
}

function providerLabel(provider: string): string {
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

/** Reason the given job must wait, or null when it may download. */
function gateReason(job: DownloadJob): string | null {
  if (pausedAll) return MANUAL_PAUSE_REASON;
  if (requiresForegroundApp(job.provider) && !appActive) {
    return FOREGROUND_WAIT_REASON;
  }
  if (settings.wifiOnly && !networkWifi) return WIFI_WAIT_REASON;
  return null;
}

function runningForProvider(provider: string): number {
  let count = 0;
  running.forEach((_control, id) => {
    if (jobs.get(id)?.provider === provider) count += 1;
  });
  return count;
}

function setStatus(job: DownloadJob, status: DownloadStatus, reason: string | null): void {
  job.status = status;
  job.reason = reason;
  void updateDownload(job.id, { status, error: reason });
}

async function refreshNetwork(): Promise<void> {
  const state = await getNetworkState();
  const changed = state.wifi !== networkWifi || state.connected !== networkConnected;
  networkWifi = state.wifi;
  networkConnected = state.connected;
  if (changed) void pump();
}

function ensureNetworkWatcher(): void {
  if (networkTimer) return;
  networkTimer = setInterval(() => {
    void refreshNetwork();
  }, NETWORK_POLL_MS);
}

function stopNetworkWatcher(): void {
  if (!networkTimer) return;
  clearInterval(networkTimer);
  networkTimer = null;
}

/** Starts (or refreshes) the foreground service notification. */
function syncNotification(): void {
  const active = Array.from(jobs.values()).find(
    (job) => job.status === "running",
  );
  const queuedCount = Array.from(jobs.values()).filter(
    (job) => job.status === "queued" || job.status === "paused",
  ).length;
  const blocked = Array.from(jobs.values()).find(
    (job) =>
      job.status === "paused" && job.reason === FOREGROUND_WAIT_REASON,
  );

  if (!active && queuedCount === 0) {
    if (notificationVisible) {
      stopDownloadNotification();
      notificationVisible = false;
    }
    return;
  }

  let text: string;
  if (pausedAll) {
    text = queuedCount > 0 ? `Paused \u00b7 ${queuedCount} waiting` : "Paused";
  } else if (active) {
    const pages = active.pageCount ? ` · ${active.pagesDone}/${active.pageCount} pages` : "";
    text = `${active.mangaTitle}${pages}`;
    if (active.pagesDone === 0) {
      text = `${active.mangaTitle} · preparing…`;
    }
  } else {
    text = "Waiting to start…";
  }
  if (queuedCount > 0) text += ` · ${queuedCount} more queued`;
  if (blocked) {
    text += `\n? ${providerLabel(blocked.provider)} needs the app open — tap to continue`;
  }

  const progress = active?.pagesDone ?? 0;
  const max = active?.pageCount ?? 0;
  const jobId = active?.id ?? null;
  if (!notificationVisible) {
    startDownloadNotification(text, progress, max, jobId, pausedAll);
    notificationVisible = true;
  } else {
    updateDownloadNotification(text, progress, max, jobId, pausedAll);
  }
}

/** Picks waiting jobs that can start right now. */
async function pump(): Promise<void> {
  if (!initialized || pumping) return;
  pumping = true;
  try {
    await refreshNetwork();

    if (pausedAll) {
      syncNotification();
      emit();
      return;
    }

    const pending = waiting
      .map((id) => jobs.get(id))
      .filter((job): job is DownloadJob => job != null)
      .filter((job) => job.status === "queued" || job.status === "paused");

    for (const job of pending) {
      if (running.has(job.id)) continue;
      const reason = gateReason(job);
      if (reason) {
        if (job.status !== "paused" || job.reason !== reason) {
          setStatus(job, reason === FOREGROUND_WAIT_REASON ? "paused" : "queued", reason);
          emit();
        }
        continue;
      }
      if (runningForProvider(job.provider) >= settings.sourceConcurrency) continue;
      if (job.status === "paused" || job.reason) {
        setStatus(job, "queued", null);
      }
      startJob(job);
    }

    if (running.size > 0 || waiting.length > 0) {
      ensureNetworkWatcher();
    } else {
      stopNetworkWatcher();
      if (completedSinceIdle > 0) {
        const finished = completedSinceIdle;
        completedSinceIdle = 0;
        void notifyDownloadsFinished(finished);
      }
    }
    syncNotification();
    emit();
  } finally {
    pumping = false;
  }
}

function startJob(job: DownloadJob): void {
  const control = { cancel: false };
  running.set(job.id, control);
  waiting = waiting.filter((id) => id !== job.id);
  job.status = "running";
  job.reason = null;
  job.startedAt = Date.now();
  void updateDownload(job.id, { status: "running", error: null });
  emit();
  void runJob(job, control).finally(() => {
    running.delete(job.id);
    void pump();
  });
}

async function runJob(
  job: DownloadJob,
  control: { cancel: boolean },
): Promise<void> {
  const startedAt = Date.now();
  let stage = "preparing download";
  console.log("[downloader][job] started", {
    jobId: job.id,
    provider: job.provider,
    mangaTitle: job.mangaTitle,
    chapterTitle: job.chapterTitle,
  });
  try {
    folderState = await ensureFolder();
    const state = folderState;

    stage = "loading chapter page list";
    const pageUrls = await resolveChapterPageUrls({
      provider: job.provider,
      providerChapterId: job.providerChapterId,
    });
    if (pageUrls.length === 0) {
      throw new Error("This chapter has no pages to download.");
    }
    console.log("[downloader][job] page list loaded", {
      jobId: job.id,
      pages: pageUrls.length,
    });
    job.pageCount = pageUrls.length;
    await updateDownload(job.id, { pageCount: pageUrls.length });

    const directory = prepareChapterDirectory(
      chapterCacheDirectory({
        provider: job.provider,
        providerMangaId: job.providerMangaId,
        providerChapterId: job.providerChapterId,
        mangaTitle: job.mangaTitle,
        chapterTitle: job.chapterTitle,
        chapterIndex: job.chapterIndex,
      }),
    );
    job.pagesDirUri = directory.uri;

    const thumbnailPath = await cacheMangaThumbnail({
      provider: job.provider,
      providerMangaId: job.providerMangaId,
      thumbnailUrl: job.thumbnailUrl,
    });
    if (thumbnailPath && thumbnailPath !== job.thumbnailPath) {
      job.thumbnailPath = thumbnailPath;
      await updateDownload(job.id, { thumbnailPath });
    }
    if (control.cancel) throw new DownloadCancelledError();

    stage = "downloading page images";
    const files = await downloadChapterPages({
      directory,
      urls: pageUrls,
      provider: job.provider,
      concurrency: settings.pageConcurrency,
      isCancelled: () => control.cancel,
      pauseReason: () => gateReason(job),
      onProgress: (pagesDone, bytes) => {
        job.pagesDone = pagesDone;
        job.byteSize = bytes;
        syncNotification();
        emit();
      },
    });
    if (control.cancel) throw new DownloadCancelledError();

    console.log("[downloader][job] all page images saved", {
      jobId: job.id,
      pages: files.length,
      bytes: files.reduce((total, file) => total + file.bytes, 0),
    });

    // Every page must be a real, decodable image before it enters the archive.
    // This also rejects HTML challenge pages returned with a 200 status.
    stage = "validating downloaded images";
    for (const page of files) {
      await assertDecodableImageUri(page.path, `Page ${page.name}`);
    }

    const localArchive = new File(directory, "archive.cbz");
    stage = "building local archive";
    console.log("[downloader][job] building archive", {
      jobId: job.id,
      pages: files.length,
    });
    await buildArchive(
      files.map((page) => ({ path: page.path, name: page.name })),
      localArchive.uri,
    );
    // Validate the ZIP before it is copied into the user's folder.
    stage = "validating local archive";
    const localValidation = await validateArchiveFile(
      localArchive.uri,
      pageUrls.length,
    );

    const fileName = chapterFileName({
      chapterTitle: job.chapterTitle,
      chapterIndex: job.chapterIndex ?? job.chapterNumber,
      scanlationGroup: job.scanlationGroup,
    });
    const mangaFolderUri = await ensureMangaFolder(state, {
      provider: job.provider,
      mangaTitle: job.mangaTitle,
      providerMangaId: job.providerMangaId,
    });
    stage = "saving archive to selected folder";
    console.log("[downloader][job] saving archive", {
      jobId: job.id,
      fileName,
      pageCount: localValidation.pageCount,
      bytes: localValidation.byteSize,
    });
    const fileUri = await writeArchive(mangaFolderUri, fileName, localArchive);
    if (control.cancel) throw new DownloadCancelledError();

    // Read the final SAF document back: proves it exists, is non-empty and has
    // exactly the expected numbered image entries.
    stage = "validating saved archive";
    const savedValidation = await validateSafArchive(
      fileUri,
      localValidation.pageCount,
      new File(directory, "saved-archive.cbz").uri,
    );

    const completedAt = Date.now();
    // metadata.json is the recoverable catalog. The validated archive is the
    // source of truth, so a metadata write failure must not discard a valid
    // download; it is surfaced as a warning on the completed row instead.
    stage = "updating download metadata";
    let metadataError: string | null = null;
    try {
      await upsertDownloadMetadataEntry(
        state.downloadsDirUri,
        metadataEntryFromDownload({
          id: job.id,
          provider: job.provider,
          providerMangaId: job.providerMangaId,
          providerChapterId: job.providerChapterId,
          mangaId: job.mangaId,
          mangaTitle: job.mangaTitle,
          chapterTitle: job.chapterTitle,
          chapterIndex: job.chapterIndex,
          chapterNumber: job.chapterNumber,
          scanlationGroup: job.scanlationGroup,
          chapterGroupKey: job.chapterGroupKey,
          languageCode: job.languageCode,
          pageCount: savedValidation.pageCount,
          byteSize: savedValidation.byteSize,
          fileName,
          completedAt,
        }),
      );
    } catch (error) {
      metadataError =
        "Download saved, but metadata.json could not be updated: " +
        (error instanceof Error ? error.message : "unknown error");
      console.warn("[downloader] metadata.json was not synchronized", error);
    }

    job.status = "completed";
    job.reason = null;
    job.fileUri = fileUri;
    job.fileName = fileName;
    job.folderUri = mangaFolderUri;
    job.byteSize = savedValidation.byteSize;
    job.pagesDone = files.length;
    job.finishedAt = completedAt;
    stage = "updating completed download record";
    await updateDownload(job.id, {
      status: "completed",
      error: metadataError,
      fileUri,
      fileName,
      folderUri: mangaFolderUri,
      byteSize: savedValidation.byteSize,
      pageCount: job.pageCount,
      downloadedPages: files.length,
      completedAt: job.finishedAt,
      pagesDirUri: null,
    });
    console.log("[downloader][job] completed", {
      jobId: job.id,
      pages: files.length,
      bytes: savedValidation.byteSize,
      elapsedMs: Date.now() - startedAt,
      metadataError,
    });

    completedSinceIdle += 1;
    // The finished chapter leaves the queue; its `downloads` row is what the
    // Downloads library and the offline viewer read from.
    jobs.delete(job.id);
    // Snapshot the manga into the offline catalog (once per session).
    void snapshotDownloadMetadata(
      job.provider,
      job.providerMangaId,
      metadataSyncedThisSession,
    );
  } catch (error) {
    if (error instanceof DownloadCancelledError) {
      // The row is removed by removeDownload(); nothing to persist.
      jobs.delete(job.id);
    } else if (error instanceof DownloadPausedError) {
      setStatus(
        job,
        error.reason === WIFI_WAIT_REASON ? "queued" : "paused",
        error.reason,
      );
      if (!waiting.includes(job.id)) waiting.push(job.id);
    } else {
      const message =
        error instanceof Error ? error.message : "Download failed.";
      console.error("[downloader][job] failed", {
        jobId: job.id,
        stage,
        elapsedMs: Date.now() - startedAt,
        error,
      });
      job.status = "failed";
      job.reason = message;
      waiting = waiting.filter((waitingId) => waitingId !== job.id);
      await updateDownload(job.id, { status: "failed", error: message });
    }
  } finally {
    // Temporary work files never become a second long-lived page cache.
    removeChapterCache(job.pagesDirUri ?? null);
    job.pagesDirUri = null;
    emit();
    syncNotification();
  }
}

async function writeArchive(
  mangaFolderUri: string,
  fileName: string,
  localArchive: File,
): Promise<string> {
  try {
    return await writeArchiveToFolder(mangaFolderUri, fileName, localArchive.uri);
  } finally {
    try {
      if (localArchive.exists) localArchive.delete();
    } catch {
      // The temp archive is cleared on the next run anyway.
    }
  }
}

export function downloadJobFromRow(row: Awaited<ReturnType<typeof listDownloads>>[number]): DownloadJob {
  return {
    id: row.id,
    provider: row.provider,
    mangaId: row.mangaId,
    providerMangaId: row.providerMangaId,
    providerChapterId: row.providerChapterId,
    mangaTitle: row.mangaTitle,
    thumbnailUrl: row.thumbnailUrl ?? null,
    thumbnailPath: row.thumbnailPath ?? null,
    chapterTitle: row.chapterTitle,
    chapterIndex: row.chapterIndex ?? null,
    chapterNumber: row.chapterNumber ?? null,
    scanlationGroup: row.scanlationGroup ?? null,
    chapterGroupKey: row.chapterGroupKey ?? null,
    languageCode: row.languageCode ?? null,
    pageCount: row.pageCount ?? null,
    pagesDone: row.downloadedPages,
    byteSize: row.byteSize ?? 0,
    status: row.status as DownloadStatus,
    reason: row.error ?? null,
    fileUri: row.fileUri ?? null,
    fileName: row.fileName ?? null,
    folderUri: row.folderUri ?? null,
    pagesDirUri: row.pagesDirUri ?? null,
    startedAt: null,
    finishedAt: row.completedAt ?? null,
    foregroundOnly: requiresForegroundApp(row.provider),
  };
}

/** Mirrors the user's settings into the live queue policy. */
async function loadSettings(): Promise<void> {
  const current = await getSettings();
  settings = {
    sourceConcurrency: current.downloadSourceConcurrency,
    pageConcurrency: current.downloadPageConcurrency,
    wifiOnly: current.downloadWifiOnly,
  };
}

/**
 * Starts the queue: restores persisted jobs, resumes interrupted downloads and
 * subscribes to settings/AppState changes. Safe to call more than once.
 */
export async function initDownloadScheduler(): Promise<void> {
  if (initialized) return;
  initialized = true;
  await loadSettings();
  await resetInterruptedDownloads();
  const rows = await listDownloads();
  for (const row of rows) {
    const job = downloadJobFromRow(row);
    // Finished chapters live only in the `downloads` table (the Downloads
    // library); the queue tracks work that can still run.
    if (job.status === "completed") continue;
    if (job.status === "failed") {
      jobs.set(job.id, job);
      continue;
    }
    job.status = "queued";
    jobs.set(job.id, job);
    waiting.push(job.id);
  }
  const network = await getNetworkState();
  networkWifi = network.wifi;
  networkConnected = network.connected;
  subscribeSettings((next) => {
    settings = {
      sourceConcurrency: next.downloadSourceConcurrency,
      pageConcurrency: next.downloadPageConcurrency,
      wifiOnly: next.downloadWifiOnly,
    };
    void pump();
  });
  AppState.addEventListener("change", (state: AppStateStatus) => {
    appActive = state === "active";
    void pump();
  });
  subscribeDownloadActions((event) => {
    void handleNotificationAction(event);
  });
  emit();
  void pump();
}

export interface EnqueueChapterInput extends DownloadRecordInput {
  chapterIndex?: string | null;
}

/** Creates (or restarts) jobs for the given chapters and starts the queue. */
export async function enqueueDownloads(
  inputs: EnqueueChapterInput[],
): Promise<{ queued: number; skipped: number }> {
  if (!initialized) await initDownloadScheduler();
  let queued = 0;
  let skipped = 0;
  for (const input of inputs) {
    const existing = jobs.get(input.id);
    if (existing?.status === "running") {
      skipped += 1;
      continue;
    }
    if (existing?.status === "completed") {
      skipped += 1;
      continue;
    }
    if (!existing) {
      // The queue no longer keeps finished jobs; the database is the record.
      const stored = await getDownload(input.id);
      if (stored?.status === "completed") {
        skipped += 1;
        continue;
      }
    }
    await queueDownload(input);
    const job: DownloadJob = {
      id: input.id,
      provider: input.provider,
      mangaId: input.mangaId,
      providerMangaId: input.providerMangaId,
      providerChapterId: input.providerChapterId,
      mangaTitle: input.mangaTitle,
      thumbnailUrl: input.thumbnailUrl ?? null,
      thumbnailPath: input.thumbnailPath ?? null,
      chapterTitle: input.chapterTitle,
      chapterIndex: input.chapterIndex ?? null,
      chapterNumber: input.chapterNumber ?? null,
      scanlationGroup: input.scanlationGroup ?? null,
      chapterGroupKey: input.chapterGroupKey ?? null,
      languageCode: input.languageCode ?? null,
      pageCount: input.pageCount ?? null,
      pagesDone: 0,
      byteSize: 0,
      status: "queued",
      reason: null,
      fileUri: null,
      fileName: null,
      folderUri: null,
      pagesDirUri: null,
      startedAt: null,
      finishedAt: null,
      foregroundOnly: requiresForegroundApp(input.provider),
    };
    jobs.set(job.id, job);
    if (!waiting.includes(job.id)) waiting.push(job.id);
    queued += 1;
  }
  emit();
  void pump();
  return { queued, skipped };
}

/** Re-queues a failed or finished-early job. */
export async function retryDownload(id: string): Promise<void> {
  const job = jobs.get(id);
  if (!job || running.has(id)) return;
  job.status = "queued";
  job.reason = null;
  jobs.set(id, job);
  if (!waiting.includes(id)) waiting.push(id);
  await updateDownload(id, { status: "queued", error: null });
  emit();
  void pump();
}

export interface RemoveDownloadResult {
  deleted: boolean;
  warning: string | null;
}

/**
 * Stops a job and deletes its archive, downloader-owned page files and database row. A SAF
 * failure keeps the row (marked failed) so the delete can be retried instead
 * of pretending the file is gone.
 */
export async function removeDownload(
  id: string,
): Promise<RemoveDownloadResult> {
  const control = running.get(id);
  if (control) control.cancel = true;
  waiting = waiting.filter((waitingId) => waitingId !== id);
  const job = jobs.get(id);
  jobs.delete(id);
  emit();
  const row = job ? null : await getDownload(id).catch(() => null);
  const fileUri = job?.fileUri ?? row?.fileUri ?? null;
  let warning: string | null = null;
  if (fileUri) {
    try {
      await deleteSafDocumentStrict(fileUri);
    } catch (error) {
      warning =
        "The archive could not be deleted. Check the download folder permission and try again. " +
        (error instanceof Error ? error.message : "");
      console.warn("[downloader] archive delete failed", error);
    }
  }
  if (warning) {
    await updateDownload(id, {
      status: "failed",
      error: warning.trim(),
    }).catch(() => {});
    syncNotification();
    if (running.size === 0 && waiting.length === 0) stopNetworkWatcher();
    return { deleted: false, warning };
  }

  removeChapterCache(job?.pagesDirUri ?? row?.pagesDirUri ?? null);
  const metadataWarning = await removeCatalogEntry(id);
  await deleteDownloadRow(id);
  syncNotification();
  if (running.size === 0 && waiting.length === 0) stopNetworkWatcher();
  return { deleted: true, warning: metadataWarning };
}

/** Removes one chapter from metadata.json and reports a stale catalog. */
async function removeCatalogEntry(id: string): Promise<string | null> {
  try {
    const state = await getFolderState();
    if (!state) return null;
    await removeDownloadMetadataEntries(state.downloadsDirUri, [id]);
    return null;
  } catch (error) {
    console.warn("[downloader] metadata entry was not removed", error);
    return (
      "The chapter was deleted, but metadata.json could not be updated: " +
      (error instanceof Error ? error.message : "unknown error")
    );
  }
}


/** Pauses every job in the queue (the notification "Pause" action). */
export async function pauseAllDownloads(): Promise<void> {
  if (pausedAll) return;
  pausedAll = true;
  for (const id of Array.from(waiting)) {
    const job = jobs.get(id);
    if (job && job.status === "queued") {
      setStatus(job, "paused", MANUAL_PAUSE_REASON);
    }
  }
  emit();
  syncNotification();
  void pump();
}

/** Resumes the queue after pauseAllDownloads(). */
export async function resumeAllDownloads(): Promise<void> {
  if (!pausedAll) return;
  pausedAll = false;
  for (const job of jobs.values()) {
    if (job.status === "paused" && job.reason === MANUAL_PAUSE_REASON) {
      job.status = "queued";
      job.reason = null;
      if (!waiting.includes(job.id)) waiting.push(job.id);
      void updateDownload(job.id, { status: "queued", error: null });
    }
  }
  emit();
  void pump();
}

/** True while the whole queue is paused. */
export function isQueuePaused(): boolean {
  return pausedAll;
}

/** Applies a Pause / Resume / Cancel action tapped on the notification. */
async function handleNotificationAction(event: {
  action: string;
  jobId: string | null;
}): Promise<void> {
  if (event.action === "pause") {
    await pauseAllDownloads();
    return;
  }
  if (event.action === "resume") {
    await resumeAllDownloads();
    return;
  }
  if (event.action === "cancel" && event.jobId) {
    await removeDownload(event.jobId);
  }
}

export function isNetworkWifi(): boolean {
  return networkWifi;
}

export function isNetworkConnected(): boolean {
  return networkConnected;
}

/** Cancels every job that has not finished yet; resolves how many were dropped. */
export async function cancelPendingDownloads(): Promise<number> {
  const ids = Array.from(jobs.values())
    .filter((job) => job.status !== "completed")
    .map((job) => job.id);
  for (const id of ids) await removeDownload(id);
  return ids.length;
}

/** Re-queues every failed job; resolves how many were restarted. */
export async function retryFailedDownloads(): Promise<number> {
  const ids = Array.from(jobs.values())
    .filter((job) => job.status === "failed")
    .map((job) => job.id);
  for (const id of ids) await retryDownload(id);
  return ids.length;
}
