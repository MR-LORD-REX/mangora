/**
 * Download storage layout and lifecycle.
 *
 * All archives live below the one picked SAF root:
 *
 *   downloads/<provider>/<manga title>/<chapter> ~ <index> ~ <group>.cbz
 *
 * The root grant itself belongs to `@core/storage/root` because database
 * backups share it. This module adds only download-folder policy.
 */

import {
  forgetStorageRoot,
  getStorageRoot,
  pickStorageRoot,
} from "@core/storage/root";
import { mangaSegment, providerSegment } from "@core/storage/naming";
import { deleteSafPath, ensureSafDirectories } from "@core/storage/saf";

export const DOWNLOADS_DIR_NAME = "downloads";

export interface DownloadFolderState {
  treeUri: string;
  label: string | null;
  downloadsDirUri: string;
}

/** Reads the persisted root and resolves its `downloads/` child. */
export async function getFolderState(): Promise<DownloadFolderState | null> {
  const root = await getStorageRoot();
  if (!root) return null;
  const downloadsDirUri = await ensureSafDirectories(root.treeUri, [
    DOWNLOADS_DIR_NAME,
  ]);
  return { ...root, downloadsDirUri };
}

/** Opens the system folder picker and persists the selection. */
export async function pickFolder(): Promise<DownloadFolderState | null> {
  const root = await pickStorageRoot();
  if (!root) return null;
  return getFolderState();
}

/** Returns the folder, prompting for one when none has been granted yet. */
export async function ensureFolder(): Promise<DownloadFolderState> {
  const existing = await getFolderState();
  if (existing) return existing;
  const picked = await pickFolder();
  if (!picked) {
    throw new Error(
      "Choose a folder so downloads can be saved before starting a download.",
    );
  }
  return picked;
}

/** True when a usable folder has already been granted. */
export async function hasFolderAccess(): Promise<boolean> {
  return (await getFolderState()) != null;
}

/** Creates (or reuses) `<downloads>/<provider>/<manga>/` and returns its uri. */
export async function ensureMangaFolder(
  state: DownloadFolderState,
  input: { provider: string; mangaTitle: string; providerMangaId: string },
): Promise<string> {
  return ensureSafDirectories(state.downloadsDirUri, [
    providerSegment(input.provider),
    mangaSegment(input.mangaTitle, input.providerMangaId),
  ]);
}

/** Forgets the granted folder when access was lost. */
export async function forgetFolder(): Promise<void> {
  await forgetStorageRoot();
}

/** Removes an emptied `<downloads>/<provider>/<manga>/` folder (best effort). */
export async function removeMangaFolder(
  state: DownloadFolderState,
  input: { provider: string; mangaTitle: string; providerMangaId: string },
): Promise<boolean> {
  return deleteSafPath(state.downloadsDirUri, [
    providerSegment(input.provider),
    mangaSegment(input.mangaTitle, input.providerMangaId),
  ]);
}