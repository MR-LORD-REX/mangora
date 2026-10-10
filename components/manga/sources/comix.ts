import * as WebBrowser from "expo-web-browser";
import { router } from "expo-router";
import { Star, User } from "lucide-react-native";

import type { ChapterSourceModule } from "@/components/manga/sources/module";
import type {
  ChapterMeta,
  ChapterViewerData,
  SharedTag,
  ViewerChapterRow,
} from "@/components/manga/types";
import { providerAccent } from "@/constants/theme";
import {
  comixAllChapters,
  comixChapterTitle,
  comixMangaDetail,
  comixPosterUrl,
} from "@/services/comix/comix.api";
import type {
  ComixApiChapter,
  ComixApiManga,
  ComixMangaStatus,
  ComixMangaType,
} from "@/services/comix/comix.api.types";
import { BASE_URL } from "@/services/comix/comix.constants";
import { prepareReaderOpen } from "@/services/library/readerTracking";

const STATUS_LABELS: Record<ComixMangaStatus, string> = {
  releasing: "Releasing",
  finished: "Finished",
  on_hiatus: "On hiatus",
  discontinued: "Discontinued",
  not_yet_released: "Not yet released",
  unknown: "Unknown",
};

const TYPE_LABELS: Record<ComixMangaType, string> = {
  manga: "Manga",
  manhwa: "Manhwa",
  manhua: "Manhua",
  other: "Other",
};

const RATING_LABELS: Record<string, string> = {
  safe: "Safe",
  suggestive: "Suggestive",
  erotica: "Erotica",
  pornographic: "Pornographic",
};

const toParam = (url: string) => encodeURIComponent(url);

export const comixModule: ChapterSourceModule = {
  provider: "comix",
  accent: providerAccent.comix,
  label: "Comix",

  decodeIdentity(param: string) {
    return decodeURIComponent(param);
  },

  async load(identity, options) {
    const [detail, chapterList] = await Promise.all([
      comixMangaDetail(identity),
      comixAllChapters(identity, 40),
    ]);
    // Keep every scanlation-group upload; the viewer groups duplicate chapter
    // numbers under one main chapter header (MangaDex-style).
    const chapters = chapterList;
    const manga: ComixApiManga = detail;

    const authorNames = manga.authors?.map((a) => a.title).filter(Boolean) ?? [];
    const artistNames = manga.artists?.map((a) => a.title).filter(Boolean) ?? [];

    const meta: ChapterMeta = {
      title: manga.title,
      coverUrl: comixPosterUrl(manga) ?? options?.thumbnailUrl ?? null,
      description: manga.synopsis?.trim() || null,
      chips: [
        manga.type ? TYPE_LABELS[manga.type] : "",
        STATUS_LABELS[manga.status] ?? "",
        manga.year ? String(manga.year) : "",
        manga.contentRating
          ? (RATING_LABELS[manga.contentRating] ?? manga.contentRating)
          : "",
      ].filter(Boolean),
      extraMeta: [],
      tags: (manga.genres ?? [])
        .concat(manga.tags ?? [])
        .map((item) => ({
          key: String(item.id),
          label: item.title,
          raw: item,
        })),
      sourceUrl: `${BASE_URL}${identity}`,
    };

    if (authorNames.length) meta.extraMeta?.push({ icon: User, text: authorNames.join(", ") });
    if (artistNames.length) {
      meta.extraMeta?.push({ icon: Star, text: artistNames.join(", ") });
    }
    if (manga.ratedScore != null && manga.ratedScore > 0) {
      meta.extraMeta?.push({
        icon: Star,
        text: `${manga.ratedScore} / 10 (${manga.ratedCount ?? 0} ratings) · ${manga.followsTotal ?? 0} follows`,
      });
    }

    const rows: ViewerChapterRow[] = chapters.map((chapter: ComixApiChapter) => ({
      key: String(chapter.id),
      kind: "chapter",
      title: comixChapterTitle(chapter),
      subtitle: chapter.group?.name ?? null,
      scanGroup: chapter.group?.name ?? (chapter.isOfficial ? "Official" : null),
      groupKey: chapter.number != null ? String(chapter.number) : null,
      sectionKey: chapter.number != null ? String(chapter.number) : undefined,
      number: chapter.number,
      date: null,
      dateLabel: chapter.createdAtFormatted ?? null,
      languageCode: chapter.language || null,
      progressKey: toParam(chapter.url),
      raw: chapter,
    }));

    const data: ChapterViewerData = {
      meta,
      rows,
      library: { id: identity, aliases: [toParam(identity)] },
    };
    return data;
  },

  progressQuery(identity) {
    return {
      provider: "comix",
      providerMangaIds: [identity, toParam(identity)],
      toChapterKey: toParam,
    };
  },

  library(identity) {
    return { id: identity, aliases: [toParam(identity)] };
  },

  openSite(identity) {
    void WebBrowser.openBrowserAsync(`${BASE_URL}${identity}`);
  },

  chapterWriteIdentity(row) {
    const chapter = row.raw as ComixApiChapter | undefined;
    if (!chapter) return null;
    return {
      providerChapterId: chapter.url,
      chapterNumber: chapter.number,
      scanlationGroup:
        chapter.group?.name ?? (chapter.isOfficial ? "Official" : null),
      chapterGroupKey: chapter.number != null ? String(chapter.number) : null,
      languageCode: chapter.language || null,
    };
  },

  async openChapter(row, context) {
    const chapter = row.raw as ComixApiChapter | undefined;
    if (!chapter || !context.bridgeReady) return;
    const mangaTitle = context.meta.title;
    const chapterTitle = comixChapterTitle(chapter);
    await prepareReaderOpen({
      provider: "comix",
      providerMangaId: context.identity,
      providerChapterId: chapter.url,
      mangaTitle,
      chapterTitle,
      chapterNumber: chapter.number,
      scanlationGroup:
        chapter.group?.name ?? (chapter.isOfficial ? "Official" : null),
      chapterGroupKey: chapter.number != null ? String(chapter.number) : null,
      thumbnailUrl: context.coverUrl ?? null,
      languageCode: chapter.language || null,
      readerParams: {
        id: toParam(chapter.url),
        source: "comix",
        mangaId: toParam(context.identity),
        mangaTitle,
        chapterTitle,
        ...(context.coverUrl ? { thumbnailUrl: context.coverUrl } : {}),
      },
    });
    router.push({
      pathname: "/reader/[id]",
      params: {
        id: toParam(chapter.url),
        source: "comix",
        mangaId: toParam(context.identity),
        title: chapterTitle,
        mangaTitle,
        chapterTitle,
        ...(context.coverUrl ? { thumbnailUrl: context.coverUrl } : {}),
      },
    });
  },

  openChapterFallback(row, context) {
    const chapter = row.raw as ComixApiChapter | undefined;
    if (!chapter) return;
    const label = comixChapterTitle(chapter);
    router.push({
      pathname: "/(comix)/web",
      params: { url: encodeURIComponent(`${BASE_URL}${chapter.url}`), title: label },
    });
  },

  openTag(tag: SharedTag) {
    router.push({
      pathname: "/(comix)/main",
      params: { genre: tag.key, tagLabel: tag.label },
    });
  },
};