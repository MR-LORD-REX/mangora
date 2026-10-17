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
  /** Called once the page image URLs are known. */
  onPages: (pages: string[]) => void;
  /** Called when the extension's prev/next chapter ids resolve. */
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
  onPages,
  onAdjacent,
}: LoadChapterPagesOptions): Promise<void> {
  const reportAdjacent = (adjacent: AdjacentChapters) => {
    onAdjacent?.(adjacent);
  };
  const reportAdjacentError = (error: unknown) => console.error(error);

  if (!source.startsWith("ext:")) {
    throw new Error(
      "This reader only supports installed extension sources. Re-add this series from an extension.",
    );
  }

  const sourceId = source.slice(4);
  const chapterUrl = decodeURIComponent(chapterId);
  const res = await getExtensionPages(sourceId, chapterUrl);
  registerExtensionSourceHeaders(source, res.headers);
  res.pages.forEach((page) =>
    registerExtensionHeaders(page.imageUrl, res.headers),
  );
  onPages(res.pages.map((page) => page.imageUrl));

  if (mangaId) {
    const mangaUrl = decodeURIComponent(mangaId);
    getExtensionChapters(sourceId, mangaUrl)
      .then(({ chapters }) => {
        const index = chapters.findIndex(
          (chapter) => chapter.url === chapterUrl,
        );
        if (index < 0) {
          reportAdjacent({ prev: null, next: null });
          return;
        }
        const prev = index > 0 ? chapters[index - 1] : null;
        const next = index < chapters.length - 1 ? chapters[index + 1] : null;
        reportAdjacent({
          prev: prev ? encodeURIComponent(prev.url) : null,
          next: next ? encodeURIComponent(next.url) : null,
        });
      })
      .catch(reportAdjacentError);
  } else {
    reportAdjacent({ prev: null, next: null });
  }
}