/**
 * Public downloaded-page sessions used by the reader and translation. The
 * composition root also passes this adapter to the translation feature.
 */

import type { DownloadSessionPort } from "@shared/contracts";
import { getDownload } from "@/services/db/repositories/downloadRepository";
import {
  cleanupDownloadedPageSession,
  openDownloadedPageSession,
} from "../offline/readerPageSession";
import type { DownloadedPageSession } from "../offline/readerPageSession";

export { clearAbandonedDownloadedPageSessions } from "../offline/readerPageSession";
export { cleanupDownloadedPageSession, openDownloadedPageSession };
export type { DownloadedPageSession };

/** Opens download-owned page files or a temporary extraction of its archive. */
export async function openDownloadedPageSessionForChapter(
  chapterId: string,
): Promise<DownloadedPageSession> {
  const row = await getDownload(chapterId);
  if (!row || row.status !== "completed") {
    throw new Error("The downloaded chapter is no longer available.");
  }
  return openDownloadedPageSession(row);
}

/** Adapter the composition root passes to translation and other consumers. */
export const downloadSessions: DownloadSessionPort = {
  openChapter: (chapterId) => openDownloadedPageSessionForChapter(chapterId),
  cleanupPages: (pages) => cleanupDownloadedPageSession(pages),
};