/**
 * Types for the Manhwa18.cc scraper.
 */

export interface MangaEntry {
  url: string; // absolute URL
  title: string;
  thumbnailUrl: string;
}

export interface MangaList {
  mangas: MangaEntry[];
  hasNextPage: boolean;
}

export type MangaStatus = 'ongoing' | 'completed' | 'unknown';

export interface MangaDetails {
  url: string;
  title: string;
  author: string;
  artist: string;
  description: string;
  status: MangaStatus;
  genres: string[];
  thumbnailUrl: string;
}

export interface ChapterEntry {
  url: string; // absolute URL
  name: string;
  dateUpload: number | null; // epoch millis (UTC), null if unparseable
}

export interface PageEntry {
  index: number;
  imageUrl: string;
}

export interface Genre {
  id: string; // path slug sent to the server, e.g. 'action'
  name: string; // display label
}

/** The extension ships 3 variants of this source; only the language differs. */
export type M18Lang = 'en' | 'ko' | 'all';

export type M18SortOrder = '' | 'latest' | 'alphabet' | 'rating' | 'trending'; // '' = no override
export type M18Status = '' | 'completed'; // '' = no override

/**
 * Only one of these is applied at a time, per the site's own priority rule:
 * genre > order > status. Leave all unset to fall back to the popular/latest feed.
 */
export interface Manhwa18SearchOptions {
  genreSlug?: string; // slug from MANHWA18_GENRES
  order?: M18SortOrder;
  status?: M18Status;
}
