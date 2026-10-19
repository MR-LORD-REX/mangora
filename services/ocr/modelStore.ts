/**
 * modelStore.ts
 * ---------------------------------------------------------------------------
 * Download, verify and remove the on-device OCR model packs.
 *
 * Files live in <documents>/ocr-models/<model id>/ and are downloaded through
 * expo-file-system's resumable API so Settings can show byte progress. Each
 * file is written as a `.part` first and only promoted when its size matches
 * the publisher's manifest, so an interrupted download never looks installed.
 *
 * The store is intentionally small and process-local: downloads stop when the
 * app is killed, and the next attempt replaces any leftover `.part` files.
 * ---------------------------------------------------------------------------
 */

import * as FileSystem from "expo-file-system/legacy";

import {
  LOCAL_OCR_MODELS,
  getLocalOcrModel,
  type LocalOcrModelDef,
  type LocalOcrModelId,
} from "./ocrModels";

export type ModelDownloadStatus = "idle" | "downloading" | "error";

export interface ModelDownloadState {
  status: ModelDownloadStatus;
  /** 0..1 across the whole model pack. */
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
  error: string | null;
}

const idleState = (model: LocalOcrModelDef): ModelDownloadState => ({
  status: "idle",
  progress: 0,
  downloadedBytes: 0,
  totalBytes: model.bytes,
  error: null,
});

const states = new Map<LocalOcrModelId, ModelDownloadState>();
const listeners = new Set<() => void>();
const activeDownloads = new Map<LocalOcrModelId, FileSystem.DownloadResumable>();
const pendingDownloads = new Map<LocalOcrModelId, Promise<void>>();
const cancelled = new Set<LocalOcrModelId>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

function setState(id: LocalOcrModelId, next: ModelDownloadState): void {
  states.set(id, next);
  emit();
}

export function subscribeModelDownloads(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getModelDownloadState(id: LocalOcrModelId): ModelDownloadState {
  const model = getLocalOcrModel(id);
  const fallback = model ? idleState(model) : {
    status: "idle" as const,
    progress: 0,
    downloadedBytes: 0,
    totalBytes: 0,
    error: null,
  };
  return states.get(id) ?? fallback;
}

function requireDocuments(): string {
  const root = FileSystem.documentDirectory;
  if (!root) {
    throw new Error("App storage is not available on this platform.");
  }
  return root;
}

/** Directory that holds one model pack (always ends with a slash). */
export function modelDirectoryUri(id: LocalOcrModelId): string {
  return `${requireDocuments()}ocr-models/${id}/`;
}

/** Absolute URI of one file inside a model pack. */
export function modelFileUri(id: LocalOcrModelId, relativePath: string): string {
  return `${modelDirectoryUri(id)}${relativePath}`;
}

async function fileSize(uri: string): Promise<number> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists) return -1;
    return typeof info.size === "number" ? info.size : -1;
  } catch {
    return -1;
  }
}

async function ensureParentDirectory(uri: string): Promise<void> {
  const parent = uri.slice(0, uri.lastIndexOf("/") + 1);
  await FileSystem.makeDirectoryAsync(parent, { intermediates: true });
}

/** True when every file exists and matches the published byte size. */
export async function isModelDownloaded(id: LocalOcrModelId): Promise<boolean> {
  const model = getLocalOcrModel(id);
  if (!model) return false;
  for (const file of model.files) {
    const size = await fileSize(modelFileUri(id, file.path));
    if (size !== file.bytes) return false;
  }
  return true;
}

/**
 * Downloads every missing file in `id` sequentially. Concurrent calls for the
 * same model share one promise. Throws with a readable message on failure.
 */
export function downloadModel(id: LocalOcrModelId): Promise<void> {
  const existing = pendingDownloads.get(id);
  if (existing) return existing;

  const model = getLocalOcrModel(id);
  if (!model) return Promise.reject(new Error(`Unknown OCR model: ${id}`));

  const task = (async () => {
    cancelled.delete(id);
    const totalBytes = model.bytes;
    let completedBytes = 0;
    setState(id, {
      status: "downloading",
      progress: 0,
      downloadedBytes: 0,
      totalBytes,
      error: null,
    });

    try {
      await FileSystem.makeDirectoryAsync(modelDirectoryUri(id), {
        intermediates: true,
      });

      for (const file of model.files) {
        if (cancelled.has(id)) throw new Error("Download cancelled.");

        const target = modelFileUri(id, file.path);
        const already = await fileSize(target);
        if (already === file.bytes) {
          completedBytes += file.bytes;
          setState(id, {
            status: "downloading",
            progress: completedBytes / totalBytes,
            downloadedBytes: completedBytes,
            totalBytes,
            error: null,
          });
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
      const message = error instanceof Error ? error.message : "Download failed.";
      const wasCancelled = cancelled.has(id);
      setState(id, {
        status: wasCancelled ? "idle" : "error",
        progress: wasCancelled ? 0 : Math.min(1, completedBytes / totalBytes),
        downloadedBytes: wasCancelled ? 0 : completedBytes,
        totalBytes,
        error: wasCancelled ? null : message,
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

/** Stops an in-flight download and removes the current `.part` file. */
export async function cancelModelDownload(id: LocalOcrModelId): Promise<void> {
  cancelled.add(id);
  const resumable = activeDownloads.get(id);
  if (resumable) {
    await resumable.cancelAsync().catch(() => {});
  }
  setState(id, {
    ...getModelDownloadState(id),
    status: "idle",
    progress: 0,
    downloadedBytes: 0,
    error: null,
  });
}

/** Removes the whole model pack. */
export async function deleteModel(id: LocalOcrModelId): Promise<void> {
  await cancelModelDownload(id);
  await FileSystem.deleteAsync(modelDirectoryUri(id), { idempotent: true });
  const model = getLocalOcrModel(id);
  if (model) setState(id, idleState(model));
}

/** Every model id in catalog order. */
export const ALL_MODEL_IDS: LocalOcrModelId[] = LOCAL_OCR_MODELS.map(
  (model) => model.id,
);
