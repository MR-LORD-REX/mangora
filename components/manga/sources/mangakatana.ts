import { router } from "expo-router";
import { Star, User } from "lucide-react-native";

import { parseDecimal } from "@/components/manga/dateFormat";
import type { ChapterSourceModule } from "@/components/manga/sources/module";
import type {
  ChapterMeta,
  ChapterViewerData,
  SharedTag,
  ViewerChapterRow,
} from "@/components/manga/types";
import { providerAccent } from "@/constants/theme";
import { MangaKatana } from "@/services/mangakatana/mangakatana";
import { GENRES } from "@/services/mangakatana/mangakatana.types";
import type {
  ChapterEntry,
  MangaDetails,
} from "@/services/mangakatana/mangakatana.types";
import { encodePath } from "@/services/mangakatana/mangakatana.utils";
import { prepareReaderOpen } from "@/services/library/readerTracking";

const api = new MangaKatana();

const STATUS_LABELS: Record<string, string> = {
  ongoing: "Ongoing",
  completed: "Completed",
  cancelled: "Cancelled",
  unknown: "Unknown",
};

function genreSlugFor(genreName: string): string {
  const match = GENRES.find(
    (genre) => genre.name.toLocaleLowerCase() === genreName.toLocaleLowerCase(),
  );
  if (match) return match.id;
  return genreName
    .toLocaleLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const mangakatanaModule: ChapterSourceModule = {
  provider: "mangakatana",
  accent: providerAccent.mangakatana,
  label: "MangaKatana",

  decodeIdentity(param: string) {
    return decodeURIComponent(param);
  },

  async load(identity) {
    const result = await api.getMangaDetailsAndChapters(identity);
    const details: MangaDetails = result.details;

    const rows: ViewerChapterRow[] = result.chapters.map((chapter: ChapterEntry) => {
      const chapterNumber = parseDecimal(chapter.name);
      return {
        key: chapter.url,
        kind: "chapter",
        title: chapter.name,
        subtitle: null,
        number: chapterNumber,
        scanGroup: null,
        groupKey: chapterNumber != null ? String(chapterNumber) : null,
        date: chapter.dateUpload,
        progressKey: encodePath(chapter.url),
        raw: chapter,
      };
    });

    const meta: ChapterMeta = {
      title: details.title,
      coverUrl: details.coverUrl,
      description: details.description?.trim() || null,
      chips: [STATUS_LABELS[details.status] ?? "Unknown"],
      extraMeta: [],
      tags: details.genres.map((genre) => ({
        key: genreSlugFor(genre),
        label: genre,
        raw: genre,
      })),
      sourceUrl: null,
    };
    if (details.author) {
      meta.extraMeta?.push({ icon: User, text: details.author });
    }
    if (details.altNames && details.altNames.trim()) {
      meta.subtitle = details.altNames;
    }

    return {
      meta,
      rows,
      library: { id: identity, aliases: [encodePath(identity)] },
    } satisfies ChapterViewerData;
  },

  progressQuery(identity) {
    return {
      provider: "mangakatana",
      providerMangaIds: [identity, encodePath(identity)],
      toChapterKey: encodePath,
    };
  },

  library(identity) {
    return { id: identity, aliases: [encodePath(identity)] };
  },

  chapterWriteIdentity(row) {
    const chapter = row.raw as ChapterEntry | undefined;
    if (!chapter) return null;
    const chapterNumber = parseDecimal(chapter.name);
    return {
      providerChapterId: chapter.url,
      chapterNumber,
      scanlationGroup: null,
      chapterGroupKey: chapterNumber != null ? String(chapterNumber) : null,
      languageCode: null,
    };
  },

  async openChapter(row, context) {
    const chapter = row.raw as ChapterEntry | undefined;
    if (!chapter) return;
    const mangaTitle = context.meta.title;
    const chapterNumber = parseDecimal(chapter.name);
    await prepareReaderOpen({
      provider: "mangakatana",
      providerMangaId: context.identity,
      providerChapterId: chapter.url,
      mangaTitle,
      chapterTitle: chapter.name,
      chapterNumber,
      scanlationGroup: null,
      chapterGroupKey: chapterNumber != null ? String(chapterNumber) : null,
      thumbnailUrl: context.coverUrl ?? null,
      readerParams: {
        id: encodePath(chapter.url),
        source: "mangakatana",
        mangaId: encodePath(context.identity),
        mangaTitle,
        chapterTitle: chapter.name,
        ...(context.coverUrl ? { thumbnailUrl: context.coverUrl } : {}),
      },
    });
    router.push({
      pathname: "/reader/[id]",
      params: {
        id: encodePath(chapter.url),
        source: "mangakatana",
        title: chapter.name,
        mangaTitle,
        chapterTitle: chapter.name,
        mangaId: encodePath(context.identity),
        ...(context.coverUrl ? { thumbnailUrl: context.coverUrl } : {}),
      },
    });
  },

  openTag(tag: SharedTag) {
    router.push({
      pathname: "/(mangakatana)/main",
      params: { genre: tag.key, tagLabel: tag.label },
    });
  },
};