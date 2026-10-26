import { useMemo } from "react";

import {
  candidateFromRow,
  candidatesFromRows,
  useDownloadStatuses,
  type DownloadCandidate,
  type DownloadContext,
} from "@features/downloads";
import type {
  ChapterMeta,
  ChapterSourceModule,
} from "@shared/contracts";
import type { ChapterGroup } from "../domain/chapterGroups";

export interface UseDownloadSelectionOptions {
  source: ChapterSourceModule;
  identity: string;
  meta: ChapterMeta | null;
  thumbnailUrl?: string | null;
  rawGroups: ChapterGroup[];
}

export function useDownloadSelection({
  source,
  identity,
  meta,
  thumbnailUrl,
  rawGroups,
}: UseDownloadSelectionOptions) {
  const downloadRows = useMemo(
    () => rawGroups.flatMap((group) => group.rows),
    [rawGroups],
  );
  const downloadCandidates = useMemo(
    () => candidatesFromRows(source, identity, downloadRows),
    [downloadRows, identity, source],
  );
  const downloadByRowKey = useMemo(() => {
    const map = new Map<string, DownloadCandidate>();
    for (const row of downloadRows) {
      const candidate = candidateFromRow(source, identity, row);
      if (candidate) map.set(row.key, candidate);
    }
    return map;
  }, [downloadRows, identity, source]);
  const downloadContext = useMemo<DownloadContext>(
    () => ({
      mangaTitle: meta?.title ?? source.label,
      thumbnailUrl: meta?.coverUrl ?? thumbnailUrl ?? null,
    }),
    [meta?.coverUrl, meta?.title, source.label, thumbnailUrl],
  );
  const downloadChapterIds = useMemo(
    () => downloadCandidates.map((candidate) => candidate.target.chapterId),
    [downloadCandidates],
  );
  const downloadStatuses = useDownloadStatuses(downloadChapterIds);

  return {
    downloadCandidates,
    downloadByRowKey,
    downloadContext,
    downloadStatuses,
  };
}
