import * as WebBrowser from "expo-web-browser";
import { router } from "expo-router";
import { User } from "lucide-react-native";

import { parseDecimal } from "@/components/manga/dateFormat";
import type { ChapterSourceModule } from "@/components/manga/sources/module";
import type {
  ChapterMeta,
  ChapterViewerData,
  SharedTag,
  ViewerChapterRow,
} from "@/components/manga/types";
import { providerAccent } from "@/constants/theme";
import { MgekoClient } from "@/services/mgeko/mgeko";
import type {
  Chapter as MgekoChapter,
  MangaDetails as MgekoDetails,
} from "@/services/mgeko/mgeko.types";
import { prepareReaderOpen } from "@/services/library/readerTracking";

const api = new MgekoClient();

const STATUS_LABELS: Record<string, string> = {
  ongoing: "Ongoing",
  completed: "Completed",
  unknown: "Unknown",
};

const toParam = (url: string) => encodeURIComponent(url);

/** Numeric main-chapter key derived from a MangaGeko chapter name. */
function groupKeyFromName(name: string): string | null {
  const parsed = parseDecimal(name);
  return parsed != null ? String(parsed) : null;
}

export const mgekoModule: ChapterSourceModule = {
  provider: "mgeko",
  accent: providerAccent.mgeko,
  label: "MangaGeko",

  decodeIdentity(param: string) {
    return decodeURIComponent(param);
  },

  async load(identity) {
    const [details, chapterList] = await Promise.all([
      api.getMangaDetails(identity),
      api.getChapterList(identity),
    ]);
    const detailsTyped = details as MgekoDetails;

    const rows: ViewerChapterRow[] = chapterList.map((chapter: MgekoChapter) => ({
      key: chapter.url,
      kind: "chapter",
      title: chapter.name,
      subtitle: null,
      number: parseDecimal(chapter.name),
      scanGroup: null,
      groupKey: groupKeyFromName(chapter.name),
      date: chapter.uploadDate,
      progressKey: toParam(chapter.url),
      raw: chapter,
    }));

    const meta: ChapterMeta = {
      title: detailsTyped.title,
      coverUrl: detailsTyped.thumbnailUrl,
      description: detailsTyped.description?.trim() || null,
      chips: [STATUS_LABELS[detailsTyped.status] ?? "Unknown"],
      extraMeta: [],
      tags: (detailsTyped.genres ?? []).map((genre) => ({
        key: genre,
        label: genre,
        raw: genre,
      })),
      sourceUrl: null,
    };
    if (detailsTyped.author) {
      meta.extraMeta?.push({ icon: User, text: detailsTyped.author });
    }

    return {
      meta,
      rows,
      library: { id: identity, aliases: [toParam(identity)] },
    } satisfies ChapterViewerData;
  },

  progressQuery(identity) {
    return {
      provider: "mgeko",
      providerMangaIds: [identity, toParam(identity)],
      toChapterKey: toParam,
    };
  },

  library(identity) {
    return { id: identity, aliases: [toParam(identity)] };
  },

  openSite(identity) {
    void WebBrowser.openBrowserAsync(`https://www.mgeko.cc${identity}`);
  },

  chapterWriteIdentity(row) {
    const chapter = row.raw as MgekoChapter | undefined;
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
    const chapter = row.raw as MgekoChapter | undefined;
    if (!chapter) return;
    const mangaTitle = context.meta.title;
    await prepareReaderOpen({
      provider: "mgeko",
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
        source: "mgeko",
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
        source: "mgeko",
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
      pathname: "/(mgeko)/main",
      params: { genre: tag.key, tagLabel: tag.label },
    });
  },
};