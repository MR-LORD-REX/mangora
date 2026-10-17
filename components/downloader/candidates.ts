/**
 * candidates.ts
 * ---------------------------------------------------------------------------
 * Translates viewer rows into download candidates, so
 * the buttons never have to know provider identity rules.
 * ---------------------------------------------------------------------------
 */

import type { ChapterSourceModule } from "@/components/manga/sources/module";
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
