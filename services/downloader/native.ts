/**
 * native.ts
 * ---------------------------------------------------------------------------
 * Typed bridge to the `MangoraDownloader` Android module
 * (android/app/src/main/java/com/mangora/app/DownloadModule.kt).
 *
 * The module does the three things JavaScript cannot: build the .cbz with
 * native streams, write it into a SAF folder, and run a foreground service so
 * the queue survives backgrounding. Every call has a JavaScript fallback so
 * the downloader still works on a client without the native module (Expo Go,
 * iOS, a non-rebuilt dev client) - only the streaming and background parts
 * degrade.
 * ---------------------------------------------------------------------------
 */

import { Directory, File, Paths } from "expo-file-system";
import { DeviceEventEmitter, NativeModules, Platform } from "react-native";

import { CBZ_MIME_TYPE } from "./naming";

interface ZipEntryInput {
  path: string;
  name: string;
}

interface MangoraDownloaderModule {
  isWifiConnected(): Promise<{ connected: boolean; wifi: boolean }>;
  ensureDirectories(parentUri: string, segments: string[]): Promise<string>;
  writeSafFile(
    parentUri: string,
    fileName: string,
    mimeType: string,
    sourcePath: string,
  ): Promise<string>;
  readSafDocument(uri: string, destPath: string): Promise<string>;
  extractSafArchivePages(uri: string, destDirPath: string): Promise<string[]>;
  listSafArchivePageNames(uri: string): Promise<string[]>;
  extractSafArchivePage(
    uri: string,
    destPath: string,
    pageFileName: string,
  ): Promise<string>;
  deleteSafPath(parentUri: string, segments: string[]): Promise<boolean>;
  deleteSafDocument(uri: string): Promise<boolean>;
  findSafChild(parentUri: string, name: string): Promise<string | null>;
  listSafChildren(parentUri: string): Promise<SafChild[]>;
  renameSafDocument(uri: string, newName: string): Promise<string>;
  describeSafTree(uri: string): Promise<string>;
  zipPages(
    entries: ZipEntryInput[],
    destPath: string,
  ): Promise<{ entries: number; size: number; path: string }>;
  startDownloadService(
    title: string,
    text: string,
    progress: number,
    max: number,
    jobId: string | null,
    paused: boolean,
  ): void;
  updateDownloadService(
    text: string,
    progress: number,
    max: number,
    jobId: string | null,
    paused: boolean,
  ): void;
  stopDownloadService(): void;
}

const nativeModule = NativeModules.MangoraDownloader as
  | MangoraDownloaderModule
  | undefined;

/** True when the native downloader helpers are linked into this build. */
export function hasNativeDownloader(): boolean {
  return Platform.OS === "android" && nativeModule != null;
}

export interface NetworkState {
  connected: boolean;
  wifi: boolean;
}

/**
 * Reads the active network transport. Without the native module the check is
 * optimistic (downloads are allowed) instead of blocking the queue.
 */
export async function getNetworkState(): Promise<NetworkState> {
  if (!hasNativeDownloader()) return { connected: true, wifi: true };
  try {
    return await nativeModule!.isWifiConnected();
  } catch {
    return { connected: true, wifi: true };
  }
}

/**
 * Creates (or reuses) the `segments` chain below a picked SAF folder and
 * returns the deepest uri.
 */
export async function ensureSafDirectories(
  parentUri: string,
  segments: string[],
): Promise<string> {
  if (hasNativeDownloader()) {
    return nativeModule!.ensureDirectories(parentUri, segments);
  }
  let current = new Directory(parentUri);
  for (const segment of segments) {
    if (!segment) continue;
    const next = new Directory(current, segment);
    if (!next.exists) next.create({ intermediates: true, idempotent: true });
    current = next;
  }
  return current.uri;
}

/** Human readable label for a picked tree uri ("Internal storage/mangora"). */
export async function describeSafTree(uri: string): Promise<string | null> {
  if (!hasNativeDownloader()) return null;
  try {
    const label = await nativeModule!.describeSafTree(uri);
    return label || null;
  } catch {
    return null;
  }
}

/** One entry inside a SAF folder. */
export interface SafChild {
  name: string;
  uri: string;
  size: number;
  isDirectory: boolean;
}

/** Resolves a direct child document/folder of a SAF tree, or null. */
export async function findSafChild(
  parentUri: string,
  name: string,
): Promise<string | null> {
  if (hasNativeDownloader()) {
    try {
      return await nativeModule!.findSafChild(parentUri, name);
    } catch {
      return null;
    }
  }
  try {
    const parent = new Directory(parentUri);
    if (!parent.exists) return null;
    const child = parent.list().find((entry) => entry.name === name);
    return child?.uri ?? null;
  } catch {
    return null;
  }
}

/** Lists the direct children of a SAF folder. */
export async function listSafChildren(parentUri: string): Promise<SafChild[]> {
  if (hasNativeDownloader()) {
    try {
      return await nativeModule!.listSafChildren(parentUri);
    } catch {
      return [];
    }
  }
  try {
    const parent = new Directory(parentUri);
    if (!parent.exists) return [];
    return parent.list().map((entry) => ({
      name: entry.name,
      uri: entry.uri,
      size: entry instanceof File ? entry.size : 0,
      isDirectory: entry instanceof Directory,
    }));
  } catch {
    return [];
  }
}

/** Renames a SAF document; returns its new uri. */
export async function renameSafDocument(
  uri: string,
  newName: string,
): Promise<string> {
  if (hasNativeDownloader()) {
    return nativeModule!.renameSafDocument(uri, newName);
  }
  const file = new File(uri);
  file.rename(newName);
  return file.uri;
}

/**
 * Extracts the numbered page images of a downloaded CBZ into `destDirPath`
 * and returns their file uris in archive order.
 */
export async function extractSafArchivePages(
  uri: string,
  destDirPath: string,
): Promise<string[]> {
  if (!hasNativeDownloader()) {
    throw new Error(
      "Extracting downloaded chapters needs the native download module. Rebuild the app and try again.",
    );
  }
  return nativeModule!.extractSafArchivePages(uri, destDirPath);
}

/**
 * Streams a local file into a SAF folder, replacing a previous document with
 * the same name. Without the native module the bytes are read into memory
 * first (fine for small files only).
 */
export async function writeFileToFolder(
  folderUri: string,
  fileName: string,
  mimeType: string,
  sourcePath: string,
): Promise<string> {
  if (hasNativeDownloader()) {
    return nativeModule!.writeSafFile(folderUri, fileName, mimeType, sourcePath);
  }
  const folder = new Directory(folderUri);
  const existing = folder
    .list()
    .find(
      (entry) => entry instanceof File && entry.name === fileName,
    ) as File | undefined;
  if (existing?.exists) existing.delete();
  const target = folder.createFile(fileName, mimeType);
  const bytes = await new File(sourcePath).bytes();
  target.write(bytes);
  return target.uri;
}

/** Streams a locally built archive into the SAF folder. */
export async function writeArchiveToFolder(
  folderUri: string,
  fileName: string,
  sourcePath: string,
): Promise<string> {
  return writeFileToFolder(folderUri, fileName, CBZ_MIME_TYPE, sourcePath);
}

/**
 * Copies a document the user picked (a `content://` uri, which the JS
 * filesystem cannot read) into `destPath` and resolves the local path.
 */
export async function readSafDocumentToFile(
  uri: string,
  destPath: string,
): Promise<string> {
  if (hasNativeDownloader()) {
    return nativeModule!.readSafDocument(uri, destPath);
  }
  const bytes = await new File(uri).bytes();
  const destination = new File(destPath);
  destination.create({ intermediates: true, overwrite: true });
  destination.write(bytes);
  return destination.uri;
}

/** Lists numbered page images inside a SAF archive without extracting them. */
export async function listSafArchivePageNames(uri: string): Promise<string[]> {
  if (!hasNativeDownloader()) {
    throw new Error("Listing downloaded chapter pages needs the Android download module.");
  }
  return nativeModule!.listSafArchivePageNames(uri);
}

/** Extracts one numbered page image from a SAF archive into local cache. */
export async function extractSafArchivePage(
  uri: string,
  destPath: string,
  pageFileName: string,
): Promise<string> {
  if (!hasNativeDownloader()) {
    throw new Error("Extracting downloaded chapter pages needs the Android download module.");
  }
  return nativeModule!.extractSafArchivePage(uri, destPath, pageFileName);
}

/**
 * Deletes `<parentUri>/<segments...>` when it exists. Used by the download
 * manager to remove the now-empty manga folder after its last chapter.
 */
export async function deleteSafPath(
  parentUri: string,
  segments: string[],
): Promise<boolean> {
  if (!hasNativeDownloader()) return false;
  try {
    return await nativeModule!.deleteSafPath(parentUri, segments);
  } catch {
    return false;
  }
}

/** Deletes a `.cbz` written by {@link writeArchiveToFolder}. */
export async function deleteSafArchive(uri: string): Promise<void> {
  if (hasNativeDownloader()) {
    try {
      await nativeModule!.deleteSafDocument(uri);
      return;
    } catch {
      // Fall through to the expo-file-system delete below.
    }
  }
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Deleting is best effort: the archive may already be gone.
  }
}

/**
 * Deletes a SAF document and reports the provider's result. Unlike
 * deleteSafArchive this throws so bulk deletion can report exactly which
 * files could not be removed.
 */
export async function deleteSafDocumentStrict(uri: string): Promise<void> {
  if (hasNativeDownloader()) {
    const deleted = await nativeModule!.deleteSafDocument(uri);
    if (!deleted) {
      throw new Error("The storage provider did not delete the file.");
    }
    return;
  }
  const file = new File(uri);
  if (file.exists) file.delete();
}

/**
 * Builds the `.cbz` at `destPath` from already-downloaded page files.
 * Without the native module this falls back to a JS zip written through the
 * app cache (the whole archive is held in memory once).
 */
export async function buildArchive(
  entries: ZipEntryInput[],
  destPath: string,
): Promise<{ size: number; entries: number }> {
  if (hasNativeDownloader()) {
    const result = await nativeModule!.zipPages(entries, destPath);
    return { size: result.size, entries: result.entries };
  }
  const { zipArchive } = await import("./zipFallback");
  return zipArchive(entries, destPath);
}

/** Cache directory every downloader artifact lives under. */
export function downloaderCacheRoot(): Directory {
  return new Directory(Paths.cache, "downloads");
}

/** Starts/refreshes the foreground service notification. */
export function startDownloadNotification(
  text: string,
  progress: number,
  max: number,
  jobId: string | null,
  paused: boolean,
): void {
  if (!hasNativeDownloader()) return;
  nativeModule!.startDownloadService(
    "Mangora downloads",
    text,
    progress,
    max,
    jobId,
    paused,
  );
}

export function updateDownloadNotification(
  text: string,
  progress: number,
  max: number,
  jobId: string | null,
  paused: boolean,
): void {
  if (!hasNativeDownloader()) return;
  nativeModule!.updateDownloadService(text, progress, max, jobId, paused);
}

export function stopDownloadNotification(): void {
  if (!hasNativeDownloader()) return;
  nativeModule!.stopDownloadService();
}

/** One notification action tapped by the user. */
export interface DownloadActionEvent {
  action: "pause" | "resume" | "cancel" | string;
  jobId: string | null;
}

/**
 * Subscribes to notification actions (Pause / Resume / Cancel) forwarded from
 * the foreground service. Returns an unsubscribe function.
 */
export function subscribeDownloadActions(
  listener: (event: DownloadActionEvent) => void,
): () => void {
  if (!hasNativeDownloader()) return () => {};
  const subscription = DeviceEventEmitter.addListener(
    "MangoraDownloader:action",
    (payload: { action?: string; jobId?: string | null }) => {
      listener({
        action: payload?.action ?? "unknown",
        jobId: payload?.jobId ?? null,
      });
    },
  );
  return () => subscription.remove();
}
