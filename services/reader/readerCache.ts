/**
 * readerCache.ts
 * ---------------------------------------------------------------------------
 * Shared, filesystem-backed cache for the pages of the chapter that is open in
 * the reader. Display, detection and OCR all receive the same local file URIs
 * from this service, so a page is fetched exactly once.
 *
 * Layout:
 *   <cache>/reader-cache/<provider>/<manga-key>/<chapter-key>/
 *     manifest.json
 *     images/0001.jpg
 *
 * The files are the content authority. SQLite only records the directory and
 * LRU timestamp; a DB row never turns missing files into a cache hit.
 */

import { Directory, File, Paths } from "expo-file-system";

import {
  deleteReaderCacheChapter as deleteReaderCacheRow,
  clearReaderCacheChapters,
  getReaderCacheChapter,
  listReaderCacheChapters,
  markReaderCacheComplete,
  touchReaderCacheChapter,
  upsertReaderCacheChapter,
} from "@/services/db/repositories/readerCacheRepository";
import type { ReaderCacheChapter } from "@/services/db/schema";
import { fetchExtensionPageImage } from "@/services/extensions/native";
import { isAvifUri, transcodeAvifToPng } from "@/services/images/avif";
import { isDecodableImageUri } from "@/services/images/decode";
import { downloadToFile } from "@/services/net/browserFetch";
import {
  pageExtension,
  safeSegment,
  shortHash,
} from "@/services/downloader/naming";
import { extractSafArchivePages, hasNativeDownloader } from "@/services/downloader/native";
import { listCachedPages } from "@/services/downloader/pageFiles";
import { getSettings } from "@/services/settings/settingsStore";
import { extensionPageUrlFor, imageHeadersForPage } from "@/utils/reader/imageHeaders";
import type { ReaderIdentity } from "@/utils/reader/readerIdentity";

export const READER_CACHE_ROOT_NAME = "reader-cache";
export const READER_CACHE_LIMIT = 2;

const MANIFEST_VERSION = 1;
const PAGE_FETCH_CONCURRENCY = 2;
const PAGE_NAME_PATTERN = /^\d{4,}\.(jpe?g|png|webp|gif|avif|bmp)$/i;

export interface ReaderCachePage {
  index: number;
  file: string;
  sourceUrl: string | null;
  bytes: number;
}

export interface ReaderCacheManifest {
  version: number;
  complete: boolean;
  source: string;
  providerMangaId: string;
  providerChapterId: string;
  mangaId: string;
  chapterId: string;
  mangaTitle: string | null;
  chapterTitle: string | null;
  pageCount: number;
  byteSize: number;
  origin: "network" | "download";
  archiveUri: string | null;
  createdAt: number;
  completedAt: number | null;
  pages: ReaderCachePage[];
}

export interface ReaderCacheHit {
  identity: ReaderIdentity;
  directoryUri: string;
  pages: string[];
  pageCount: number;
  byteSize: number;
  origin: ReaderCacheManifest["origin"];
}

export interface ReaderCacheDownloadInput {
  fileUri: string | null;
  pageCount: number | null;
  /** Legacy per-page download cache, used only as a fallback. */
  pagesDirUri?: string | null;
}

export class ReaderCacheError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ReaderCacheError";
  }
}

let initialized = false;
let initializedPromise: Promise<void> | null = null;
const activeChapterIds = new Set<string>();
const pendingRemovals = new Set<string>();
let evictionDeferred = false;
let evicting = false;

function hashKey(value: string): string {
  return shortHash(value);
}

function segmentFor(value: string, fallback: string): string {
  return safeSegment(value, fallback);
}

export function readerCacheRoot(): Directory {
  return new Directory(Paths.cache, READER_CACHE_ROOT_NAME);
}

function chapterDirectory(identity: ReaderIdentity): Directory {
  const mangaKey = `${segmentFor(identity.providerMangaId, "manga")}~${hashKey(identity.mangaId)}`;
  const chapterKey = `${segmentFor(identity.providerChapterId, "chapter")}~${hashKey(identity.chapterId)}`;
  return new Directory(
    readerCacheRoot(),
    segmentFor(identity.provider, "source"),
    mangaKey,
    chapterKey,
  );
}

function imagesDirectory(chapterDir: Directory): Directory {
  return new Directory(chapterDir, "images");
}

function manifestFile(chapterDir: Directory): File {
  return new File(chapterDir, "manifest.json");
}

function tempName(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function deleteIfPresent(target: File | Directory): void {
  try {
    if (target.exists) target.delete();
  } catch {
    // Best effort: the failure is surfaced when the replacement write fails.
  }
}

async function fileSize(file: File): Promise<number> {
  try {
    return file.exists ? file.size : 0;
  } catch {
    return 0;
  }
}

/** True when React Native's image decoder can open the local file. */
export async function isDecodableImageFile(uri: string): Promise<boolean> {
  return isDecodableImageUri(uri);
}

async function validatePageFile(file: File): Promise<void> {
  if (!file.exists || file.size <= 0) {
    throw new ReaderCacheError(`Cached page is missing or empty: ${file.name}`);
  }
  if (!(await isDecodableImageFile(file.uri))) {
    throw new ReaderCacheError(`Cached page is not decodable: ${file.name}`);
  }
}

/** Writes a manifest atomically: a complete temp file replaces the old one. */
function writeManifest(chapterDir: Directory, manifest: ReaderCacheManifest): void {
  const target = manifestFile(chapterDir);
  const temp = new File(chapterDir, `${target.name}.tmp`);
  deleteIfPresent(temp);
  temp.create({ intermediates: true, overwrite: true });
  temp.write(JSON.stringify(manifest, null, 2));
  deleteIfPresent(target);
  temp.move(target);
}

function parseManifest(value: unknown): ReaderCacheManifest | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<ReaderCacheManifest>;
  if (input.version !== MANIFEST_VERSION || input.complete !== true) return null;
  if (!Array.isArray(input.pages)) return null;
  if (typeof input.pageCount !== "number" || input.pageCount <= 0) return null;
  if (input.pages.length !== input.pageCount) return null;
  const pages: ReaderCachePage[] = [];
  for (const page of input.pages) {
    if (
      !page ||
      typeof page.file !== "string" ||
      !PAGE_NAME_PATTERN.test(page.file) ||
      typeof page.index !== "number" ||
      typeof page.bytes !== "number" ||
      page.bytes <= 0
    ) {
      return null;
    }
    pages.push({
      index: page.index,
      file: page.file,
      sourceUrl: typeof page.sourceUrl === "string" ? page.sourceUrl : null,
      bytes: page.bytes,
    });
  }
  pages.sort((a, b) => a.index - b.index);
  return {
    version: MANIFEST_VERSION,
    complete: true,
    source: typeof input.source === "string" ? input.source : "",
    providerMangaId:
      typeof input.providerMangaId === "string" ? input.providerMangaId : "",
    providerChapterId:
      typeof input.providerChapterId === "string"
        ? input.providerChapterId
        : "",
    mangaId: typeof input.mangaId === "string" ? input.mangaId : "",
    chapterId: typeof input.chapterId === "string" ? input.chapterId : "",
    mangaTitle: typeof input.mangaTitle === "string" ? input.mangaTitle : null,
    chapterTitle:
      typeof input.chapterTitle === "string" ? input.chapterTitle : null,
    pageCount: input.pageCount,
    byteSize: typeof input.byteSize === "number" ? input.byteSize : 0,
    origin: input.origin === "download" ? "download" : "network",
    archiveUri: typeof input.archiveUri === "string" ? input.archiveUri : null,
    createdAt: typeof input.createdAt === "number" ? input.createdAt : 0,
    completedAt:
      typeof input.completedAt === "number" ? input.completedAt : null,
    pages,
  };
}

async function readManifest(chapterDir: Directory): Promise<ReaderCacheManifest | null> {
  try {
    const file = manifestFile(chapterDir);
    if (!file.exists) return null;
    return parseManifest(JSON.parse(await file.text()) as unknown);
  } catch {
    return null;
  }
}

async function validateChapterDirectory(
  identity: ReaderIdentity,
  options: { verifyDecodable?: boolean } = {},
): Promise<ReaderCacheHit | null> {
  const directory = chapterDirectory(identity);
  if (!directory.exists) return null;
  const manifest = await readManifest(directory);
  if (!manifest) return null;
  if (manifest.chapterId !== identity.chapterId) return null;
  const images = imagesDirectory(directory);
  if (!images.exists) return null;
  let byteSize = 0;
  const pages: string[] = [];
  for (let index = 0; index < manifest.pages.length; index += 1) {
    const page = manifest.pages[index];
    if (page.index !== index) return null;
    const file = new File(images, page.file);
    if (!file.exists || file.size <= 0) return null;
    if (options.verifyDecodable) {
      try {
        await validatePageFile(file);
      } catch {
        return null;
      }
    }
    byteSize += file.size;
    pages.push(file.uri);
  }
  if (pages.length !== manifest.pageCount) return null;
  return {
    identity,
    directoryUri: directory.uri,
    pages,
    pageCount: manifest.pageCount,
    byteSize,
    origin: manifest.origin,
  };
}

/** Returns a complete, file-verified cache entry (and touches its LRU time). */
export async function readValidReaderCacheChapter(
  identity: ReaderIdentity,
  options: { verifyDecodable?: boolean } = {},
): Promise<ReaderCacheHit | null> {
  const hit = await validateChapterDirectory(identity, options);
  if (!hit) return null;
  await touchReaderCache(identity);
  return hit;
}

export async function touchReaderCache(identity: ReaderIdentity): Promise<void> {
  try {
    await touchReaderCacheChapter(identity.chapterId);
  } catch {
    // Cache hits are still valid when the LRU timestamp cannot be written.
  }
}

async function commitChapter(input: {
  identity: ReaderIdentity;
  chapterDir: Directory;
  workDir: Directory;
  pages: { file: string; sourceUrl: string | null; bytes: number }[];
  origin: ReaderCacheManifest["origin"];
  archiveUri: string | null;
  mangaTitle: string | null;
  chapterTitle: string | null;
}): Promise<ReaderCacheHit> {
  const { identity, chapterDir, workDir, pages, origin } = input;
  const images = imagesDirectory(chapterDir);
  const manifestTarget = manifestFile(chapterDir);
  deleteIfPresent(manifestTarget);
  if (images.exists) images.delete();
  workDir.move(images);
  const byteSize = pages.reduce((total, page) => total + page.bytes, 0);
  const manifest: ReaderCacheManifest = {
    version: MANIFEST_VERSION,
    complete: true,
    source: identity.provider,
    providerMangaId: identity.providerMangaId,
    providerChapterId: identity.providerChapterId,
    mangaId: identity.mangaId,
    chapterId: identity.chapterId,
    mangaTitle: input.mangaTitle,
    chapterTitle: input.chapterTitle,
    pageCount: pages.length,
    byteSize,
    origin,
    archiveUri: input.archiveUri,
    createdAt: Date.now(),
    completedAt: Date.now(),
    pages: pages.map((page, index) => ({
      index,
      file: page.file,
      sourceUrl: page.sourceUrl,
      bytes: page.bytes,
    })),
  };
  writeManifest(chapterDir, manifest);
  // A crash between writing files and the DB update is repaired by the startup
  // reconciliation, which treats the manifest as the completion marker.
  try {
    await upsertReaderCacheChapter({
      id: identity.chapterId,
      source: identity.provider,
      providerMangaId: identity.providerMangaId,
      providerChapterId: identity.providerChapterId,
      mangaId: identity.mangaId,
      chapterId: identity.chapterId,
      mangaTitle: input.mangaTitle,
      chapterTitle: input.chapterTitle,
      mangaKey: `${segmentFor(identity.providerMangaId, "manga")}~${hashKey(identity.mangaId)}`,
      chapterKey: chapterDir.name,
      directoryUri: chapterDir.uri,
      pageCount: pages.length,
      byteSize,
      complete: true,
      lastAccessedAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  } catch (error) {
    console.warn("[reader-cache] could not record chapter in SQLite", error);
  }
  return {
    identity,
    directoryUri: chapterDir.uri,
    pages: pages.map((page) => new File(images, page.file).uri),
    pageCount: pages.length,
    byteSize,
    origin,
  };
}

function prepareChapterDir(identity: ReaderIdentity): {
  chapterDir: Directory;
  workDir: Directory;
} {
  const chapterDir = chapterDirectory(identity);
  if (!chapterDir.exists) {
    chapterDir.create({ intermediates: true, idempotent: true });
  }
  const workDir = new Directory(chapterDir, tempName("images.tmp"));
  if (workDir.exists) workDir.delete();
  workDir.create({ intermediates: true, idempotent: true });
  return { chapterDir, workDir };
}

async function writePageFile(input: {
  provider: string;
  url: string;
  index: number;
  workDir: Directory;
}): Promise<{ file: string; sourceUrl: string; bytes: number }> {
  const { provider, url, index, workDir } = input;
  const extension = pageExtension(url, index);
  const tempExtension = isAvifUri(url) ? "avif" : extension.split(".").pop() || "img";
  const temp = new File(workDir, `page-${String(index + 1).padStart(4, "0")}.${tempExtension}.part`);
  deleteIfPresent(temp);

  try {
    if (provider.startsWith("ext:")) {
      const image = await fetchExtensionPageImage(
        provider.slice(4),
        url,
        extensionPageUrlFor(url) ?? url,
      );
      const source = new File(image.path);
      if (!source.exists || source.size <= 0) {
        throw new ReaderCacheError(`Extension returned an empty page image (${index + 1}).`);
      }
      source.copy(temp);
      if (isAvifUri(url) || /avif/i.test(image.mime)) {
        const pngUri = await transcodeAvifToPng(temp.uri);
        deleteIfPresent(temp);
        new File(pngUri).copy(temp);
      }
    } else {
      await downloadToFile(url, temp, imageHeadersForPage(provider, url));
      if (isAvifUri(url)) {
        const pngUri = await transcodeAvifToPng(temp.uri);
        deleteIfPresent(temp);
        new File(pngUri).copy(temp);
      }
    }
    if (!temp.exists || temp.size <= 0) {
      throw new ReaderCacheError(`Page ${index + 1} downloaded empty.`);
    }
    if (!(await isDecodableImageFile(temp.uri))) {
      throw new ReaderCacheError(`Page ${index + 1} is not a decodable image.`);
    }
    const finalName = `${String(index + 1).padStart(4, "0")}.${
      isAvifUri(url) ? "png" : extension.split(".").pop() || "jpg"
    }`;
    const target = new File(workDir, finalName);
    deleteIfPresent(target);
    temp.move(target);
    return { file: finalName, sourceUrl: url, bytes: target.size };
  } finally {
    deleteIfPresent(temp);
  }
}

async function runPageWorkers<T>(
  count: number,
  concurrency: number,
  worker: (index: number) => Promise<T>,
): Promise<T[]> {
  const output = new Array<T>(count);
  let next = 0;
  let failure: unknown = null;
  const pump = async () => {
    while (!failure && next < count) {
      const index = next;
      next += 1;
      try {
        output[index] = await worker(index);
      } catch (error) {
        failure = error;
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, count) }, () => pump()),
  );
  if (failure) throw failure;
  return output;
}

/** Materialises a network chapter into the shared reader cache. */
export async function materializeNetworkReaderChapter(
  identity: ReaderIdentity,
  pageUrls: string[],
  options: {
    mangaTitle?: string | null;
    chapterTitle?: string | null;
    onProgress?: (done: number, total: number) => void;
  } = {},
): Promise<ReaderCacheHit> {
  if (pageUrls.length === 0) {
    throw new ReaderCacheError("This chapter has no pages to cache.");
  }
  const cached = await validateChapterDirectory(identity);
  if (cached && cached.pageCount === pageUrls.length) {
    await touchReaderCache(identity);
    await enforceReaderCacheLimit();
    return cached;
  }

  const { chapterDir, workDir } = prepareChapterDir(identity);
  let done = 0;
  try {
    const pages = await runPageWorkers(
      pageUrls.length,
      PAGE_FETCH_CONCURRENCY,
      async (index) => {
        const page = await writePageFile({
          provider: identity.provider,
          url: pageUrls[index],
          index,
          workDir,
        });
        done += 1;
        options.onProgress?.(done, pageUrls.length);
        return page;
      },
    );
    const hit = await commitChapter({
      identity,
      chapterDir,
      workDir,
      pages,
      origin: "network",
      archiveUri: null,
      mangaTitle: options.mangaTitle ?? null,
      chapterTitle: options.chapterTitle ?? null,
    });
    await enforceReaderCacheLimit();
    return hit;
  } catch (error) {
    deleteIfPresent(workDir);
    throw error instanceof ReaderCacheError
      ? error
      : new ReaderCacheError(
          error instanceof Error ? error.message : "Could not cache chapter pages.",
          { cause: error },
        );
  }
}

async function materializeFromPageFiles(input: {
  identity: ReaderIdentity;
  chapterDir: Directory;
  workDir: Directory;
  files: string[];
  options: {
    mangaTitle?: string | null;
    chapterTitle?: string | null;
  };
  archiveUri: string | null;
}): Promise<ReaderCacheHit> {
  const { identity, chapterDir, workDir, files } = input;
  const pages: { file: string; sourceUrl: string | null; bytes: number }[] = [];
  for (let index = 0; index < files.length; index += 1) {
    const source = new File(files[index]);
    if (!source.exists || source.size <= 0) {
      throw new ReaderCacheError(`Downloaded page ${index + 1} is missing or empty.`);
    }
    const avif = isAvifUri(source.uri);
    const extension = (source.name.split(".").pop() || "jpg").toLowerCase();
    const finalName = `${String(index + 1).padStart(4, "0")}.${avif ? "png" : extension}`;
    const target = new File(workDir, finalName);
    deleteIfPresent(target);
    if (avif) {
      const pngUri = await transcodeAvifToPng(source.uri);
      new File(pngUri).copy(target);
    } else {
      source.copy(target);
    }
    await validatePageFile(target);
    pages.push({ file: finalName, sourceUrl: null, bytes: target.size });
  }
  return commitChapter({
    identity,
    chapterDir,
    workDir,
    pages,
    origin: "download",
    archiveUri: input.archiveUri,
    mangaTitle: input.options.mangaTitle ?? null,
    chapterTitle: input.options.chapterTitle ?? null,
  });
}

/** Materialises a downloaded chapter by extracting its CBZ into the cache. */
export async function materializeDownloadedReaderChapter(
  identity: ReaderIdentity,
  download: ReaderCacheDownloadInput,
  options: {
    mangaTitle?: string | null;
    chapterTitle?: string | null;
    onProgress?: (done: number, total: number) => void;
  } = {},
): Promise<ReaderCacheHit> {
  const cached = await validateChapterDirectory(identity);
  if (cached && (download.pageCount == null || cached.pageCount === download.pageCount)) {
    await touchReaderCache(identity);
    await enforceReaderCacheLimit();
    return cached;
  }

  const extracted: string[] = [];
  const { chapterDir, workDir } = prepareChapterDir(identity);
  try {
    if (download.fileUri) {
      if (!hasNativeDownloader()) {
        throw new ReaderCacheError(
          "Opening downloaded chapters needs the native download module. Rebuild the app and try again.",
        );
      }
      const extractDir = new Directory(chapterDir, tempName("extracted.tmp"));
      deleteIfPresent(extractDir);
      extractDir.create({ intermediates: true, idempotent: true });
      try {
        const raw = await extractSafArchivePages(
          download.fileUri,
          extractDir.uri,
        );
        extracted.push(
          ...raw
            .filter((uri) => PAGE_NAME_PATTERN.test(new File(uri).name))
            .sort((a, b) => new File(a).name.localeCompare(new File(b).name)),
        );
        if (extracted.length === 0) {
          throw new ReaderCacheError("The downloaded archive contains no page images.");
        }
        if (
          download.pageCount != null &&
          download.pageCount > 0 &&
          extracted.length !== download.pageCount
        ) {
          throw new ReaderCacheError(
            "The downloaded archive has " +
              extracted.length +
              " pages, expected " +
              download.pageCount +
              ".",
          );
        }
        options.onProgress?.(0, extracted.length);
        const hit = await materializeFromPageFiles({
          identity,
          chapterDir,
          workDir,
          files: extracted,
          options,
          archiveUri: download.fileUri,
        });
        await enforceReaderCacheLimit();
        return hit;
      } finally {
        deleteIfPresent(extractDir);
      }
    }

    const legacy = listCachedPages(download.pagesDirUri ?? null);
    if (legacy.length === 0) {
      throw new ReaderCacheError(
        "The downloaded archive is missing. Download this chapter again.",
      );
    }
    if (
      download.pageCount != null &&
      download.pageCount > 0 &&
      legacy.length !== download.pageCount
    ) {
      throw new ReaderCacheError(
        `The downloaded pages are incomplete (${legacy.length} of ${download.pageCount}).`,
      );
    }
    options.onProgress?.(0, legacy.length);
    const hit = await materializeFromPageFiles({
      identity,
      chapterDir,
      workDir,
      files: legacy,
      options,
      archiveUri: null,
    });
    await enforceReaderCacheLimit();
    return hit;
  } catch (error) {
    deleteIfPresent(workDir);
    throw error instanceof ReaderCacheError
      ? error
      : new ReaderCacheError(
          error instanceof Error
            ? error.message
            : "Could not extract the downloaded chapter.",
          { cause: error },
        );
  }
}

/** Marks a chapter as in use so LRU eviction cannot remove its files. */
export function pinReaderCacheChapter(chapterId: string): void {
  activeChapterIds.add(chapterId);
}

/** Releases a chapter, honouring a deferred delete and any pending eviction. */
export function releaseReaderCacheChapter(chapterId: string): void {
  activeChapterIds.delete(chapterId);
  if (pendingRemovals.delete(chapterId)) {
    // Wait for the delete before applying LRU, otherwise the row being removed
    // still counts towards the limit and a second chapter is evicted.
    void deleteReaderCacheEntry(chapterId)
      .catch((error) => {
        console.warn("[reader-cache] could not delete released chapter", error);
      })
      .finally(() => {
        if (evictionDeferred) {
          evictionDeferred = false;
          void enforceReaderCacheLimit();
        }
      });
    return;
  }
  if (evictionDeferred) {
    evictionDeferred = false;
    void enforceReaderCacheLimit();
  }
}

async function deleteReaderCacheEntry(chapterId: string): Promise<boolean> {
  const row = await getReaderCacheChapter(chapterId).catch(() => null);
  if (row) {
    let filesDeleted = true;
    try {
      const directory = new Directory(row.directoryUri);
      if (directory.exists) directory.delete();
    } catch (error) {
      console.warn("[reader-cache] could not delete chapter files", error);
      filesDeleted = false;
    }
    // Keep the row when the files could not be removed. The row is the only
    // way a later pass can retry the eviction; dropping it would leave the
    // directory orphaned and make the LRU report a slot it never freed.
    if (!filesDeleted) return false;
    try {
      await deleteReaderCacheRow(chapterId);
    } catch (error) {
      console.warn("[reader-cache] could not delete chapter row", error);
      return false;
    }
    return true;
  }
  return false;
}

/**
 * Removes a cached chapter. Pinned chapters are queued for removal on release
 * so files that an open reader is rendering are never deleted underneath it.
 */
export async function removeReaderCacheChapter(chapterId: string): Promise<boolean> {
  if (activeChapterIds.has(chapterId)) {
    pendingRemovals.add(chapterId);
    return false;
  }
  pendingRemovals.delete(chapterId);
  return deleteReaderCacheEntry(chapterId);
}

/** Enforces the two-chapter LRU limit, skipping chapters pinned by readers. */
export async function enforceReaderCacheLimit(): Promise<void> {
  if (evicting) return;
  evicting = true;
  try {
    const rows = await listReaderCacheChapters();
    let remaining = rows.length;
    // Incomplete rows never count as cached chapters.
    for (const row of rows) {
      if (row.complete) continue;
      if (await removeReaderCacheChapter(row.id)) remaining -= 1;
    }
    if (remaining <= READER_CACHE_LIMIT) return;
    for (const row of rows) {
      if (remaining <= READER_CACHE_LIMIT) break;
      if (!row.complete) continue;
      if (activeChapterIds.has(row.id)) {
        evictionDeferred = true;
        continue;
      }
      if (await removeReaderCacheChapter(row.id)) remaining -= 1;
    }
    if (remaining > READER_CACHE_LIMIT) evictionDeferred = true;
  } catch (error) {
    console.warn("[reader-cache] LRU enforcement failed", error);
  } finally {
    evicting = false;
  }
}

/** Deletes the whole reader cache (files + SQLite rows). */
export async function clearReaderCache(): Promise<void> {
  evictionDeferred = false;
  pendingRemovals.clear();
  try {
    const root = readerCacheRoot();
    if (root.exists) root.delete();
  } catch (error) {
    console.warn("[reader-cache] could not delete cache directory", error);
  }
  try {
    await clearReaderCacheChapters();
  } catch (error) {
    console.warn("[reader-cache] could not clear cache rows", error);
  }
}

/** Removes only incomplete leftovers; used when clear-on-start is off. */
export async function clearTransientReaderCache(): Promise<void> {
  try {
    const root = readerCacheRoot();
    if (root.exists) {
      for (const sourceEntry of root.list()) {
        if (!(sourceEntry instanceof Directory)) continue;
        for (const mangaEntry of sourceEntry.list()) {
          if (!(mangaEntry instanceof Directory)) continue;
          for (const chapterEntry of mangaEntry.list()) {
            if (!(chapterEntry instanceof Directory)) continue;
            const manifest = await readManifest(chapterEntry);
            if (!manifest) {
              try {
                chapterEntry.delete();
              } catch {
                // Best effort.
              }
            }
          }
        }
      }
    }
  } catch (error) {
    console.warn("[reader-cache] transient cleanup failed", error);
  }
}

function normalizeDirectoryUri(uri: string): string {
  return uri.replace(/\/+$/, "");
}

/** Every `<source>/<manga>/<chapter>` directory below the cache root. */
function listChapterDirectories(): Directory[] {
  const root = readerCacheRoot();
  try {
    if (!root.exists) return [];
    const chapters: Directory[] = [];
    for (const sourceEntry of root.list()) {
      if (!(sourceEntry instanceof Directory)) continue;
      for (const mangaEntry of sourceEntry.list()) {
        if (!(mangaEntry instanceof Directory)) continue;
        for (const chapterEntry of mangaEntry.list()) {
          if (chapterEntry instanceof Directory) chapters.push(chapterEntry);
        }
      }
    }
    return chapters;
  } catch (error) {
    console.warn("[reader-cache] could not list chapter directories", error);
    return [];
  }
}

/**
 * Removes chapter directories that no validated cache row references. This
 * covers interrupted materialisations and rows deleted outside the cache
 * service, while leaving the two valid LRU chapters untouched.
 */
async function pruneOrphanChapterDirectories(
  validUris: Set<string>,
): Promise<void> {
  try {
    const root = readerCacheRoot();
    if (!root.exists) return;
    for (const sourceEntry of root.list()) {
      if (!(sourceEntry instanceof Directory)) continue;
      for (const mangaEntry of sourceEntry.list()) {
        if (!(mangaEntry instanceof Directory)) continue;
        for (const chapterEntry of mangaEntry.list()) {
          if (!(chapterEntry instanceof Directory)) continue;
          if (validUris.has(normalizeDirectoryUri(chapterEntry.uri))) continue;
          try {
            chapterEntry.delete();
          } catch {
            // Best effort; the next startup pass retries.
          }
        }
        try {
          if (mangaEntry.list().length === 0) mangaEntry.delete();
        } catch {
          // Best effort.
        }
      }
      try {
        if (sourceEntry.list().length === 0) sourceEntry.delete();
      } catch {
        // Best effort.
      }
    }
  } catch (error) {
    console.warn("[reader-cache] orphan cleanup failed", error);
  }
}

async function reconcileCacheRows(): Promise<void> {
  let rows: ReaderCacheChapter[];
  try {
    rows = await listReaderCacheChapters();
  } catch (error) {
    // Never prune files when the index itself could not be read.
    console.warn("[reader-cache] could not read cache rows", error);
    return;
  }
  const validDirectories = new Set<string>();
  for (const row of rows) {
    const identity: ReaderIdentity = {
      provider: row.source as ReaderIdentity["provider"],
      providerMangaId: row.providerMangaId,
      providerChapterId: row.providerChapterId,
      mangaId: row.mangaId,
      chapterId: row.chapterId,
    };
    const hit = await validateChapterDirectory(identity, {
      verifyDecodable: true,
    });
    if (!hit) {
      await removeReaderCacheChapter(row.id);
      continue;
    }
    validDirectories.add(normalizeDirectoryUri(hit.directoryUri));
    if (!row.complete || row.pageCount !== hit.pageCount) {
      try {
        await markReaderCacheComplete(row.id, {
          pageCount: hit.pageCount,
          byteSize: hit.byteSize,
          directoryUri: hit.directoryUri,
        });
      } catch {
        // The files remain valid even when the row cannot be refreshed.
      }
    }
  }

  // The manifest is the completion marker. A crash between writing it and the
  // SQLite row must not discard an otherwise complete chapter, so adopt any
  // directory whose manifest and files validate but whose row is missing.
  const knownDirectories = new Set(validDirectories);
  for (const directory of listChapterDirectories()) {
    if (knownDirectories.has(normalizeDirectoryUri(directory.uri))) continue;
    const manifest = await readManifest(directory);
    if (!manifest) continue;
    const identity: ReaderIdentity = {
      provider: manifest.source as ReaderIdentity["provider"],
      providerMangaId: manifest.providerMangaId,
      providerChapterId: manifest.providerChapterId,
      mangaId: manifest.mangaId,
      chapterId: manifest.chapterId,
    };
    const expected = chapterDirectory(identity);
    if (normalizeDirectoryUri(expected.uri) !== normalizeDirectoryUri(directory.uri)) {
      continue;
    }
    const hit = await validateChapterDirectory(identity, {
      verifyDecodable: true,
    });
    if (!hit) continue;
    try {
      await upsertReaderCacheChapter({
        id: identity.chapterId,
        source: identity.provider,
        providerMangaId: identity.providerMangaId,
        providerChapterId: identity.providerChapterId,
        mangaId: identity.mangaId,
        chapterId: identity.chapterId,
        mangaTitle: manifest.mangaTitle,
        chapterTitle: manifest.chapterTitle,
        mangaKey: segmentFor(identity.providerMangaId, "manga") + "~" + hashKey(identity.mangaId),
        chapterKey: directory.name,
        directoryUri: directory.uri,
        pageCount: hit.pageCount,
        byteSize: hit.byteSize,
        complete: true,
        lastAccessedAt: Date.now(),
        createdAt: manifest.createdAt || Date.now(),
        updatedAt: Date.now(),
      });
      validDirectories.add(normalizeDirectoryUri(directory.uri));
    } catch (error) {
      console.warn("[reader-cache] could not adopt cache directory", error);
    }
  }
  await pruneOrphanChapterDirectories(validDirectories);
  await enforceReaderCacheLimit();
}

/**
 * Cold-start initialisation. Clears the reader cache when the user opted in,
 * otherwise validates rows/directories and applies the LRU limit. Safe to call
 * multiple times; it does nothing after the first successful run.
 */
export function initializeReaderCache(): Promise<void> {
  if (initializedPromise) return initializedPromise;
  initializedPromise = (async () => {
    try {
      const settings = await getSettings();
      if (settings.readerClearCacheOnStart) {
        await clearReaderCache();
        console.log("[reader-cache] cleared on cold start");
      } else {
        await clearTransientReaderCache();
        await reconcileCacheRows();
      }
      initialized = true;
    } catch (error) {
      console.warn("[reader-cache] initialisation failed", error);
      initializedPromise = null;
    }
  })();
  return initializedPromise;
}

/** True once the cold-start pass completed. */
export function isReaderCacheInitialized(): boolean {
  return initialized;
}
