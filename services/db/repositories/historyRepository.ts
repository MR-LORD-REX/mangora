import { desc, eq, like, or } from "drizzle-orm";

import { db } from "../client";
import { chapters, manga, readingHistory } from "../schema";
import type { ProviderId } from "./catalogRepository";

export interface ReaderParamsSnapshot {
  id: string;
  source: ProviderId;
  mangaId?: string;
  title?: string;
  mangaTitle?: string;
  chapterTitle?: string;
  chapterNumber?: number;
  thumbnailUrl?: string;
  language?: string;
}

export interface HistoryOpenInput {
  mangaId: string;
  chapterId?: string | null;
  provider: string;
  title: string;
  thumbnailUrl?: string | null;
  readerParams: ReaderParamsSnapshot;
  pageIndex?: number;
}

export async function recordHistoryOpen(input: HistoryOpenInput): Promise<void> {
  const now = Date.now();
  const historyId = input.chapterId ?? `${input.provider}:${input.mangaId}`;
  await db
    .insert(readingHistory)
    .values({
      id: historyId,
      mangaId: input.mangaId,
      chapterId: input.chapterId ?? null,
      provider: input.provider,
      titleSnapshot: input.title,
      thumbnailSnapshot: input.thumbnailUrl ?? null,
      readerParamsJson: JSON.stringify(input.readerParams),
      openedAt: now,
      lastPageIndex: Math.max(0, Math.floor(input.pageIndex ?? 0)),
    })
    .onConflictDoUpdate({
      target: readingHistory.id,
      set: {
        titleSnapshot: input.title,
        thumbnailSnapshot: input.thumbnailUrl ?? null,
        readerParamsJson: JSON.stringify(input.readerParams),
        openedAt: now,
        lastPageIndex: Math.max(0, Math.floor(input.pageIndex ?? 0)),
      },
    });
}

export async function updateHistoryPage(
  historyId: string,
  pageIndex: number,
): Promise<void> {
  await db
    .update(readingHistory)
    .set({ lastPageIndex: Math.max(0, Math.floor(pageIndex)) })
    .where(eq(readingHistory.id, historyId));
}

export async function listHistory(search?: string) {
  const query = search?.trim();
  return db
    .select({
      id: readingHistory.id,
      mangaId: readingHistory.mangaId,
      chapterId: readingHistory.chapterId,
      provider: readingHistory.provider,
      titleSnapshot: readingHistory.titleSnapshot,
      thumbnailSnapshot: readingHistory.thumbnailSnapshot,
      readerParamsJson: readingHistory.readerParamsJson,
      openedAt: readingHistory.openedAt,
      lastPageIndex: readingHistory.lastPageIndex,
      chapterTitle: chapters.title,
      chapterNumber: chapters.chapterNumber,
      mangaTitle: manga.title,
    })
    .from(readingHistory)
    .innerJoin(manga, eq(readingHistory.mangaId, manga.id))
    .leftJoin(chapters, eq(readingHistory.chapterId, chapters.id))
    .where(
      query
        ? or(
            like(manga.title, `%${query}%`),
            like(readingHistory.titleSnapshot, `%${query}%`),
          )
        : undefined,
    )
    .orderBy(desc(readingHistory.openedAt));
}

export async function deleteHistoryEntry(id: string): Promise<void> {
  await db.delete(readingHistory).where(eq(readingHistory.id, id));
}

export async function clearHistory(): Promise<void> {
  try {
    await db.delete(readingHistory);
    console.log("Cleared history");
  } catch(error) {
    console.warn("Failed to clear history:", error);
  }
}