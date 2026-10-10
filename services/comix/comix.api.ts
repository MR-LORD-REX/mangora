/**
 * comix.api.ts
 *
 * Typed facade over the hidden WebView bridge. Every call is executed by the
 * site's own env module inside the WebView, so signing/decryption are always
 * fresh and correct; this file only normalizes params/results for the app.
 */

import { comixBridgeRequest } from "./comixBridge";
import type {
  ComixApiChapter,
  ComixApiChapterListResult,
  ComixApiListResult,
  ComixApiManga,
  ComixChapterListParams,
  ComixChapterPagesData,
  ComixListParams,
} from "./comix.api.types";

const DEFAULT_PAGE_SIZE = 28;

/** Extracts the short hid from a manga page url ("/title/l7re-..." -> "l7re"). */
export function comixHidFromUrl(mangaUrl: string): string {
  const trimmed = mangaUrl.split("?")[0].replace(/^\/+/, "");
  const titleMatch = trimmed.match(/^title\/([^/-]+)/);
  if (titleMatch) return decodeURIComponent(titleMatch[1]);
  const bare = trimmed.split("/")[0] ?? "";
  return decodeURIComponent(bare.split("-")[0] ?? bare);
}

/** Numeric chapter id from a reader url (".../11312305-chapter-87"). */
export function comixChapterIdFromUrl(chapterUrl: string): number | null {
  const match = chapterUrl.match(/(\d+)-chapter-/);
  if (!match) return null;
  const id = Number(match[1]);
  return Number.isFinite(id) ? id : null;
}

/** Numeric chapter number from a reader url. */
export function comixChapterNumberFromUrl(chapterUrl: string): number | null {
  const match = chapterUrl.match(/-chapter-(\d+)(?:[^\d]|$)/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

export function comixPosterUrl(manga: ComixApiManga | null | undefined): string | null {
  return manga?.poster?.medium || manga?.poster?.large || null;
}

function asListResult(data: unknown): ComixApiListResult {
  const value = data as ComixApiListResult;
  if (!value || !Array.isArray(value.items)) {
    throw new Error("Unexpected Comix listing payload.");
  }
  return value;
}

function asChapterListResult(data: unknown): ComixApiChapterListResult {
  const value = data as ComixApiChapterListResult;
  if (!value || !Array.isArray(value.items)) {
    throw new Error("Unexpected Comix chapter list payload.");
  }
  return value;
}

/**
 * GET /api/v1/manga - powers search, browse and feed-style lists.
 * `content_rating` filters which ratings are returned.
 */
export async function comixListManga(
  params: ComixListParams = {},
): Promise<ComixApiListResult> {
  const data = await comixBridgeRequest("list", {
    params: {
      page: params.page ?? 1,
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params.keyword ? { keyword: params.keyword } : {}),
      ...(params.order ? { order: params.order } : {}),
      ...(params.genres_in?.length
        ? { genres_in: params.genres_in }
        : {}),
      ...(params.types?.length ? { types: params.types } : {}),
      ...(params.statuses?.length ? { statuses: params.statuses } : {}),
      ...(params.content_rating?.length
        ? { content_rating: params.content_rating }
        : { content_rating: ["safe", "suggestive"] }),
    },
  });
  return asListResult(data);
}

/** Full manga details from GET /api/v1/manga/{hid}. Accepts url or hid. */
export async function comixMangaDetail(
  mangaUrlOrHid: string,
): Promise<ComixApiManga> {
  const hid = comixHidFromUrl(mangaUrlOrHid);
  const data = await comixBridgeRequest("get", { hid });
  if (!data || typeof data !== "object") {
    throw new Error("Unexpected Comix manga payload.");
  }
  return data as ComixApiManga;
}

/** Chapter list from GET /api/v1/manga/{hid}/chapters. */
export async function comixChapters(
  mangaUrlOrHid: string,
  params: ComixChapterListParams = {},
): Promise<ComixApiChapterListResult> {
  const hid = comixHidFromUrl(mangaUrlOrHid);
  const data = await comixBridgeRequest("chapters", {
    hid,
    params: {
      page: params.page ?? 1,
      limit: params.limit ?? 50,
      order: params.order ?? { number: "desc" },
    },
  });
  return asChapterListResult(data);
}

/**
 * Loads every chapter of a manga through the signed API, walking pagination
 * in pages of up to 100. Used by the library sync adapter.
 */
export async function comixAllChapters(
  mangaUrlOrHid: string,
  maxPages = 25,
): Promise<ComixApiChapter[]> {
  const collected: ComixApiChapter[] = [];
  let page = 1;
  for (;;) {
    const result = await comixChapters(mangaUrlOrHid, {
      page,
      limit: 100,
      order: { number: "desc" },
    });
    collected.push(...result.items);
    if (!result.meta.hasNext || page >= maxPages) break;
    page += 1;
  }
  return collected;
}

/** Decrypted page list + prev/next navigation from GET /api/v1/chapters/{id}. */
export async function comixChapterPages(
  chapterUrlOrId: string | number,
): Promise<ComixChapterPagesData> {
  const chapterId =
    typeof chapterUrlOrId === "number"
      ? chapterUrlOrId
      : comixChapterIdFromUrl(chapterUrlOrId);
  if (chapterId === null) {
    throw new Error("Could not parse Comix chapter id from: " + chapterUrlOrId);
  }
  const data = await comixBridgeRequest("pages", { chapterId });
  if (!data || typeof data !== "object") {
    throw new Error("Unexpected Comix chapter payload.");
  }
  return data as ComixChapterPagesData;
}

/**
 * Orders chapter rows newest-first, dropping duplicate scanlation uploads for
 * the same chapter number (keeps the freshest/largest id) so the manga screen
 * shows one row per chapter.
 */
export function dedupeComixChapters(
  chapters: ComixApiChapter[],
): ComixApiChapter[] {
  const byNumber = new Map<number, ComixApiChapter>();
  for (const chapter of chapters) {
    const current = byNumber.get(chapter.number);
    if (!current || chapter.id > current.id) byNumber.set(chapter.number, chapter);
  }
  return Array.from(byNumber.values()).sort((a, b) => b.number - a.number);
}

export function comixChapterTitle(chapter: ComixApiChapter): string {
  const base = chapter.name?.trim()
    ? `Chapter ${chapter.number} - ${chapter.name}`
    : `Chapter ${chapter.number}`;
  const suffix =
    chapter.volume && chapter.volume > 0
      ? `  (Vol. ${chapter.volume})`
      : "";
  return base + suffix;
}

/** Relative manga page path (used as the app's stable Comix identity). */
export function comixMangaUrl(item: ComixApiManga): string {
  return item.url || `/title/${item.hid}`;
}
