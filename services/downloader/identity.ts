/**
 * identity.ts
 * ---------------------------------------------------------------------------
 * Canonical identities for download jobs. They match the rows the library,
 * history and progress layers persist, so a downloaded chapter is the same
 * record as an opened chapter.
 * ---------------------------------------------------------------------------
 */

import { canonicalId } from "@/services/db/repositories/catalogRepository";
import { encodePath } from "@/services/mangakatana/mangakatana.utils";
import { resolveReaderIdentity } from "@/utils/reader/readerIdentity";

export interface DownloadTargetInput {
  provider: string;
  /** Decoded provider manga identity (id/slug/url). */
  providerMangaId: string;
  /** Decoded provider chapter identity (id/url). */
  providerChapterId: string;
}

export interface DownloadTarget {
  provider: string;
  providerMangaId: string;
  providerChapterId: string;
  /** `<provider>:<providerMangaId>`. */
  mangaId: string;
  /** `<provider>:<providerMangaId>:<providerChapterId>`. */
  chapterId: string;
}

/** Builds the canonical manga/chapter ids used by the downloads table. */
export function downloadTarget(input: DownloadTargetInput): DownloadTarget {
  const mangaId = canonicalId(input.provider, input.providerMangaId);
  return {
    provider: input.provider,
    providerMangaId: input.providerMangaId,
    providerChapterId: input.providerChapterId,
    mangaId,
    chapterId: canonicalId(mangaId, input.providerChapterId),
  };
}

/**
 * Encodes a provider identity the way that provider's route params expect it
 * (mangakatana uses `encodePath`, URL-based providers use `encodeURIComponent`).
 */
export function encodeProviderParam(provider: string, value: string): string {
  if (provider === "mangakatana") return encodePath(value);
  if (
    provider === "manhwa18" ||
    provider === "mgeko" ||
    provider === "comix" ||
    provider === "brainrot" ||
    provider === "philia"
  ) {
    return encodeURIComponent(value);
  }
  return value;
}

/**
 * Reader route params are encoded for URL-based providers; the downloader
 * works with the decoded identities, exactly like the library does.
 */
export function readerTarget(input: {
  source: string;
  chapterId: string;
  mangaId?: string;
}): DownloadTarget {
  // Uses the reader's own resolver so a download always refers to the exact
  // chapter ids the reader, history and progress layers persist.
  const ids = resolveReaderIdentity({
    source: input.source,
    chapterId: input.chapterId,
    mangaId: input.mangaId,
  });
  return {
    provider: ids.provider,
    providerMangaId: ids.providerMangaId,
    providerChapterId: ids.providerChapterId,
    mangaId: ids.mangaId,
    chapterId: ids.chapterId,
  };
}
