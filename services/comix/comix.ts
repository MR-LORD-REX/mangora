/**
 * comix.ts
 *
 * Class-based SDK for Comix (comix.to). It speaks the ONLY protocol the
 * site offers to plain HTTP clients: server-rendered "initial-data" JSON.
 *
 * WORKING METHODS (verified against the live site):
 *   - getHomeFeed()        -> homepage SSR: Trending / Most Followed /
 *                             Hot Updates / New Titles
 *   - getMangaPage(url)    -> title page SSR: full details, recommended,
 *                             scanlation groups
 *   - getBrowseMeta()      -> /browse SSR: filter vocabulary only
 *   - getChapterReadMeta() -> reader page SSR: manga + chapter identity
 *
 * NOT SUPPORTED over HTTP (WAF-token-gated /api/v1, see
 * comix.constants.ts): search results, filtered listings, chapter lists and
 * page-image URLs. The app therefore opens the real site in an in-app
 * WebView for those flows; helpers like searchUrl() / browseUrl() /
 * chapterUrl() return the URLs a browser engine can actually serve.
 *
 * ```ts
 * import { ComixClient } from "./comix";
 * const comix = new ComixClient();
 * const feed = await comix.getHomeFeed();
 * const page = await comix.getMangaPage(feed.sections[0].items[0].url);
 * ```
 */

import { BASE_URL, DEFAULT_HEADERS, ENDPOINTS } from "./comix.constants";
import {
  browseUrl as buildBrowseUrl,
  mangaPageUrl,
  parseBrowseMeta,
  parseChapterReadMeta,
  parseHomeFeed,
  parseMangaPage,
  resolveUrl,
  searchUrl as buildSearchUrl,
} from "./comix.utils";
import type {
  BrowseMeta,
  ChapterReadMeta,
  ComixClientOptions,
  FetchLike,
  HomeFeed,
  MangaPageData,
} from "./comix.types";

export class ComixClient {
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;
  private readonly fetchImpl: FetchLike;
  private readonly htmlLoader: ((url: string) => Promise<string>) | null;

  constructor(options: ComixClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? BASE_URL;
    this.headers = { ...DEFAULT_HEADERS, ...options.headers };
    this.fetchImpl =
      options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
    this.htmlLoader = options.htmlLoader ?? null;
    if (!this.fetchImpl && !this.htmlLoader) {
      throw new Error(
        "No fetch implementation available. Pass one via `new ComixClient({ fetchImpl })` or an `htmlLoader`.",
      );
    }
  }

  /**
   * GETs an absolute URL as text. Cloudflare now serves a managed challenge
   * ("Just a moment...") to every plain HTTP request, so when an `htmlLoader`
   * is provided (the app passes the WebView bridge) the page is fetched from
   * inside the browser session that already cleared the challenge. The direct
   * fetch path remains for tests and non-challenged deployments.
   */
  private async getHtml(absoluteUrl: string): Promise<string> {
    if (this.htmlLoader) return this.htmlLoader(absoluteUrl);
    const response = await this.fetchImpl(absoluteUrl, {
      method: "GET",
      headers: this.headers,
    });
    if (!response.ok) {
      throw new Error(`Comix request failed: ${response.status} ${absoluteUrl}`);
    }
    return response.text();
  }

  /**
   * Homepage feeds (Trending / Most Followed / Hot Updates / New Titles),
   * parsed straight from server-rendered JSON.
   */
  async getHomeFeed(): Promise<HomeFeed> {
    const html = await this.getHtml(`${this.baseUrl}${ENDPOINTS.HOME}`);
    return parseHomeFeed(html);
  }

  /**
   * A manga's title page: full details plus recommended titles and the
   * scanlation groups that picked the series up.
   *
   * @param mangaUrl Relative path as returned in `MangaSummary.url`
   *   (e.g. "/title/l7re-...").
   */
  async getMangaPage(mangaUrl: string): Promise<MangaPageData> {
    const absoluteUrl = mangaPageUrl(this.baseUrl, mangaUrl);
    if (!absoluteUrl) throw new Error(`Invalid manga URL: ${mangaUrl}`);
    const html = await this.getHtml(absoluteUrl);
    return parseMangaPage(html);
  }

  /**
   * The filter vocabulary /browse ships before it hydrates (genres,
   * demographics, formats, statuses, types, years, sorts). Use it to label
   * UI chips; results still need the site's own web UI (browseUrl/searchUrl).
   */
  async getBrowseMeta(): Promise<BrowseMeta> {
    const html = await this.getHtml(`${this.baseUrl}${ENDPOINTS.BROWSE}`);
    return parseBrowseMeta(html);
  }

  /**
   * Reads the SSR metadata of a chapter reader page (manga + chapter
   * identity). Page images are API-gated and not present in HTML.
   *
   * @param chapterUrl Relative reader path (e.g.
   *   "/title/<hid>-.../<id>-chapter-3").
   */
  async getChapterReadMeta(
    chapterUrl: string,
  ): Promise<ChapterReadMeta | null> {
    const absoluteUrl = resolveUrl(this.baseUrl, chapterUrl);
    const html = await this.getHtml(absoluteUrl);
    return parseChapterReadMeta(html);
  }

  /**
   * URL of the site's search UI for a keyword. Open it in a real browser
   * engine (the app's WebView screen) — the site generates its own API
   * token there, so search and filters work.
   */
  searchUrl(query: string): string {
    return buildSearchUrl(this.baseUrl, query);
  }

  /** URL of the site's full browse + filter UI. */
  browseUrl(): string {
    return buildBrowseUrl(this.baseUrl);
  }

  /** Absolute URL for a manga title page. */
  mangaUrl(relativeUrl: string): string {
    return mangaPageUrl(this.baseUrl, relativeUrl);
  }

  /** Absolute URL for a chapter reader page. */
  chapterUrl(relativeChapterUrl: string): string {
    return resolveUrl(this.baseUrl, relativeChapterUrl);
  }
}

export default ComixClient;
