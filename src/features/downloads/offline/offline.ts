/**
 * offline.ts
 * ---------------------------------------------------------------------------
 * Database-backed fallback for the manga / one-shot viewers.
 *
 * Every finished download keeps a per-chapter snapshot in the `downloads`
 * table and the catalog snapshot refreshed through the provider adapters, so
 * the viewers can render a readable chapter list (the downloaded chapters)
 * with no network at all. Tapping a row opens the shared reader, which renders
 * downloader-owned local page files.
 * ---------------------------------------------------------------------------
 */


import type {
  ChapterMeta,
  ChapterViewerData,
  ViewerChapterRow,
} from "@shared/contracts";
import { canonicalId } from "@core/catalog";
import { getMangaCatalogRow } from "@core/db/repositories/catalogRepository";
import { listDownloadsForManga } from "@core/db/repositories/downloadRepository";
import type { Download } from "@core/db/schema";


/** Row payload used by the offline viewer; keeps the underlying download. */
export interface OfflineRowPayload {
  offlineDownload: Download;
}

/** Returns the download behind an offline row, or null for a normal row. */
export function offlineRowDownload(
  row: ViewerChapterRow,
): Download | null {
  const raw = row.raw as OfflineRowPayload | undefined;
  return raw?.offlineDownload ?? null;
}

function coverFor(
  head: Download,
  catalogThumbnail: string | null | undefined,
): string | null {
  return head.thumbnailPath ?? catalogThumbnail ?? head.thumbnailUrl ?? null;
}

/**
 * Builds the chapter viewer for a manga from the database only: the manga
 * metadata when it was catalogued, plus one row per downloaded chapter.
 * Returns null when nothing of this manga has been downloaded.
 */
export async function loadOfflineChapterViewer(
  provider: string,
  providerMangaId: string,
): Promise<ChapterViewerData | null> {
  const mangaId = canonicalId(provider, providerMangaId);
  let rows: Download[];
  try {
    rows = (await listDownloadsForManga(mangaId)).filter(
      (row) => row.status === "completed",
    );
  } catch {
    return null;
  }
  if (rows.length === 0) return null;

  const catalog = await getMangaCatalogRow(provider, providerMangaId).catch(
    () => null,
  );
  const head = rows[0];

  const meta: ChapterMeta = {
    title: catalog?.title ?? head.mangaTitle,
    coverUrl: coverFor(head, catalog?.thumbnailUrl),
    description: catalog?.description?.trim() || null,
    tags: [],
  };

  const viewerRows: ViewerChapterRow[] = rows.map((row) => ({
    key: row.id,
    kind: "chapter",
    title: row.chapterTitle,
    number: row.chapterNumber ?? null,
    scanGroup: row.scanlationGroup ?? null,
    groupKey: row.chapterGroupKey ?? null,
    pageCount: row.pageCount ?? null,
    languageCode: row.languageCode ?? null,
    raw: { offlineDownload: row } satisfies OfflineRowPayload,
  }));

  return { meta, rows: viewerRows, offline: true };
}

/**
 * Library meta for a one-shot gallery from the database: the catalog row when
 * present, otherwise the snapshot stored with its downloaded chapter.
 */
export async function loadOfflineGalleryMeta(
  provider: string,
  providerGalleryId: string,
): Promise<ChapterMeta | null> {
  const catalog = await getMangaCatalogRow(provider, providerGalleryId).catch(
    () => null,
  );
  if (catalog) {
    return {
      title: catalog.title,
      coverUrl: catalog.thumbnailUrl,
      description: catalog.description?.trim() || null,
      tags: [],
    };
  }
  const rows = await listDownloadsForManga(
    canonicalId(provider, providerGalleryId),
  ).catch(() => []);
  const head = rows.find((row) => row.status === "completed") ?? rows[0];
  if (!head) return null;
  return {
    title: head.mangaTitle,
    coverUrl: head.thumbnailPath ?? head.thumbnailUrl,
    description: null,
    tags: [],
  };
}

