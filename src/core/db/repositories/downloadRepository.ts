/**
 * downloadRepository.ts
 * ---------------------------------------------------------------------------
 * Persistence for the chapter downloader: one row per downloaded chapter
 * archive (`downloads`). The user-picked storage root lives in core storage.
 *
 * The queue keeps its live state in memory (features/downloads/queue/scheduler.ts)
 * but every state change is mirrored here, so badges, offline reading and the
 * "Downloaded" strips survive an app restart.
 * ---------------------------------------------------------------------------
 */

import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "../client";
import { downloads } from "../schema";
import type { Download, NewDownload } from "../schema";

export type DownloadStatus =
  | "queued"
  | "running"
  | "paused"
  | "failed"
  | "completed";


export interface DownloadRecordInput {
  /** Canonical chapter id. */
  id: string;
  mangaId: string;
  provider: string;
  providerMangaId: string;
  providerChapterId: string;
  mangaTitle: string;
  thumbnailUrl?: string | null;
  thumbnailPath?: string | null;
  chapterTitle: string;
  chapterIndex?: string | null;
  chapterNumber?: number | null;
  scanlationGroup?: string | null;
  chapterGroupKey?: string | null;
  languageCode?: string | null;
  pageCount?: number | null;
}

/** Creates the row for a new job, or refreshes a failed/cancelled one. */
export async function queueDownload(input: DownloadRecordInput): Promise<void> {
  const now = Date.now();
  await db
    .insert(downloads)
    .values({
      id: input.id,
      mangaId: input.mangaId,
      provider: input.provider,
      providerMangaId: input.providerMangaId,
      providerChapterId: input.providerChapterId,
      mangaTitle: input.mangaTitle,
      thumbnailUrl: input.thumbnailUrl ?? null,
      thumbnailPath: input.thumbnailPath ?? null,
      chapterTitle: input.chapterTitle,
      chapterIndex: input.chapterIndex ?? null,
      chapterNumber: input.chapterNumber ?? null,
      scanlationGroup: input.scanlationGroup ?? null,
      chapterGroupKey: input.chapterGroupKey ?? null,
      languageCode: input.languageCode ?? null,
      pageCount: input.pageCount ?? null,
      downloadedPages: 0,
      byteSize: null,
      status: "queued",
      error: null,
      fileUri: null,
      fileName: null,
      folderUri: null,
      pagesDirUri: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    })
    .onConflictDoUpdate({
      target: downloads.id,
      set: {
        mangaTitle: input.mangaTitle,
        thumbnailUrl: input.thumbnailUrl ?? null,
        thumbnailPath: input.thumbnailPath ?? null,
        chapterTitle: input.chapterTitle,
        chapterIndex: input.chapterIndex ?? null,
        chapterNumber: input.chapterNumber ?? null,
        scanlationGroup: input.scanlationGroup ?? null,
        chapterGroupKey: input.chapterGroupKey ?? null,
        languageCode: input.languageCode ?? null,
        pageCount: input.pageCount ?? null,
        downloadedPages: 0,
        byteSize: null,
        status: "queued",
        error: null,
        fileUri: null,
        fileName: null,
        folderUri: null,
        pagesDirUri: null,
        updatedAt: now,
        completedAt: null,
      },
    });
}

/** Applies a partial state update to one job. */
export async function updateDownload(
  id: string,
  patch: Partial<NewDownload>,
): Promise<void> {
  await db
    .update(downloads)
    .set({ ...patch, updatedAt: Date.now() })
    .where(eq(downloads.id, id));
}

export async function getDownload(id: string): Promise<Download | null> {
  const rows = await db
    .select()
    .from(downloads)
    .where(eq(downloads.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Newest download for a provider chapter identity, regardless of how the
 * canonical manga id was built. The reader uses this so a downloaded chapter
 * opens its local pages even when the id rebuilt from the route param does not
 * match the id recorded at download time (URL-based providers re-encode).
 */
export async function getDownloadByProviderChapter(
  provider: string,
  providerChapterId: string,
): Promise<Download | null> {
  const rows = await db
    .select()
    .from(downloads)
    .where(
      and(
        eq(downloads.provider, provider),
        eq(downloads.providerChapterId, providerChapterId),
      ),
    )
    .orderBy(desc(downloads.updatedAt))
    .limit(1);
  return rows[0] ?? null;
}

export async function listDownloads(): Promise<Download[]> {
  return db.select().from(downloads).orderBy(desc(downloads.updatedAt));
}

/** Every job (any status) for one provider manga, newest first. */
export async function listDownloadsForManga(
  mangaId: string,
): Promise<Download[]> {
  return db
    .select()
    .from(downloads)
    .where(eq(downloads.mangaId, mangaId))
    .orderBy(desc(downloads.updatedAt));
}

export async function listDownloadsForChapterIds(
  ids: string[],
): Promise<Download[]> {
  if (ids.length === 0) return [];
  return db.select().from(downloads).where(inArray(downloads.id, ids));
}

/** Status map keyed by canonical chapter id, used by the viewer badges. */
export async function getDownloadStatusMap(
  ids: string[],
): Promise<Record<string, DownloadStatus>> {
  const rows = await listDownloadsForChapterIds(ids);
  const map: Record<string, DownloadStatus> = {};
  for (const row of rows) {
    map[row.id] = row.status as DownloadStatus;
  }
  return map;
}

export interface DownloadedMangaSummary {
  mangaId: string;
  provider: string;
  providerMangaId: string;
  title: string;
  thumbnailUrl: string | null;
  thumbnailPath: string | null;
  chapterCount: number;
  /** Total archive size in bytes. */
  byteSize: number;
  updatedAt: number;
}

/**
 * One entry per manga that has at least one downloaded chapter, for the
 * offline "Downloaded" strips on the provider main screens.
 */
export async function listDownloadedManga(
  provider?: string,
): Promise<DownloadedMangaSummary[]> {
  const rows = await db
    .select({
      mangaId: downloads.mangaId,
      provider: downloads.provider,
      providerMangaId: downloads.providerMangaId,
      title: downloads.mangaTitle,
      thumbnailUrl: sql<string | null>`max(${downloads.thumbnailUrl})`,
      thumbnailPath: sql<string | null>`max(${downloads.thumbnailPath})`,
      chapterCount: sql<number>`count(*)`,
      byteSize: sql<number>`coalesce(sum(${downloads.byteSize}), 0)`,
      updatedAt: sql<number>`max(${downloads.updatedAt})`,
    })
    .from(downloads)
    .where(
      provider
        ? and(
            eq(downloads.provider, provider),
            eq(downloads.status, "completed"),
          )
        : eq(downloads.status, "completed"),
    )
    .groupBy(
      downloads.mangaId,
      downloads.provider,
      downloads.providerMangaId,
      downloads.mangaTitle,
    )
    .orderBy(desc(sql`max(${downloads.updatedAt})`));
  return rows;
}

export async function deleteDownload(id: string): Promise<void> {
  await db.delete(downloads).where(eq(downloads.id, id));
}

/**
 * Restores a completed download discovered by the metadata recovery flow.
 * Unlike queueDownload this keeps the completed state and archive identity.
 */
export async function importCompletedDownload(input: {
  id: string;
  mangaId: string;
  provider: string;
  providerMangaId: string;
  providerChapterId: string;
  mangaTitle: string;
  chapterTitle: string;
  chapterIndex?: string | null;
  chapterNumber?: number | null;
  scanlationGroup?: string | null;
  chapterGroupKey?: string | null;
  languageCode?: string | null;
  pageCount: number;
  byteSize: number;
  fileUri: string;
  fileName: string;
  folderUri: string;
  completedAt: number;
}): Promise<void> {
  const now = Date.now();
  await db
    .insert(downloads)
    .values({
      id: input.id,
      mangaId: input.mangaId,
      provider: input.provider,
      providerMangaId: input.providerMangaId,
      providerChapterId: input.providerChapterId,
      mangaTitle: input.mangaTitle,
      thumbnailUrl: null,
      thumbnailPath: null,
      chapterTitle: input.chapterTitle,
      chapterIndex: input.chapterIndex ?? null,
      chapterNumber: input.chapterNumber ?? null,
      scanlationGroup: input.scanlationGroup ?? null,
      chapterGroupKey: input.chapterGroupKey ?? null,
      languageCode: input.languageCode ?? null,
      pageCount: input.pageCount,
      downloadedPages: input.pageCount,
      byteSize: input.byteSize,
      status: "completed",
      error: null,
      fileUri: input.fileUri,
      fileName: input.fileName,
      folderUri: input.folderUri,
      pagesDirUri: null,
      createdAt: now,
      updatedAt: now,
      completedAt: input.completedAt,
    })
    .onConflictDoUpdate({
      target: downloads.id,
      set: {
        mangaId: input.mangaId,
        provider: input.provider,
        providerMangaId: input.providerMangaId,
        providerChapterId: input.providerChapterId,
        mangaTitle: input.mangaTitle,
        chapterTitle: input.chapterTitle,
        chapterIndex: input.chapterIndex ?? null,
        chapterNumber: input.chapterNumber ?? null,
        scanlationGroup: input.scanlationGroup ?? null,
        chapterGroupKey: input.chapterGroupKey ?? null,
        languageCode: input.languageCode ?? null,
        pageCount: input.pageCount,
        downloadedPages: input.pageCount,
        byteSize: input.byteSize,
        status: "completed",
        error: null,
        fileUri: input.fileUri,
        fileName: input.fileName,
        folderUri: input.folderUri,
        updatedAt: now,
        completedAt: input.completedAt,
      },
    });
}

/** Removes every row of one manga (used by "delete all" in the download manager). */
export async function deleteDownloadsForManga(mangaId: string): Promise<void> {
  await db.delete(downloads).where(eq(downloads.mangaId, mangaId));
}

/** Total bytes stored by finished downloads (optionally for one manga). */
export async function sumDownloadedBytes(mangaId?: string): Promise<number> {
  const rows = await db
    .select({
      total: sql<number>`coalesce(sum(${downloads.byteSize}), 0)`,
    })
    .from(downloads)
    .where(
      mangaId
        ? and(
            eq(downloads.status, "completed"),
            eq(downloads.mangaId, mangaId),
          )
        : eq(downloads.status, "completed"),
    );
  return rows[0]?.total ?? 0;
}

/** Drops jobs that can no longer be resumed (used when the folder is lost). */
export async function resetInterruptedDownloads(): Promise<void> {
  await db
    .update(downloads)
    .set({ status: "paused", updatedAt: Date.now() })
    .where(eq(downloads.status, "running"));
}
