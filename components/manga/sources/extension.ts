import { router } from "expo-router";
import { PenLine, User } from "lucide-react-native";
import * as WebBrowser from "expo-web-browser";

import type { ChapterSourceModule } from "@/components/manga/sources/module";
import type {
  ChapterMeta,
  ChapterViewerData,
  ViewerChapterRow,
} from "@/components/manga/types";
import { colors } from "@/constants/theme";
import { prepareReaderOpen } from "@/services/library/readerTracking";
import {
  getExtensionManga,
  getExtensionMangaUrl,
  getExtensionPages,
} from "@/services/extensions/native";
import {
  cachedExtensionSource,
  extensionProviderFor,
  refreshExtensionRegistry,
} from "@/services/extensions/registry";
import { registerExtensionHeaders } from "@/utils/reader/imageHeaders";

const STATUS_LABELS: Record<number, string> = {
  0: "Unknown",
  1: "Ongoing",
  2: "Completed",
  3: "Licensed",
  4: "Publishing finished",
  5: "Cancelled",
  6: "On hiatus",
};

function chapterNumber(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value < 0) return null;
  return value;
}

function chapterDate(value: number | null | undefined): number | null {
  if (!value || !Number.isFinite(value) || value <= 0) return null;
  // Some extensions still emit seconds; Mihon stores epoch millis.
  return value < 100_000_000_000 ? value * 1000 : value;
}

const modules = new Map<string, ChapterSourceModule>();

export function extensionModuleFor(sourceId: string): ChapterSourceModule {
  const existing = modules.get(sourceId);
  if (existing) return existing;

  const provider = extensionProviderFor(sourceId);
  if (!cachedExtensionSource(sourceId)) void refreshExtensionRegistry();
  const module: ChapterSourceModule = {
    provider,
    accent: colors.accent,
    get label() {
      return cachedExtensionSource(sourceId)?.name ?? "Extension source";
    },

    decodeIdentity(param: string) {
      return param;
    },

    async load(identity): Promise<ChapterViewerData> {
      const details = await getExtensionManga(sourceId, identity);
      const manga = details.manga;
      registerExtensionHeaders(details.mangaUrl, details.headers);
      if (manga.thumbnailUrl) {
        registerExtensionHeaders(manga.thumbnailUrl, details.headers);
      }

      const rows: ViewerChapterRow[] = details.chapters.map((chapter) => {
        const number = chapterNumber(chapter.chapterNumber);
        return {
          key: chapter.url,
          kind: "chapter",
          title: chapter.name || "Chapter",
          subtitle: chapter.scanlator || null,
          scanGroup: chapter.scanlator || null,
          groupKey: number != null ? String(number) : chapter.name || null,
          number,
          date: chapterDate(chapter.dateUpload),
          progressKey: chapter.url,
          raw: chapter,
        };
      });

      const meta: ChapterMeta = {
        title: manga.title || "Untitled",
        coverUrl: manga.thumbnailUrl ?? null,
        subtitle: null,
        author: manga.author ?? null,
        artist: manga.artist ?? null,
        description: manga.description ?? null,
        chips: [STATUS_LABELS[manga.status] ?? "Unknown"].filter(Boolean),
        extraMeta: [],
        tags: (manga.genres.length ? manga.genres : (manga.genre ?? "").split(","))
          .map((genre) => genre.trim())
          .filter(Boolean)
          .map((genre) => ({ key: genre.toLowerCase(), label: genre })),
        sourceUrl: details.mangaUrl,
      };
      if (manga.author) {
        meta.extraMeta?.push({ icon: User, text: manga.author });
      }
      if (manga.artist && manga.artist !== manga.author) {
        meta.extraMeta?.push({ icon: PenLine, text: manga.artist });
      }

      return {
        meta,
        rows,
        library: { id: identity },
      };
    },

    progressQuery(identity) {
      return {
        provider,
        providerMangaIds: [identity],
      };
    },

    library(identity) {
      return { id: identity };
    },

    chapterWriteIdentity(row) {
      const chapter = row.raw as
        | { url: string; chapterNumber: number | null; scanlator: string | null }
        | undefined;
      if (!chapter) return null;
      const number = chapterNumber(chapter.chapterNumber);
      return {
        providerChapterId: chapter.url,
        chapterNumber: number,
        scanlationGroup: chapter.scanlator,
        chapterGroupKey:
          number != null ? String(number) : chapter.url,
        languageCode: cachedExtensionSource(sourceId)?.lang ?? null,
      };
    },

    async openChapter(row, context) {
      const chapter = row.raw as
        | { url: string; chapterNumber: number | null; scanlator: string | null }
        | undefined;
      if (!chapter) return;
      const number = chapterNumber(chapter.chapterNumber);
      const chapterId = encodeURIComponent(chapter.url);
      const mangaId = encodeURIComponent(context.identity);
      await prepareReaderOpen({
        provider,
        providerMangaId: context.identity,
        providerChapterId: chapter.url,
        mangaTitle: context.meta.title,
        chapterTitle: row.title,
        chapterNumber: number,
        scanlationGroup: chapter.scanlator,
        chapterGroupKey: number != null ? String(number) : chapter.url,
        thumbnailUrl: context.coverUrl ?? null,
        readerParams: {
          id: chapterId,
          source: provider,
          mangaId,
          mangaTitle: context.meta.title,
          chapterTitle: row.title,
          ...(context.coverUrl ? { thumbnailUrl: context.coverUrl } : {}),
        },
      });
      router.push({
        pathname: "/reader/[id]",
        params: {
          id: chapterId,
          source: provider,
          mangaId,
          title: row.title,
          mangaTitle: context.meta.title,
          chapterTitle: row.title,
          ...(context.coverUrl ? { thumbnailUrl: context.coverUrl } : {}),
        },
      });
    },

    openSite(identity, meta) {
      void getExtensionMangaUrl(sourceId, identity)
        .then((url) => WebBrowser.openBrowserAsync(url))
        .catch(() => {
          if (meta.sourceUrl) void WebBrowser.openBrowserAsync(meta.sourceUrl);
        });
    },
  };

  modules.set(sourceId, module);
  return module;
}

export async function loadExtensionPageUrls(
  sourceId: string,
  chapterUrl: string,
): Promise<{ pages: string[]; headers: Record<string, string> }> {
  const result = await getExtensionPages(sourceId, chapterUrl);
  registerExtensionHeaders(chapterUrl, result.headers);
  return {
    pages: result.pages.map((page) => page.imageUrl),
    headers: result.headers,
  };
}