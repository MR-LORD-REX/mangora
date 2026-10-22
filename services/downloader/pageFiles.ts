/**
 * pageFiles.ts
 * ---------------------------------------------------------------------------
 * Downloads one chapter's page images into the app cache.
 *
 * A chapter's pages are stored as individual files (not only inside the .cbz)
 * because:
 *   - the reader can then render offline pages straight from `file://` uris,
 *   - an interrupted download resumes by skipping files that already exist,
 *   - the .cbz is written once, at the end, from these files.
 * ---------------------------------------------------------------------------
 */

import { Directory, File } from "expo-file-system";

import { downloadToFile } from "@/services/net/browserFetch";
import { fetchExtensionPageImage } from "@/services/extensions/native";
import { isDecodableImageUri } from "@/services/images/decode";
import {
  extensionPageUrlFor,
  imageHeadersForPage,
} from "@/utils/reader/imageHeaders";
import { pageExtension, providerSegment, safeSegment, shortHash } from "./naming";
import { downloaderCacheRoot } from "./native";

export interface CachedPage {
  path: string;
  name: string;
  bytes: number;
}

/** Raised when the user removes a job while it is running. */
export class DownloadCancelledError extends Error {
  constructor() {
    super("Download cancelled");
    this.name = "DownloadCancelledError";
  }
}

/** Raised when the queue must wait (no Wi-Fi, or a provider that needs the app). */
export class DownloadPausedError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "DownloadPausedError";
  }
}

export interface ChapterCacheKey {
  provider: string;
  providerMangaId: string;
  providerChapterId: string;
  mangaTitle: string;
  chapterTitle: string;
  chapterIndex?: string | number | null;
}

/** `<cache>/downloads/<provider>/<manga>~<hash>/<chapter>~<index>~<hash>/`. */
export function chapterCacheDirectory(key: ChapterCacheKey): Directory {
  const index =
    key.chapterIndex == null || `${key.chapterIndex}`.trim() === ""
      ? "1"
      : `${key.chapterIndex}`;
  return new Directory(
    downloaderCacheRoot(),
    providerSegment(key.provider),
    `${safeSegment(key.mangaTitle, "manga")}~${shortHash(key.providerMangaId)}`,
    `${safeSegment(key.chapterTitle, "chapter")}~${safeSegment(index, "1")}~${shortHash(
      key.providerChapterId,
    )}`,
  );
}

/** Creates the chapter directory and clears leftovers from a killed download. */
export function prepareChapterDirectory(directory: Directory): Directory {
  if (!directory.exists) {
    directory.create({ intermediates: true, idempotent: true });
  }
  for (const entry of directory.list()) {
    if (entry instanceof File && entry.name.endsWith(".part")) {
      try {
        entry.delete();
      } catch {
        // A stale temp file is harmless.
      }
    }
  }
  return directory;
}

export interface DownloadPagesOptions {
  directory: Directory;
  urls: string[];
  provider: string;
  /** Parallel page downloads (1-5). */
  concurrency: number;
  /** Returns true when the user removed the job. */
  isCancelled: () => boolean;
  /** Returns a reason string while the job must wait. */
  pauseReason: () => string | null;
  onProgress: (pagesDone: number, bytes: number) => void;
}

/**
 * Downloads every page of a chapter, reusing files from a previous attempt.
 * Resolves with the pages in reading order.
 */
export async function downloadChapterPages({
  directory,
  urls,
  provider,
  concurrency,
  isCancelled,
  pauseReason,
  onProgress,
}: DownloadPagesOptions): Promise<CachedPage[]> {
  prepareChapterDirectory(directory);
  const names = urls.map((url, index) => pageExtension(url, index));
  const pages: (CachedPage | null)[] = new Array(urls.length).fill(null);
  let nextIndex = 0;
  let pagesDone = 0;
  let bytes = 0;
  let failure: unknown = null;

  const takeNext = (): number | null => {
    if (nextIndex >= urls.length) return null;
    const index = nextIndex;
    nextIndex += 1;
    return index;
  };

  const worker = async () => {
    for (;;) {
      if (failure) return;
      if (isCancelled()) {
        failure = new DownloadCancelledError();
        return;
      }
      const waitReason = pauseReason();
      if (waitReason) {
        failure = new DownloadPausedError(waitReason);
        return;
      }
      const index = takeNext();
      if (index == null) return;

      const name = names[index];
      const existing = new File(directory, name);
      if (
        existing.exists &&
        existing.size > 0 &&
        (await isDecodableImageUri(existing.uri))
      ) {
        console.log("[downloader][page] reusing cached image", {
          page: index + 1,
          total: urls.length,
          name,
          bytes: existing.size,
        });
        pages[index] = { path: existing.uri, name, bytes: existing.size };
        pagesDone += 1;
        bytes += existing.size;
        onProgress(pagesDone, bytes);
        continue;
      }
      if (existing.exists) {
        try {
          existing.delete();
        } catch {
          // The download below replaces it anyway.
        }
      }

      try {
        const file = await downloadPage(
          provider,
          urls[index],
          directory,
          name,
          imageHeadersForPage(provider, urls[index]),
        );
        pages[index] = { path: file.uri, name, bytes: file.size };
        pagesDone += 1;
        bytes += file.size;
        onProgress(pagesDone, bytes);
      } catch (error) {
        failure = failure ?? error;
        return;
      }
    }
  };

  const workerCount = Math.max(1, Math.min(concurrency, urls.length || 1));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  if (failure) throw failure;

  const ordered = pages.filter((page): page is CachedPage => page != null);
  if (ordered.length !== urls.length) {
    throw new Error("Some pages could not be downloaded.");
  }
  return ordered;
}

/** Downloads one page to a `.part` file, then moves it into place. */
async function downloadPage(
  provider: string,
  url: string,
  directory: Directory,
  name: string,
  headers: Record<string, string> | undefined,
): Promise<File> {
  const temp = new File(directory, `${name}.part`);
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      console.log("[downloader][page] fetch started", {
        provider,
        name,
        attempt,
      });
      if (temp.exists) temp.delete();
      if (provider.startsWith("ext:")) {
        const image = await fetchExtensionPageImage(
          provider.slice(4),
          url,
          extensionPageUrlFor(url) ?? "",
        );
        const source = new File(image.path);
        if (!source.exists || source.size <= 0) {
          throw new Error("Extension returned an empty page image");
        }
        source.copy(temp);
      } else {
        await downloadToFile(url, temp, headers);
      }
      if (!temp.exists || temp.size <= 0) {
        throw new Error("Empty page payload");
      }
      console.log("[downloader][page] payload received", {
        provider,
        name,
        attempt,
        bytes: temp.size,
      });
      if (!(await isDecodableImageUri(temp.uri))) {
        throw new Error("Downloaded page is not a decodable image");
      }
      console.log("[downloader][page] image decoded", {
        provider,
        name,
        attempt,
      });
      const target = new File(directory, name);
      if (target.exists) target.delete();
      temp.move(target);
      console.log("[downloader][page] image saved", {
        provider,
        name,
        path: target.uri,
        bytes: target.size,
      });
      return target;
    } catch (error) {
      lastError = error;
      console.error("[downloader][page] attempt failed", {
        provider,
        name,
        attempt,
        error,
      });
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 700 * attempt));
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Page download failed.");
}

/** Caches a manga cover locally so offline strips still show a thumbnail. */
export async function cacheMangaThumbnail(input: {
  provider: string;
  providerMangaId: string;
  thumbnailUrl: string | null;
}): Promise<string | null> {
  if (!input.thumbnailUrl) return null;
  const match = input.thumbnailUrl.split(/[?#]/)[0].match(/\.(jpe?g|png|webp|avif|gif)$/i);
  const extension = match ? match[1].toLowerCase().replace("jpeg", "jpg") : "jpg";
  const directory = new Directory(
    downloaderCacheRoot(),
    "thumbs",
    providerSegment(input.provider),
  );
  if (!directory.exists) {
    directory.create({ intermediates: true, idempotent: true });
  }
  const target = new File(directory, `${shortHash(input.providerMangaId)}.${extension}`);
  if (target.exists && target.size > 0) return target.uri;

  const temp = new File(directory, `${target.name}.part`);
  try {
    if (temp.exists) temp.delete();
    const thumbHeaders = imageHeadersForPage(
      input.provider,
      input.thumbnailUrl,
    );
    if (input.provider.startsWith("ext:")) {
      const image = await fetchExtensionPageImage(
        input.provider.slice(4),
        input.thumbnailUrl,
        input.thumbnailUrl,
      );
      const source = new File(image.path);
      if (!source.exists || source.size <= 0) return null;
      source.copy(temp);
    } else {
      await downloadToFile(input.thumbnailUrl, temp, thumbHeaders);
    }
    if (!temp.exists || temp.size <= 0) return null;
    if (target.exists) target.delete();
    temp.move(target);
    return target.uri;
  } catch {
    return null;
  }
}

/** Deletes a chapter's cached pages (and the temp archive) if present. */
export function removeChapterCache(directoryUri: string | null): void {
  if (!directoryUri) return;
  try {
    const directory = new Directory(directoryUri);
    if (directory.exists) directory.delete();
  } catch {
    // Cache cleanup is best effort.
  }
}

/**
 * Lists the cached page files of a completed download in reading order, so the
 * reader can render a downloaded chapter while offline.
 */
export function listCachedPages(directoryUri: string | null): string[] {
  if (!directoryUri) return [];
  try {
    const directory = new Directory(directoryUri);
    if (!directory.exists) return [];
    return directory
      .list()
      .filter((entry): entry is File => entry instanceof File)
      .filter((file) => !file.name.endsWith(".part") && !file.name.endsWith(".cbz"))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((file) => file.uri);
  } catch {
    return [];
  }
}
