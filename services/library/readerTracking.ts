import {
    upsertChapter,
    upsertManga,
    type ProviderId,
    type TrackedChapterInput,
} from "@/services/db/repositories/catalogRepository";
import { setChaptersReadState } from "@/services/db/repositories/progressRepository";
import {
    recordHistoryOpen,
    type ReaderParamsSnapshot,
} from "@/services/db/repositories/historyRepository";

export interface ReaderOpenInput {
  provider: ProviderId;
  providerMangaId: string;
  providerChapterId: string;
  mangaTitle: string;
  chapterTitle: string;
  chapterNumber?: number | null;
  /** Scanlation group / scanlator name for the opened upload. */
  scanlationGroup?: string | null;
  /** Main-chapter key ("45", "45.5", "Oneshot"...) shared by group uploads. */
  chapterGroupKey?: string | null;
  thumbnailUrl?: string | null;
  languageCode?: string | null;
  readerParams: ReaderParamsSnapshot;
}
function chapterNumberFromTitle(title: string): number | null {
  const match = title.match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const value = Number(match[0]);
  return Number.isFinite(value) ? value : null;
}

/** Persists the complete reading identity before navigating to the reader. */
export async function prepareReaderOpen(input: ReaderOpenInput): Promise<{
  mangaId: string;
  chapterId: string;
}> {
  const mangaId = await upsertManga({
    provider: input.provider,
    providerMangaId: input.providerMangaId,
    title: input.mangaTitle,
    thumbnailUrl: input.thumbnailUrl ?? null,
  });
  const chapterId = await upsertChapter({
    mangaId,
    providerChapterId: input.providerChapterId,
    title: input.chapterTitle,
    chapterNumber: input.chapterNumber ?? chapterNumberFromTitle(input.chapterTitle),
    scanlationGroup: input.scanlationGroup ?? null,
    chapterGroupKey: input.chapterGroupKey ?? null,
    languageCode: input.languageCode ?? null,
  });
  await recordHistoryOpen({
    mangaId,
    chapterId,
    provider: input.provider,
    title: input.chapterTitle,
    thumbnailUrl: input.thumbnailUrl ?? null,
    readerParams: input.readerParams,
    pageIndex: 0,
  });
  return { mangaId, chapterId };
}

export interface ChapterReadWriteInput {
  provider: ProviderId;
  providerMangaId: string;
  mangaTitle: string;
  thumbnailUrl?: string | null;
  providerChapterId: string;
  chapterTitle: string;
  chapterNumber?: number | null;
  scanlationGroup?: string | null;
  chapterGroupKey?: string | null;
  languageCode?: string | null;
}

/**
 * Persists (upserts) the manga + chapter rows and flips their read state.
 * Used by the chapter list long-press actions ("mark as read", "mark as
 * unread", "mark all chapters as read") so progress survives even when the
 * chapter has never been opened or synced before.
 */
export async function persistChapterReadState(
  items: ChapterReadWriteInput[],
  completed: boolean,
): Promise<void> {
  const uniqueItems = Array.from(
    new Map(
      items.map((item) => [`${item.providerChapterId}:${item.providerMangaId}`, item]),
    ).values(),
  );
  if (!uniqueItems.length) return;
  const first = uniqueItems[0];

  const mangaId = await upsertManga({
    provider: first.provider,
    providerMangaId: first.providerMangaId,
    title: first.mangaTitle,
    thumbnailUrl: first.thumbnailUrl ?? null,
  });

  const chapterInputs: TrackedChapterInput[] = uniqueItems.map((item) => ({
    mangaId,
    providerChapterId: item.providerChapterId,
    title: item.chapterTitle,
    chapterNumber: item.chapterNumber ?? null,
    scanlationGroup: item.scanlationGroup ?? null,
    chapterGroupKey: item.chapterGroupKey ?? null,
    languageCode: item.languageCode ?? null,
  }));

  const chapterIds: string[] = [];
  for (let index = 0; index < chapterInputs.length; index += 30) {
    const chunk = chapterInputs.slice(index, index + 30);
    const results = await Promise.all(chunk.map((input) => upsertChapter(input)));
    chapterIds.push(...results);
  }
  await setChaptersReadState(chapterIds, completed);
}
