/**
 * providerAdapters.ts
 * ---------------------------------------------------------------------------
 * Catalog snapshots for library/download refresh. Only installed extension
 * sources are supported; all hand-written provider integrations were removed.
 * ---------------------------------------------------------------------------
 */

import { getExtensionManga } from "@/services/extensions/native";
import type { NativeMangaDetails } from "@/services/extensions/types";
import type {
  ProviderId,
  TrackedChapterInput,
  TrackedMangaInput,
} from "@/services/db/repositories/catalogRepository";

export type { ProviderId } from "@/services/db/repositories/catalogRepository";

export interface ProviderCatalogSnapshot {
  manga: TrackedMangaInput;
  chapters: Omit<TrackedChapterInput, "mangaId">[];
}

export interface ProviderAdapter {
  provider: ProviderId;
  load(providerMangaId: string): Promise<ProviderCatalogSnapshot>;
}

function extensionSnapshot(
  provider: ProviderId,
  details: NativeMangaDetails,
): ProviderCatalogSnapshot {
  return {
    manga: {
      provider,
      providerMangaId: details.manga.url,
      title: details.manga.title || "Untitled",
      thumbnailUrl: details.manga.thumbnailUrl,
      description: details.manga.description,
    },
    chapters: details.chapters.map((chapter) => {
      const number =
        chapter.chapterNumber != null && chapter.chapterNumber >= 0
          ? chapter.chapterNumber
          : null;
      const date =
        chapter.dateUpload > 0
          ? chapter.dateUpload < 100_000_000_000
            ? chapter.dateUpload * 1000
            : chapter.dateUpload
          : null;
      return {
        providerChapterId: chapter.url,
        title: chapter.name || "Chapter",
        chapterNumber: number,
        scanlationGroup: chapter.scanlator,
        chapterGroupKey: number != null ? String(number) : chapter.name,
        languageCode: null,
        publishedAt: date,
      };
    }),
  };
}

export function getProviderAdapter(provider: ProviderId): ProviderAdapter {
  if (!provider.startsWith("ext:")) {
    throw new Error(
      "This record belongs to a removed built-in provider. Re-add the series from an installed extension.",
    );
  }
  const sourceId = provider.slice(4);
  return {
    provider,
    async load(providerMangaId) {
      return extensionSnapshot(
        provider,
        await getExtensionManga(sourceId, providerMangaId),
      );
    },
  };
}