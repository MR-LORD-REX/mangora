import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/services/db/client";
import {
    chapters,
    libraryManga,
    manga,
    readingProgress,
} from "@/services/db/schema";
import { trySyncProviderManga } from "./catalogSync";
import type { ProviderId } from "./providerAdapters";

const MAX_CONCURRENT_SYNCS = 3;

async function runWithLimit<T>(items: T[], worker: (item: T) => Promise<void>): Promise<void> {
  let nextIndex = 0;
  const workers = Array.from(
    { length: Math.min(MAX_CONCURRENT_SYNCS, items.length) },
    async () => {
      while (nextIndex < items.length) {
        const item = items[nextIndex];
        nextIndex += 1;
        await worker(item);
      }
    },
  );
  await Promise.all(workers);
}

export interface TrackedIdentity {
  provider: ProviderId;
  providerMangaId: string;
}

export async function listTrackedManga(
  libraryId?: string,
): Promise<TrackedIdentity[]> {
  const base = db
    .select({ provider: manga.provider, providerMangaId: manga.providerMangaId })
    .from(libraryManga)
    .innerJoin(manga, eq(libraryManga.mangaId, manga.id));

  const rows = libraryId
    ? await base.where(eq(libraryManga.libraryId, libraryId))
    : await base;

  return rows.map((row) => ({
    provider: row.provider as ProviderId,
    providerMangaId: row.providerMangaId,
  }));
}

export async function syncLibrary(libraryId: string): Promise<void> {
  const tracked = await listTrackedManga(libraryId);

  await runWithLimit(tracked, async (item) => {
    await trySyncProviderManga(item.provider, item.providerMangaId);
  });
}

/** Refresh every manga that lives in any library. Used once on app start. */
export async function syncAllLibraries(): Promise<void> {
  const tracked = await listTrackedManga();

  await runWithLimit(tracked, async (item) => {
    await trySyncProviderManga(item.provider, item.providerMangaId);
  });
}

export interface TrackedChapterProgress {
  status: "unread" | "reading" | "completed";
  lastPageIndex: number;
  lastPageCount: number | null;
}

export interface TrackedProgressLookup {
  provider: ProviderId;
  providerMangaIds: string[];
  /** Optional transform applied to stored chapter ids so detail screens can
   *  look progress up by the id they pass to the reader (e.g. encoded urls). */
  toChapterKey?: (providerChapterId: string) => string;
}

/**
 * Returns reading progress for tracked manga chapters keyed by the chapter id
 * that a detail screen would hand to the reader. Detail screens should query
 * with every identity variant a manga may be stored under (library adds use raw
 * urls while direct reads may have stored the encoded form).
 */
export async function getTrackedChapterProgress({
  provider,
  providerMangaIds,
  toChapterKey,
}: TrackedProgressLookup): Promise<Record<string, TrackedChapterProgress>> {
  if (!providerMangaIds.length) return {};

  const rows = await db
    .select({
      providerChapterId: chapters.providerChapterId,
      status: readingProgress.status,
      lastPageIndex: readingProgress.lastPageIndex,
      lastPageCount: readingProgress.lastPageCount,
    })
    .from(chapters)
    .innerJoin(manga, eq(chapters.mangaId, manga.id))
    .innerJoin(readingProgress, eq(readingProgress.chapterId, chapters.id))
    .where(
      and(
        eq(manga.provider, provider),
        inArray(manga.providerMangaId, providerMangaIds),
      ),
    );

  const map: Record<string, TrackedChapterProgress> = {};
  for (const row of rows) {
    const progress = {
      status: row.status as TrackedChapterProgress["status"],
      lastPageIndex: row.lastPageIndex,
      lastPageCount: row.lastPageCount,
    };
    // Store both the stored id and its reader-facing alias. Rows can be
    // saved raw (library sync) or already encoded (reader opens), so detail
    // screens should be able to look progress up either way.
    map[row.providerChapterId] = progress;
    const alias = toChapterKey ? toChapterKey(row.providerChapterId) : null;
    if (alias && alias !== row.providerChapterId) map[alias] = progress;
  }
  return map;
}
