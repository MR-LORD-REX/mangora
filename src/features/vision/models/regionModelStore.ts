/**
 * Download, verify and remove downloadable region detectors.
 *
 * Detector files live in <documents>/models/region/<id>/ and use the same
 * resumable .part workflow as OCR packs. The store is process-local: killing
 * the app stops the transfer and the next attempt restarts from a clean part.
 */

import * as FileSystem from "expo-file-system/legacy";

import {
  REGION_DETECTORS,
  getRegionDetector,
  type RegionDetectorDef,
  type RegionDetectorId,
} from "./regionModels";

export type RegionModelDownloadStatus = "idle" | "downloading" | "error";

export interface RegionModelDownloadState {
  status: RegionModelDownloadStatus;
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
  error: string | null;
}

const states = new Map<RegionDetectorId, RegionModelDownloadState>();
const listeners = new Set<() => void>();
const activeDownloads = new Map<
  RegionDetectorId,
  FileSystem.DownloadResumable
>();
const pendingDownloads = new Map<RegionDetectorId, Promise<void>>();
const cancelled = new Set<RegionDetectorId>();

const idleState = (detector: RegionDetectorDef): RegionModelDownloadState => ({
  status: "idle",
  progress: 0,
  downloadedBytes: 0,
  totalBytes: detector.bytes,
  error: null,
});

function emit(): void {
  listeners.forEach((listener) => listener());
}

function setState(
  id: RegionDetectorId,
  next: RegionModelDownloadState,
): void {
  states.set(id, next);
  emit();
}

export function subscribeRegionModelDownloads(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getRegionModelDownloadState(
  id: RegionDetectorId,
): RegionModelDownloadState {
  return states.get(id) ?? idleState(getRegionDetector(id));
}

function requireDocuments(): string {
  const root = FileSystem.documentDirectory;
  if (!root) throw new Error("App storage is not available on this platform.");
  return root;
}

export function regionDetectorDirectoryUri(id: RegionDetectorId): string {
  return `${requireDocuments()}models/region/${id}/`;
}

export function regionDetectorFileUri(
  id: RegionDetectorId,
  relativePath: string,
): string {
  return `${regionDetectorDirectoryUri(id)}${relativePath}`;
}

async function fileSize(uri: string): Promise<number> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists && typeof info.size === "number" ? info.size : -1;
  } catch {
    return -1;
  }
}

async function ensureParentDirectory(uri: string): Promise<void> {
  const parent = uri.slice(0, uri.lastIndexOf("/") + 1);
  await FileSystem.makeDirectoryAsync(parent, { intermediates: true });
}

export async function isRegionModelDownloaded(
  id: RegionDetectorId,
): Promise<boolean> {
  const detector = getRegionDetector(id);
  for (const file of detector.files) {
    if ((await fileSize(regionDetectorFileUri(id, file.path))) !== file.bytes) {
      return false;
    }
  }
  return true;
}

/** Downloads all missing files sequentially; concurrent calls share a task. */
export function downloadRegionModel(id: RegionDetectorId): Promise<void> {
  const existing = pendingDownloads.get(id);
  if (existing) return existing;

  const detector = getRegionDetector(id);
  const task = (async () => {
    cancelled.delete(id);
    let completedBytes = 0;
    const totalBytes = detector.bytes;
    setState(id, {
      status: "downloading",
      progress: 0,
      downloadedBytes: 0,
      totalBytes,
      error: null,
    });

    try {
      await FileSystem.makeDirectoryAsync(regionDetectorDirectoryUri(id), {
        intermediates: true,
      });

      for (const file of detector.files) {
        if (cancelled.has(id)) throw new Error("Download cancelled.");
        const target = regionDetectorFileUri(id, file.path);
        if ((await fileSize(target)) === file.bytes) {
          completedBytes += file.bytes;
          continue;
        }

        await ensureParentDirectory(target);
        const partial = `${target}.part`;
        await FileSystem.deleteAsync(partial, { idempotent: true });
        let lastEmit = 0;
        const resumable = FileSystem.createDownloadResumable(
          file.url,
          partial,
          {},
          (event) => {
            const written = Math.min(event.totalBytesWritten, file.bytes);
            const now = Date.now();
            if (now - lastEmit < 120 && written < file.bytes) return;
            lastEmit = now;
            setState(id, {
              status: "downloading",
              progress: (completedBytes + written) / totalBytes,
              downloadedBytes: completedBytes + written,
              totalBytes,
              error: null,
            });
          },
        );
        activeDownloads.set(id, resumable);
        const result = await resumable.downloadAsync();
        activeDownloads.delete(id);
        if (cancelled.has(id) || !result) {
          await FileSystem.deleteAsync(partial, { idempotent: true });
          throw new Error("Download cancelled.");
        }

        const downloaded = await fileSize(partial);
        if (downloaded !== file.bytes) {
          await FileSystem.deleteAsync(partial, { idempotent: true });
          throw new Error(
            `${file.path} did not download completely (${downloaded} of ${file.bytes} bytes).`,
          );
        }
        await FileSystem.deleteAsync(target, { idempotent: true });
        await FileSystem.moveAsync({ from: partial, to: target });
        completedBytes += file.bytes;
        setState(id, {
          status: "downloading",
          progress: completedBytes / totalBytes,
          downloadedBytes: completedBytes,
          totalBytes,
          error: null,
        });
      }

      setState(id, {
        status: "idle",
        progress: 1,
        downloadedBytes: totalBytes,
        totalBytes,
        error: null,
      });
    } catch (error) {
      const wasCancelled = cancelled.has(id);
      setState(id, {
        status: wasCancelled ? "idle" : "error",
        progress: wasCancelled ? 0 : Math.min(1, completedBytes / totalBytes),
        downloadedBytes: wasCancelled ? 0 : completedBytes,
        totalBytes,
        error: wasCancelled
          ? null
          : error instanceof Error
            ? error.message
            : "Download failed.",
      });
      if (!wasCancelled) throw error;
    } finally {
      activeDownloads.delete(id);
      pendingDownloads.delete(id);
      cancelled.delete(id);
    }
  })();

  pendingDownloads.set(id, task);
  return task;
}

export async function cancelRegionModelDownload(
  id: RegionDetectorId,
): Promise<void> {
  cancelled.add(id);
  const resumable = activeDownloads.get(id);
  if (resumable) await resumable.cancelAsync().catch(() => {});
  setState(id, {
    ...getRegionModelDownloadState(id),
    status: "idle",
    progress: 0,
    downloadedBytes: 0,
    error: null,
  });
}

export async function deleteRegionModel(id: RegionDetectorId): Promise<void> {
  await cancelRegionModelDownload(id);
  await FileSystem.deleteAsync(regionDetectorDirectoryUri(id), {
    idempotent: true,
  });
  setState(id, idleState(getRegionDetector(id)));
}

export const ALL_REGION_DETECTOR_IDS: RegionDetectorId[] = REGION_DETECTORS.map(
  (detector) => detector.id,
);
