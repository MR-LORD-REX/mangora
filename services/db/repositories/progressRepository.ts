import { and, eq } from "drizzle-orm";

import { db } from "../client";
import { chapters, readingProgress } from "../schema";

export type ProgressStatus = "unread" | "reading" | "completed";

export interface ProgressUpdate {
  pageIndex: number;
  pageCount?: number | null;
  status?: ProgressStatus;
}

function clampPageIndex(pageIndex: number, pageCount?: number | null): number {
  const value = Number.isFinite(pageIndex) ? Math.floor(pageIndex) : 0;
  if (!pageCount || pageCount < 1) return Math.max(0, value);
  return Math.min(pageCount - 1, Math.max(0, value));
}

export async function getProgress(chapterId: string) {
  const rows = await db
    .select()
    .from(readingProgress)
    .where(eq(readingProgress.chapterId, chapterId));
  return rows[0] ?? null;
}

export async function updateProgress(
  chapterId: string,
  update: ProgressUpdate,
): Promise<void> {
  const now = Date.now();
  const pageCount = update.pageCount ?? null;
  const pageIndex = clampPageIndex(update.pageIndex, pageCount);
  const status = update.status ?? (pageCount && pageIndex >= pageCount - 1 ? "completed" : "reading");

  await db
    .insert(readingProgress)
    .values({
      chapterId,
      status,
      lastPageIndex: pageIndex,
      lastPageCount: pageCount,
      startedAt: now,
      lastReadAt: now,
      completedAt: status === "completed" ? now : null,
    })
    .onConflictDoUpdate({
      target: readingProgress.chapterId,
      set: {
        status,
        lastPageIndex: pageIndex,
        lastPageCount: pageCount,
        lastReadAt: now,
        completedAt: status === "completed" ? now : null,
      },
    });
}

export async function markChapterCompleted(chapterId: string): Promise<void> {
  const now = Date.now();
  await db
    .update(readingProgress)
    .set({ status: "completed", completedAt: now, lastReadAt: now })
    .where(eq(readingProgress.chapterId, chapterId));
}

export async function getChapterPageCount(chapterId: string): Promise<number | null> {
  const rows = await db
    .select({ pageCount: chapters.pageCount })
    .from(chapters)
    .where(eq(chapters.id, chapterId));
  return rows[0]?.pageCount ?? null;
}

/**
 * Resolves a chapter row's manga + main-chapter identity. Used to propagate
 * "completed" to every scanlation-group upload of the same main chapter.
 */
export async function getChapterGroupContext(chapterId: string): Promise<{
  mangaId: string;
  chapterGroupKey: string | null;
  chapterNumber: number | null;
} | null> {
  const rows = await db
    .select({
      mangaId: chapters.mangaId,
      chapterGroupKey: chapters.chapterGroupKey,
      chapterNumber: chapters.chapterNumber,
    })
    .from(chapters)
    .where(eq(chapters.id, chapterId))
    .limit(1);
  return rows[0] ?? null;
}

/** Marks every stored upload of the same main chapter (same manga + group
 *  key / chapter number) as completed. */
export async function markChapterGroupCompleted(chapterId: string): Promise<void> {
  const context = await getChapterGroupContext(chapterId);
  if (!context) return;
  const conditions = [eq(chapters.mangaId, context.mangaId)];
  if (context.chapterGroupKey) {
    conditions.push(eq(chapters.chapterGroupKey, context.chapterGroupKey));
  } else if (context.chapterNumber != null) {
    conditions.push(eq(chapters.chapterNumber, context.chapterNumber));
  } else {
    return;
  }
  const rows = await db
    .select({ id: chapters.id })
    .from(chapters)
    .where(and(...conditions));
  if (!rows.length) return;
  await setChaptersReadState(rows.map((row) => row.id), true);
}

/** Upserts read state for a set of persisted chapter ids. */
export async function setChaptersReadState(
  chapterIds: string[],
  completed: boolean,
): Promise<void> {
  const unique = Array.from(new Set(chapterIds));
  if (!unique.length) return;
  const now = Date.now();
  const update = completed
    ? { status: "completed" as ProgressStatus, completedAt: now, lastReadAt: now }
    : {
        status: "unread" as ProgressStatus,
        completedAt: null,
        lastReadAt: null,
        lastPageIndex: 0,
      };
  const valuesFor = (chunk: string[]) =>
    chunk.map((chapterId) => ({
      chapterId,
      status: (completed ? "completed" : "unread") as ProgressStatus,
      lastPageIndex: 0,
      lastPageCount: null,
      startedAt: now,
      lastReadAt: completed ? now : null,
      completedAt: completed ? now : null,
    }));
  // Chunked so very large series (mark-all-read) stay under SQLite's
  // per-statement parameter limit.
  for (let index = 0; index < unique.length; index += 200) {
    const chunk = unique.slice(index, index + 200);
    await db
      .insert(readingProgress)
      .values(valuesFor(chunk))
      .onConflictDoUpdate({
        target: readingProgress.chapterId,
        set: update,
      });
  }
}
