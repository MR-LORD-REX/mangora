/**
 * recovery.ts
 * ---------------------------------------------------------------------------
 * Rebuild SQLite from `downloads/metadata/metadata.json`, and delete the
 * chapter archives that the catalog can actually identify.
 *
 * Recovery never guesses chapter identities from filenames: when metadata is
 * missing it stops before importing anything.
 */

import { Paths } from "expo-file-system";

import {
  deleteDownload as deleteDownloadRow,
  importCompletedDownload,
  listDownloads,
} from "@/services/db/repositories/downloadRepository";
import { ArchiveValidationError, validateSafArchive } from "../storage/archive";
import {
  DownloadMetadataError,
  readDownloadMetadata,
  removeDownloadMetadataEntries,
  resolveMetadataEntryFile,
  type DownloadMetadataEntry,
} from "./catalogMetadata";
import { deleteSafDocumentStrict } from "@core/storage/saf";
import { listSafChildren, type SafChild } from "@core/storage/saf";
import { removeChapterCache } from "../storage/pageFiles";
import { getFolderState } from "../storage/storage";

export const MISSING_METADATA_MESSAGE =
  "metadata.json is missing. Downloads cannot be recovered automatically.";

export class MissingDownloadMetadataError extends Error {
  constructor() {
    super(MISSING_METADATA_MESSAGE);
    this.name = "MissingDownloadMetadataError";
  }
}

export interface DownloadProgress {
  checked: number;
  total: number;
  recovered: number;
  skipped: number;
  failed: number;
  current: string;
}

export interface DownloadIssue {
  id: string;
  title: string;
  reason: string;
}

export interface DownloadRecoveryResult {
  total: number;
  recovered: number;
  skipped: number;
  failed: number;
  issues: DownloadIssue[];
}

export interface DownloadDeletionResult {
  total: number;
  deleted: number;
  skipped: number;
  failed: number;
  issues: DownloadIssue[];
  metadataMissing: boolean;
  metadataInvalid: boolean;
  message: string;
}

function tempArchivePath(): string {
  return `${Paths.cache.uri.replace(/\/$/, "")}/downloader-recovery-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}.cbz`;
}

function entryTitle(entry: DownloadMetadataEntry): string {
  return `${entry.mangaTitle} - ${entry.chapterTitle}`;
}

/** Imports every valid chapter from metadata.json and reports the rest. */
export async function recoverDownloads(
  onProgress?: (progress: DownloadProgress) => void,
): Promise<DownloadRecoveryResult> {
  const state = await getFolderState();
  if (!state) {
    throw new Error(
      "No download folder is selected. Choose a storage location in Settings first.",
    );
  }
  const metadata = await readDownloadMetadata(state.downloadsDirUri);
  if (metadata.state === "missing") throw new MissingDownloadMetadataError();
  if (metadata.state === "invalid") {
    throw new DownloadMetadataError(
      `metadata.json is invalid. ${metadata.reason}`,
    );
  }

  const entries = metadata.data.chapters;
  const result: DownloadRecoveryResult = {
    total: entries.length,
    recovered: 0,
    skipped: 0,
    failed: 0,
    issues: [],
  };
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    onProgress?.({
      checked: index,
      total: entries.length,
      recovered: result.recovered,
      skipped: result.skipped,
      failed: result.failed,
      current: entryTitle(entry),
    });
    const resolved = await resolveMetadataEntryFile(
      state.downloadsDirUri,
      entry,
    );
    if (!resolved) {
      result.skipped += 1;
      result.issues.push({
        id: entry.id,
        title: entryTitle(entry),
        reason: "The archive is missing or the metadata path is invalid.",
      });
      continue;
    }
    try {
      const validation = await validateSafArchive(
        resolved.fileUri,
        entry.pageCount,
        tempArchivePath(),
      );
      await importCompletedDownload({
        id: entry.id,
        mangaId: entry.mangaId,
        provider: entry.provider,
        providerMangaId: entry.providerMangaId,
        providerChapterId: entry.providerChapterId,
        mangaTitle: entry.mangaTitle,
        chapterTitle: entry.chapterTitle,
        chapterIndex: entry.chapterIndex,
        chapterNumber: entry.chapterNumber,
        scanlationGroup: entry.scanlationGroup,
        chapterGroupKey: entry.chapterGroupKey,
        languageCode: entry.languageCode,
        pageCount: validation.pageCount,
        byteSize: validation.byteSize,
        fileUri: resolved.fileUri,
        fileName: resolved.fileName,
        folderUri: resolved.folderUri,
        completedAt: entry.completedAt,
      });
      result.recovered += 1;
    } catch (error) {
      if (error instanceof ArchiveValidationError) {
        result.skipped += 1;
      } else {
        result.failed += 1;
      }
      result.issues.push({
        id: entry.id,
        title: entryTitle(entry),
        reason:
          error instanceof Error
            ? error.message
            : "The archive could not be validated.",
      });
    }
  }
  onProgress?.({
    checked: entries.length,
    total: entries.length,
    recovered: result.recovered,
    skipped: result.skipped,
    failed: result.failed,
    current: "",
  });
  return result;
}

/**
 * Deletes the chapters identified by metadata.json. If metadata is missing or
 * invalid it falls back to archives recorded in SQLite and reports that the
 * remaining files cannot be identified.
 */
export async function deleteAllDownloads(
  onProgress?: (progress: DownloadProgress) => void,
): Promise<DownloadDeletionResult> {
  const state = await getFolderState();
  if (!state) {
    throw new Error(
      "No download folder is selected. Choose a storage location in Settings first.",
    );
  }
  const metadata = await readDownloadMetadata(state.downloadsDirUri);
  const result: DownloadDeletionResult = {
    total: 0,
    deleted: 0,
    skipped: 0,
    failed: 0,
    issues: [],
    metadataMissing: metadata.state === "missing",
    metadataInvalid: metadata.state === "invalid",
    message: "",
  };

  if (metadata.state === "ok") {
    const entries = metadata.data.chapters;
    result.total = entries.length;
    const deletedIds: string[] = [];
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      onProgress?.({
        checked: index,
        total: entries.length,
        recovered: result.deleted,
        skipped: result.skipped,
        failed: result.failed,
        current: entryTitle(entry),
      });
      const resolved = await resolveMetadataEntryFile(
        state.downloadsDirUri,
        entry,
      );
      if (!resolved) {
        result.skipped += 1;
        result.issues.push({
          id: entry.id,
          title: entryTitle(entry),
          reason:
            "The archive is missing or the download folder is not accessible. Nothing was deleted for this chapter.",
        });
        continue;
      }
      try {
        await deleteSafDocumentStrict(resolved.fileUri);
        await deleteDownloadRow(entry.id);
        deletedIds.push(entry.id);
        result.deleted += 1;
      } catch (error) {
        result.failed += 1;
        result.issues.push({
          id: entry.id,
          title: entryTitle(entry),
          reason:
            error instanceof Error ? error.message : "Could not delete the file.",
        });
      }
    }
    if (deletedIds.length > 0) {
      try {
        await removeDownloadMetadataEntries(state.downloadsDirUri, deletedIds);
      } catch (error) {
        result.issues.push({
          id: "metadata",
          title: "metadata.json",
          reason:
            error instanceof Error
              ? error.message
              : "Deleted files are still listed in metadata.json.",
        });
      }
    }
    result.message =
      "Deleted the chapters listed in metadata.json. Files it does not list were left untouched.";
    return result;
  }

  // Metadata is unavailable: delete only archives that SQLite can identify.
  const rows = (await listDownloads()).filter(
    (row) => row.fileUri || row.pagesDirUri,
  );
  result.total = rows.length;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    onProgress?.({
      checked: index,
      total: rows.length,
      recovered: result.deleted,
      skipped: result.skipped,
      failed: result.failed,
      current: `${row.mangaTitle} - ${row.chapterTitle}`,
    });
    try {
      if (row.fileUri) await deleteSafDocumentStrict(row.fileUri);
      removeChapterCache(row.pagesDirUri ?? null);
      await deleteDownloadRow(row.id);
      result.deleted += 1;
    } catch (error) {
      result.failed += 1;
      result.issues.push({
        id: row.id,
        title: `${row.mangaTitle} - ${row.chapterTitle}`,
        reason:
          error instanceof Error ? error.message : "Could not delete the file.",
      });
    }
  }
  result.message =
    metadata.state === "missing"
      ? "metadata.json is missing. Only archives recorded in the app database were deleted; other files in downloads/ could not be identified."
      : `metadata.json is invalid (${metadata.reason}). Only archives recorded in the app database were deleted.`;
  return result;
}

/** Folder entries below downloads/, used by recovery diagnostics. */
export async function listDownloadFolderChildren(
  folderUri: string,
): Promise<SafChild[]> {
  return listSafChildren(folderUri);
}
