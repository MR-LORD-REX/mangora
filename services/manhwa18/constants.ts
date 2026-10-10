import type { Genre, M18SortOrder, M18Status } from './types';

export const MANHWA18_BASE_URL = 'https://manhwa18.cc';

// Neither a special header nor a session is required for these endpoints as
// of writing (no Cloudflare / JS challenge) — this is just good hygiene.
export const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
};

export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 39 genres — verified live against the site's own genre nav on 2026-09-02. */
export const MANHWA18_GENRES: Genre[] = [
  { id: 'adult', name: 'Adult (18+)' },
  { id: 'action', name: 'Action' },
  { id: 'adventure', name: 'Adventure' },
  { id: 'bl', name: 'BL' },
  { id: 'comedy', name: 'Comedy' },
  { id: 'comics', name: 'Comics' },
  { id: 'doujinshi', name: 'Doujinshi' },
  { id: 'drama', name: 'Drama' },
  { id: 'ecchi', name: 'Ecchi' },
  { id: 'family', name: 'Family' },
  { id: 'fantasy', name: 'Fantasy' },
  { id: 'gender-bender', name: 'Gender Bender' },
  { id: 'gl', name: 'GL' },
  { id: 'harem', name: 'Harem' },
  { id: 'hentai', name: 'Hentai' },
  { id: 'historical', name: 'Historical' },
  { id: 'horror', name: 'Horror' },
  { id: 'isekai', name: 'Isekai' },
  { id: 'josei', name: 'Josei' },
  { id: 'magic', name: 'Magic' },
  { id: 'martial-arts', name: 'Martial Arts' },
  { id: 'mature', name: 'Mature' },
  { id: 'mecha', name: 'Mecha' },
  { id: 'mystery', name: 'Mystery' },
  { id: 'ntr', name: 'NTR' },
  { id: 'psychological', name: 'Psychological' },
  { id: 'romance', name: 'Romance' },
  { id: 'school-life', name: 'School Life' },
  { id: 'sci-fi', name: 'Sci-fi' },
  { id: 'seinen', name: 'Seinen' },
  { id: 'shoujo', name: 'Shoujo' },
  { id: 'shounen', name: 'Shounen' },
  { id: 'slice-of-life', name: 'Slice of Life' },
  { id: 'smut', name: 'Smut' },
  { id: 'sports', name: 'Sports' },
  { id: 'supernatural', name: 'Supernatural' },
  { id: 'thriller', name: 'Thriller' },
  { id: 'tragedy', name: 'Tragedy' },
  { id: 'yaoi', name: 'Yaoi' },
  { id: 'yuri', name: 'Yuri' },
];

export const MANHWA18_ORDER_OPTIONS: { name: string; value: M18SortOrder }[] = [
  { name: 'None', value: '' },
  { name: 'Latest', value: 'latest' },
  { name: 'Alphabet', value: 'alphabet' },
  { name: 'Rating', value: 'rating' },
  { name: 'Trending', value: 'trending' },
];

export const MANHWA18_STATUS_OPTIONS: { name: string; value: M18Status }[] = [
  { name: 'All', value: '' },
  { name: 'Completed', value: 'completed' },
];

/** Priority when more than one filter is set, per the site's own UI copy: genre > order > status. */
export const MANHWA18_FILTER_PRIORITY = ['genre', 'order', 'status'] as const;
