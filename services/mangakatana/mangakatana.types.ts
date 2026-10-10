export const BASE_URL = 'https://mangakatana.com';

export const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.122 Mobile Safari/537.36',
  Referer: `${BASE_URL}/`,
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

export interface MangaEntry {
  /** Relative path, e.g. `/manga/one-piece.49` */
  url: string;
  title: string;
  /** Best-quality thumbnail — prefers WebP srcset, falls back to JPG `<img>`. */
  thumbnailUrl: string;
}

export interface MangaList {
  mangas: MangaEntry[];
  hasNextPage: boolean;
}

export type MangaStatus = 'ongoing' | 'completed' | 'cancelled' | 'unknown';

export interface MangaDetails {
  /** Relative path, e.g. `/manga/one-piece.49` */
  url: string;
  title: string;
  /** Comma-separated if multiple authors. */
  author: string;
  /** Alt / alternative names (raw string from the site). */
  altNames: string;
  /** HTML-stripped synopsis. */
  description: string;
  status: MangaStatus;
  genres: string[];
  /** Best-quality cover — prefers AVIF > WebP > JPG. */
  coverUrl: string;
}

export interface ChapterEntry {
  /** Relative path, e.g. `/manga/one-piece.49/c1191` */
  url: string;
  /** Display name, e.g. `Chapter 1191: Loki is Here` */
  name: string;
  /** Epoch milliseconds (UTC). `null` if the date couldn't be parsed. */
  dateUpload: number | null;
}

export interface PageEntry {
  /** 0-based index of the page within the chapter. */
  index: number;
  /** Direct CDN image URL. */
  imageUrl: string;
}

/** Which image server to request. Empty string = default server 1. */
export type ServerPreference = '' | 'mk' | '3';

/** `search_by` parameter for text search. */
export type SearchByField = 'm_name' | 'author';
export type GenreMode = 'and' | 'or';
export type SortOrder = 'latest' | 'new' | 'az' | 'numc';
export type StatusFilter = '' | '0' | '1' | '2';

export interface TextSearchOptions {
  searchBy?: SearchByField;
}

export interface FilterSearchOptions {
  includeGenres?: string[];
  excludeGenres?: string[];
  genreMode?: GenreMode;
  order?: SortOrder;
  status?: StatusFilter;
  /** Minimum chapter count. '-1' for oneshots, '' for default. */
  minChapters?: string;
}

export type SearchOptions = TextSearchOptions & FilterSearchOptions;

export interface MangaFullInfo {
  details: MangaDetails;
  chapters: ChapterEntry[];
}

export type SearchResult =
  | { kind: 'list'; data: MangaList }
  | { kind: 'details'; data: MangaDetails };

export interface Genre {
  id: string;
  name: string;
}

export const GENRES: Genre[] = [
  { id: '4-koma', name: '4 koma' },
  { id: 'action', name: 'Action' },
  { id: 'adult', name: 'Adult' },
  { id: 'adventure', name: 'Adventure' },
  { id: 'artbook', name: 'Artbook' },
  { id: 'award-winning', name: 'Award winning' },
  { id: 'comedy', name: 'Comedy' },
  { id: 'cooking', name: 'Cooking' },
  { id: 'doujinshi', name: 'Doujinshi' },
  { id: 'drama', name: 'Drama' },
  { id: 'ecchi', name: 'Ecchi' },
  { id: 'erotica', name: 'Erotica' },
  { id: 'fantasy', name: 'Fantasy' },
  { id: 'gender-bender', name: 'Gender Bender' },
  { id: 'gore', name: 'Gore' },
  { id: 'harem', name: 'Harem' },
  { id: 'historical', name: 'Historical' },
  { id: 'horror', name: 'Horror' },
  { id: 'isekai', name: 'Isekai' },
  { id: 'josei', name: 'Josei' },
  { id: 'loli', name: 'Loli' },
  { id: 'manhua', name: 'Manhua' },
  { id: 'manhwa', name: 'Manhwa' },
  { id: 'martial-arts', name: 'Martial Arts' },
  { id: 'mecha', name: 'Mecha' },
  { id: 'medical', name: 'Medical' },
  { id: 'music', name: 'Music' },
  { id: 'mystery', name: 'Mystery' },
  { id: 'one-shot', name: 'One shot' },
  { id: 'overpowered-mc', name: 'Overpowered MC' },
  { id: 'psychological', name: 'Psychological' },
  { id: 'reincarnation', name: 'Reincarnation' },
  { id: 'romance', name: 'Romance' },
  { id: 'school-life', name: 'School Life' },
  { id: 'sci-fi', name: 'Sci-fi' },
  { id: 'seinen', name: 'Seinen' },
  { id: 'sexual-violence', name: 'Sexual violence' },
  { id: 'shota', name: 'Shota' },
  { id: 'shoujo', name: 'Shoujo' },
  { id: 'shoujo-ai', name: 'Shoujo Ai' },
  { id: 'shounen', name: 'Shounen' },
  { id: 'shounen-ai', name: 'Shounen Ai' },
  { id: 'slice-of-life', name: 'Slice of Life' },
  { id: 'sports', name: 'Sports' },
  { id: 'super-power', name: 'Super power' },
  { id: 'supernatural', name: 'Supernatural' },
  { id: 'survival', name: 'Survival' },
  { id: 'time-travel', name: 'Time Travel' },
  { id: 'tragedy', name: 'Tragedy' },
  { id: 'webtoon', name: 'Webtoon' },
  { id: 'yaoi', name: 'Yaoi' },
  { id: 'yuri', name: 'Yuri' },
];

export const MONTH_ABBRS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;
