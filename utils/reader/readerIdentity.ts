/**
 * readerIdentity.ts
 * ---------------------------------------------------------------------------
 * Resolves the provider-specific reader route params (source + encoded
 * manga/chapter ids) into the canonical DB identities used by the catalog,
 * history, progress and translation-cache repositories.
 *
 * MangaKatana and Manhwa18/Mgeko/Comix pass URLs through Expo Router, so the
 * encoded values must be decoded exactly the same way everywhere they are
 * stored - keeping that rule here avoids the reader screen from carrying two
 * copies of it.
 * ---------------------------------------------------------------------------
 */

import {
  canonicalId,
  type ProviderId,
} from "@/services/db/repositories/catalogRepository";
import { decodePath } from "@/services/mangakatana/mangakatana.utils";

export interface ReaderRouteIdentity {
  source: string;
  chapterId: string;
  mangaId?: string;
}

export interface ProviderReaderIds {
  provider: ProviderId;
  /** Decoded provider manga id (URL for URL-based providers). */
  providerMangaId: string;
  /** Decoded provider chapter id (URL for URL-based providers). */
  providerChapterId: string;
}

export interface ReaderIdentity extends ProviderReaderIds {
  /** Canonical provider-qualified manga id. */
  mangaId: string;
  /** Canonical provider-qualified chapter id. */
  chapterId: string;
}

/** Decodes the provider manga/chapter route params (URL-based providers). */
export function providerReaderIds({
  source,
  chapterId,
  mangaId,
}: ReaderRouteIdentity): ProviderReaderIds {
  const provider = source as ProviderId;
  if (provider === "mangakatana") {
    return {
      provider,
      providerMangaId: decodePath(mangaId || chapterId),
      providerChapterId: decodePath(chapterId),
    };
  }
  if (
    provider === "manhwa18" ||
    provider === "mgeko" ||
    provider === "comix" ||
    provider === "brainrot" ||
    provider === "philia"
  ) {
    return {
      provider,
      providerMangaId: decodeURIComponent(mangaId || chapterId),
      providerChapterId: decodeURIComponent(chapterId),
    };
  }
  return {
    provider,
    providerMangaId: mangaId || chapterId,
    providerChapterId: chapterId,
  };
}

/** Canonical DB identities used by the translation cache + AI context. */
export function resolveReaderIdentity(
  params: ReaderRouteIdentity,
): ReaderIdentity {
  const ids = providerReaderIds(params);
  const mangaId = canonicalId(ids.provider, ids.providerMangaId);
  return {
    ...ids,
    mangaId,
    chapterId: canonicalId(mangaId, ids.providerChapterId),
  };
}
