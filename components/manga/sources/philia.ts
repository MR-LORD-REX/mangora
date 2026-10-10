import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { Alert } from "react-native";
import { Star } from "lucide-react-native";

import type { ChapterSourceModule } from "@/components/manga/sources/module";
import type {
  ChapterMeta,
  ChapterViewerData,
  SharedTag,
  ViewerChapterRow,
} from "@/components/manga/types";
import { providerAccent } from "@/constants/theme";
import {
  PhiliaScansClient,
  chapterTitle,
  extractSlug,
} from "@/services/philia/philia";
import type {
  PhiliaChapter,
  PhiliaMangaStatus,
  PhiliaContentType,
} from "@/services/philia/philia.types";
import { BASE_URL } from "@/services/philia/philia.types";
import { prepareReaderOpen } from "@/services/library/readerTracking";

const STATUS_LABELS: Record<PhiliaMangaStatus, string> = {
  on_going: "Ongoing",
  completed: "Completed",
  on_hold: "On hold",
  canceled: "Canceled",
  unknown: "Unknown",
};

const TYPE_LABELS: Record<PhiliaContentType, string> = {
  manga: "Manga",
  manhwa: "Manhwa",
  manhua: "Manhua",
  webtoon: "Webtoon",
  comic: "Comic",
  other: "Other",
};

/** Appended to a locked chapter's display name, per app spec. */
export const PHILIA_LOCKED_SUFFIX = ' ("behind paywall read on official site")';
const PHILIA_LOCKED_MESSAGE =
  "This chapter is behind the paywall. Read it on the official site.";

/** A chapter is locked when it costs coins and has not been purchased. */
export function isPhiliaChapterLocked(chapter: PhiliaChapter): boolean {
  return (chapter.coinPrice ?? 0) > 0 && !chapter.purchased;
}

/** Public list/detail/chapters use a plain fetch; the API is not gated. */
function client(): PhiliaScansClient {
  return new PhiliaScansClient();
}

function lockedTitle(base: string): string {
  return `${base}${PHILIA_LOCKED_SUFFIX}`;
}

export const philiaModule: ChapterSourceModule = {
  provider: "philia",
  accent: providerAccent.philia,
  label: "Philia Scans",

  decodeIdentity(param: string) {
    return extractSlug(decodeURIComponent(param));
  },

  async load(identity, options): Promise<ChapterViewerData> {
    const api = client();
    const [detail, chapterList] = await Promise.all([
      api.getMangaDetails(identity),
      api.getChapterList(identity),
    ]);

    const meta: ChapterMeta = {
      title: detail.title || "Untitled",
      coverUrl: detail.coverImageUrl ?? options?.thumbnailUrl ?? null,
      subtitle:
        detail.alternativeTitles.length > 0
          ? detail.alternativeTitles.join(" / ")
          : null,
      description: detail.synopsis ?? null,
      chips: [
        detail.type ? (TYPE_LABELS[detail.type] ?? "") : "",
        STATUS_LABELS[detail.status] ?? "",
        detail.year ? String(detail.year) : "",
      ].filter(Boolean),
      extraMeta: [],
      tags: detail.genres.map((genre) => ({
        key: genre.slug || String(genre.id),
        label: genre.name,
        raw: genre,
      })),
      sourceUrl: `${BASE_URL}/manga/${detail.slug}`,
    };

    if (detail.ratingAvg != null && detail.ratingAvg > 0) {
      meta.extraMeta?.push({
        icon: Star,
        text: `${detail.ratingAvg.toFixed(1)} / 5 (${detail.ratingCount ?? 0} ratings)`,
      });
    }
    if (detail.authors.length) {
      meta.author = detail.authors.map((a) => a.name).join(", ");
    }
    if (detail.artists.length) {
      meta.artist = detail.artists.map((a) => a.name).join(", ");
    }

    const rows: ViewerChapterRow[] = chapterList.items.map((chapter) => {
      const locked = isPhiliaChapterLocked(chapter);
      const base = chapterTitle(chapter);
      return {
        key: String(chapter.id),
        kind: "chapter",
        title: locked ? lockedTitle(base) : base,
        subtitle: locked
          ? "Locked"
          : chapter.isEarlyAccess
            ? "Early access"
            : null,
        scanGroup: null,
        groupKey: String(chapter.number),
        sectionKey: String(chapter.number),
        number: chapter.number,
        date: chapter.publishedAt,
        pageCount: chapter.pageCount,
        languageCode: chapter.language,
        progressKey: String(chapter.id),
        raw: chapter,
      };
    });

    return {
      meta,
      rows,
      library: { id: identity, aliases: [String(detail.id)] },
    };
  },

  progressQuery(identity) {
    return {
      provider: "philia",
      providerMangaIds: [identity],
    };
  },

  library(identity) {
    return { id: identity };
  },

  openSite(identity) {
    void WebBrowser.openBrowserAsync(`${BASE_URL}/manga/${identity}`);
  },

  chapterWriteIdentity(row) {
    // Offline rows carry the download snapshot, not a provider chapter.
    const offline = (
      row.raw as { offlineDownload?: Record<string, unknown> } | undefined
    )?.offlineDownload;
    if (offline && typeof offline.providerChapterId === "string") {
      return {
        providerChapterId: offline.providerChapterId,
        chapterNumber:
          typeof offline.chapterNumber === "number" ? offline.chapterNumber : null,
        chapterGroupKey:
          typeof offline.chapterGroupKey === "string"
            ? offline.chapterGroupKey
            : null,
        languageCode:
          typeof offline.languageCode === "string" ? offline.languageCode : null,
      };
    }
    const chapter = row.raw as PhiliaChapter | undefined;
    if (!chapter || typeof chapter.id !== "number") return null;
    // Locked chapters have no downloadable pages and no download button.
    if (isPhiliaChapterLocked(chapter)) return null;
    return {
      providerChapterId: String(chapter.id),
      chapterNumber: chapter.number,
      chapterGroupKey: String(chapter.number),
      languageCode: chapter.language,
    };
  },

  async openChapter(row, context) {
    const chapter = row.raw as PhiliaChapter | undefined;
    if (!chapter || typeof chapter.id !== "number") return;

    if (isPhiliaChapterLocked(chapter)) {
      Alert.alert(chapterTitle(chapter), PHILIA_LOCKED_MESSAGE, [
        { text: "OK", style: "cancel" },
        {
          text: "Open site",
          onPress: () =>
            void WebBrowser.openBrowserAsync(`${BASE_URL}/series/${chapter.id}`),
        },
      ]);
      return;
    }

    const label = chapterTitle(chapter);
    const mangaTitle = context.meta.title;
    await prepareReaderOpen({
      provider: "philia",
      providerMangaId: context.identity,
      providerChapterId: String(chapter.id),
      mangaTitle,
      chapterTitle: label,
      chapterNumber: chapter.number,
      chapterGroupKey: String(chapter.number),
      thumbnailUrl: context.coverUrl ?? null,
      languageCode: chapter.language,
      readerParams: {
        id: String(chapter.id),
        source: "philia",
        mangaId: encodeURIComponent(context.identity),
        mangaTitle,
        chapterTitle: label,
        ...(context.coverUrl ? { thumbnailUrl: context.coverUrl } : {}),
      },
    });
    router.push({
      pathname: "/reader/[id]",
      params: {
        id: String(chapter.id),
        source: "philia",
        mangaId: encodeURIComponent(context.identity),
        title: label,
        mangaTitle,
        chapterTitle: label,
        ...(context.coverUrl ? { thumbnailUrl: context.coverUrl } : {}),
      },
    });
  },

  openChapterFallback(row, context) {
    // The web reader is gone; the native reader is the only path now.
    void context;
    void row;
  },

  openTag(tag: SharedTag) {
    router.push({
      pathname: "/(philia)/main",
      params: { genre: tag.key, tagLabel: tag.label },
    });
  },
};