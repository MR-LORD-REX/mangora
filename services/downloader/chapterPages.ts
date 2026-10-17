/**
 * chapterPages.ts
 * ---------------------------------------------------------------------------
 * Resolves the page image urls for one chapter/gallery by reusing the shared
 * reader dispatch (utils/reader/loadChapterPages.ts). The downloader never
 * duplicates provider parsing.
 * ---------------------------------------------------------------------------
 */

import { encodeProviderParam } from "./identity";
import { loadChapterPages } from "@/utils/reader/loadChapterPages";


/**
 * Loads the ordered page urls for a chapter without touching reader state
 * (adjacent-chapter lookups are skipped).
 */
export function resolveChapterPageUrls(input: {
  provider: string;
  providerChapterId: string;
}): Promise<string[]> {
  return new Promise((resolve, reject) => {
    let settled = false;
    loadChapterPages({
      source: input.provider,
      chapterId: encodeProviderParam(input.provider, input.providerChapterId),
      mangaId: "",
      onPages: (pages) => {
        settled = true;
        resolve(pages);
      },
    }).catch((error) => {
      if (!settled) reject(error);
    });
  });
}
