/**
 * loadChapterPages.ts
 * ---------------------------------------------------------------------------
 * Provider dispatch for the shared reader: resolves a chapter's page image
 * URLs and, where the provider supports it, the previous/next chapter ids.
 *
 * Adjacent-chapter lookups are best-effort and resolve after the pages so the
 * reader can render as soon as the images are known.
 * ---------------------------------------------------------------------------
 */

import { comixChapterPages } from "@/services/comix/comix.api";
import { BrainRotComicsClient } from "@/services/brainrot/brainrot";
import { brainrotBridgeFetch } from "@/services/brainrot/brainrotBridge";
import { PhiliaScansClient } from "@/services/philia/philia";
import { registerPhiliaProgressiveChapter } from "@/services/philia/philiaDecrypt";
import Mangadex from "@/services/mangadex/mangaDex";
import { MangaKatana } from "@/services/mangakatana/mangakatana";
import {
  decodePath,
  encodePath,
} from "@/services/mangakatana/mangakatana.utils";
import { Manhwa18Source } from "@/services/manhwa18/Manhwa18";
import { MgekoClient } from "@/services/mgeko/mgeko";
import { nhClient } from "@/services/nh/nhShared";

const dex = new Mangadex();
const katana = new MangaKatana();
const manhwa18 = new Manhwa18Source();
const mgeko = new MgekoClient();

/**
 * Comix returns page images as a CDN directory (`pages.baseUrl`) plus
 * per-page entries (`pages.items[].url`). The item paths are relative to that
 * base, so a bare `page.url` is not a loadable URL - it must be joined, or
 * every page image (reader + downloader) resolves to an invalid URI. Absolute
 * URLs pass through unchanged so this stays a no-op if the API ever returns
 * them fully qualified.
 */
function resolveComixPageUrl(baseUrl: string, url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  if (!baseUrl) return url;
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return `${base}${url.replace(/^\/+/, "")}`;
}

export interface AdjacentChapters {
  prev: string | null;
  next: string | null;
}

export interface LoadChapterPagesOptions {
  source: string;
  chapterId: string;
  mangaId: string;
  /** MangaDex chapter language code, used to keep prev/next in-language. */
  chapterLanguageCode?: string;
  /** "reader" (default) resolves renderable uris; "download" resolves source urls. */
  purpose?: "reader" | "download";
  /** Called once the page image URLs are known. */
  onPages: (pages: string[]) => void;
  /** Called when the provider's prev/next chapter ids resolve. */
  onAdjacent?: (adjacent: AdjacentChapters) => void;
}

/**
 * Loads the page list for one chapter and reports it through `onPages`.
 * Adjacent chapters are reported later through `onAdjacent` when available.
 */
export async function loadChapterPages({
  source,
  chapterId,
  mangaId,
  chapterLanguageCode,
  purpose = "reader",
  onPages,
  onAdjacent,
}: LoadChapterPagesOptions): Promise<void> {
  const reportAdjacent = (adjacent: AdjacentChapters) => {
    onAdjacent?.(adjacent);
  };
  const reportAdjacentError = (error: unknown) => console.error(error);

  if (source === "mangadex") {
    const res = await dex.getPageUrls(chapterId);
    if (res.pages) onPages(res.pages);
    if (mangaId) {
      dex
        .getAdjacentChapters(mangaId, chapterId, chapterLanguageCode)
        .then((adj) => reportAdjacent({ prev: adj.prev, next: adj.next }))
        .catch(reportAdjacentError);
    }
    return;
  }

  if (source === "mangakatana") {
    const chapterUrl = decodePath(chapterId);
    const res = await katana.getPageList(chapterUrl);
    onPages(res.map((page) => page.imageUrl));
    if (mangaId) {
      const mangaUrl = decodePath(mangaId);
      katana
        .getAdjacentChapters(mangaUrl, chapterUrl)
        .then((adj) =>
          reportAdjacent({
            prev: adj.prev ? encodePath(adj.prev) : null,
            next: adj.next ? encodePath(adj.next) : null,
          }),
        )
        .catch(reportAdjacentError);
    }
    return;
  }

  if (source === "manhwa18") {
    const chapterUrl = decodeURIComponent(chapterId);
    const res = await manhwa18.getPageList(chapterUrl);
    onPages(res.map((page) => page.imageUrl));
    if (mangaId) {
      const mangaUrl = decodeURIComponent(mangaId);
      manhwa18
        .getAdjacentChapters(mangaUrl, chapterUrl)
        .then((adj) =>
          reportAdjacent({
            prev: adj.prev ? encodeURIComponent(adj.prev) : null,
            next: adj.next ? encodeURIComponent(adj.next) : null,
          }),
        )
        .catch(reportAdjacentError);
    }
    return;
  }

  if (source === "mgeko") {
    const chapterUrl = decodeURIComponent(chapterId);
    const res = await mgeko.getPageList(chapterUrl);
    onPages(res.map((page) => page.imageUrl));
    reportAdjacent({ prev: null, next: null });
    return;
  }

  if (source === "comix") {
    const chapterUrl = decodeURIComponent(chapterId);
    const res = await comixChapterPages(chapterUrl);
    const baseUrl = res.pages?.baseUrl ?? "";
    const pageItems = res.pages?.items ?? [];
    onPages(pageItems.map((page) => resolveComixPageUrl(baseUrl, page.url)));
    const prev = res.prev || res.prevAny;
    const next = res.next || res.nextAny;
    reportAdjacent({
      prev: prev ? encodeURIComponent(prev.url) : null,
      next: next ? encodeURIComponent(next.url) : null,
    });
    return;
  }

  if (source === "brainrot") {
    const chapterUrl = decodeURIComponent(chapterId);
    const api = new BrainRotComicsClient({ fetchImpl: brainrotBridgeFetch });
    const res = await api.getPageList(chapterUrl);
    onPages(res.map((page) => page.imageUrl));
    if (mangaId) {
      const mangaUrl = decodeURIComponent(mangaId);
      api
        .getChapterList(mangaUrl)
        .then((list) => {
          const index = list.findIndex((chapter) => chapter.url === chapterUrl);
          reportAdjacent({
            prev: index > 0 ? encodeURIComponent(list[index - 1].url) : null,
            next:
              index >= 0 && index < list.length - 1
                ? encodeURIComponent(list[index + 1].url)
                : null,
          });
        })
        .catch(reportAdjacentError);
    } else {
      reportAdjacent({ prev: null, next: null });
    }
    return;
  }

  if (source === "philia") {
    const chapterIdNum = Number(decodeURIComponent(chapterId));
    const api = new PhiliaScansClient();
    const pages = await api.getChapterPages(chapterIdNum);

    if (purpose === "download") {
      // The downloader wants the signed source urls; it decrypts each blob
      // itself (see services/downloader/scheduler.ts).
      onPages(pages.map((page) => page.url));
      reportAdjacent({ prev: null, next: null });
      return;
    }

    // Reader: register the chapter for lazy page decryption and hand back the
    // cache uris immediately so the reader opens without waiting for the whole
    // chapter. The reader decrypts each page on demand as it nears the
    // viewport (see app/reader/[id].tsx).
    const keys = await api.getPageKeys(chapterIdNum);
    const context = {
      chapterKeyB64: keys.chapterKeyB64,
      gridSize: keys.gridSize > 0 ? keys.gridSize : 4,
      scrambled: keys.scrambled,
    };
    const job = registerPhiliaProgressiveChapter(chapterIdNum, context, pages);
    onPages(job.uris);

    if (mangaId) {
      const slug = decodeURIComponent(mangaId);
      api
        .getChapterList(slug)
        .then((list) => {
          const index = list.items.findIndex(
            (chapter) => chapter.id === chapterIdNum,
          );
          if (index < 0) {
            reportAdjacent({ prev: null, next: null });
            return;
          }
          // `items` is deduped and sorted newest-first (descending number).
          const prev =
            index < list.items.length - 1 ? list.items[index + 1] : null;
          const next = index > 0 ? list.items[index - 1] : null;
          reportAdjacent({
            prev: prev ? encodeURIComponent(String(prev.id)) : null,
            next: next ? encodeURIComponent(String(next.id)) : null,
          });
        })
        .catch(reportAdjacentError);
    } else {
      reportAdjacent({ prev: null, next: null });
    }
    return;
  }

  if (source === "nh") {
    const res = await nhClient.getById(chapterId);
    onPages(res.pages.map((page) => page.url));
    reportAdjacent({ prev: null, next: null });
  }
}
