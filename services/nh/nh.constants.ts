/**
 * nh.constants.ts
 * ---------------------------------------------------------------------------
 * STATIC constants. These ship with your app bundle, so the UI can render
 * filters, sort pickers, language chips and a tag list *instantly at cold
 * start*, with zero network. Anything the site adds later is picked up by the
 * DYNAMIC layer (see `TaxonomyStore` in nh.ts) and merged on top of these.
 *
 * Rule of thumb:
 *   STATIC  = shipped defaults, always available, never fails.
 *   DYNAMIC = fetched + cached at app start, may be stale/empty, never blocks UI.
 * ---------------------------------------------------------------------------
 */

/** Official host. nhentai.net is the only host that speaks the v2 JSON API. */
export const NH_NET = 'https://nhentai.net';

/** Image CDNs. `i*` = full pages, `t*` = covers/thumbnails. Mirrors the
 *  server lists returned by GET /api/v2/config. */
export const NH_IMAGE_HOSTS = [
  'https://i1.nhentai.net',
  'https://i2.nhentai.net',
  'https://i3.nhentai.net',
  'https://i4.nhentai.net',
] as const;

export const NH_THUMB_HOSTS = [
  'https://t1.nhentai.net',
  'https://t2.nhentai.net',
  'https://t3.nhentai.net',
  'https://t4.nhentai.net',
] as const;

/** Path templates relative to the v2 API base (https://nhentai.net). */
export const NH_PATHS = {
  /** JSON: full gallery metadata by numeric code. */
  v2Gallery: (id: string | number) => `/api/v2/galleries/${id}`,
  /** JSON: "more like this" for a gallery. */
  v2Related: (id: string | number) => `/api/v2/galleries/${id}/related`,
  /** JSON: search. `query` uses the site's own query syntax. */
  v2Search: '/api/v2/search',
  /** JSON: newest uploads / sorted browse feed. */
  v2Galleries: '/api/v2/galleries',
  /** JSON: browse by numeric tag id. */
  v2Tagged: '/api/v2/galleries/tagged',
  /** JSON: random gallery (returns an id, then fetch that gallery). */
  v2Random: '/api/v2/galleries/random',
  /** JSON: taxonomy list by type: tag, artist, group, parody, character,
   *  language or category. */
  v2Tags: (type: string) => `/api/v2/tags/${type}`,
  /** HTML: canonical gallery page for share sheets / "open in browser". */
  gallery: (id: string | number) => `/g/${id}`,
} as const;

/* -------------------------------------------------------------------------- */
/* Tag taxonomy                                                               */
/* -------------------------------------------------------------------------- */

export const NH_TAG_TYPES = [
  'tag',
  'artist',
  'group',
  'parody',
  'character',
  'language',
  'category',
] as const;
export type NhTagType = (typeof NH_TAG_TYPES)[number];


/** Human labels for UI section headers / filter tabs. */
export const NH_TAG_TYPE_LABEL: Record<NhTagType, string> = {
  tag: 'Tags',
  artist: 'Artists',
  group: 'Circles / Groups',
  parody: 'Parodies',
  character: 'Characters',
  language: 'Languages',
  category: 'Categories',
};

/** Which taxonomies are small & stable enough to be worth showing as chips. */
export const NH_QUICK_FILTER_TYPES: NhTagType[] = ['language', 'category', 'tag'];

/* -------------------------------------------------------------------------- */
/* Sorting / languages / categories                                           */
/* -------------------------------------------------------------------------- */

export const NH_SORT = {
  RECENT: '',
  POPULAR: 'popular',
  POPULAR_WEEK: 'popular-week',
  POPULAR_TODAY: 'popular-today',
  POPULAR_MONTH: 'popular-month',
} as const;
export type NhSort = (typeof NH_SORT)[keyof typeof NH_SORT];

/** Ready-made options array for a <Picker>/segmented control. */
export const NH_SORT_OPTIONS: { label: string; value: NhSort }[] = [
  { label: 'Recent', value: NH_SORT.RECENT },
  { label: 'Popular today', value: NH_SORT.POPULAR_TODAY },
  { label: 'Popular this week', value: NH_SORT.POPULAR_WEEK },
  { label: 'Popular this month', value: NH_SORT.POPULAR_MONTH },
  { label: 'Popular all time', value: NH_SORT.POPULAR },
];

export const NH_LANGUAGES = [
  { name: 'english', label: 'English', flag: '🇬🇧' },
  { name: 'japanese', label: '日本語', flag: '🇯🇵' },
  { name: 'chinese', label: '中文', flag: '🇨🇳' },
  { name: 'korean', label: '한국어', flag: '🇰🇷' },
  { name: 'spanish', label: 'Español', flag: '🇪🇸' },
  { name: 'french', label: 'Français', flag: '🇫🇷' },
  { name: 'german', label: 'Deutsch', flag: '🇩🇪' },
  { name: 'russian', label: 'Русский', flag: '🇷🇺' },
  { name: 'portuguese', label: 'Português', flag: '🇵🇹' },
  { name: 'italian', label: 'Italiano', flag: '🇮🇹' },
  { name: 'speechless', label: 'Speechless', flag: '🔇' },
  { name: 'translated', label: 'Translated', flag: '🌐' },
] as const;

export const NH_CATEGORIES = [
  'doujinshi',
  'manga',
  'artist cg',
  'game cg',
  'western',
  'image set',
  'cosplay',
  'asian porn',
  'misc',
] as const;

/* -------------------------------------------------------------------------- */
/* Static seed tag list                                                        */
/* -------------------------------------------------------------------------- */

/**
 * A curated seed of common content tags so filter UI is populated on first
 * launch before `TaxonomyStore.sync()` finishes. Intentionally *not* the full
 * list (the site has ~50k tags incl. artists) — the dynamic layer fills it in.
 */
export const NH_STATIC_TAGS: readonly string[] = [
  'full color', 'multi-work series', 'sole female', 'sole male', 'nakadashi',
  'big breasts', 'small breasts', 'blowjob', 'group', 'anal', 'stockings',
  'glasses', 'schoolgirl uniform', 'ahegao', 'defloration', 'x-ray',
  'paizuri', 'yuri', 'yaoi', 'futanari', 'netorare', 'cheating',
  'milf', 'mature woman', 'housewife', 'office lady', 'nurse', 'teacher',
  'maid', 'nun', 'idol', 'twintails', 'ponytail', 'dark skin', 'tanlines',
  'swimsuit', 'bikini', 'bloomers', 'gyaru', 'kimono', 'bunny girl',
  'catgirl', 'kemonomimi', 'monster girl', 'elf', 'succubus',
  'femdom', 'males only', 'females only', 'crossdressing', 'mind control',
  'hypnosis', 'bondage', 'exhibitionism', 'public use', 'harem',
  'lactation', 'pregnant', 'impregnation', 'creampie', 'cunnilingus',
  'handjob', 'footjob', 'masturbation', 'sex toys', 'vibrator',
  'romance', 'story arc', 'wholesome', 'vanilla', 'first person perspective',
  'uncensored', 'decensored', 'text-heavy', 'sweating', 'muscle',
  'chubby', 'petite', 'tomboy', 'osananajimi', 'incest', 'sister', 'mother',
  'cosplay', 'unusual pupils', 'blush', 'dilf', 'oyakodon', 'threesome',
];

/**
 * Tag ids hard-filtered out of every result by default (pass `blockTagIds: []`
 * to disable). v2 list responses only expose numeric tag ids, so filtering is
 * id-based. The ids are stable on nhentai and were resolved from
 * /api/v2/tags/tag/{slug} in 2026-09; names the site no longer carries (for
 * example "loli", "shota", "gore") cannot appear in results and were dropped.
 */
export const NH_BLOCKED_TAG_IDS: readonly number[] = [
  19440, // lolicon
  32341, // shotacon
  27217, // guro
  10542, // snuff
  12523, // bestiality
  2820,  // scat
  16518, // coprophagia
];

/* -------------------------------------------------------------------------- */
/* Networking                                                                  */
/* -------------------------------------------------------------------------- */

/** Explicit desktop UA - the v2 API expects a recognizable User-Agent. */
export const NH_DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export const NH_DEFAULT_HEADERS: Record<string, string> = {
  'User-Agent': NH_DEFAULT_USER_AGENT,
  Accept: 'application/json',
  'Accept-Language': 'en-US,en;q=0.9',
};

export const NH_PAGE_SIZE = 25;

export const NH_DEFAULTS = {
  timeoutMs: 15000,
  retries: 2,
  retryBaseDelayMs: 600,
  /** Politeness gap between API calls (anon limit is ~20 req/min per IP). */
  minRequestGapMs: 800,
  /** TTL for the dynamic taxonomy cache. */
  taxonomyTtlMs: 24 * 60 * 60 * 1000,
  /** Pages of /api/v2/tags/{type} to fetch during a sync (~120 entries/page). */
  taxonomySyncPages: 2,
} as const;

/** Stable keys for whatever storage adapter you plug in (AsyncStorage/MMKV). */
export const NH_STORAGE_KEYS = {
  taxonomy: 'nh:taxonomy:v2',
} as const;

export const NH_ERROR = {
  NETWORK: 'NETWORK',
  TIMEOUT: 'TIMEOUT',
  NOT_FOUND: 'NOT_FOUND',
  RATE_LIMITED: 'RATE_LIMITED',
  PARSE: 'PARSE',
  BLOCKED_CONTENT: 'BLOCKED_CONTENT',
  UNKNOWN: 'UNKNOWN',
} as const;
export type NhErrorCode = (typeof NH_ERROR)[keyof typeof NH_ERROR];
