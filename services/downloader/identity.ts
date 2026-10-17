/**
 * identity.ts
 * ---------------------------------------------------------------------------
 * Canonical identities for download jobs. They match the rows the library,
 * history and progress layers persist.
 * ---------------------------------------------------------------------------
 */

import { canonicalId } from "@/services/db/repositories/catalogRepository";
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

/** Extension route params are URL-encoded chapter and manga paths. */
export function encodeProviderParam(_provider: string, value: string): string {
  return encodeURIComponent(value);
}

/** Reader route params are encoded for URL-based extension sources. */
export function readerTarget(input: {
  source: string;
  chapterId: string;
  mangaId?: string;
}): DownloadTarget {
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