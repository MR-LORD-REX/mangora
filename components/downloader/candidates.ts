/**
 * candidates.ts
 * ---------------------------------------------------------------------------
 * Translates viewer rows (and gallery metadata) into download candidates, so
 * the buttons never have to know provider identity rules.
 * ---------------------------------------------------------------------------
 */

import type {
  ChapterSourceModule,
  GallerySourceModule,
} from "@/components/manga/sources/module";
import type { ChapterMeta, ViewerChapterRow } from "@/components/manga/types";
import { downloadTarget } from "@/services/downloader";
import type { DownloadCandidate } from "@/services/downloader";

/** One chapter row -> one candidate (null for section headers). */
export function candidateFromRow(
  source: ChapterSourceModule,
  identity: string,
  row: ViewerChapterRow,
): DownloadCandidate | null {
  if (row.kind !== "chapter") return null;
  const write = source.chapterWriteIdentity?.(row) ?? null;
  if (!write?.providerChapterId) return null;

  const chapterNumber = write.chapterNumber ?? row.number ?? null;
  const chapterIndex =
    chapterNumber != null
      ? String(chapterNumber)
      : (row.groupKey ?? null);

  return {
    target: downloadTarget({
      provider: source.provider,
      providerMangaId: identity,
      providerChapterId: write.providerChapterId,
    }),
    chapterTitle: row.title,
    chapterIndex,
    chapterNumber,
    scanlationGroup: write.scanlationGroup ?? row.scanGroup ?? null,
    chapterGroupKey: write.chapterGroupKey ?? row.groupKey ?? null,
    languageCode: write.languageCode ?? row.languageCode ?? null,
    pageCount: row.pageCount ?? null,
  };
}

export function candidatesFromRows(
  source: ChapterSourceModule,
  identity: string,
  rows: ViewerChapterRow[],
): DownloadCandidate[] {
  const seen = new Set<string>();
  const candidates: DownloadCandidate[] = [];
  for (const row of rows) {
    const candidate = candidateFromRow(source, identity, row);
    if (!candidate) continue;
    if (seen.has(candidate.target.chapterId)) continue;
    seen.add(candidate.target.chapterId);
    candidates.push(candidate);
  }
  return candidates;
}

/** A one-shot gallery behaves like a single chapter. */
export function galleryCandidate(
  source: GallerySourceModule,
  identity: string,
  meta: ChapterMeta,
  pageCount?: number | null,
): DownloadCandidate {
  return {
    target: downloadTarget({
      provider: source.provider,
      providerMangaId: identity,
      providerChapterId: identity,
    }),
    chapterTitle: meta.title,
    chapterIndex: "1",
    chapterNumber: null,
    scanlationGroup: null,
    chapterGroupKey: null,
    languageCode: null,
    pageCount: pageCount ?? null,
  };
}
