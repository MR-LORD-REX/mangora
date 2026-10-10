import Mangadex from "@/services/mangadex/mangaDex";
import type {
    Chapter as MangaDexChapter,
    Manga as MangaDexManga,
} from "@/services/mangadex/mangadex.types";
import { MangaKatana } from "@/services/mangakatana/mangakatana";
import type {
    ChapterEntry as MangaKatanaChapter,
    MangaDetails as MangaKatanaDetails,
} from "@/services/mangakatana/mangakatana.types";
import { Manhwa18Source } from "@/services/manhwa18/Manhwa18";
import type {
    ChapterEntry as Manhwa18Chapter,
    MangaDetails as Manhwa18Details,
} from "@/services/manhwa18/types";
import type { NhGallery } from "@/services/nh/nh.types";
import { nhClient } from "@/services/nh/nhShared";
import { MgekoClient } from "@/services/mgeko/mgeko";
import type {
    Chapter as MgekoChapter,
    MangaDetails as MgekoDetails,
} from "@/services/mgeko/mgeko.types";
import { comixAllChapters, comixChapterTitle, comixMangaDetail, comixPosterUrl } from "@/services/comix/comix.api";
import type { ComixApiChapter, ComixApiManga } from "@/services/comix/comix.api.types";
import { BrainRotComicsClient } from "@/services/brainrot/brainrot";
import { brainrotBridgeFetch } from "@/services/brainrot/brainrotBridge";
import type {
    ChapterEntry as BrainRotChapter,
    MangaDetails as BrainRotDetails,
} from "@/services/brainrot/brainrot.types";
import { PhiliaScansClient, chapterTitle as philiaChapterTitle } from "@/services/philia/philia";
import type {
    PhiliaChapter,
    PhiliaMangaDetails,
} from "@/services/philia/philia.types";

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

const parseChapterNumber = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const match = value.match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const number = Number(match[0]);
  return Number.isFinite(number) ? number : null;
};

const epoch = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
};

/** Textual main-chapter key derived from a chapter's display name. */
const groupKeyFromName = (name: string | null | undefined): string | null => {
  const parsed = parseChapterNumber(name);
  return parsed != null ? String(parsed) : null;
};

function mangaDexSnapshot(manga: MangaDexManga, chapters: MangaDexChapter[]): ProviderCatalogSnapshot {
  return {
    manga: {
      provider: "mangadex",
      providerMangaId: manga.id,
      title: manga.title,
      thumbnailUrl: manga.cover?.url ?? null,
      description: manga.description,
    },
    chapters: chapters.map((chapter) => ({
      providerChapterId: chapter.id,
      title: chapter.title || chapter.chapter || "Chapter",
      chapterNumber: parseChapterNumber(chapter.chapter),
      scanlationGroup: chapter.group ?? chapter.groups[0]?.name ?? null,
      chapterGroupKey: chapter.chapter ?? "Oneshot",
      volume: chapter.volume,
      languageCode: chapter.language.code,
      pageCount: chapter.pages,
      publishedAt: epoch(chapter.publishAt),
    })),
  };
}

function mangaKatanaSnapshot(
  details: MangaKatanaDetails,
  chapterList: MangaKatanaChapter[],
): ProviderCatalogSnapshot {
  return {
    manga: {
      provider: "mangakatana",
      providerMangaId: details.url,
      title: details.title,
      thumbnailUrl: details.coverUrl,
      description: details.description,
    },
    chapters: chapterList.map((chapter) => ({
      providerChapterId: chapter.url,
      title: chapter.name,
      chapterNumber: parseChapterNumber(chapter.name),
      scanlationGroup: null,
      chapterGroupKey: groupKeyFromName(chapter.name),
      publishedAt: chapter.dateUpload,
    })),
  };
}

function manhwa18Snapshot(
  details: Manhwa18Details,
  chapterList: Manhwa18Chapter[],
): ProviderCatalogSnapshot {
  return {
    manga: {
      provider: "manhwa18",
      providerMangaId: details.url,
      title: details.title,
      thumbnailUrl: details.thumbnailUrl,
      description: details.description,
    },
    chapters: chapterList.map((chapter) => ({
      providerChapterId: chapter.url,
      title: chapter.name,
      chapterNumber: parseChapterNumber(chapter.name),
      scanlationGroup: null,
      chapterGroupKey: groupKeyFromName(chapter.name),
      publishedAt: chapter.dateUpload,
    })),
  };
}

function mgekoSnapshot(
  details: MgekoDetails,
  chapterList: MgekoChapter[],
): ProviderCatalogSnapshot {
  return {
    manga: {
      provider: "mgeko",
      providerMangaId: details.url,
      title: details.title,
      thumbnailUrl: details.thumbnailUrl,
      description: details.description,
    },
    chapters: chapterList.map((chapter) => ({
      providerChapterId: chapter.url,
      title: chapter.name,
      chapterNumber: parseChapterNumber(chapter.name),
      scanlationGroup: null,
      chapterGroupKey: groupKeyFromName(chapter.name),
      publishedAt: chapter.uploadDate,
    })),
  };
}

function comixSnapshot(
  manga: ComixApiManga,
  chapterList: ComixApiChapter[],
): ProviderCatalogSnapshot {
  return {
    manga: {
      provider: "comix",
      providerMangaId: manga.url,
      title: manga.title,
      thumbnailUrl: comixPosterUrl(manga),
      description: manga.synopsis,
    },
    chapters: chapterList.map((chapter) => ({
      providerChapterId: chapter.url,
      title: comixChapterTitle(chapter),
      chapterNumber: chapter.number,
      scanlationGroup: chapter.group?.name ?? null,
      chapterGroupKey: chapter.number != null ? String(chapter.number) : null,
      languageCode: chapter.language || null,
    })),
  };
}

function brainrotSnapshot(
  details: BrainRotDetails,
  chapterList: BrainRotChapter[],
): ProviderCatalogSnapshot {
  return {
    manga: {
      provider: "brainrot",
      providerMangaId: details.url,
      title: details.title,
      thumbnailUrl: details.thumbnailUrl,
      description: details.description,
    },
    chapters: chapterList.map((chapter) => ({
      providerChapterId: chapter.url,
      title: chapter.name,
      chapterNumber: parseChapterNumber(chapter.name),
      scanlationGroup: null,
      chapterGroupKey: groupKeyFromName(chapter.name),
      publishedAt: chapter.dateUpload,
    })),
  };
}

function philiaSnapshot(
  details: PhiliaMangaDetails,
  chapterList: PhiliaChapter[],
): ProviderCatalogSnapshot {
  return {
    manga: {
      provider: "philia",
      providerMangaId: details.slug,
      title: details.title,
      thumbnailUrl: details.coverImageUrl,
      description: details.synopsis,
    },
    chapters: chapterList.map((chapter) => ({
      providerChapterId: String(chapter.id),
      title: philiaChapterTitle(chapter),
      chapterNumber: chapter.number,
      scanlationGroup: null,
      chapterGroupKey: String(chapter.number),
      languageCode: chapter.language,
      pageCount: chapter.pageCount,
      publishedAt: chapter.publishedAt,
    })),
  };
}

function nhSnapshot(gallery: NhGallery): ProviderCatalogSnapshot {
  return {
    manga: {
      provider: "nh",
      providerMangaId: gallery.id,
      title: gallery.title,
      thumbnailUrl: gallery.thumbUrl || gallery.coverUrl,
      description: null,
    },
    chapters: [
      {
        providerChapterId: gallery.id,
        title: "Gallery",
        chapterNumber: null,
        languageCode: gallery.languages[0] ?? null,
        pageCount: gallery.pageCount,
        publishedAt: gallery.uploadedAt || null,
      },
    ],
  };
}

export const providerAdapters: Record<ProviderId, ProviderAdapter> = {
  mangadex: {
    provider: "mangadex",
    async load(providerMangaId) {
      const api = new Mangadex();
      const manga = await api.getManga(providerMangaId);
      const chapters = await api.getChapters(providerMangaId, {
        includeUnreadable: false,
        dedupe: false,
      });
      return mangaDexSnapshot(manga, chapters);
    },
  },
  mangakatana: {
    provider: "mangakatana",
    async load(providerMangaId) {
      const api = new MangaKatana();
      const result = await api.getMangaDetailsAndChapters(providerMangaId);
      return mangaKatanaSnapshot(result.details, result.chapters);
    },
  },
  manhwa18: {
    provider: "manhwa18",
    async load(providerMangaId) {
      const api = new Manhwa18Source();
      const result = await api.getMangaDetailsAndChapters(providerMangaId);
      return manhwa18Snapshot(result.details, result.chapters);
    },
  },
  nh: {
    provider: "nh",
    async load(providerMangaId) {
      return nhSnapshot(await nhClient.getById(providerMangaId));
    },
  },
  mgeko: {
    provider: "mgeko",
    async load(providerMangaId) {
      const api = new MgekoClient();
      const [details, chapterList] = await Promise.all([
        api.getMangaDetails(providerMangaId),
        api.getChapterList(providerMangaId),
      ]);
      return mgekoSnapshot(details, chapterList);
    },
  },
  comix: {
    provider: "comix",
    async load(providerMangaId) {
      const [manga, chapters] = await Promise.all([
        comixMangaDetail(providerMangaId),
        comixAllChapters(providerMangaId),
      ]);
      return comixSnapshot(manga, chapters);
    },
  },
  brainrot: {
    provider: "brainrot",
    async load(providerMangaId) {
      const api = new BrainRotComicsClient({ fetchImpl: brainrotBridgeFetch });
      const [details, chapters] = await Promise.all([
        api.getMangaDetails(providerMangaId),
        api.getChapterList(providerMangaId),
      ]);
      return brainrotSnapshot(details, chapters);
    },
  },
  philia: {
    provider: "philia",
    async load(providerMangaId) {
      const api = new PhiliaScansClient();
      const [details, chapters] = await Promise.all([
        api.getMangaDetails(providerMangaId),
        api.getChapterList(providerMangaId),
      ]);
      return philiaSnapshot(details, chapters.items);
    },
  },
};

export function getProviderAdapter(provider: ProviderId): ProviderAdapter {
  return providerAdapters[provider];
}
