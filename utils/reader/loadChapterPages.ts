/**
 * loadChapterPages.ts
 * ---------------------------------------------------------------------------
 * Page resolution for extension sources. Adjacent-chapter lookups are
 * best-effort and resolve after the pages so the reader renders immediately.
 * ---------------------------------------------------------------------------
 */

import {
  getExtensionChapters,
  getExtensionPages,
} from "@/services/extensions/native";
import {
  registerExtensionHeaders,
  registerExtensionPageUrl,
  registerExtensionSourceHeaders,
} from "@/utils/reader/imageHeaders";

export interface AdjacentChapters {
  prev: string | null;
  next: string | null;
}

export interface LoadChapterPagesOptions {
  source: string;
  chapterId: string;
  mangaId: string;
  /** Extension-specific chapter memo (Madara stores mangaPath here). */
  chapterMemo?: string;
  /** Called once the page image URLs are known. */
  onPages: (pages: string[]) => void;
  /** Called when the extension's prev/next chapter ids resolve. */
  onAdjacent?: (adjacent: AdjacentChapters) => void;
}

export interface LoadAdjacentChaptersOptions {
  source: string;
  chapterId: string;
  mangaId: string;
  onAdjacent?: (adjacent: AdjacentChapters) => void;
}

/**
 * Resolves the previous/next chapter ids without touching the page list.
 * Cached chapters use this so navigation still works on a warm open without
 * asking the extension for the pages again.
 */
export function loadAdjacentChapters({
  source,
  chapterId,
  mangaId,
  onAdjacent,
}: LoadAdjacentChaptersOptions): void {
  if (!source.startsWith("ext:")) {
    onAdjacent?.({ prev: null, next: null });
    return;
  }
  if (!mangaId) {
    onAdjacent?.({ prev: null, next: null });
    return;
  }
  const sourceId = source.slice(4);
  let chapterUrl: string;
  let mangaUrl: string;
  try {
    chapterUrl = decodeURIComponent(chapterId);
    mangaUrl = decodeURIComponent(mangaId);
  } catch {
    onAdjacent?.({ prev: null, next: null });
    return;
  }
  getExtensionChapters(sourceId, mangaUrl)
    .then(({ chapters }) => {
      const index = chapters.findIndex(
        (chapter) => chapter.url === chapterUrl,
      );
      if (index < 0) {
        onAdjacent?.({ prev: null, next: null });
        return;
      }
      const prev = index > 0 ? chapters[index - 1] : null;
      const next = index < chapters.length - 1 ? chapters[index + 1] : null;
      onAdjacent?.({
        prev: prev ? encodeURIComponent(prev.url) : null,
        next: next ? encodeURIComponent(next.url) : null,
      });
    })
    .catch((error) => console.error(error));
}

/**
 * Loads the page list for one chapter and reports it through `onPages`.
 * Adjacent chapters are reported later through `onAdjacent` when available.
 */
export async function loadChapterPages({
  source,
  chapterId,
  mangaId,
  chapterMemo,
  onPages,
  onAdjacent,
}: LoadChapterPagesOptions): Promise<string[]> {
  const reportAdjacent = (adjacent: AdjacentChapters) => {
    onAdjacent?.(adjacent);
  };

  if (!source.startsWith("ext:")) {
    throw new Error(
      "This reader only supports installed extension sources. Re-add this series from an extension.",
    );
  }

  const sourceId = source.slice(4);
  const chapterUrl = decodeURIComponent(chapterId);
  const res = await getExtensionPages(
    sourceId,
    chapterUrl,
    chapterMemo || "{}",
    mangaId,
  );
  registerExtensionSourceHeaders(source, res.headers);
  res.pages.forEach((page) => {
    registerExtensionHeaders(page.imageUrl, res.headers);
    registerExtensionPageUrl(page.imageUrl, page.url);
  });
  const imageUrls = res.pages.map((page) => page.imageUrl);
  onPages(imageUrls);

  loadAdjacentChapters({
    source,
    chapterId,
    mangaId,
    onAdjacent: reportAdjacent,
  });
  return imageUrls;
}
