/**
 * mgeko.types.ts
 *
 * Shared types for the MangaGeko SDK. Pure type definitions — no logic.
 */

import { GENRES, SORT_OPTIONS, STATUS_OPTIONS, TYPE_OPTIONS } from './mgeko.constants';

/** One of the site's predefined genre names. */
export type Genre = (typeof GENRES)[number];

/** One of the site's sort-order API values (e.g. `'popular_weekly'`). */
export type SortValue = (typeof SORT_OPTIONS)[number]['value'];

/** UI label for a sort option (e.g. `'Popular (Weekly)'`). */
export type SortLabel = (typeof SORT_OPTIONS)[number]['label'];

/** Publication-status filter as shown in the UI ("Any" included). */
export type StatusOption = (typeof STATUS_OPTIONS)[number];

/** Content-type filter as shown in the UI ("Any" included). */
export type TypeOption = (typeof TYPE_OPTIONS)[number];

/** Normalized publication status for a manga's details. */
export type MangaStatus = 'unknown' | 'ongoing' | 'completed';

/**
 * A lightweight manga entry as it appears in a listing (popular, latest,
 * or search results). `url` is always **relative** to BASE_URL, matching
 * how Mihon stores it (`setUrlWithoutDomain`) — join it yourself with
 * BASE_URL, or use `MgekoClient`'s methods which accept relative URLs.
 */
export interface MangaSummary {
  title: string;
  /** Relative path, e.g. `/manga/some-title`. */
  url: string;
  /** Absolute image URL, or null if the listing had no cover. */
  thumbnailUrl: string | null;
  /** Average rating (0?5) when the listing showed one (browse cards). */
  rating?: number | null;
  /** Chapter count when the listing showed one (search rows). */
  chapterCount?: number | null;
}

/** Full detail data for a single manga, scraped from its detail page. */
export interface MangaDetails extends MangaSummary {
  /** Null when the site's own placeholder is "Updating" (i.e. unknown). */
  author: string | null;
  /** Synopsis plus an appended "Alternative Names" block, if any existed. */
  description: string;
  /** Title-cased genre names, e.g. `['Action', 'Sci Fi']`. */
  genres: string[];
  status: MangaStatus;
}

/** A single chapter entry from a manga's chapter list. */
export interface Chapter {
  /** Display name, e.g. `"Chapter 128"`. */
  name: string;
  /** Relative path to the chapter reader page. */
  url: string;
  /** Upload time in epoch milliseconds, or null if unknown/unparseable. */
  uploadDate: number | null;
}

/** A single readable page image inside a chapter. */
export interface Page {
  /** 0-based position within the chapter. */
  index: number;
  /** Absolute, directly-loadable image URL. */
  imageUrl: string;
}

/** Generic paginated result wrapper returned by listing/search methods. */
export interface PagedResult<T> {
  items: T[];
  /** Whether a next page is known to exist. */
  hasNextPage: boolean;
  /** The page number that was requested. */
  currentPage: number;
  /** Only known when the JSON "browse" endpoint was used (not the plain
   *  text-search endpoint, which doesn't report a total). */
  totalPages?: number;
}

/**
 * Filters accepted by `MgekoClient.search()`. All fields are optional —
 * anything omitted uses the site's own default. Passing **any** non-default
 * value (or leaving `query` empty) makes the client use the advanced
 * "browse-comics" endpoint instead of the plain text-search endpoint; see
 * the `search()` doc comment in mgeko.ts for exactly why that distinction
 * matters.
 */
export interface SearchFilters {
  sort?: SortValue;
  /** Genres that results must include. */
  includeGenres?: Genre[];
  /** Genres that results must NOT include. */
  excludeGenres?: Genre[];
  status?: StatusOption;
  type?: TypeOption;
  /** Minimum chapter count, as a string exactly like the site's own text field (e.g. `"50"`). */
  minChapters?: string;
  maxChapters?: string;
  /** e.g. `"4.5"` — matches the site's rating scale (0–5, one decimal). */
  minRating?: string;
  /** Free-text tags; the site treats these as separate from `genres`. */
  tags?: string[];
  onlyCompletedSeries?: boolean;
  onlyWellTranslated?: boolean;
  hideLongHiatus?: boolean;
  /**
   * When true, the site's own "safe mode" is enabled and NSFW entries are
   * excluded from results. Defaults to `false` (matching the extension's
   * own default preference), meaning NSFW content is included unless you
   * opt out here.
   */
  hideNsfw?: boolean;
}

/** Shape of the JSON payload returned by the `/browse-comics/data/` endpoint. */
export interface BrowseComicsResponse {
  results_html: string;
  page: number;
  num_pages: number;
}

/** Minimal fetch signature, so you can inject RN's global fetch, a polyfill, or a mock in tests. */
export type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
  }
) => Promise<{
  ok: boolean;
  status: number;
  url: string;
  text: () => Promise<string>;
  json: () => Promise<unknown>;
}>;

/** Construction options for `MgekoClient`. */
export interface MgekoClientOptions {
  /** Override the site origin (e.g. for a mirror domain). Defaults to BASE_URL. */
  baseUrl?: string;
  /** Merged over the SDK's default headers (yours win on conflicts). */
  headers?: Record<string, string>;
  /** Provide your own fetch (defaults to the global `fetch`). Useful for RN
   *  environments needing a custom polyfill, or for testing. */
  fetchImpl?: FetchLike;
}
