/**
 * catalogMetadata.ts
 * ---------------------------------------------------------------------------
 * Versioned `downloads/metadata/metadata.json` index.
 *
 * SQLite remains the fast operational index; this file is the recoverable
 * catalog. It is written atomically (temp document + rename) only after an
 * archive has been validated, and updated again when a chapter is deleted.
 */

import { Directory, File, Paths } from "expo-file-system";

import type { Download } from "@/services/db/schema";
import {
  deleteSafArchive,
  ensureSafDirectories,
  findSafChild,
  readSafDocumentToFile,
  renameSafDocument,
  writeFileToFolder,
} from "./native";
import { mangaSegment, providerSegment } from "./naming";

export const DOWNLOAD_METADATA_VERSION = 1;
export const DOWNLOAD_METADATA_DIR = "metadata";
export const DOWNLOAD_METADATA_FILE = "metadata.json";
const METADATA_BACKUP_FILE = "metadata.json.bak";
const METADATA_TEMP_FILE = "metadata.json.tmp";
const METADATA_MIME = "application/json";

export interface DownloadMetadataEntry {
  id: string;
  provider: string;
  providerMangaId: string;
  providerChapterId: string;
  mangaId: string;
  mangaTitle: string;
  chapterTitle: string;
  chapterIndex: string | null;
  chapterNumber: number | null;
  scanlationGroup: string | null;
  chapterGroupKey: string | null;
  languageCode: string | null;
  pageCount: number;
  byteSize: number;
  fileName: string;
  /** `<provider>/<manga>/<file>` below the downloads root. */
  relativePath: string;
  /** `<provider>/<manga>` below the downloads root. */
  mangaRelativePath: string;
  completedAt: number;
}

export interface DownloadMetadataFile {
  version: number;
  updatedAt: number;
  chapters: DownloadMetadataEntry[];
}

export type DownloadMetadataReadResult =
  | { state: "ok"; data: DownloadMetadataFile }
  | { state: "missing" }
  | { state: "invalid"; reason: string };

export class DownloadMetadataError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DownloadMetadataError";
  }
}

function localScratchDirectory(): Directory {
  const directory = new Directory(Paths.cache, "downloader-metadata");
  directory.create({ intermediates: true, idempotent: true });
  return directory;
}

function scratchFile(name: string): File {
  return new File(localScratchDirectory(), name);
}

function deleteIfPresent(target: File): void {
  try {
    if (target.exists) target.delete();
  } catch {
    // Best effort.
  }
}

/** Metadata directory below the downloads root. */
export async function ensureMetadataDirectory(
  downloadsDirUri: string,
): Promise<string> {
  return ensureSafDirectories(downloadsDirUri, [DOWNLOAD_METADATA_DIR]);
}

function isSafeRelativePath(value: string): boolean {
  if (!value || value.startsWith("/") || value.startsWith("\\")) return false;
  if (value.includes("\\")) return false;
  const segments = value.split("/");
  return segments.length > 0 && segments.every((segment) => {
    if (!segment || segment === "." || segment === "..") return false;
    return !segment.includes("\u0000");
  });
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function optionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseEntry(value: unknown): DownloadMetadataEntry | null {
  if (!value || typeof value !== "object") return null;
  const entry = value as Partial<DownloadMetadataEntry>;
  if (
    typeof entry.id !== "string" ||
    typeof entry.provider !== "string" ||
    typeof entry.providerMangaId !== "string" ||
    typeof entry.providerChapterId !== "string" ||
    typeof entry.mangaId !== "string" ||
    typeof entry.mangaTitle !== "string" ||
    typeof entry.chapterTitle !== "string" ||
    typeof entry.pageCount !== "number" ||
    entry.pageCount <= 0 ||
    typeof entry.byteSize !== "number" ||
    entry.byteSize < 0 ||
    typeof entry.fileName !== "string" ||
    !entry.fileName ||
    entry.fileName.includes("/") ||
    entry.fileName.includes("\\") ||
    typeof entry.relativePath !== "string" ||
    !isSafeRelativePath(entry.relativePath) ||
    !entry.relativePath.endsWith(`/${entry.fileName}`) ||
    typeof entry.mangaRelativePath !== "string" ||
    !isSafeRelativePath(entry.mangaRelativePath) ||
    entry.relativePath !==
      `${entry.mangaRelativePath}/${entry.fileName}` ||
    typeof entry.completedAt !== "number"
  ) {
    return null;
  }
  return {
    id: entry.id,
    provider: entry.provider,
    providerMangaId: entry.providerMangaId,
    providerChapterId: entry.providerChapterId,
    mangaId: entry.mangaId,
    mangaTitle: entry.mangaTitle,
    chapterTitle: entry.chapterTitle,
    chapterIndex: optionalString(entry.chapterIndex),
    chapterNumber: optionalNumber(entry.chapterNumber),
    scanlationGroup: optionalString(entry.scanlationGroup),
    chapterGroupKey: optionalString(entry.chapterGroupKey),
    languageCode: optionalString(entry.languageCode),
    pageCount: Math.round(entry.pageCount),
    byteSize: Math.round(entry.byteSize),
    fileName: entry.fileName,
    relativePath: entry.relativePath,
    mangaRelativePath: entry.mangaRelativePath,
    completedAt: entry.completedAt,
  };
}

export function parseDownloadMetadata(value: unknown): DownloadMetadataFile {
  if (!value || typeof value !== "object") {
    throw new DownloadMetadataError("metadata.json is not an object.");
  }
  const file = value as Partial<DownloadMetadataFile>;
  if (file.version !== DOWNLOAD_METADATA_VERSION) {
    throw new DownloadMetadataError(
      `Unsupported metadata version: ${String(file.version)}.`,
    );
  }
  if (!Array.isArray(file.chapters)) {
    throw new DownloadMetadataError("metadata.json has no chapters array.");
  }
  const chapters: DownloadMetadataEntry[] = [];
  const ids = new Set<string>();
  for (const raw of file.chapters) {
    const entry = parseEntry(raw);
    if (!entry) {
      throw new DownloadMetadataError(
        "metadata.json contains an invalid chapter entry.",
      );
    }
    if (ids.has(entry.id)) {
      throw new DownloadMetadataError(
        `metadata.json contains a duplicate chapter: ${entry.id}.`,
      );
    }
    ids.add(entry.id);
    chapters.push(entry);
  }
  return {
    version: DOWNLOAD_METADATA_VERSION,
    updatedAt: typeof file.updatedAt === "number" ? file.updatedAt : Date.now(),
    chapters,
  };
}

/** Reads metadata.json (falling back to the backup left by an interrupted write). */
export async function readDownloadMetadata(
  downloadsDirUri: string,
): Promise<DownloadMetadataReadResult> {
  let metadataDirUri: string;
  try {
    metadataDirUri = await ensureMetadataDirectory(downloadsDirUri);
  } catch (error) {
    return {
      state: "invalid",
      reason:
        error instanceof Error
          ? `Could not open the metadata folder: ${error.message}`
          : "Could not open the metadata folder.",
    };
  }
  const candidates = [DOWNLOAD_METADATA_FILE, METADATA_BACKUP_FILE];
  const temp = scratchFile(`metadata-read-${Date.now()}.json`);
  let firstError: string | null = null;
  try {
    // Prefer the main file, but fall back to the backup when the main file
    // exists yet cannot be read or parsed. Atomic writes normally avoid that
    // state; this keeps recovery usable after external corruption.
    for (const name of candidates) {
      const documentUri = await findSafChild(metadataDirUri, name);
      if (!documentUri) continue;
      try {
        await readSafDocumentToFile(documentUri, temp.uri);
        if (!temp.exists || temp.size <= 0) {
          firstError ??= name + " is empty.";
          continue;
        }
        const parsed = JSON.parse(await temp.text()) as unknown;
        return { state: "ok", data: parseDownloadMetadata(parsed) };
      } catch (error) {
        firstError ??=
          error instanceof Error
            ? name + ": " + error.message
            : name + " could not be parsed.";
        console.warn("[downloader] could not read " + name, error);
      } finally {
        deleteIfPresent(temp);
      }
    }
    if (firstError) return { state: "invalid", reason: firstError };
    return { state: "missing" };
  } finally {
    deleteIfPresent(temp);
  }
}

/**
 * Atomically replaces metadata.json. A fully written temp document is renamed
 * into place; the previous file is kept as `.bak` until the rename succeeds.
 */
export async function writeDownloadMetadata(
  downloadsDirUri: string,
  data: DownloadMetadataFile,
): Promise<void> {
  const metadataDirUri = await ensureMetadataDirectory(downloadsDirUri);
  const payload = JSON.stringify(
    {
      ...data,
      version: DOWNLOAD_METADATA_VERSION,
      updatedAt: Date.now(),
    },
    null,
    2,
  );
  const tempLocal = scratchFile(`metadata-write-${Date.now()}.json`);
  let tempDocumentUri: string | null = null;
  let backupUri: string | null = null;
  try {
    tempLocal.create({ intermediates: true, overwrite: true });
    tempLocal.write(payload);
    tempDocumentUri = await writeFileToFolder(
      metadataDirUri,
      METADATA_TEMP_FILE,
      METADATA_MIME,
      tempLocal.uri,
    );
    if (!tempDocumentUri) {
      throw new DownloadMetadataError("Could not create the metadata temp file.");
    }

    const existing = await findSafChild(metadataDirUri, DOWNLOAD_METADATA_FILE);
    if (existing) {
      const staleBackup = await findSafChild(metadataDirUri, METADATA_BACKUP_FILE);
      if (staleBackup) await deleteSafArchive(staleBackup);
      backupUri = await renameSafDocument(existing, METADATA_BACKUP_FILE);
    }
    await renameSafDocument(tempDocumentUri, DOWNLOAD_METADATA_FILE);
    tempDocumentUri = null;
    if (backupUri) {
      await deleteSafArchive(backupUri);
      backupUri = null;
    }
  } catch (error) {
    // Restore the previous catalog if the replacement could not complete.
    if (backupUri) {
      try {
        await renameSafDocument(backupUri, DOWNLOAD_METADATA_FILE);
      } catch {
        // The backup is still on disk and is read by the recovery flow.
      }
    }
    throw new DownloadMetadataError(
      error instanceof Error
        ? `Could not update metadata.json: ${error.message}`
        : "Could not update metadata.json.",
      { cause: error },
    );
  } finally {
    deleteIfPresent(tempLocal);
    if (tempDocumentUri) {
      try {
        await deleteSafArchive(tempDocumentUri);
      } catch {
        // Best effort.
      }
    }
  }
}

export function metadataEntryFromDownload(input: {
  id: string;
  provider: string;
  providerMangaId: string;
  providerChapterId: string;
  mangaId: string;
  mangaTitle: string;
  chapterTitle: string;
  chapterIndex?: string | null;
  chapterNumber?: number | null;
  scanlationGroup?: string | null;
  chapterGroupKey?: string | null;
  languageCode?: string | null;
  pageCount: number;
  byteSize: number;
  fileName: string;
  completedAt: number;
}): DownloadMetadataEntry {
  const provider = providerSegment(input.provider);
  const manga = mangaSegment(input.mangaTitle, input.providerMangaId);
  // The downloader already produced a filesystem-safe name. Do not run it
  // through safeSegment again: that truncates long chapter file names and the
  // metadata entry would no longer point at the archive on disk.
  const fileName = input.fileName.replace(/[\\/]/g, "_");
  return {
    id: input.id,
    provider: input.provider,
    providerMangaId: input.providerMangaId,
    providerChapterId: input.providerChapterId,
    mangaId: input.mangaId,
    mangaTitle: input.mangaTitle,
    chapterTitle: input.chapterTitle,
    chapterIndex: input.chapterIndex ?? null,
    chapterNumber: input.chapterNumber ?? null,
    scanlationGroup: input.scanlationGroup ?? null,
    chapterGroupKey: input.chapterGroupKey ?? null,
    languageCode: input.languageCode ?? null,
    pageCount: input.pageCount,
    byteSize: input.byteSize,
    fileName,
    relativePath: provider + "/" + manga + "/" + fileName,
    mangaRelativePath: `${provider}/${manga}`,
    completedAt: input.completedAt,
  };
}

export function metadataEntryFromRow(row: Download): DownloadMetadataEntry | null {
  if (!row.fileUri || !row.fileName) return null;
  return metadataEntryFromDownload({
    id: row.id,
    provider: row.provider,
    providerMangaId: row.providerMangaId,
    providerChapterId: row.providerChapterId,
    mangaId: row.mangaId,
    mangaTitle: row.mangaTitle,
    chapterTitle: row.chapterTitle,
    chapterIndex: row.chapterIndex,
    chapterNumber: row.chapterNumber,
    scanlationGroup: row.scanlationGroup,
    chapterGroupKey: row.chapterGroupKey,
    languageCode: row.languageCode,
    pageCount: row.pageCount ?? row.downloadedPages,
    byteSize: row.byteSize ?? 0,
    fileName: row.fileName,
    completedAt: row.completedAt ?? row.updatedAt,
  });
}

async function readOrEmpty(
  downloadsDirUri: string,
): Promise<DownloadMetadataFile> {
  const result = await readDownloadMetadata(downloadsDirUri);
  if (result.state === "missing") {
    return { version: DOWNLOAD_METADATA_VERSION, updatedAt: Date.now(), chapters: [] };
  }
  if (result.state === "invalid") {
    throw new DownloadMetadataError(
      `metadata.json cannot be updated automatically: ${result.reason}`,
    );
  }
  return result.data;
}

/** Adds/replaces one chapter entry and writes the catalog atomically. */
export async function upsertDownloadMetadataEntry(
  downloadsDirUri: string,
  entry: DownloadMetadataEntry,
): Promise<void> {
  const data = await readOrEmpty(downloadsDirUri);
  const chapters = data.chapters.filter((item) => item.id !== entry.id);
  chapters.push(entry);
  chapters.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  await writeDownloadMetadata(downloadsDirUri, { ...data, chapters });
}

/** Removes chapter entries from the catalog (best effort at the call site). */
export async function removeDownloadMetadataEntries(
  downloadsDirUri: string,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  const data = await readOrEmpty(downloadsDirUri);
  const remove = new Set(ids);
  const chapters = data.chapters.filter((item) => !remove.has(item.id));
  if (chapters.length === data.chapters.length) return;
  await writeDownloadMetadata(downloadsDirUri, { ...data, chapters });
}

export async function removeDownloadMetadataEntry(
  downloadsDirUri: string,
  id: string,
): Promise<void> {
  await removeDownloadMetadataEntries(downloadsDirUri, [id]);
}

export interface ResolvedMetadataFile {
  fileUri: string;
  folderUri: string;
  fileName: string;
}

/**
 * Resolves an entry's relative path below the downloads root without ever
 * leaving that root. Returns null when any segment is missing or unsafe.
 */
export async function resolveMetadataEntryFile(
  downloadsDirUri: string,
  entry: DownloadMetadataEntry,
): Promise<ResolvedMetadataFile | null> {
  if (!isSafeRelativePath(entry.relativePath)) return null;
  if (!entry.relativePath.endsWith(`/${entry.fileName}`)) return null;
  const segments = entry.relativePath.split("/");
  let currentUri = downloadsDirUri;
  for (let index = 0; index < segments.length; index += 1) {
    const child = await findSafChild(currentUri, segments[index]);
    if (!child) return null;
    if (index === segments.length - 1) {
      return {
        fileUri: child,
        folderUri: currentUri,
        fileName: segments[index],
      };
    }
    currentUri = child;
  }
  return null;
}
