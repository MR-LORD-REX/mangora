/**
 * Persistence for materialised reader chapters. The files remain the content
 * authority; this repository only records where a validated copy lives and
 * when it was last used for LRU eviction.
 */

import { asc, eq } from "drizzle-orm";

import { db } from "../client";
import {
  readerCacheChapters,
  type NewReaderCacheChapter,
  type ReaderCacheChapter,
} from "../schema";

export async function upsertReaderCacheChapter(
  input: NewReaderCacheChapter,
): Promise<ReaderCacheChapter> {
  const now = Date.now();
  await db
    .insert(readerCacheChapters)
    .values({ ...input, createdAt: input.createdAt ?? now, updatedAt: now })
    .onConflictDoUpdate({
      target: readerCacheChapters.id,
      set: {
        source: input.source,
        providerMangaId: input.providerMangaId,
        providerChapterId: input.providerChapterId,
        mangaId: input.mangaId,
        chapterId: input.chapterId,
        mangaTitle: input.mangaTitle ?? null,
        chapterTitle: input.chapterTitle ?? null,
        mangaKey: input.mangaKey,
        chapterKey: input.chapterKey,
        directoryUri: input.directoryUri,
        pageCount: input.pageCount,
        byteSize: input.byteSize,
        complete: input.complete,
        lastAccessedAt: input.lastAccessedAt,
        updatedAt: now,
      },
    });
  const rows = await db
    .select()
    .from(readerCacheChapters)
    .where(eq(readerCacheChapters.id, input.id))
    .limit(1);
  return rows[0]!;
}

export async function getReaderCacheChapter(
  id: string,
): Promise<ReaderCacheChapter | null> {
  const rows = await db
    .select()
    .from(readerCacheChapters)
    .where(eq(readerCacheChapters.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/** Oldest access first, so callers can evict from the front. */
export async function listReaderCacheChapters(): Promise<ReaderCacheChapter[]> {
  return db
    .select()
    .from(readerCacheChapters)
    .orderBy(asc(readerCacheChapters.lastAccessedAt));
}

export async function touchReaderCacheChapter(id: string): Promise<void> {
  const now = Date.now();
  await db
    .update(readerCacheChapters)
    .set({ lastAccessedAt: now, updatedAt: now })
    .where(eq(readerCacheChapters.id, id));
}

export async function markReaderCacheComplete(
  id: string,
  input: { pageCount: number; byteSize: number; directoryUri: string },
): Promise<void> {
  const now = Date.now();
  await db
    .update(readerCacheChapters)
    .set({
      pageCount: input.pageCount,
      byteSize: input.byteSize,
      directoryUri: input.directoryUri,
      complete: true,
      lastAccessedAt: now,
      updatedAt: now,
    })
    .where(eq(readerCacheChapters.id, id));
}

export async function deleteReaderCacheChapter(id: string): Promise<void> {
  await db.delete(readerCacheChapters).where(eq(readerCacheChapters.id, id));
}

export async function clearReaderCacheChapters(): Promise<number> {
  const rows = await db.select({ id: readerCacheChapters.id }).from(readerCacheChapters);
  await db.delete(readerCacheChapters);
  return rows.length;
}

