/**
 * philia.types.ts
 *
 * Types for the Philia Scans (https://philiascans.org) SDK.
 *
 * The site is a Next.js app. Its JSON API lives under `/api` (the
 * `NEXT_PUBLIC_API_URL` build constant is baked in as "/api"), NOT at the
 * document routes: `/manga` renders SSR HTML, while `/api/manga` returns the
 * JSON this SDK consumes.
 *
 * Verified live against philiascans.org:
 *   GET  /api/manga?page=&perPage=&q=&orderby=&types=&statuses=&genres=
 *   GET  /api/manga/{slug}
 *   GET  /api/manga/{slug}/chapters            (no query params accepted)
 *   POST /api/chapters/{id}/refresh-pages      -> signed page image URLs
 *   GET  /api/chapters/{id}/page-keys          -> chapterKey + scramble flag
 *   POST /api/reader/access-token              -> { token, expiresAt }
 *   GET  /api/chapters/{id}/get-drm?session=   -> DRM key material
 *
 * Reader images are DRM-scrambled: `page-keys.scrambled` marks a tile
 * permutation keyed by `chapterKeyB64` (HMAC-SHA256 -> Fisher-Yates over a
 * gridSize x gridSize tile grid). The native reader cannot decode those in
 * place, so encrypted chapters open in the in-app WebView reader.
 */

export const BASE_URL = "https://philiascans.org";
/** The JSON API root (Next.js `NEXT_PUBLIC_API_URL`). */
export const API_BASE = BASE_URL + "/api";

export const DEFAULT_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  Accept: "application/json",
  "Accept-Language": "en-US,en;q=0.9",
  Referer: BASE_URL + "/",
  "X-Requested-With": "XMLHttpRequest",
};

export type PhiliaMangaStatus =
  | "on_going"
  | "completed"
  | "on_hold"
  | "canceled"
  | "unknown";

export type PhiliaContentType =
  | "manga"
  | "manhwa"
  | "manhua"
  | "webtoon"
  | "comic"
  | "other";

export interface PhiliaTaxonomyRef {
  id: number;
  slug: string;
  name: string;
}

/** One row from GET /api/manga (list result). */
export interface PhiliaMangaSummary {
  id: number;
  slug: string;
  title: string;
  coverImageUrl: string | null;
  status: PhiliaMangaStatus;
  type: PhiliaContentType;
  ratingAvg: number | null;
  ratingCount: number | null;
  viewsWeek: number | null;
  viewsTotal: number | null;
  chapterCount: number | null;
  /** Epoch ms from `latestChapterAt`. */
  latestChapterAt: number | null;
  genres: PhiliaTaxonomyRef[];
}

/** Full detail from GET /api/manga/{slug}. */
export interface PhiliaMangaDetails extends PhiliaMangaSummary {
  synopsis: string | null;
  alternativeTitles: string[];
  year: number | null;
  contentRating: string | null;
  authors: PhiliaTaxonomyRef[];
  artists: PhiliaTaxonomyRef[];
  tags: PhiliaTaxonomyRef[];
}

export interface PhiliaChapter {
  id: number;
  /** Parsed from the API's string `number` field. */
  number: number;
  title: string | null;
  slug: string | null;
  language: string | null;
  publishedAt: number | null;
  coinPrice: number | null;
  purchased: boolean;
  isEarlyAccess: boolean;
  pageCount: number | null;
  /** Per-chapter reader token (used by the web reader). */
  readerToken: string | null;
}

export interface PhiliaChapterListResult {
  items: PhiliaChapter[];
  total: number;
  volumes: unknown[];
}

/** A signed page image returned by POST /api/chapters/{id}/refresh-pages. */
export interface PhiliaPage {
  index: number;
  /** Absolute, signed media URL. */
  url: string;
  mime: string | null;
  width: number | null;
  height: number | null;
  blurDataUrl: string | null;
}

/** Response from GET /api/chapters/{id}/page-keys. */
export interface PhiliaPageKeysResponse {
  /** Base64 AES chapter key. */
  chapterKeyB64: string;
  /** True when page images are tile-scrambled. */
  scrambled: boolean;
  gridSize: number;
  sessionDefault: boolean;
}

export interface PhiliaTokenResponse {
  token: string;
  expiresAt: number | null;
}

/** Response from GET /api/chapters/{id}/get-drm?session=. */
export interface PhiliaDrmResponse {
  payloadA: string;
  payloadB: string;
  gridSize: number | null;
  sessionId: string | null;
}

export type PhiliaSortOrder =
  | "recently_updated"
  | "trending"
  | "views"
  | "rating"
  | "title";

export interface PhiliaListParams {
  page?: number;
  perPage?: number;
  /** Keyword search (`q`). */
  q?: string;
  orderby?: PhiliaSortOrder;
  types?: PhiliaContentType[];
  statuses?: PhiliaMangaStatus[];
  /** Genre slugs (e.g. "romance"), not numeric ids. */
  genres?: string[];
}

export type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  }
) => Promise<{
  ok: boolean;
  status: number;
  text: () => Promise<string>;
}>;

export interface PhiliaClientOptions {
  baseUrl?: string;
  headers?: Record<string, string>;
  fetchImpl?: FetchLike;
  /**
   * Authenticated fetch (e.g. RN WebView bridge) for locked chapters and DRM
   * endpoints. Falls back to the anonymous fetchImpl when omitted.
   */
  authFetch?: FetchLike;
}

export const PHILIA_GENRES: { slug: string; name: string }[] = [
  { slug: "action", name: "Action" },
  { slug: "adventure", name: "Adventure" },
  { slug: "comedy", name: "Comedy" },
  { slug: "drama", name: "Drama" },
  { slug: "ecchi", name: "Ecchi" },
  { slug: "fantasy", name: "Fantasy" },
  { slug: "gourmet", name: "Gourmet" },
  { slug: "harem", name: "Harem" },
  { slug: "historical", name: "Historical" },
  { slug: "isekai", name: "Isekai" },
  { slug: "josei", name: "Josei" },
  { slug: "magic", name: "Magic" },
  { slug: "martial-arts", name: "Martial Arts" },
  { slug: "monsters", name: "Monsters" },
  { slug: "music", name: "Music" },
  { slug: "mystery", name: "Mystery" },
  { slug: "psychological", name: "Psychological" },
  { slug: "regression", name: "Regression" },
  { slug: "romance", name: "Romance" },
  { slug: "school-life", name: "School Life" },
  { slug: "sci-fi", name: "Sci-Fi" },
  { slug: "seinen", name: "Seinen" },
  { slug: "shoujo", name: "Shoujo" },
  { slug: "shounen", name: "Shounen" },
  { slug: "slice-of-life", name: "Slice of Life" },
  { slug: "supernatural", name: "Supernatural" },
  { slug: "survival", name: "Survival" },
  { slug: "tragedy", name: "Tragedy" },
  { slug: "villainess", name: "Villainess" },
  { slug: "war", name: "War" },
];

export const PHILIA_STATUSES: { value: PhiliaMangaStatus; label: string }[] = [
  { value: "on_going", label: "On Going" },
  { value: "completed", label: "Completed" },
  { value: "on_hold", label: "On Hold" },
  { value: "canceled", label: "Canceled" },
];

export const PHILIA_TYPES: { value: PhiliaContentType; label: string }[] = [
  { value: "manga", label: "Manga" },
  { value: "manhwa", label: "Manhwa" },
  { value: "manhua", label: "Manhua" },
  { value: "webtoon", label: "Webtoon" },
  { value: "comic", label: "Comic" },
];

export const PHILIA_SORTS: { value: PhiliaSortOrder; label: string }[] = [
  { value: "recently_updated", label: "Recently Updated" },
  { value: "trending", label: "Trending" },
  { value: "views", label: "Most Viewed" },
  { value: "rating", label: "Highest Rated" },
  { value: "title", label: "A-Z" },
];