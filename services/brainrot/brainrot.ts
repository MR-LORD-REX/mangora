/**
 * brainrot.ts
 *
 * SDK for BrainRotComics (https://brainrotcomics.com).
 *
 * Source architecture: WordPress + Madara manga theme.
 * All listing/search POSTs hit /wp-admin/admin-ajax.php.
 * Chapter lists POST to {mangaUrl}ajax/chapters/.
 * Page images live in .reading-content img[data-src] or #single-pager img.
 *
 * Reverse-engineered from classes.jar (keiyoushi/source/Generated.class,
 * c0.class). No authentication required — all endpoints are public.
 *
 * React Native usage:
 *   const client = new BrainRotComicsClient({ fetchImpl: fetch });
 *   const popular = await client.getPopularManga(1);
 */

import {
  BASE_URL,
  DEFAULT_HEADERS,
  ChapterEntry,
  FilterData,
  GenreItem,
  MangaDetails,
  MangaEntry,
  MangaList,
  MangaStatus,
  PageEntry,
  SearchOptions,
  SortOrder,
  FetchLike,
} from "./brainrot.types";

// No DOM in RN — we use regex-based extraction matching the selectors found in
// the compiled source. CSS selectors from the bytecode are kept as comments.

function attr(html: string, selector: RegExp, group = 1): string | null {
  const m = selector.exec(html);
  return m ? m[group].trim() : null;
}

function allMatches(html: string, re: RegExp): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  while ((m = g.exec(html)) !== null) out.push(m[1].trim());
  return out;
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ");
}


/** Madara `m_orderby` values used by the GET archive page. */
const ORDERBY_VALUE: Record<SortOrder, string> = {
  latest: "latest",
  new: "new",
  az: "alphabet",
  rating: "rating",
  views: "views",
  trending: "trending",
};

/** App status filter -> Madara status taxonomy slug. */
const STATUS_SLUG: Record<string, string> = {
  ongoing: "on-going",
  completed: "completed",
  on_hold: "on-hold",
  canceled: "canceled",
};

/**
 * First real <img> in an HTML block, preferring Madara lazy attributes over
 * the placeholder `src`. Returns an absolute URL or null.
 */
function pickImageUrl(block: string): string | null {
  const img = /<img\b[^>]*>/i.exec(block);
  if (!img) return null;
  const tag = img[0];
  const match =
    /\bdata-src="([^"]+)"/i.exec(tag) ||
    /\bdata-manga-src="([^"]+)"/i.exec(tag) ||
    /\bdata-lazy-src="([^"]+)"/i.exec(tag) ||
    /\bsrc="([^"]+)"/i.exec(tag);
  if (!match) return null;
  const url = match[1].trim();
  if (!url || url.startsWith("data:")) return null;
  return absUrl(url);
}


/**
 * Parses the list HTML returned by admin-ajax for manga listings.'
 * Selectors from bytecode:
 *   div.page-item-detail, .manga__item, .c-tabs-item__content
 *   div.post-title h3, div.post-title h1
 *   abs:data-manga-src / img.thumb
 */
function parseMangaList(html: string): MangaEntry[] {
  const mangas: MangaEntry[] = [];

  // Each item block — match common Madara item containers
  const itemRe =
    /<div[^>]+class="[^"]*(?:page-item-detail|manga__item|c-tabs-item__content)[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]+class="[^"]*(?:page-item-detail|manga__item|c-tabs-item__content)|$)/gi;

  let item: RegExpExecArray | null;
  while ((item = itemRe.exec(html)) !== null) {
    const block = item[1];

    // Title + URL: div.post-title h3/h1 > a
    const titleMatch =
      /<div[^>]+class="post-title[^"]*"[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(
        block
      );
    if (!titleMatch) continue;
    const url = relUrl(titleMatch[1]);
    const title = decodeHtmlEntities(stripTags(titleMatch[2]));

    // Thumbnail: data-manga-src first, then src
    const thumbnailUrl = pickImageUrl(block);

    mangas.push({ url, title, thumbnailUrl });
  }

  return mangas;
}

/**
 * Parses manga detail page.
 * Selectors from bytecode:
 *   div.post-title h3, div.post-title h1
 *   div.author-content > a, div.manga-authors > a
 *   div.description-summary div.summary__content
 *   div.genres-content a
 *   .summary-content, div.summary-heading:contains(Status) + div
 */
function parseMangaDetails(html: string, mangaUrl: string): MangaDetails {
  const title =
    attr(
      html,
      /<div[^>]+class="post-title[^"]*"[^>]*>[\s\S]*?<h[13][^>]*>([\s\S]*?)<\/h[13]>/i
    ) ?? "";

  const author =
    attr(
      html,
      /<div[^>]+class="(?:author-content|manga-authors)[^"]*"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i
    ) ?? null;

  const artist =
    attr(
      html,
      /<div[^>]+class="artist-content[^"]*"[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i
    ) ?? null;

  // Description
  const descMatch =
    /<div[^>]+class="(?:summary__content|manga-excerpt)[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(
      html
    );
  const description = descMatch ? stripTags(descMatch[1]).trim() : null;

  // Status
  const statusRaw =
    attr(
      html,
      /<div[^>]+class="summary-content[^"]*"[^>]*>[\s\S]*?<div[^>]*>([\s\S]*?)<\/div>/i
    )
      ?.toLowerCase()
      .trim() ?? "";
  let status: MangaStatus = "unknown";
  if (statusRaw.includes("ongoing") || statusRaw.includes("on going"))
    status = "ongoing";
  else if (statusRaw.includes("completed")) status = "completed";
  else if (statusRaw.includes("on hold")) status = "on_hold";
  else if (statusRaw.includes("canceled") || statusRaw.includes("cancelled"))
    status = "canceled";

  // Genres: div.genres-content a
  const genreBlock =
    /<div[^>]+class="genres-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(html);
  const genres = genreBlock
    ? allMatches(genreBlock[1], /<a[^>]*>([\s\S]*?)<\/a>/i).map(
      decodeHtmlEntities
    )
    : [];

  // Thumbnail: Madara wraps the cover in div.summary_image.
  const summaryBlock =
    /<div[^>]+class="[^"]*summary_image[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(html);
  const thumbnailUrl = summaryBlock
    ? pickImageUrl(summaryBlock[1])
    : pickImageUrl(html);

  // Alt names
  const altNames =
    attr(html, /class="alt_names[^"]*"[^>]*>([\s\S]*?)<\/div>/i) ?? null;

  return {
    url: mangaUrl,
    title: decodeHtmlEntities(stripTags(title)),
    author: author ? decodeHtmlEntities(stripTags(author)) : null,
    artist: artist ? decodeHtmlEntities(stripTags(artist)) : null,
    description,
    status,
    genres,
    thumbnailUrl: thumbnailUrl ?? null,
    altNames: altNames ? stripTags(altNames).trim() : null,
  };
}

/**
 * Parses the HTML returned by {mangaUrl}ajax/chapters/
 * Selector from bytecode: li.wp-manga-chapter
 */
function parseChapterList(html: string): ChapterEntry[] {
  const chapters: ChapterEntry[] = [];

  const chRe =
    /<li[^>]+class="[^"]*wp-manga-chapter[^"]*"[^>]*>([\s\S]*?)(?=<li[^>]+class="[^"]*wp-manga-chapter|$)/gi;
  let ch: RegExpExecArray | null;
  while ((ch = chRe.exec(html)) !== null) {
    const block = ch[1];
    const linkMatch = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(
      block
    );
    if (!linkMatch) continue;

    const url = relUrl(linkMatch[1]);
    const name = decodeHtmlEntities(stripTags(linkMatch[2]));

    // span.chapter-release-date
    const dateMatch =
      /<span[^>]+class="chapter-release-date[^"]*"[^>]*>([\s\S]*?)<\/span>/i.exec(
        block
      );
    const dateText = dateMatch ? stripTags(dateMatch[1]).trim() : null;
    const dateUpload = dateText ? parseMadaraDate(dateText) : null;

    chapters.push({ url, name, dateUpload });
  }

  return chapters;
}

/**
 * Parses page images from a chapter reader page.
 * Selectors from bytecode:
 *   div.page-break img, li.blocks-gallery-item img,
 *   .reading-content img[data-src]
 *   #single-pager img
 */
function parsePageList(html: string): PageEntry[] {
  const pages: PageEntry[] = [];
  const seen = new Set<string>();

  // Priority: data-src on .reading-content images
  const readingMatch =
    /<div[^>]+class="[^"]*reading-content[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(
      html
    );
  const block = readingMatch ? readingMatch[1] : html;

  const imgRe =
    /<img[^>]+(?:data-src|src)="([^"]+)"[^>]*(?:class="[^"]*wp-manga-chapter-img[^"]*"|data-src="[^"]*")/gi;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(block)) !== null) {
    const url = m[1].trim();
    if (url && !seen.has(url)) {
      seen.add(url);
      pages.push({ index: pages.length, imageUrl: absUrl(url) });
    }
  }

  // Fallback: any img inside page-break or blocks-gallery-item
  if (pages.length === 0) {
    const fbRe =
      /<(?:div[^>]+class="[^"]*page-break[^"]*"|li[^>]+class="[^"]*blocks-gallery-item[^"]*")[^>]*>[\s\S]*?<img[^>]+(?:data-src|src)="([^"]+)"/gi;
    while ((m = fbRe.exec(html)) !== null) {
      const url = m[1].trim();
      if (url && !seen.has(url)) {
        seen.add(url);
        pages.push({ index: pages.length, imageUrl: absUrl(url) });
      }
    }
  }

  return pages;
}



const RELATIVE_RE = /(\d+)\s*(second|minute|hour|day|week|month|year)/i;

function parseMadaraDate(text: string): number | null {
  const clean = text.trim();

  // "2 hours ago", "3 days ago", etc.
  const rel = RELATIVE_RE.exec(clean);
  if (rel) {
    const val = parseInt(rel[1], 10);
    const unit = rel[2].toLowerCase();
    const ms: Record<string, number> = {
      second: 1000,
      minute: 60_000,
      hour: 3_600_000,
      day: 86_400_000,
      week: 604_800_000,
      month: 2_592_000_000,
      year: 31_536_000_000,
    };
    return Date.now() - val * (ms[unit] ?? 0);
  }

  // Try absolute parse
  const d = new Date(clean);
  if (!isNaN(d.getTime())) return d.getTime();
  return null;
}

function absUrl(url: string | null | undefined): string {
  if (!url) return "";
  url = url.trim();
  if (url.startsWith("http")) return url;
  if (url.startsWith("//")) return "https:" + url;
  if (url.startsWith("/")) return BASE_URL + url;
  return `${BASE_URL}/${url}`;
}

function relUrl(url: string): string {
  if (!url) return "";
  url = url.trim();
  if (url.startsWith(BASE_URL)) return url.slice(BASE_URL.length);
  return url;
}


export interface BrainRotComicsClientOptions {
  fetchImpl?: FetchLike;
  baseUrl?: string;
  headers?: Record<string, string>;
}


export class BrainRotComicsClient {
  private readonly base: string;
  private readonly headers: Record<string, string>;
  private readonly fetchImpl: FetchLike;

  constructor(options: BrainRotComicsClientOptions = {}) {
    this.base = options.baseUrl ?? BASE_URL;
    this.headers = { ...DEFAULT_HEADERS, ...options.headers };
    this.fetchImpl =
      options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
    if (!this.fetchImpl) {
      throw new Error(
        "No fetch implementation. Pass one via new BrainRotComicsClient({ fetchImpl })."
      );
    }
  }

  private async getHtml(url: string): Promise<string> {
    const res = await this.fetchImpl(url, {
      method: "GET",
      headers: this.headers,
    });
    if (!res.ok) {
      throw new Error(`BrainRotComics HTTP ${res.status}: ${url}`);
    }
    return res.text();
  }

  private async postHtml(
    url: string,
    body: Record<string, string>
  ): Promise<string> {
    const encoded = Object.entries(body)
      .map(
        ([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`
      )
      .join("&");
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: {
        ...this.headers,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: encoded,
    });
    if (!res.ok) {
      throw new Error(`BrainRotComics HTTP ${res.status}: ${url}`);
    }
    return res.text();
  }



  /**
   * Popular manga sorted by views (m_orderby=views).
   * GET /manga/?m_orderby=views&page=N
   */
  async getPopularManga(page = 1): Promise<MangaList> {
    const url = `${this.base}/manga/?m_orderby=views&page=${page}`;
    const html = await this.getHtml(url);
    const mangas = parseMangaList(html);
    const hasNextPage = html.includes('class="next page-numbers"');
    return { mangas, hasNextPage };
  }

  /**
   * Latest-updated manga feed.
   * POSTs to admin-ajax with action=madara_load_more.
   */
  async getLatestUpdates(page = 1): Promise<MangaList> {
    const html = await this.postHtml(
      `${this.base}/wp-admin/admin-ajax.php`,
      {
        action: "madara_load_more",
        "vars[paged]": String(page - 1),
        "vars[posts_per_page]": "18",
        "vars[post_type]": "wp-manga",
        "vars[post_status]": "publish",
        "vars[meta_key]": "_latest_update",
        "vars[orderby]": "meta_value_num",
        "vars[order]": "desc",
        "vars[template]": "madara-core/content/content-archive",
        "vars[sidebar]": "full",
        "vars[manga_archives_item_layout]": "default",
      }
    );
    const mangas = parseMangaList(html);
    const hasNextPage = mangas.length >= 18;
    return { mangas, hasNextPage };
  }

  /**
   * Search / filter manga.
   * Uses GET for text search, POST admin-ajax for filter-only.
   */
  async searchManga(
    query: string,
    page = 1,
    opts: SearchOptions = {}
  ): Promise<MangaList> {
    if (query.trim().length > 0) {
      // Text search — GET /?s=...&post_type=wp-manga
      const params = new URLSearchParams({
        s: query.trim(),
        post_type: "wp-manga",
        page: String(page),
      });
      const html = await this.getHtml(`${this.base}/?${params}`);
      const mangas = parseMangaList(html);
      return { mangas, hasNextPage: html.includes('class="next page-numbers"') };
    }

    // Filter-only browsing goes through GET on the archive page. The Madara
    // admin-ajax POST path returns an empty/challenged body through the warm
    // WebView, which surfaced to users as "no manga found".
    const html = await this.getHtml(this.browseUrl(page, opts));
    const mangas = parseMangaList(html);
    return {
      mangas,
      hasNextPage:
        html.includes('class="next page-numbers"') || mangas.length >= 18,
    };
  }

  /** GET archive URL for a filter-only browse (sort / genre / status). */
  private browseUrl(page: number, opts: SearchOptions): string {
    const order = ORDERBY_VALUE[opts.order ?? "latest"] ?? "latest";
    const genre = opts.genres?.[0];
    const status = opts.status ? STATUS_SLUG[opts.status] : undefined;
    const path = genre
      ? `/manga-genre/${genre}/`
      : status
        ? `/manga-status/${status}/`
        : `/manga/`;
    const params = new URLSearchParams();
    params.set("m_orderby", order);
    params.set("page", String(page));
    return `${this.base}${path}?${params}`;
  }

  /**
   * Full manga details from a manga page.
   */
  async getMangaDetails(mangaUrl: string): Promise<MangaDetails> {
    const html = await this.getHtml(absUrl(mangaUrl));
    return parseMangaDetails(html, mangaUrl);
  }

  /**
   * Chapter list via POST to {mangaUrl}ajax/chapters/
   * (mangaUrl must be the absolute or relative manga page URL)
   */
  async getChapterList(mangaUrl: string): Promise<ChapterEntry[]> {
    // Extract manga post ID from the page first
    const pageHtml = await this.getHtml(absUrl(mangaUrl));
    const mangaIdMatch =
      /manga_id['":\s]+(\d+)/.exec(pageHtml) ??
      /input\.rating-post-id[^>]+value=.(\d+)/.exec(pageHtml);
    const mangaId = mangaIdMatch ? mangaIdMatch[1] : "";

    // POST to ajax/chapters/
    const ajaxUrl = absUrl(mangaUrl).replace(/\/?$/, "/") + "ajax/chapters/";
    const body: Record<string, string> = { action: "manga_get_chapters" };
    if (mangaId) body["manga"] = mangaId;

    const html = await this.postHtml(ajaxUrl, body);
    return parseChapterList(html);
  }

  /**
   * Page image list from a chapter reader URL.
   */
  async getPageList(chapterUrl: string): Promise<PageEntry[]> {
    const html = await this.getHtml(absUrl(chapterUrl));
    return parsePageList(html);
  }

  /**
   * Genre/filter vocabulary. Fetched from /manga/ and parsed from the sidebar.
   * Caches per client instance after first call.
   */
  private _filterCache: FilterData | null = null;
  async getFilterData(forceRefresh = false): Promise<FilterData> {
    if (this._filterCache && !forceRefresh) return this._filterCache;
    const html = await this.getHtml(`${this.base}/manga/`);
    const genreBlock =
      /<ul[^>]+class="[^"]*list-category[^"]*"[^>]*>([\s\S]*?)<\/ul>/i.exec(
        html
      );
    const genres: GenreItem[] = [];
    if (genreBlock) {
      const linkRe =
        /<a[^>]+href="[^"]*\/manga-genre\/([^/"]+)\/"[^>]*>([\s\S]*?)<\/a>/gi;
      let m: RegExpExecArray | null;
      while ((m = linkRe.exec(genreBlock[1])) !== null) {
        genres.push({
          id: m[1].trim(),
          name: decodeHtmlEntities(stripTags(m[2])),
        });
      }
    }
    this._filterCache = { genres };
    return this._filterCache;
  }

  /** Absolute URL from a relative path. */
  absoluteUrl(relative: string): string {
    return absUrl(relative);
  }
}

export default BrainRotComicsClient;
