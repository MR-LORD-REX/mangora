import { and, eq } from "drizzle-orm";

import { db } from "../client";
import { chapters, manga } from "../schema";
import type { Manga } from "../schema";

/**
 * Extension sources are namespaced by their 64-bit source id. Legacy
 * hand-written provider ids can still exist in old database rows; they are
 * treated as inert records and have no adapter.
 */
export type ProviderId = `ext:${string}` | (string & {});

export interface TrackedMangaInput {
  provider: ProviderId;
  providerMangaId: string;
  title: string;
  thumbnailUrl?: string | null;
  description?: string | null;
}

export interface TrackedChapterInput {
  mangaId: string;
  providerChapterId: string;
  title: string;
  chapterNumber?: number | null;
  /** Scanlation group / scanlator name for this upload. */
  scanlationGroup?: string | null;
  /** Stable key of the "main chapter" this upload belongs to ("45", "45.5", "Oneshot"...). */
  chapterGroupKey?: string | null;
  volume?: string | null;
  languageCode?: string | null;
  pageCount?: number | null;
  publishedAt?: number | null;
}

export const canonicalId = (provider: string, externalId: string) =>
  `${provider}:${externalId}`;

export async function upsertManga(input: TrackedMangaInput): Promise<string> {
  const id = canonicalId(input.provider, input.providerMangaId);
  const now = Date.now();
  await db
    .insert(manga)
    .values({
      id,
      provider: input.provider,
      providerMangaId: input.providerMangaId,
      title: input.title,
      thumbnailUrl: input.thumbnailUrl ?? null,
      description: input.description ?? null,
      addedAt: now,
      lastSyncedAt: now,
      lastSyncError: null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [manga.provider, manga.providerMangaId],
      set: {
        title: input.title,
        thumbnailUrl: input.thumbnailUrl ?? null,
        description: input.description ?? null,
        lastSyncedAt: now,
        lastSyncError: null,
        updatedAt: now,
      },
    });
  return id;
}

export async function markMangaSyncError(
  provider: ProviderId,
  providerMangaId: string,
  error: unknown,
): Promise<void> {
  await db
    .update(manga)
    .set({
      lastSyncError: error instanceof Error ? error.message : String(error),
      updatedAt: Date.now(),
    })
    .where(
      and(
        eq(manga.provider, provider),
        eq(manga.providerMangaId, providerMangaId),
      ),
    );
}

export async function upsertChapter(input: TrackedChapterInput): Promise<string> {
  const id = canonicalId(input.mangaId, input.providerChapterId);
  const now = Date.now();
  await db
    .insert(chapters)
    .values({
      id,
      mangaId: input.mangaId,
      providerChapterId: input.providerChapterId,
      title: input.title,
      chapterNumber: input.chapterNumber ?? null,
      scanlationGroup: input.scanlationGroup ?? null,
      chapterGroupKey: input.chapterGroupKey ?? null,
      volume: input.volume ?? null,
      languageCode: input.languageCode ?? null,
      pageCount: input.pageCount ?? null,
      publishedAt: input.publishedAt ?? null,
      lastSyncedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [chapters.mangaId, chapters.providerChapterId],
      set: {
        title: input.title,
        chapterNumber: input.chapterNumber ?? null,
        scanlationGroup: input.scanlationGroup ?? null,
        chapterGroupKey: input.chapterGroupKey ?? null,
        volume: input.volume ?? null,
        languageCode: input.languageCode ?? null,
        pageCount: input.pageCount ?? null,
        publishedAt: input.publishedAt ?? null,
        lastSyncedAt: now,
        updatedAt: now,
      },
    });
  return id;
}

export async function updateChapterPageCount(
  chapterId: string,
  pageCount: number,
): Promise<void> {
  await db
    .update(chapters)
    .set({ pageCount, lastSyncedAt: Date.now(), updatedAt: Date.now() })
    .where(eq(chapters.id, chapterId));
}

export interface ChapterDownloadInfo {
  title: string;
  chapterNumber: number | null;
  scanlationGroup: string | null;
  chapterGroupKey: string | null;
  languageCode: string | null;
  pageCount: number | null;
}

/**
 * Stored metadata for one chapter, used to give the downloader the real
 * chapter index, scanlation group and language instead of guessing them from
 * the reader title. Returns null when the chapter was never catalogued.
 */
export async function getChapterDownloadInfo(
  chapterId: string,
): Promise<ChapterDownloadInfo | null> {
  const rows = await db
    .select({
      title: chapters.title,
      chapterNumber: chapters.chapterNumber,
      scanlationGroup: chapters.scanlationGroup,
      chapterGroupKey: chapters.chapterGroupKey,
      languageCode: chapters.languageCode,
      pageCount: chapters.pageCount,
    })
    .from(chapters)
    .where(eq(chapters.id, chapterId))
    .limit(1);
  return rows[0] ?? null;
}

/** The stored catalog row for one provider manga (null when unknown). */
export async function getMangaCatalogRow(
  provider: string,
  providerMangaId: string,
): Promise<Manga | null> {
  const rows = await db
    .select()
    .from(manga)
    .where(
      and(
        eq(manga.provider, provider),
        eq(manga.providerMangaId, providerMangaId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}