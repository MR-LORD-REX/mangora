/**
 * brainrot.types.ts
 *
 * Types for the BrainRotComics (brainrotcomics.com) SDK.
 * Source: Madara-framework WordPress manga extension.
 * Base URL: https://brainrotcomics.com
 *
 * Architecture: WordPress + wp-manga plugin. All listing/search
 * goes through /wp-admin/admin-ajax.php (POST, action=madara_load_more
 * or manga_get_chapters). Chapter pages are fetched via GET on
 * the manga/chapter slug, then #single-pager / .reading-content
 * images are extracted. A separate /ajax/chapters/ endpoint returns
 * an HTML chapter list for a given manga.
 */

export const BASE_URL = "https://brainrotcomics.com";

export const DEFAULT_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/126.0.6478.122 Mobile Safari/537.36",
  Referer: BASE_URL + "/",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "X-Requested-With": "XMLHttpRequest",
};


export type MangaStatus =
  | "ongoing"
  | "completed"
  | "on_hold"
  | "canceled"
  | "unknown";

export interface MangaEntry {
  /** Relative path, e.g. /manga/one-piece/ */
  url: string;
  title: string;
  thumbnailUrl: string | null;
}

export interface MangaList {
  mangas: MangaEntry[];
  /** True when more pages exist. */
  hasNextPage: boolean;
}

export interface MangaDetails {
  url: string;
  title: string;
  author: string | null;
  artist: string | null;
  description: string | null;
  status: MangaStatus;
  /** Genre names. */
  genres: string[];
  thumbnailUrl: string | null;
  altNames: string | null;
}


export interface ChapterEntry {
  /** Relative path, e.g. /manga/one-piece/chapter-100/ */
  url: string;
  name: string;
  /** Epoch ms or null. */
  dateUpload: number | null;
}

export interface PageEntry {
  index: number;
  imageUrl: string;
}



export type SortOrder =
  | "latest"   // _latest_update (default)
  | "new"      // new-manga
  | "az"       // title
  | "rating"   // _manga_avarage_reviews
  | "views"    // _manga_views
  | "trending"; // trending

export type StatusFilter =
  | ""          // any
  | "ongoing"
  | "completed"
  | "on_hold"
  | "canceled";

export type AdultFilter = "" | "none" | "only";

export interface SearchOptions {
  order?: SortOrder;
  status?: StatusFilter;
  /** Genre slugs to require (resolved after getFilterData). */
  genres?: string[];
  /** Author string prefix. */
  author?: string;
  /** Artist string prefix. */
  artist?: string;
  /** Content: "" = all, "none" = SFW only, "only" = adult only. */
  adult?: AdultFilter;
}



export interface GenreItem {
  id: string;
  name: string;
}

export interface FilterData {
  genres: GenreItem[];
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
