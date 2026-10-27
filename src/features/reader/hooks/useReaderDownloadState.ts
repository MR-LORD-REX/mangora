/**
 * Reader-side download state.
 *
 * Resolves the canonical reader/download identity once per route, then loads
 * the catalogued chapter row that supplies the real index, group and language.
 * The chapter loader and chrome consume the resulting candidate/context.
 */
import { useEffect, useMemo, useState } from "react";

import {
  getChapterDownloadInfo,
  type ChapterDownloadInfo,
} from "@/services/db/repositories/catalogRepository";
import { resolveReaderIdentity } from "@core/catalog/readerIdentity";
import {
  readerTarget,
  type DownloadCandidate,
} from "@features/downloads";

export interface ReaderDownloadStateOptions {
  source: string;
  chapterId: string;
  mangaId: string;
  title: string;
  mangaTitle: string;
  thumbnailUrl: string;
  language: string;
}

export interface ReaderDownloadState {
  readerIdentity: ReturnType<typeof resolveReaderIdentity>;
  downloadTargetIdentity: ReturnType<typeof readerTarget>;
  chapterDownloadInfo: ChapterDownloadInfo | null;
  downloadCandidate: DownloadCandidate;
  downloadContext: { mangaTitle: string; thumbnailUrl: string | null };
}

export function useReaderDownloadState({
  source,
  chapterId,
  mangaId,
  title,
  mangaTitle,
  thumbnailUrl,
  language,
}: ReaderDownloadStateOptions): ReaderDownloadState {
  const readerIdentity = useMemo(
    () => resolveReaderIdentity({ source, chapterId, mangaId }),
    [source, chapterId, mangaId],
  );
  const downloadTargetIdentity = useMemo(
    () => readerTarget({ source, chapterId, mangaId }),
    [source, chapterId, mangaId],
  );
  const [chapterDownloadInfo, setChapterDownloadInfo] =
    useState<ChapterDownloadInfo | null>(null);

  useEffect(() => {
    let active = true;
    setChapterDownloadInfo(null);
    getChapterDownloadInfo(downloadTargetIdentity.chapterId)
      .then((info) => {
        if (active) setChapterDownloadInfo(info);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [downloadTargetIdentity.chapterId]);

  const downloadChapterIndex = useMemo(() => {
    if (chapterDownloadInfo?.chapterNumber != null) {
      return String(chapterDownloadInfo.chapterNumber);
    }
    const match = title.match(/\d+(?:\.\d+)?/);
    return match ? match[0] : null;
  }, [chapterDownloadInfo, title]);

  const downloadCandidate = useMemo<DownloadCandidate>(
    () => ({
      target: downloadTargetIdentity,
      chapterTitle: chapterDownloadInfo?.title ?? title,
      chapterIndex: downloadChapterIndex,
      chapterNumber:
        chapterDownloadInfo?.chapterNumber ??
        (downloadChapterIndex ? Number(downloadChapterIndex) : null),
      scanlationGroup: chapterDownloadInfo?.scanlationGroup ?? null,
      chapterGroupKey:
        chapterDownloadInfo?.chapterGroupKey ?? downloadChapterIndex,
      languageCode: chapterDownloadInfo?.languageCode ?? (language || null),
      pageCount: chapterDownloadInfo?.pageCount ?? null,
    }),
    [
      chapterDownloadInfo,
      downloadChapterIndex,
      downloadTargetIdentity,
      language,
      title,
    ],
  );

  const downloadContext = useMemo(
    () => ({ mangaTitle, thumbnailUrl: thumbnailUrl || null }),
    [mangaTitle, thumbnailUrl],
  );

  return {
    readerIdentity,
    downloadTargetIdentity,
    chapterDownloadInfo,
    downloadCandidate,
    downloadContext,
  };
}