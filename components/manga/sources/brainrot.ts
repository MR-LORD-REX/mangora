import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Clock } from "lucide-react-native";

import type { ChapterSourceModule } from "@/components/manga/sources/module";
import type {
  ChapterMeta,
  ChapterViewerData,
  SharedTag,
  ViewerChapterRow,
} from "@/components/manga/types";
import { providerAccent } from "@/constants/theme";
import { BASE_URL } from "@/services/brainrot/brainrot.constants";
import { BrainRotComicsClient } from "@/services/brainrot/brainrot";
import type { MangaStatus } from "@/services/brainrot/brainrot.types";
import { brainrotBridgeFetch } from "@/services/brainrot/brainrotBridge";
import { prepareReaderOpen } from "@/services/library/readerTracking";

const STATUS_LABELS: Record<MangaStatus, string> = {
  ongoing: "Ongoing",
  completed: "Completed",
  on_hold: "On hold",
  canceled: "Canceled",
  unknown: "Unknown",
};

/**
 * BrainRot is Cloudflare-gated, so every request runs through the hidden
 * WebView bridge (warm session + cleared challenge) instead of a plain fetch.
 */
function client(): BrainRotComicsClient {
  return new BrainRotComicsClient({
    fetchImpl: brainrotBridgeFetch,
    baseUrl: BASE_URL,
  });
}

const toParam = (value: string) => encodeURIComponent(value);

/**
 * Resolves the chapter url/name for a row, preferring the provider payload but
 * falling back to the row's own key/title (offline rows come from the downloaded
 * metadata snapshot and carry no aw chapter entry).
 */
function chapterFields(row: ViewerChapterRow): { url: string; name: string } | null {
  const raw = row.raw as
    | {
        url?: unknown;
        name?: unknown;
        offlineDownload?: { providerChapterId?: unknown; chapterTitle?: unknown };
      }
    | undefined;
  const offline = raw?.offlineDownload;
  const url =
    (typeof raw?.url === "string" && raw.url.length > 0 ? raw.url : null) ??
    (typeof offline?.providerChapterId === "string" &&
    offline.providerChapterId.length > 0
      ? offline.providerChapterId
      : null) ??
    row.key;
  if (!url) return null;
  const name =
    (typeof raw?.name === "string" && raw.name.length > 0 ? raw.name : null) ??
    (typeof offline?.chapterTitle === "string" &&
    offline.chapterTitle.length > 0
      ? offline.chapterTitle
      : null) ??
    row.title ??
    "";
  return { url, name };
}

function chapterNumberFromName(name: string): number | null {
  const match = name.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

export const brainrotModule: ChapterSourceModule = {
  provider: "brainrot",
  accent: providerAccent.brainrot,
  label: "BrainRot",

  decodeIdentity(param: string) {
    return decodeURIComponent(param);
  },

  async load(identity, options): Promise<ChapterViewerData> {
    const api = client();
    const [detail, chapters] = await Promise.all([
      api.getMangaDetails(identity),
      api.getChapterList(identity),
    ]);

    const meta: ChapterMeta = {
      title: detail.title || "Untitled",
      coverUrl: detail.thumbnailUrl ?? options?.thumbnailUrl ?? null,
      subtitle: detail.altNames ?? null,
      description: detail.description ?? null,
      author: detail.author ?? null,
      artist: detail.artist ?? null,
      chips: [STATUS_LABELS[detail.status] ?? ""].filter(Boolean),
      extraMeta: detail.author
        ? [{ icon: Clock, text: detail.author }]
        : [],
      tags: detail.genres.map((genre) => ({
        key: genre.toLowerCase().replace(/\s+/g, "-"),
        label: genre,
        raw: genre,
      })),
      sourceUrl: `${BASE_URL}${identity}`,
    };

    const rows: ViewerChapterRow[] = chapters.map((chapter) => {
      const number = chapterNumberFromName(chapter.name);
      return {
        key: chapter.url,
        kind: "chapter",
        title: chapter.name,
        subtitle: null,
        scanGroup: null,
        groupKey: number != null ? String(number) : null,
        sectionKey: number != null ? String(number) : undefined,
        number,
        date: chapter.dateUpload,
        progressKey: toParam(chapter.url),
        raw: chapter,
      };
    });

    return {
      meta,
      rows,
      library: { id: identity, aliases: [toParam(identity)] },
    };
  },

  progressQuery(identity) {
    return {
      provider: "brainrot",
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
    const fields = chapterFields(row);
    if (!fields) return null;
    const number = chapterNumberFromName(fields.name);
    return {
      providerChapterId: fields.url,
      chapterNumber: number,
      chapterGroupKey: number != null ? String(number) : null,
    };
  },

  async openChapter(row, context) {
    const fields = chapterFields(row);
    if (!fields) return;
    const mangaTitle = context.meta.title;
    const chapterTitle = fields.name || row.title;
    const number = chapterNumberFromName(fields.name);
    await prepareReaderOpen({
      provider: "brainrot",
      providerMangaId: context.identity,
      providerChapterId: fields.url,
      mangaTitle,
      chapterTitle,
      chapterNumber: number,
      chapterGroupKey: number != null ? String(number) : null,
      thumbnailUrl: context.coverUrl ?? null,
      readerParams: {
        id: toParam(fields.url),
        source: "brainrot",
        mangaId: toParam(context.identity),
        mangaTitle,
        chapterTitle,
        ...(context.coverUrl ? { thumbnailUrl: context.coverUrl } : {}),
      },
    });
    router.push({
      pathname: "/reader/[id]",
      params: {
        id: toParam(fields.url),
        source: "brainrot",
        mangaId: toParam(context.identity),
        title: chapterTitle,
        mangaTitle,
        chapterTitle,
        ...(context.coverUrl ? { thumbnailUrl: context.coverUrl } : {}),
      },
    });
  },

  openChapterFallback(row, context) {
    void context;
    const fields = chapterFields(row);
    if (!fields) return;
    const url = /^https?:\/\//i.test(fields.url) ? fields.url : `${BASE_URL}${fields.url}`;
    router.push({
      pathname: "/(brainrot)/web",
      params: {
        url: encodeURIComponent(url),
        title: fields.name || row.title,
      },
    });
  },

  openTag(tag: SharedTag) {
    router.push({
      pathname: "/(brainrot)/main",
      params: { genre: tag.key, tagLabel: tag.label },
    });
  },
};