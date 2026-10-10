/**
 * mgeko.constants.ts
 *
 * Static configuration for the MangaGeko (mgeko.cc) source, reverse engineered
 * from the Mihon/Tachiyomi "keiyoushi" extension for this site (internal
 * package id: `mangarawclub`, display name: "MangaGeko").
 *
 * Nothing in this file makes a network call — it's just data.
 */

/** Root of every request. Change here if the site ever moves domains. */
export const BASE_URL = 'https://www.mgeko.cc';

/** Metadata the original Mihon extension exposes about itself. */
export const SOURCE_META = {
  id: '734865402529567092',
  name: 'MangaGeko',
  lang: 'en',
} as const;

/**
 * Paths used by the site. Both popular and latest reuse the same
 * "browse-comics" JSON endpoint, only the `sort` query param differs.
 */
export const ENDPOINTS = {
  /** Returns `{ results_html, page, num_pages }` JSON. Used for popular,
   *  latest, and any filtered/advanced search. */
  BROWSE_DATA: '/browse-comics/data/',
  /** Returns a full HTML page. Used only for a plain text search with no
   *  other filters applied (the site's older/simpler search endpoint). */
  SEARCH: '/search/',
  /** Suffix appended to a manga's URL to get its full chapter list page. */
  ALL_CHAPTERS_SUFFIX: 'all-chapters/',
} as const;

/** Genre list exactly as offered by the site's filter UI. */
export const GENRES = [
  'Action', 'Adventure', 'Comedy', 'Cooking', 'Manga', 'Drama', 'Fantasy',
  'Gender bender', 'Harem', 'Historical', 'Horror', 'Isekai', 'Josei',
  'Manhua', 'Manhwa', 'Martial arts', 'Mature', 'Mecha', 'Medical',
  'Mystery', 'One shot', 'Psychological', 'Romance', 'School life',
  'Sci fi', 'Seinen', 'Shoujo', 'Shounen', 'Slice of life', 'Sports',
  'Supernatural', 'Tragedy', 'Webtoons', 'Ladies',
] as const;

/** Publication-status filter options. "Any" is sent to the API as `''`. */
export const STATUS_OPTIONS = ['Any', 'Ongoing', 'Completed', 'Hiatus'] as const;

/** Content-type filter options. "Any" is sent to the API as `''`. */
export const TYPE_OPTIONS = ['Any', 'Manga', 'Manhwa', 'Manhua', 'Webtoon'] as const;

/**
 * Sort options as (label, API value) pairs, in the same order the site's
 * own dropdown presents them. "New" (`recently_added`) is the default.
 */
export const SORT_OPTIONS: ReadonlyArray<{ label: string; value: string }> = [
  { label: 'New', value: 'recently_added' },
  { label: 'Updated', value: 'latest' },
  { label: 'Popular (Daily)', value: 'popular_daily' },
  { label: 'Popular (Weekly)', value: 'popular_weekly' },
  { label: 'Popular (Monthly)', value: 'popular_monthly' },
  { label: 'Popular (All Time)', value: 'popular_all_time' },
  { label: 'Rating', value: 'rating' },
  { label: 'Title (A-Z)', value: 'az' },
  { label: 'Title (Z-A)', value: 'za' },
];

export const DEFAULT_SORT = SORT_OPTIONS[0].value; // 'recently_added'
/** Sort value used by MgekoClient.getPopular(). */
export const POPULAR_SORT = 'popular_all_time';
/** Sort value used by MgekoClient.getLatestUpdates(). */
export const LATEST_SORT = 'latest';

/**
 * The three "Extras" checkboxes from the filter UI. `param` is the exact
 * query-string key the API expects (sent as `param=1` when checked).
 */
export const EXTRA_FILTERS = [
  { label: 'Only completed series', param: 'only_completed' },
  { label: 'At least 50+ chapters translated', param: 'only_translated' },
  { label: 'Hide long hiatus (> 6 months)', param: 'hide_on_break' },
] as const;

/**
 * Marker filename the site stamps onto a "credits/watermark" image that
 * appears among real chapter-page images. It must be filtered out or your
 * reader will show an extra fake "page" at a random position.
 */
export const CREDITS_IMAGE_MARKER = 'credits-mgeko.png';

/** Trailing text the site appends to some chapter numbers that must be stripped. */
export const CHAPTER_NAME_SUFFIX_TO_STRIP = '-eng-li';

/**
 * The two exact date formats the site uses for chapter upload timestamps
 * (`datetime` attribute on `.chapter-update`), already normalized for the
 * quirks handled in mgeko.utils.ts (stray periods removed, "Sept" -> "Sep").
 * Kept here for reference; parsing itself lives in mgeko.utils.ts.
 */
export const CHAPTER_DATE_FORMATS = ['MMMM d, yyyy, h:mm a', 'MMMM d, yyyy, h a'] as const;

/**
 * Default request headers. The original Android extension relies on
 * Tachiyomi's default User-Agent; from a browser/RN context you should
 * supply a realistic desktop User-Agent so the site treats you like a
 * normal browser. Override via MgekoClientOptions if the site starts
 * challenging requests (e.g. Cloudflare) so you can plug in your own
 * fetch/headers strategy.
 */
export const DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Referer: `${BASE_URL}/`,
};

/** CSS selectors used across parsing, centralized so a site redesign means one edit. */
export const SELECTORS = {
  browseCard: '.comic-card',
  browseCardTitle: '.comic-card__title a',
  browseCardCover: '.comic-card__cover img',
  browseCardRating: '.comic-card__stat--rating',
  searchItem: '.novel-item',
  searchItemTitle: '.novel-title',
  searchItemCover: '.novel-cover img',
  searchStats: '.novel-stats',
  searchNextPageLink: 'nav.paging a',
  mangaHeader: '.novel-header',
  author: '.author a',
  description: '.description',
  alternativeTitle: '.alternative-title',
  genreLinks: 'a[href*=genre]',
  genreContainer: '.categories',
  statusCompleted: 'div.header-stats strong.completed',
  statusOngoing: 'div.header-stats strong.ongoing',
  cover: '.cover img',
  chapterListItem: 'ul.chapter-list > li',
  chapterAnchor: 'a',
  chapterTitle: '.chapter-title, .chapter-number',
  chapterDate: '.chapter-update',
  pageImages: '#chapter-reader img',
} as const;
