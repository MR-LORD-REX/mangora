import type { ProviderId } from "@core/catalog";
import type { ReaderParamsSnapshot } from "@/services/db/repositories/historyRepository";
import type { Download } from "@/services/db/schema";
import { encodeProviderParam } from "./identity";

export interface OfflineReaderTarget {
  provider: ProviderId;
  providerMangaId: string;
  providerChapterId: string;
  mangaTitle: string;
  chapterTitle: string;
  chapterNumber: number | null;
  scanlationGroup: string | null;
  chapterGroupKey: string | null;
  thumbnailUrl: string | null;
  languageCode: string | null;
  readerParams: ReaderParamsSnapshot;
}

/** Builds the exact identity and reader params encoded with a download. */
export function offlineReaderTarget(download: Download): OfflineReaderTarget {
  const provider = download.provider as ProviderId;
  const encodedChapterId = encodeProviderParam(provider, download.providerChapterId);
  const encodedMangaId = encodeProviderParam(provider, download.providerMangaId);
  const thumbnailUrl = download.thumbnailPath ?? download.thumbnailUrl ?? null;

  return {
    provider,
    providerMangaId: download.providerMangaId,
    providerChapterId: download.providerChapterId,
    mangaTitle: download.mangaTitle,
    chapterTitle: download.chapterTitle,
    chapterNumber: download.chapterNumber ?? null,
    scanlationGroup: download.scanlationGroup ?? null,
    chapterGroupKey: download.chapterGroupKey ?? null,
    thumbnailUrl,
    languageCode: download.languageCode ?? null,
    readerParams: {
      id: encodedChapterId,
      source: provider,
      mangaId: encodedMangaId,
      mangaTitle: download.mangaTitle,
      chapterTitle: download.chapterTitle,
      ...(download.chapterNumber != null
        ? { chapterNumber: download.chapterNumber }
        : {}),
      ...(download.languageCode ? { language: download.languageCode } : {}),
      ...(thumbnailUrl ? { thumbnailUrl } : {}),
    },
  };
}