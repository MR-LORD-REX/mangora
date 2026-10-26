/**
 * Persistence for the one user-picked SAF root.
 *
 * Downloads, database backups and legacy reader-cache cleanup all use the same
 * directory grant. This repository therefore belongs to core storage, not to
 * the downloads feature.
 */

import { eq } from "drizzle-orm";

import { db } from "@/services/db/client";
import { downloadFolders } from "@/services/db/schema";

export const STORAGE_ROOT_ID = "default";

export interface StoredStorageRoot {
  treeUri: string;
  label: string | null;
  /** Legacy cache from the retired downloader-owned layout. */
  downloadsDirUri: string | null;
}

export async function getStoredStorageRoot(): Promise<StoredStorageRoot | null> {
  const rows = await db
    .select()
    .from(downloadFolders)
    .where(eq(downloadFolders.id, STORAGE_ROOT_ID))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  return {
    treeUri: row.treeUri,
    label: row.label,
    downloadsDirUri: row.downloadsDirUri,
  };
}

export async function saveStoredStorageRoot(
  input: StoredStorageRoot,
): Promise<void> {
  const now = Date.now();
  await db
    .insert(downloadFolders)
    .values({
      id: STORAGE_ROOT_ID,
      treeUri: input.treeUri,
      label: input.label,
      downloadsDirUri: input.downloadsDirUri,
      grantedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: downloadFolders.id,
      set: {
        treeUri: input.treeUri,
        label: input.label,
        downloadsDirUri: input.downloadsDirUri,
        updatedAt: now,
      },
    });
}

export async function clearStoredStorageRoot(): Promise<void> {
  await db
    .delete(downloadFolders)
    .where(eq(downloadFolders.id, STORAGE_ROOT_ID));
}