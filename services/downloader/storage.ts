/**
 * storage.ts
 * ---------------------------------------------------------------------------
 * The storage gate: every download writes into one user-picked folder
 * (`ACTION_OPEN_DOCUMENT_TREE`, so the grant survives restarts).
 *
 * Layout inside the picked folder:
 *
 *   downloads/<provider>/<manga title>/<chapter> ~ <index> ~ <group>.cbz
 *
 * The picked tree uri and the `downloads/` child uri are persisted in SQLite
 * so the whole app reads and writes the same location.
 * ---------------------------------------------------------------------------
 */

import { Directory } from "expo-file-system";

import {
  clearDownloadFolder,
  getDownloadFolder,
  saveDownloadFolder,
} from "@/services/db/repositories/downloadRepository";
import { deleteSafPath, describeSafTree, ensureSafDirectories } from "./native";
import { mangaSegment, providerSegment } from "./naming";

export const DOWNLOADS_DIR_NAME = "downloads";
export const BACKUP_DIR_NAME = "backup";

export interface DownloadFolderState {
  treeUri: string;
  label: string | null;
  downloadsDirUri: string;
}

/** True when the persisted folder is still readable (grant not revoked). */
function isTreeAccessible(treeUri: string): boolean {
  try {
    return new Directory(treeUri).exists;
  } catch {
    return false;
  }
}

/** Reads the persisted folder, dropping it when its grant was revoked. */
export async function getFolderState(): Promise<DownloadFolderState | null> {
  const stored = await getDownloadFolder();
  if (!stored) return null;
  if (!isTreeAccessible(stored.treeUri)) {
    await clearDownloadFolder();
    return null;
  }
  let downloadsDirUri = stored.downloadsDirUri;
  if (!downloadsDirUri || !isTreeAccessible(downloadsDirUri)) {
    downloadsDirUri = await ensureSafDirectories(stored.treeUri, [
      DOWNLOADS_DIR_NAME,
    ]);
    await saveDownloadFolder({
      treeUri: stored.treeUri,
      label: stored.label,
      downloadsDirUri,
    });
  }
  return {
    treeUri: stored.treeUri,
    label: stored.label,
    downloadsDirUri,
  };
}

/**
 * Opens the system folder picker and persists the selection.
 * Resolves null when the user cancels.
 */
export async function pickFolder(): Promise<DownloadFolderState | null> {
  let picked: Awaited<ReturnType<typeof Directory.pickDirectoryAsync>>;
  try {
    picked = await Directory.pickDirectoryAsync();
  } catch {
    return null;
  }
  const label = await describeSafTree(picked.uri);
  const downloadsDirUri = await ensureSafDirectories(picked.uri, [
    DOWNLOADS_DIR_NAME,
  ]);
  await saveDownloadFolder({
    treeUri: picked.uri,
    label,
    downloadsDirUri,
  });
  return { treeUri: picked.uri, label, downloadsDirUri };
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

/** Forgets the granted folder (used by the retry flow when access was lost). */
export async function forgetFolder(): Promise<void> {
  await clearDownloadFolder();
}

/** `<root>/backup` - where database backups are written. */
export async function ensureBackupFolder(
  state: DownloadFolderState,
): Promise<string> {
  return ensureSafDirectories(state.treeUri, [BACKUP_DIR_NAME]);
}

/**
 * Removes an emptied `<downloads>/<provider>/<manga>/` folder (best effort).
 * Called after the last chapter of a manga is deleted from the manager.
 */
export async function removeMangaFolder(
  state: DownloadFolderState,
  input: { provider: string; mangaTitle: string; providerMangaId: string },
): Promise<boolean> {
  return deleteSafPath(state.downloadsDirUri, [
    providerSegment(input.provider),
    mangaSegment(input.mangaTitle, input.providerMangaId),
  ]);
}
