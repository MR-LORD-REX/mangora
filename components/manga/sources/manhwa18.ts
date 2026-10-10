import * as WebBrowser from "expo-web-browser";
import { router } from "expo-router";
import { Palette, User } from "lucide-react-native";

import { parseDecimal } from "@/components/manga/dateFormat";
import type { ChapterSourceModule } from "@/components/manga/sources/module";
import type {
  ChapterMeta,
  ChapterViewerData,
  SharedTag,
  ViewerChapterRow,
} from "@/components/manga/types";
import { providerAccent } from "@/constants/theme";
import { MANHWA18_BASE_URL, MANHWA18_GENRES } from "@/services/manhwa18/constants";
import { Manhwa18Source } from "@/services/manhwa18/Manhwa18";
import type {
  ChapterEntry,
  MangaDetails,
} from "@/services/manhwa18/types";
import { prepareReaderOpen } from "@/services/library/readerTracking";

const api = new Manhwa18Source();

const STATUS_LABELS: Record<string, string> = {
  ongoing: "Ongoing",
  completed: "Completed",
  unknown: "Unknown",
};

const toParam = (url: string) => encodeURIComponent(url);

/** Numeric main-chapter key derived from a Manhwa18 chapter name. */
function groupKeyFromName(name: string): string | null {
  const parsed = parseDecimal(name);
  return parsed != null ? String(parsed) : null;
}

function genreSlugFor(genre: string): string {
  const match = MANHWA18_GENRES.find(
    (item) =>
      item.name.toLocaleLowerCase() === genre.toLocaleLowerCase() ||
      item.id.toLocaleLowerCase() === genre.toLocaleLowerCase(),
  );
  if (match) return match.id;
  return genre
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const manhwa18Module: ChapterSourceModule = {
  provider: "manhwa18",
  accent: providerAccent.manhwa18,
  label: "Manhwa18",

  decodeIdentity(param: string) {
    return decodeURIComponent(param);
  },

  async load(identity) {
    const result = await api.getMangaDetailsAndChapters(identity);
    const details: MangaDetails = result.details;

    const rows: ViewerChapterRow[] = result.chapters.map((chapter: ChapterEntry) => ({
      key: chapter.url,
      kind: "chapter",
      title: chapter.name,
      subtitle: null,
      number: parseDecimal(chapter.name),
      scanGroup: null,
      groupKey: groupKeyFromName(chapter.name),
      date: chapter.dateUpload,
      progressKey: toParam(chapter.url),
      raw: chapter,
    }));

    const meta: ChapterMeta = {
      title: details.title,
      coverUrl: details.thumbnailUrl,
      description: details.description?.trim() || null,
      chips: [STATUS_LABELS[details.status] ?? "Unknown"],
      extraMeta: [],
      tags: (details.genres ?? []).map((genre) => ({
        key: genreSlugFor(genre),
        label: genre,
        raw: genre,
      })),
      sourceUrl: identity,
    };
    if (details.author) meta.extraMeta?.push({ icon: User, text: details.author });
    if (details.artist && details.artist !== details.author) {
      meta.extraMeta?.push({ icon: Palette, text: details.artist });
    }

    return {
      meta,
      rows,
      library: { id: identity, aliases: [toParam(identity)] },
    } satisfies ChapterViewerData;
  },

  progressQuery(identity) {
    return {
      provider: "manhwa18",
      providerMangaIds: [identity, toParam(identity)],
      toChapterKey: toParam,
    };
  },

  library(identity) {
    return { id: identity, aliases: [toParam(identity)] };
  },

  openSite(identity) {
    if (identity) {
      void WebBrowser.openBrowserAsync(MANHWA18_BASE_URL + identity);
    }
  },

  chapterWriteIdentity(row) {
    const chapter = row.raw as ChapterEntry | undefined;
    if (!chapter) return null;
    return {
      providerChapterId: chapter.url,
      chapterNumber: parseDecimal(chapter.name),
      scanlationGroup: null,
      chapterGroupKey: groupKeyFromName(chapter.name),
      languageCode: null,
    };
  },

  async openChapter(row, context) {
    const chapter = row.raw as ChapterEntry | undefined;
    if (!chapter) return;
    const mangaTitle = context.meta.title;
    await prepareReaderOpen({
      provider: "manhwa18",
      providerMangaId: context.identity,
      providerChapterId: chapter.url,
      mangaTitle,
      chapterTitle: chapter.name,
      chapterNumber: parseDecimal(chapter.name),
      scanlationGroup: null,
      chapterGroupKey: groupKeyFromName(chapter.name),
      thumbnailUrl: context.coverUrl ?? null,
      readerParams: {
        id: toParam(chapter.url),
        source: "manhwa18",
        mangaId: toParam(context.identity),
        mangaTitle,
        chapterTitle: chapter.name,
        ...(context.coverUrl ? { thumbnailUrl: context.coverUrl } : {}),
      },
    });
    router.push({
      pathname: "/reader/[id]",
      params: {
        id: toParam(chapter.url),
        source: "manhwa18",
        title: chapter.name,
        mangaTitle,
        chapterTitle: chapter.name,
        mangaId: toParam(context.identity),
        ...(context.coverUrl ? { thumbnailUrl: context.coverUrl } : {}),
      },
    });
  },

  openTag(tag: SharedTag) {
    router.push({
      pathname: "/(manhwa18)/main",
      params: { genre: tag.key, tagLabel: tag.label },
    });
  },
};