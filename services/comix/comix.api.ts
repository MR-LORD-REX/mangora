/**
 * comix.api.ts
 *
 * Typed facade over the hidden WebView bridge. Every call is answered by the
 * real comix.to app running inside the WebView: the bridge navigates to the
 * page that renders the data, and the site's own React Query cache (already
 * fetched + decrypted by the site) is read back. This file only normalizes
 * params/results for the app.
 */

import { BASE_URL } from "./comix.constants";
import {
  comixBridgeChaptersAll,
  comixBridgeOpenAndQuery,
  type ComixQuerySpec,
} from "./comixBridge";
import type {
  ComixApiChapter,
  ComixApiChapterListResult,
  ComixApiListResult,
  ComixApiManga,
  ComixChapterListParams,
  ComixChapterPagesData,
  ComixListParams,
} from "./comix.api.types";

/** Absolute comix.to URL from a relative path or an already-absolute URL. */
function absoluteComixUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const base = BASE_URL.replace(/\/+$/, "");
  const clean = pathOrUrl.replace(/^\/+/, "");
  return clean ? `${base}/${clean}` : base;
}

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

/** URL of the /browse screen that makes the site fetch a matching list query. */
function browseUrlFor(params: ComixListParams, keyword: string, page: number): string {
  const search = new URLSearchParams();
  if (keyword) search.set("keyword", keyword);
  if (page > 1) search.set("page", String(page));
  if (params.genres_in?.length) search.set("genres_in", params.genres_in.join(","));
  if (params.types?.length) search.set("types", params.types.join(","));
  if (params.statuses?.length) search.set("statuses", params.statuses.join(","));
  const qs = search.toString();
  return `${BASE_URL.replace(/\/+$/, "")}/browse${qs ? `?${qs}` : ""}`;
}

/** Cache key matcher for the site's list queries (search + filtered browse). */
function listSpec(params: ComixListParams, keyword: string, page: number): ComixQuerySpec {
  const objKeys: Record<string, string | number | unknown[]> = { page };
  if (keyword) objKeys.keyword = keyword;
  if (params.genres_in?.length) objKeys.genres_in = params.genres_in;
  if (params.types?.length) objKeys.types = params.types;
  if (params.statuses?.length) objKeys.statuses = params.statuses;
  return { key: ["manga", "list"], objKeys };
}

/**
 * GET the site's manga list - powers search and filtered browse. The site fills
 * in its own defaults (content rating, ordering), so we only match on the
 * filters we actually asked for.
 */
export async function comixListManga(
  params: ComixListParams = {},
): Promise<ComixApiListResult> {
  const keyword = params.keyword?.trim() ?? "";
  const page = params.page ?? 1;
  const url = browseUrlFor(params, keyword, page);
  const data = await comixBridgeOpenAndQuery({
    url,
    spec: listSpec(params, keyword, page),
    timeoutMs: 20_000,
  });
  return asListResult(data);
}

/** Full manga details from the title page. Accepts a url or a hid. */
export async function comixMangaDetail(
  mangaUrlOrHid: string,
): Promise<ComixApiManga> {
  const hid = comixHidFromUrl(mangaUrlOrHid);
  const url = absoluteComixUrl(
    mangaUrlOrHid.startsWith("/") ? mangaUrlOrHid : `/title/${mangaUrlOrHid}`,
  );
  const data = await comixBridgeOpenAndQuery({
    url,
    spec: { key: ["manga", "detail", hid] },
    timeoutMs: 15_000,
  });
  if (!data || typeof data !== "object") {
    throw new Error("Unexpected Comix manga payload.");
  }
  return data as ComixApiManga;
}

/** First page of a manga's chapter list. */
export async function comixChapters(
  mangaUrlOrHid: string,
  _params: ComixChapterListParams = {},
): Promise<ComixApiChapterListResult> {
  const hid = comixHidFromUrl(mangaUrlOrHid);
  const url = absoluteComixUrl(
    mangaUrlOrHid.startsWith("/") ? mangaUrlOrHid : `/title/${mangaUrlOrHid}`,
  );
  const data = await comixBridgeOpenAndQuery({
    url,
    spec: { key: ["manga", "chapters", hid] },
    timeoutMs: 20_000,
  });
  return asChapterListResult(data);
}

/**
 * Every chapter of a manga. The title page paginates its list, so the bridge
 * walks the pager inside the WebView and merges every page.
 */
export async function comixAllChapters(
  mangaUrlOrHid: string,
  maxPages = 40,
): Promise<ComixApiChapter[]> {
  const hid = comixHidFromUrl(mangaUrlOrHid);
  const url = absoluteComixUrl(
    mangaUrlOrHid.startsWith("/") ? mangaUrlOrHid : `/title/${mangaUrlOrHid}`,
  );
  const result = await comixBridgeChaptersAll({ url, hid, maxPages });
  return result.items as ComixApiChapter[];
}

/** Page list + prev/next navigation for one chapter. */
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
  const url = absoluteComixUrl(
    typeof chapterUrlOrId === "string" ? chapterUrlOrId : "",
  );
  const data = await comixBridgeOpenAndQuery({
    url,
    spec: { key: ["chapters", "detail", chapterId] },
    timeoutMs: 25_000,
  });
  if (!data || typeof data !== "object") {
    throw new Error("Unexpected Comix chapter payload.");
  }
  const payload = data as ComixChapterPagesData & {
    pages?: unknown;
  };
  // Older site builds returned `pages: { baseUrl, items }`; the current build
  // returns a flat array of absolute-URL images.
  if (Array.isArray(payload.pages)) {
    return {
      ...payload,
      pages: { baseUrl: "", items: payload.pages as never },
    };
  }
  return payload;
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