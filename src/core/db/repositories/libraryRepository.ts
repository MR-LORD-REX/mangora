import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "../client";
import {
    chapters,
    libraries,
    libraryManga,
    manga,
    readingProgress,
} from "../schema";

export type LibrarySort =
  | "addedAsc"
  | "addedDesc"
  | "readAsc"
  | "readDesc"
  | "provider";

export interface LibraryCard {
  id: string;
  provider: string;
  providerMangaId: string;
  title: string;
  thumbnailUrl: string | null;
  addedAt: number;
  totalChapters: number;
  unreadChapters: number;
}

export interface LibrarySummary {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export const DEFAULT_LIBRARY_ID = "default";
export const DOWNLOADS_LIBRARY_ID = "downloads";
const SYSTEM_LIBRARY_IDS = new Set<string>([DEFAULT_LIBRARY_ID, DOWNLOADS_LIBRARY_ID]);

/** True for the built-in libraries that cannot be renamed or deleted. */
export function isSystemLibrary(id: string): boolean {
  return SYSTEM_LIBRARY_IDS.has(id);
}

const newId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export async function listLibraries(): Promise<LibrarySummary[]> {
  return db
    .select({
      id: libraries.id,
      name: libraries.name,
      createdAt: libraries.createdAt,
      updatedAt: libraries.updatedAt,
    })
    .from(libraries)
    .orderBy(asc(libraries.createdAt));
}

export async function createLibrary(name: string): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Library name cannot be empty.");

  const id = newId("library");
  const now = Date.now();
  await db.insert(libraries).values({
    id,
    name: trimmed,
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

export async function renameLibrary(id: string, name: string): Promise<void> {
  if (isSystemLibrary(id)) {
    throw new Error("This library cannot be renamed.");
  }
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Library name cannot be empty.");
  await db
    .update(libraries)
    .set({ name: trimmed, updatedAt: Date.now() })
    .where(eq(libraries.id, id));
}

export async function deleteLibrary(id: string): Promise<void> {
  if (isSystemLibrary(id)) {
    throw new Error("This library cannot be deleted.");
  }
  await db.delete(libraries).where(eq(libraries.id, id));
}

export async function addMangaToLibrary(
  libraryId: string,
  mangaId: string,
): Promise<void> {
  await db
    .insert(libraryManga)
    .values({ libraryId, mangaId, addedAt: Date.now(), pinned: false })
    .onConflictDoNothing();
}

export async function removeMangaFromLibrary(
  libraryId: string,
  mangaId: string,
): Promise<void> {
  await db
    .delete(libraryManga)
    .where(
      and(
        eq(libraryManga.libraryId, libraryId),
        eq(libraryManga.mangaId, mangaId),
      ),
    );
}

export async function removeMangaIdentitiesFromLibrary(
  libraryId: string,
  provider: string,
  providerMangaIds: string[],
): Promise<void> {
  if (!providerMangaIds.length) return;
  await db
    .delete(libraryManga)
    .where(
      and(
        eq(libraryManga.libraryId, libraryId),
        sql`${libraryManga.mangaId} in (select ${manga.id} from ${manga} where ${manga.provider} = ${provider} and ${inArray(manga.providerMangaId, providerMangaIds)})`,
      ),
    );
}

export async function listLibraryCards(
  libraryId: string,
  options: { search?: string; provider?: string; sort?: LibrarySort } = {},
): Promise<LibraryCard[]> {
  const search = options.search?.trim();
  const conditions = [eq(libraryManga.libraryId, libraryId)];
  if (search) conditions.push(sql`lower(${manga.title}) like ${`%${search.toLowerCase()}%`}`);
  if (options.provider) conditions.push(eq(manga.provider, options.provider));

  // Group uploads of the same "main chapter" (same scanlation-group key /
  // chapter number) into one row so duplicate group uploads don't inflate the
  // library counts. An upload without a stored key falls back to its chapter
  // number, then to its own id (oneshots without a number).
  const mainKeyExpr = sql`coalesce(${chapters.chapterGroupKey}, cast(${chapters.chapterNumber} as text), ${chapters.id})`;
  const chapterStats = db
    .select({
      mangaId: chapters.mangaId,
      mainKey: mainKeyExpr.as("main_key"),
      hasCompleted: sql<number>`max(case when ${readingProgress.status} = 'completed' then 1 else 0 end)`.as("has_completed"),
    })
    .from(chapters)
    .leftJoin(readingProgress, eq(readingProgress.chapterId, chapters.id))
    .groupBy(chapters.mangaId, mainKeyExpr)
    .as("chapter_stats");

  const totalCount = sql<number>`count(${chapterStats.mainKey})`;
  const unreadCount = sql<number>`sum(case when coalesce(${chapterStats.hasCompleted}, 0) = 0 then 1 else 0 end)`;
  const rows = await db
    .select({
      id: manga.id,
      provider: manga.provider,
      providerMangaId: manga.providerMangaId,
      title: manga.title,
      thumbnailUrl: manga.thumbnailUrl,
      addedAt: libraryManga.addedAt,
      totalChapters: totalCount,
      unreadChapters: unreadCount,
    })
    .from(libraryManga)
    .innerJoin(manga, eq(libraryManga.mangaId, manga.id))
    .leftJoin(chapterStats, eq(chapterStats.mangaId, manga.id))
    .where(and(...conditions))
    .groupBy(libraryManga.libraryId, libraryManga.mangaId, manga.id)
    .orderBy(
      options.sort === "addedAsc"
        ? asc(libraryManga.addedAt)
        : options.sort === "readAsc"
          ? asc(unreadCount)
          : options.sort === "readDesc"
            ? desc(unreadCount)
            : options.sort === "provider"
              ? asc(manga.provider)
              : desc(libraryManga.addedAt),
    );

  return rows.map((row) => ({
    ...row,
    totalChapters: Number(row.totalChapters ?? 0),
    unreadChapters: Number(row.unreadChapters ?? 0),
  }));
}

/** True when a manga (by any identity variant) lives in at least one library. */
export async function isMangaInAnyLibrary(
  provider: string,
  providerMangaIds: string[],
): Promise<boolean> {
  if (!providerMangaIds.length) return false;
  const rows = await db
    .select({ id: libraryManga.libraryId })
    .from(libraryManga)
    .innerJoin(manga, eq(libraryManga.mangaId, manga.id))
    .where(
      and(
        eq(manga.provider, provider),
        inArray(manga.providerMangaId, providerMangaIds),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function getMangaLibraryIds(
  provider: string,
  providerMangaIds: string[],
): Promise<Set<string>> {
  if (!providerMangaIds.length) return new Set();
  const rows = await db
    .select({ libraryId: libraryManga.libraryId })
    .from(libraryManga)
    .innerJoin(manga, eq(libraryManga.mangaId, manga.id))
    .where(
      and(
        eq(manga.provider, provider),
        inArray(manga.providerMangaId, providerMangaIds),
      ),
    );
  return new Set(rows.map((row) => row.libraryId));
}
