/* Adjacent-chapter preparation and navigation. */

import {
  getChapterDownloadInfo,
} from "@/services/db/repositories/catalogRepository";
import { prepareReaderOpen } from "@features/library";
import { resolveReaderIdentity } from "@/utils/reader/readerIdentity";
import { chapterTitleFromId } from "@/utils/reader/chapterLabel";
export { chapterNavigationFlipped } from "../domain/navigation/chapterDirection";

interface ReaderChapterNavigationOptions {
  source: string;
  mangaId: string;
  title: string;
  mangaTitle: string;
  thumbnailUrl: string;
  language: string;
  onReplaceReader: (params: {
    id: string;
    [key: string]: string | number | undefined;
  }) => void;
}

function paramString(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

/**
 * Jumps to an adjacent chapter. The old params are dropped, not spread:
 * the target chapter's title/number come from the catalog when known (so
 * the header number updates), and the manga + chapter rows are upserted
 * first so progress/history are tracked against the right chapter.
 */
export async function openAdjacentChapter(
  targetParam: string,
  options: ReaderChapterNavigationOptions,
): Promise<void> {
  const {
    source,
    mangaId,
    title,
    mangaTitle,
    thumbnailUrl,
    language,
    onReplaceReader,
  } = options;
  const nextId = paramString(targetParam);
  if (!nextId) return;
  const nextIdentity = resolveReaderIdentity({
    source,
    chapterId: nextId,
    mangaId,
  });
  const known = await getChapterDownloadInfo(nextIdentity.chapterId).catch(
    () => null,
  );
  const nextChapterTitle = known?.title ?? chapterTitleFromId(nextId);
  const nextMangaTitle = mangaTitle || title;
  const nextLanguage = known?.languageCode ?? language;
  await prepareReaderOpen({
    provider: nextIdentity.provider,
    providerMangaId: nextIdentity.providerMangaId,
    providerChapterId: nextIdentity.providerChapterId,
    mangaTitle: nextMangaTitle,
    chapterTitle: nextChapterTitle,
    chapterNumber: known?.chapterNumber ?? null,
    scanlationGroup: known?.scanlationGroup ?? null,
    chapterGroupKey: known?.chapterGroupKey ?? null,
    languageCode: nextLanguage ?? null,
    thumbnailUrl: thumbnailUrl || null,
    readerParams: {
      id: nextId,
      source: nextIdentity.provider,
      mangaTitle: nextMangaTitle,
      chapterTitle: nextChapterTitle,
      ...(mangaId ? { mangaId } : {}),
      ...(thumbnailUrl ? { thumbnailUrl } : {}),
      ...(nextLanguage ? { language: nextLanguage } : {}),
    },
  });
  onReplaceReader({
    id: nextId,
    source,
    ...(mangaId ? { mangaId } : {}),
    mangaTitle: nextMangaTitle,
    chapterTitle: nextChapterTitle,
    ...(known?.chapterNumber != null
      ? { chapterNumber: known.chapterNumber }
      : {}),
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
    ...(nextLanguage ? { language: nextLanguage } : {}),
  });
}
