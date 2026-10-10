/**
 * comix.api.types.ts
 *
 * Types for Comix's signed JSON API (`/api/v1`), served through the in-app
 * bridge (see comixBridge.ts). Shapes were captured live from the site's own
 * env module and mirror the API exactly - no SSR guessing.
 */

export type ComixRating = "safe" | "suggestive" | "erotica" | "pornographic";
export type ComixMangaType = "manga" | "manhwa" | "manhua" | "other";
export type ComixMangaStatus =
  | "releasing"
  | "finished"
  | "on_hiatus"
  | "discontinued"
  | "not_yet_released"
  | "unknown";

export interface ComixTaxonomyRef {
  id: number;
  title: string;
  slug: string | null;
}

export interface ComixPoster {
  medium: string | null;
  large: string | null;
  original?: string | null;
}

export interface ComixExternalLinks {
  al: string | null;
  mal: string | null;
  mu: string | null;
  md: string | null;
  mb: string | null;
}

/** One manga row as returned by GET /api/v1/manga and /api/v1/manga/{hid}. */
export interface ComixApiManga {
  id: number;
  hid: string;
  title: string;
  altTitles: string[];
  type: ComixMangaType;
  status: ComixMangaStatus;
  originalLanguage: string | null;
  poster: ComixPoster | null;
  latestChapter: number | null;
  finalChapter: number | null;
  finalVolume: number | null;
  hasChapters: boolean;
  chapterUpdatedAtFormatted: string | null;
  createdAtFormatted: string | null;
  updatedAtFormatted: string | null;
  startDate: string | null;
  endDate: string | null;
  year: number | null;
  rank: number | null;
  synopsis: string | null;
  followsTotal: number | null;
  ratedAvg: number | null;
  ratedScore: number | null;
  ratedCount: number | null;
  contentRating: ComixRating;
  links: ComixExternalLinks;
  url: string;
  // Detail-only fields (GET /api/v1/manga/{hid}):
  genres?: ComixTaxonomyRef[];
  demographics?: ComixTaxonomyRef[];
  formats?: ComixTaxonomyRef[];
  tags?: ComixTaxonomyRef[];
  authors?: ComixTaxonomyRef[];
  artists?: ComixTaxonomyRef[];
  publishers?: ComixTaxonomyRef[];
  firstChapterUrl?: string | null;
  latestChapterUrl?: string | null;
  sources?: { label: string; url: string }[];
}

export interface ComixListMeta {
  total: number;
  perPage: number;
  page: number;
  lastPage: number;
  from: number;
  to: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface ComixApiListResult {
  items: ComixApiManga[];
  meta: ComixListMeta;
}

export interface ComixChapterGroup {
  id: number;
  name: string;
}

/** A chapter row from GET /api/v1/manga/{hid}/chapters. */
export interface ComixApiChapter {
  id: number;
  mangaId: number;
  number: number;
  volume: number | null;
  name: string;
  language: string;
  isOfficial: boolean;
  votes: number | null;
  createdAtFormatted: string | null;
  groupId: number | null;
  group: ComixChapterGroup | null;
  creator: unknown;
  url: string;
}

export interface ComixApiChapterListResult {
  items: ComixApiChapter[];
  meta: ComixListMeta;
}

export interface ComixChapterNavRef {
  id: number;
  number: number;
  volume: number | null;
  url: string;
}

export interface ComixChapterPageImage {
  width: number;
  height: number;
  url: string;
}

/**
 * Decrypted GET /api/v1/chapters/{id} payload. `pages.items` are the actual
 * page-image URLs; `prev`/`next` (and the `Any` variants that cross scanlation
 * groups) power in-reader navigation.
 */
export interface ComixChapterPagesData {
  id: number;
  mangaId: number;
  number: number;
  volume: number | null;
  name: string;
  language: string;
  isOfficial: boolean;
  votes: number | null;
  createdAtFormatted: string | null;
  groupId: number | null;
  group: ComixChapterGroup | null;
  url: string;
  pages: {
    baseUrl: string;
    items: ComixChapterPageImage[];
  };
  prev: ComixChapterNavRef | null;
  next: ComixChapterNavRef | null;
  prevAny: ComixChapterNavRef | null;
  nextAny: ComixChapterNavRef | null;
}

/** Sort keys the /browse vocabulary + API understand. */
export type ComixSortValue =
  | "relevance:desc"
  | "chapter_updated_at:desc"
  | "created_at:desc"
  | "title:asc"
  | "title:desc"
  | "year:desc"
  | "year:asc"
  | "score:desc"
  | "views_7d:desc"
  | "views_30d:desc"
  | "views_90d:desc"
  | "views_total:desc"
  | "follows_total:desc";

/** Params accepted by GET /api/v1/manga (mirrors the site's /browse UI). */
export interface ComixListParams {
  keyword?: string;
  page?: number;
  limit?: number;
  order?: { [field: string]: "asc" | "desc" };
  genres_in?: number[];
  types?: ComixMangaType[];
  statuses?: ComixMangaStatus[];
  content_rating?: ComixRating[];
}

export interface ComixChapterListParams {
  page?: number;
  limit?: number;
  order?: { number?: "asc" | "desc" };
}
