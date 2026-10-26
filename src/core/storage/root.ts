/**
 * The user-picked storage root shared by downloads and database backups.
 *
 * `ACTION_OPEN_DOCUMENT_TREE` grants survive app restarts. This module owns
 * the grant lifecycle and root label; feature-specific subfolders stay with
 * their feature.
 */

import { Directory } from "expo-file-system";

import {
  clearStoredStorageRoot,
  getStoredStorageRoot,
  saveStoredStorageRoot,
} from "./pickedRootRepository";
import { describeSafTree, ensureSafDirectories } from "./saf";

export interface StorageRootState {
  treeUri: string;
  label: string | null;
}

function isTreeAccessible(treeUri: string): boolean {
  try {
    return new Directory(treeUri).exists;
  } catch {
    return false;
  }
}

/** Reads the persisted root, dropping it when its grant was revoked. */
export async function getStorageRoot(): Promise<StorageRootState | null> {
  const stored = await getStoredStorageRoot();
  if (!stored) return null;
  if (!isTreeAccessible(stored.treeUri)) {
    await clearStoredStorageRoot();
    return null;
  }
  return { treeUri: stored.treeUri, label: stored.label };
}

/** Opens the system folder picker and persists the selected root. */
export async function pickStorageRoot(): Promise<StorageRootState | null> {
  let picked: Awaited<ReturnType<typeof Directory.pickDirectoryAsync>>;
  try {
    picked = await Directory.pickDirectoryAsync();
  } catch {
    return null;
  }
  const label = await describeSafTree(picked.uri);
  await saveStoredStorageRoot({
    treeUri: picked.uri,
    label,
    downloadsDirUri: null,
  });
  return { treeUri: picked.uri, label };
}

/** Returns the root, prompting for one when none has been granted yet. */
export async function ensureStorageRoot(): Promise<StorageRootState> {
  const existing = await getStorageRoot();
  if (existing) return existing;
  const picked = await pickStorageRoot();
  if (!picked) {
    throw new Error(
      "Choose a folder so downloads can be saved before starting a download.",
    );
  }
  return picked;
}

export async function hasStorageRootAccess(): Promise<boolean> {
  return (await getStorageRoot()) != null;
}

export async function forgetStorageRoot(): Promise<void> {
  await clearStoredStorageRoot();
}

/** Creates (or reuses) a direct child directory of the selected root. */
export async function ensureRootChild(
  root: StorageRootState,
  name: string,
): Promise<string> {
  return ensureSafDirectories(root.treeUri, [name]);
}