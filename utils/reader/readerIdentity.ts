import { canonicalId } from "@/services/db/repositories/catalogRepository";
import type { ProviderId } from "@/services/db/repositories/catalogRepository";

export interface ReaderRouteIdentity {
  source: string;
  chapterId: string;
  mangaId?: string;
}

export interface ProviderReaderIds {
  provider: ProviderId;
  /** Decoded provider manga id (URL for extension sources). */
  providerMangaId: string;
  /** Decoded provider chapter id (URL for extension sources). */
  providerChapterId: string;
}

export interface ReaderIdentity extends ProviderReaderIds {
  /** Canonical provider-qualified manga id. */
  mangaId: string;
  /** Canonical provider-qualified chapter id. */
  chapterId: string;
}

/** Decodes extension manga/chapter route params. */
export function providerReaderIds({
  source,
  chapterId,
  mangaId,
}: ReaderRouteIdentity): ProviderReaderIds {
  const provider = source as ProviderId;
  if (provider.startsWith("ext:")) {
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