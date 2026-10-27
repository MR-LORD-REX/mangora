import { Directory, File, Paths } from "expo-file-system";

import type { Download } from "@core/db/schema";
import { listCachedPages } from "../storage/pageFiles";
import { extractSafArchivePages } from "@core/storage/saf";

const SESSION_ROOT_NAME = "reader-page-sessions";
const PAGE_NAME_PATTERN = /^\d{4,}\.(jpe?g|png|webp|gif|avif|bmp)$/i;

let sessionSequence = 0;
const temporarySessions = new Map<string, Directory>();

export interface DownloadedPageSession {
  pages: string[];
  cleanup: () => Promise<void>;
}

function validatePageCount(download: Download, pages: string[]): void {
  if (
    download.pageCount != null &&
    download.pageCount > 0 &&
    pages.length !== download.pageCount
  ) {
    throw new Error(
      `The downloaded chapter has ${pages.length} pages, expected ${download.pageCount}.`,
    );
  }
}

function temporarySessionDirectory(): Directory {
  sessionSequence += 1;
  const root = new Directory(Paths.cache, SESSION_ROOT_NAME);
  if (!root.exists) root.create({ intermediates: true, idempotent: true });
  const session = new Directory(
    root,
    `session-${Date.now()}-${sessionSequence}-${Math.random().toString(36).slice(2, 8)}`,
  );
  session.create({ intermediates: true, idempotent: true });
  return session;
}

async function cleanupDirectory(directory: Directory): Promise<void> {
  try {
    if (directory.exists) directory.delete();
  } catch (error) {
    console.warn("[reader-pages] temporary page cleanup failed", {
      directory: directory.uri,
      error,
    });
  }
}

async function cleanupSessionForPages(pages: string[]): Promise<void> {
  const firstPage = pages[0];
  if (!firstPage) return;
  const directory = temporarySessions.get(firstPage);
  if (!directory) return;
  temporarySessions.delete(firstPage);
  await cleanupDirectory(directory);
}

/** Returns download-owned page files or a session-scoped extraction of its archive. */
export async function openDownloadedPageSession(
  download: Download,
): Promise<DownloadedPageSession> {
  const downloadedFiles = listCachedPages(download.pagesDirUri);
  if (downloadedFiles.length > 0) {
    validatePageCount(download, downloadedFiles);
    return { pages: downloadedFiles, cleanup: async () => {} };
  }

  if (!download.fileUri) {
    throw new Error("The downloaded archive is missing. Download this chapter again.");
  }

  const directory = temporarySessionDirectory();
  try {
    const extracted = await extractSafArchivePages(
      download.fileUri,
      directory.uri,
    );
    const pages = extracted
      .filter((uri) => PAGE_NAME_PATTERN.test(new File(uri).name))
      .sort((a, b) => new File(a).name.localeCompare(new File(b).name));
    if (pages.length === 0) {
      throw new Error("The downloaded archive contains no page images.");
    }
    validatePageCount(download, pages);
    temporarySessions.set(pages[0], directory);
    return {
      pages,
      cleanup: () => cleanupSessionForPages(pages),
    };
  } catch (error) {
    await cleanupDirectory(directory);
    throw error;
  }
}

/** Cleans temporary extraction ownership after a pre-translation job finishes. */
export async function cleanupDownloadedPageSession(
  pages: string[],
): Promise<void> {
  await cleanupSessionForPages(pages);
}

/** Removes only abandoned temporary archive extractions from a previous process. */
export async function clearAbandonedDownloadedPageSessions(): Promise<void> {
  const root = new Directory(Paths.cache, SESSION_ROOT_NAME);
  try {
    if (!root.exists) return;
    for (const entry of root.list()) {
      if (entry instanceof Directory) await cleanupDirectory(entry);
      else if (entry instanceof File) {
        try {
          entry.delete();
        } catch (error) {
          console.warn("[reader-pages] stale temporary file cleanup failed", {
            file: entry.uri,
            error,
          });
        }
      }
    }
  } catch (error) {
    console.warn("[reader-pages] stale session cleanup failed", error);
  }
}
