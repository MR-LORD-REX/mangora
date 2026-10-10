/**
 * mgeko.ts
 *
 * Class-based SDK for MangaGeko (mgeko.cc), reverse engineered from the
 * site's Mihon/Tachiyomi extension. Import `MgekoClient`, construct one,
 * and call its methods — networking and parsing are both handled for you.
 *
 * ```ts
 * import { MgekoClient } from './mgeko';
 *
 * const mgeko = new MgekoClient();
 * const { items } = await mgeko.getPopular(1);
 * const details = await mgeko.getMangaDetails(items[0].url);
 * const chapters = await mgeko.getChapterList(items[0].url);
 * const pages = await mgeko.getPageList(chapters[0].url);
 * ```
 */

import {
  BASE_URL,
  DEFAULT_HEADERS,
  ENDPOINTS,
  EXTRA_FILTERS,
  LATEST_SORT,
  POPULAR_SORT,
} from './mgeko.constants';
import {
  parseChapterList,
  parseComicCards,
  parseMangaDetails,
  parsePageList,
  parseSearchResultsPage,
  resolveUrl,
} from './mgeko.utils';
import type {
  BrowseComicsResponse,
  Chapter,
  FetchLike,
  MangaDetails,
  MgekoClientOptions,
  Page,
  PagedResult,
  MangaSummary,
  SearchFilters,
} from './mgeko.types';

/** The default state of every `SearchFilters` field, used to detect "no filters applied". */
const DEFAULT_FILTERS: Required<Omit<SearchFilters, 'hideNsfw'>> = {
  sort: 'recently_added',
  includeGenres: [],
  excludeGenres: [],
  status: 'Any',
  type: 'Any',
  minChapters: '',
  maxChapters: '',
  minRating: '',
  tags: [],
  onlyCompletedSeries: false,
  onlyWellTranslated: false,
  hideLongHiatus: false,
};

function isDefaultFilters(filters: SearchFilters | undefined): boolean {
  if (!filters) return true;
  const f = { ...DEFAULT_FILTERS, ...filters };
  return (
    f.sort === DEFAULT_FILTERS.sort &&
    f.includeGenres.length === 0 &&
    f.excludeGenres.length === 0 &&
    f.status === DEFAULT_FILTERS.status &&
    f.type === DEFAULT_FILTERS.type &&
    f.minChapters.trim() === '' &&
    f.maxChapters.trim() === '' &&
    f.minRating.trim() === '' &&
    f.tags.length === 0 &&
    !f.onlyCompletedSeries &&
    !f.onlyWellTranslated &&
    !f.hideLongHiatus
  );
}

/**
 * Ensures exactly one trailing slash. The site's manga URLs are expected to
 * already end in `/` (e.g. `/manga/one-piece/`); this just guards against a
 * caller passing one without it before appending `all-chapters/`.
 */
function ensureTrailingSlash(path: string): string {
  return path.endsWith('/') ? path : `${path}/`;
}

export class MgekoClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly fetchImpl: FetchLike;

  constructor(options: MgekoClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? BASE_URL;
    this.headers = { ...DEFAULT_HEADERS, ...options.headers };
    // Falls back to the RN/browser global fetch if you don't supply one.
    this.fetchImpl = options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
    if (!this.fetchImpl) {
      throw new Error(
        'No fetch implementation available. Pass one via `new MgekoClient({ fetchImpl })`.'
      );
    }
  }

  /** Low-level GET helper shared by every method. Throws on a non-OK HTTP status. */
  private async get(absoluteUrl: string): Promise<{ text: () => Promise<string>; json: () => Promise<unknown> }> {
    const response = await this.fetchImpl(absoluteUrl, { method: 'GET', headers: this.headers });
    if (!response.ok) {
      throw new Error(`MangaGeko request failed: ${response.status} ${absoluteUrl}`);
    }
    return response;
  }

  /**
   * Most popular manga of all time, paginated.
   *
   * @param page 1-based page number.
   * @param hideNsfw When true, matches the extension's "Hide NSFW" preference —
   *   NSFW entries are excluded. Defaults to `false` (site default: NSFW shown).
   */
  async getPopular(page = 1, hideNsfw = false): Promise<PagedResult<MangaSummary>> {
    return this.browse(page, POPULAR_SORT, hideNsfw);
  }

  /**
   * Recently updated manga, paginated (i.e. the site's "latest" feed).
   *
   * @param page 1-based page number.
   * @param hideNsfw Same meaning as in {@link getPopular}.
   */
  async getLatestUpdates(page = 1, hideNsfw = false): Promise<PagedResult<MangaSummary>> {
    return this.browse(page, LATEST_SORT, hideNsfw);
  }

  private async browse(page: number, sort: string, hideNsfw: boolean): Promise<PagedResult<MangaSummary>> {
    const url = `${this.baseUrl}${ENDPOINTS.BROWSE_DATA}?page=${page}&sort=${sort}&safe_mode=${hideNsfw ? '1' : '0'}`;
    const response = await this.get(url);
    const data = (await response.json()) as BrowseComicsResponse;
    const items = parseComicCards(data.results_html, this.baseUrl);
    return {
      items,
      hasNextPage: data.page < data.num_pages,
      currentPage: data.page,
      totalPages: data.num_pages,
    };
  }

  /**
   * Searches for manga by title, optionally narrowed by genre/status/type/
   * rating/tag/chapter-count filters.
   *
   * Site quirk worth knowing (preserved intentionally, not a bug in this
   * SDK): a plain keyword search with **no** filters applied uses the
   * site's simpler `/search/` page and does *not* respect `hideNsfw` at
   * all. The moment you set any filter (or search with an empty query to
   * just browse), the request switches to the same advanced
   * `/browse-comics/data/` endpoint used by {@link getPopular} /
   * {@link getLatestUpdates}, which *does* respect `hideNsfw`. This mirrors
   * the real site's own behavior — not an inconsistency to "fix".
   *
   * @param query Search text. Can be empty if you just want to browse with filters.
   * @param page 1-based page number.
   * @param filters See {@link SearchFilters}; every field is optional.
   */
  async search(query: string, page = 1, filters?: SearchFilters): Promise<PagedResult<MangaSummary>> {
    const trimmed = query.trim();

    if (trimmed !== '' && isDefaultFilters(filters)) {
      const url = `${this.baseUrl}${ENDPOINTS.SEARCH}?search=${encodeURIComponent(trimmed)}&results=${page}`;
      const response = await this.get(url);
      const html = await response.text();
      const { items, hasNextPage } = parseSearchResultsPage(html, this.baseUrl);
      return { items, hasNextPage, currentPage: page };
    }

    const f = { ...DEFAULT_FILTERS, ...filters };
    const params = new URLSearchParams();
    params.set('sort', f.sort);
    params.set('status', f.status === 'Any' ? '' : f.status);
    params.set('type', f.type === 'Any' ? '' : f.type);
    if (f.minChapters.trim() !== '') params.set('min_chapters', f.minChapters.trim());
    if (f.maxChapters.trim() !== '') params.set('max_chapters', f.maxChapters.trim());
    if (f.minRating.trim() !== '') {
      const parsed = parseFloat(f.minRating);
      const scaled = Number.isNaN(parsed) ? 0 : Math.round(parsed * 10);
      params.set('min_rating', String(scaled));
    }
    const cleanTags = f.tags.map((t) => t.trim()).filter((t) => t.length > 0);
    if (cleanTags.length > 0) params.set('tags', cleanTags.join(','));
    if (f.includeGenres.length > 0) params.set('include_genres', f.includeGenres.join(','));
    if (f.excludeGenres.length > 0) params.set('exclude_genres', f.excludeGenres.join(','));
    if (f.onlyCompletedSeries) params.set(EXTRA_FILTERS[0].param, '1');
    if (f.onlyWellTranslated) params.set(EXTRA_FILTERS[1].param, '1');
    if (f.hideLongHiatus) params.set(EXTRA_FILTERS[2].param, '1');
    params.set('safe_mode', filters?.hideNsfw ? '1' : '0');
    params.set('page', String(page));
    params.set('q', query);

    const url = `${this.baseUrl}${ENDPOINTS.BROWSE_DATA}?${params.toString()}`;
    const response = await this.get(url);
    const data = (await response.json()) as BrowseComicsResponse;
    const items = parseComicCards(data.results_html, this.baseUrl);
    return {
      items,
      hasNextPage: data.page < data.num_pages,
      currentPage: data.page,
      totalPages: data.num_pages,
    };
  }

  /**
   * Fetches and parses a manga's detail page (author, description, genres,
   * status, cover). See the note on `MangaDetails.title` in mgeko.utils.ts —
   * it's a best-effort scrape; prefer the title you already have from a
   * listing if you called {@link getPopular}/{@link search} first.
   *
   * @param mangaUrl Relative URL as returned in `MangaSummary.url`.
   */
  async getMangaDetails(mangaUrl: string): Promise<MangaDetails> {
    const absoluteUrl = resolveUrl(this.baseUrl, mangaUrl);
    if (!absoluteUrl) throw new Error(`Invalid manga URL: ${mangaUrl}`);
    const response = await this.get(absoluteUrl);
    const html = await response.text();
    return parseMangaDetails(html, this.baseUrl, mangaUrl);
  }

  /**
   * Fetches and parses the full chapter list for a manga (newest-listed
   * first, matching the site's own ordering).
   *
   * @param mangaUrl Relative URL as returned in `MangaSummary.url`.
   */
  async getChapterList(mangaUrl: string): Promise<Chapter[]> {
    const absoluteUrl = resolveUrl(this.baseUrl, ensureTrailingSlash(mangaUrl) + ENDPOINTS.ALL_CHAPTERS_SUFFIX);
    if (!absoluteUrl) throw new Error(`Invalid manga URL: ${mangaUrl}`);
    const response = await this.get(absoluteUrl);
    const html = await response.text();
    return parseChapterList(html, this.baseUrl);
  }

  /**
   * Fetches and parses a chapter's reader page into an ordered list of
   * directly-loadable page image URLs (the site's watermark/credits image
   * is filtered out automatically).
   *
   * @param chapterUrl Relative URL as returned in `Chapter.url`.
   */
  async getPageList(chapterUrl: string): Promise<Page[]> {
    const absoluteUrl = resolveUrl(this.baseUrl, chapterUrl);
    if (!absoluteUrl) throw new Error(`Invalid chapter URL: ${chapterUrl}`);
    const response = await this.get(absoluteUrl);
    const html = await response.text();
    return parsePageList(html, this.baseUrl);
  }
}

export default MgekoClient;
