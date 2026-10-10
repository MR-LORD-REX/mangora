import { router } from "expo-router";
import { Brush, User } from "lucide-react-native";

import { parseDecimal } from "@/components/manga/dateFormat";
import type { ChapterSourceModule } from "@/components/manga/sources/module";
import type {
  ChapterMeta,
  ChapterViewerData,
  SharedTag,
  ViewerChapterRow,
} from "@/components/manga/types";
import { providerAccent } from "@/constants/theme";
import Mangadex from "@/services/mangadex/mangaDex";
import type {
  Chapter as MangaDexChapter,
  Manga as MangaDexManga,
  Tag as MangaDexTag,
} from "@/services/mangadex/mangaDex";
import { prepareReaderOpen } from "@/services/library/readerTracking";

const dex = new Mangadex();

const STATUS_LABELS: Record<string, string> = {
  ongoing: "Ongoing",
  completed: "Completed",
  hiatus: "Hiatus",
  cancelled: "Cancelled",
};

function statusLabel(status?: string): string {
  return STATUS_LABELS[status ?? ""] ?? "Unknown";
}

function chapterKey(chapter: MangaDexChapter): string {
  return chapter.chapter ?? "Oneshot";
}

function chapterDisplayTitle(chapter: MangaDexChapter): string {
  const number = chapter.chapter ?? "Oneshot";
  const base = number === "Oneshot" ? "Oneshot" : `Chapter ${number}`;
  return chapter.title ? `${base}: ${chapter.title}` : base;
}

/** Primary scanlation group name for a MangaDex chapter upload. */
function chapterScanGroup(chapter: MangaDexChapter): string | null {
  return chapter.group ?? chapter.groups[0]?.name ?? null;
}

/** "Main chapter" key shared by every upload of the same MangaDex chapter. */
function chapterGroupKey(chapter: MangaDexChapter): string {
  return chapter.chapter ?? "Oneshot";
}

/** Cache raw SDK payloads so language changes don't re-hit the API. */
const cache = new Map<
  string,
  { manga: MangaDexManga; chapters: MangaDexChapter[] }
>();

function languageMatch(chapter: MangaDexChapter, code: string): boolean {
  return chapter.language.code === code || chapter.language.base === code;
}

function buildRows(
  chapters: MangaDexChapter[],
  language: string | undefined,
): ViewerChapterRow[] {
  const visible = language
    ? chapters.filter((chapter) => languageMatch(chapter, language))
    : chapters;

  const groups = new Map<string, MangaDexChapter[]>();
  for (const chapter of visible) {
    const key = chapterKey(chapter);
    const list = groups.get(key);
    if (list) list.push(chapter);
    else groups.set(key, [chapter]);
  }

  const rows: ViewerChapterRow[] = [];
  for (const [key, list] of groups) {
    rows.push({
      key: `header:${key}`,
      kind: "section",
      sectionKey: key,
      sectionLabel: key === "Oneshot" ? "Oneshot" : `Chapter ${key}`,
      title: key === "Oneshot" ? "Oneshot" : `Chapter ${key}`,
    });
    for (const chapter of list) {
      rows.push({
        key: `${key}:${chapter.id}`,
        kind: "chapter",
        sectionKey: key,
        title: chapterDisplayTitle(chapter),
        subtitle: chapter.group
          ? `${chapter.language.flag} · ${chapter.group}`
          : chapter.groups.length
            ? `${chapter.language.flag} · ${chapter.groups.map((g) => g.name).join(", ")}`
            : `${chapter.language.flag} · Unknown group`,
        number: parseDecimal(chapter.chapter),
        scanGroup: chapterScanGroup(chapter),
        groupKey: chapterGroupKey(chapter),
        date: Date.parse(chapter.publishAt),
        pageCount: chapter.pages,
        languageCode: chapter.language.code,
        progressKey: chapter.id,
        raw: chapter,
      });
    }
  }
  return rows;
}

export const mangadexModule: ChapterSourceModule = {
  provider: "mangadex",
  accent: providerAccent.mangadex,
  label: "MangaDex",

  decodeIdentity(param: string) {
    return param;
  },

  async load(identity, options) {
    let entry = cache.get(identity);
    if (!entry) {
      const [manga, chapters] = await Promise.all([
        dex.getManga(identity),
        dex.getChapters(identity, {
          includeUnreadable: false,
          dedupe: false,
        }),
      ]);
      entry = { manga, chapters };
      cache.set(identity, entry);
    }
    const { manga, chapters } = entry;

    const rows = buildRows(chapters, options?.language);
    const authorNames = manga.authors.map((person) => person.name).filter(Boolean);
    const artistNames = manga.artists.map((person) => person.name).filter(Boolean);

    const meta: ChapterMeta = {
      title: manga.title,
      coverUrl: manga.cover?.url ?? options?.thumbnailUrl ?? null,
      description: manga.description?.trim() || null,
      chips: [
        statusLabel(manga.status),
        manga.year ? String(manga.year) : "",
        manga.demographic ? String(manga.demographic) : "",
      ].filter(Boolean),
      extraMeta: [],
      tags: manga.tags.map((tag: MangaDexTag) => ({
        key: tag.id,
        label: tag.name,
        raw: tag,
      })),
      sourceUrl: null,
    };
    if (authorNames.length) {
      meta.extraMeta?.push({
        icon: User,
        text: authorNames.join(", "),
      });
    }
    if (artistNames.length) {
      meta.extraMeta?.push({
        icon: Brush,
        text: artistNames.join(", "),
      });
    }

    const languages = manga.availableLanguages.map((info) => ({
      code: info.code,
      label: `${info.flag} ${info.name}`,
    }));

    const data: ChapterViewerData = {
      meta,
      rows,
      languages: languages.length ? languages : undefined,
      library: { id: manga.id },
    };
    return data;
  },

  progressQuery(identity) {
    return { provider: "mangadex", providerMangaIds: [identity] };
  },

  library(identity) {
    return { id: identity };
  },

  chapterWriteIdentity(row) {
    const chapter = row.raw as MangaDexChapter | undefined;
    if (!chapter) return null;
    return {
      providerChapterId: chapter.id,
      chapterNumber: chapter.chapter ? Number(chapter.chapter) : null,
      scanlationGroup: chapterScanGroup(chapter),
      chapterGroupKey: chapterGroupKey(chapter),
      languageCode: chapter.language.code,
    };
  },

  async openChapter(row, context) {
    const chapter = row.raw as MangaDexChapter | undefined;
    if (!chapter) return;
    const chapterTitle = row.title;
    await prepareReaderOpen({
      provider: "mangadex",
      providerMangaId: context.identity,
      providerChapterId: chapter.id,
      mangaTitle: context.meta.title,
      chapterTitle,
      chapterNumber: chapter.chapter ? Number(chapter.chapter) : null,
      scanlationGroup: chapterScanGroup(chapter),
      chapterGroupKey: chapterGroupKey(chapter),
      thumbnailUrl: context.coverUrl ?? null,
      languageCode: chapter.language.code,
      readerParams: {
        id: chapter.id,
        source: "mangadex",
        mangaId: context.identity,
        mangaTitle: context.meta.title,
        chapterTitle,
        language: chapter.language.code,
        ...(context.coverUrl ? { thumbnailUrl: context.coverUrl } : {}),
      },
    });
    router.push({
      pathname: "/reader/[id]",
      params: {
        id: chapter.id,
        source: "mangadex",
        mangaId: context.identity,
        title: chapterTitle,
        mangaTitle: context.meta.title,
        chapterTitle,
        language: chapter.language.code,
        ...(context.coverUrl ? { thumbnailUrl: context.coverUrl } : {}),
      },
    });
  },

  openTag(tag: SharedTag) {
    const dexTag = tag.raw as MangaDexTag | undefined;
    router.push({
      pathname: "/(mangadex)/main",
      params: {
        tag: dexTag?.id ?? tag.label,
        tagLabel: tag.label,
      },
    });
  },
};