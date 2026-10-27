/**
 * backup.ts
 * ---------------------------------------------------------------------------
 * "Create backup" / "Restore backup" for Settings -> Data and storage.
 *
 * The backup is one SQLite file written to `<picked root>/backup/`. It holds
 * every app table (including the settings mirror), so restoring it brings the
 * whole app state back. Restoring happens against the live connection: the
 * backup is opened in memory and copied table by table.
 * ---------------------------------------------------------------------------
 */

import { Directory, File, Paths } from "expo-file-system";

import { restoreDatabaseFromBytes, serializeDatabase } from "@core/db/backup";
import type { RestoreResult } from "@core/db/backup";
import { ensureStorageRoot, ensureRootChild } from "@core/storage/root";
import { readSafDocumentToFile, writeFileToFolder } from "@core/storage/saf";
import { reloadSettingsFromMirror, updateSettings } from "./settingsStore";

const BACKUP_MIME_TYPE = "application/octet-stream";

export interface BackupInfo {
  fileName: string;
  /** Uri of the document inside the picked folder. */
  uri: string;
  bytes: number;
  createdAt: number;
}

/** Temporary scratch folder; the finished backup is written to the SAF folder. */
function backupCacheDirectory(): Directory {
  const directory = new Directory(Paths.cache, "mangora-backup-tmp");
  if (!directory.exists) {
    directory.create({ intermediates: true, idempotent: true });
  }
  return directory;
}

function stamp(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => `${value}`.padStart(2, "0");
  return (
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
  );
}

/** Snapshots the database into `<root>/backup/mangora-<timestamp>.db`. */
export async function createBackup(): Promise<BackupInfo> {
  const root = await ensureStorageRoot();
  const backupFolderUri = await ensureRootChild(root, "backup");
  const bytes = await serializeDatabase();
  const createdAt = Date.now();
  const fileName = `mangora-${stamp(createdAt)}.db`;
  const scratch = new File(backupCacheDirectory(), fileName);
  scratch.create({ intermediates: true, overwrite: true });
  scratch.write(bytes);
  try {
    const uri = await writeFileToFolder(
      backupFolderUri,
      fileName,
      BACKUP_MIME_TYPE,
      scratch.uri,
    );
    await updateSettings({ lastBackupAt: createdAt });
    return { fileName, uri, bytes: bytes.byteLength, createdAt };
  } finally {
    try {
      if (scratch.exists) scratch.delete();
    } catch {
      // The scratch folder is cleared by the OS cache policy anyway.
    }
  }
}

/**
 * Opens the system file picker and restores the picked backup.
 * Resolves null when the user cancels.
 */
export async function restoreBackup(): Promise<RestoreResult | null> {
  let picked: Awaited<ReturnType<typeof File.pickFileAsync>>;
  try {
    picked = await File.pickFileAsync(undefined, "*/*");
  } catch {
    return null;
  }
  const file = Array.isArray(picked) ? picked[0] : picked;
  if (!file?.uri) return null;

  const scratch = new File(backupCacheDirectory(), `restore-${Date.now()}.db`);
  try {
    await readSafDocumentToFile(file.uri, scratch.uri);
    const bytes = await scratch.bytes();
    const result = await restoreDatabaseFromBytes(bytes);
    // The settings file is the app's live copy; re-seed it from the restored
    // mirror so the UI reflects the backup immediately.
    await reloadSettingsFromMirror();
    return result;
  } finally {
    try {
      if (scratch.exists) scratch.delete();
    } catch {
      // Best effort cleanup.
    }
  }
}
