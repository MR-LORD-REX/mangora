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

import { Directory, Paths } from "expo-file-system";
import { DeviceEventEmitter, NativeModules, Platform } from "react-native";

import { CBZ_MIME_TYPE } from "@core/storage/naming";
import {
  deleteSafDocumentStrict,
  writeFileToFolder,
} from "@core/storage/saf";

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

/** Streams a locally built archive into the SAF folder. */
export async function writeArchiveToFolder(
  folderUri: string,
  fileName: string,
  sourcePath: string,
): Promise<string> {
  return writeFileToFolder(folderUri, fileName, CBZ_MIME_TYPE, sourcePath);
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
  const { zipArchive } = await import("../storage/zipFallback");
  return zipArchive(entries, destPath);
}

/** Cache directory every downloader artifact lives under. */
export function downloaderCacheRoot(): Directory {
  return new Directory(Paths.cache, "downloads");
}

/** Deletes a .cbz written by {@link writeArchiveToFolder}. */
export async function deleteSafArchive(uri: string): Promise<void> {
  return deleteSafDocumentStrict(uri).catch(() => {});
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
