/**
 * Manhwa18.cc scraper
 * ────────────────────
 * Reverse-engineered from the Keiyoushi/Mihon "manhwa18cc" extension
 * (a Madara/WordPress-theme source). No cheerio / DOM parser — uses the
 * regex-based helpers in html-utils.ts, which are safe under React
 * Native's Hermes engine.
 *
 * Verified live against https://manhwa18.cc on 2026-09-02: no Cloudflare
 * challenge, plain GET + HTML parsing works for browse/search/details/
 * chapters. Some individual chapters are served through Madara's
 * "chapter protector" plugin, which AES-encrypts the page-image list
 * inline in the HTML — that path is implemented below and independently
 * verified against a hand-built OpenSSL-compatible ciphertext.
 *
 * Requires (React Native):
 *   npm i crypto-js react-native-url-polyfill
 *   npm i -D @types/crypto-js
 *   import 'react-native-url-polyfill/auto';   // once, at your app's entry point
 * crypto-js is pure JS (MD5/AES/Base64/Hex, no native bindings) — the
 * right choice for RN/Hermes, unlike Node's `crypto` module. The URL
 * polyfill is needed because Hermes' built-in URL/URLSearchParams
 * support is incomplete on some RN versions.
 */

import CryptoJS from 'crypto-js';
import {
  absUrl,
  extractBlockAt,
  findAllByClass,
  findFirstByClass,
  findFirstByIdPrefix,
  findFirstOpenTag,
  getAttr,
  getOwnText,
  getText,
  imageFromImgTag,
} from './html-utils';
import { DEFAULT_HEADERS, MANHWA18_BASE_URL, MANHWA18_GENRES, MONTHS } from './constants';
import type { ChapterEntry, M18Lang, MangaDetails, MangaList, Manhwa18SearchOptions, PageEntry } from './types';

// ───────────────────────── status/date word lists ─────────────────────────
// Mirrors the extension's own multi-language matching so dates and status
// text render correctly even if the site serves a non-English locale.

const COMPLETED_STATUS = [
  'completed', 'completo', 'completado', 'concluído', 'concluido', 'finalizado',
  'achevé', 'terminé', 'hoàn thành', 'مكتملة', 'مكتمل', '已完结', 'tamamlandı',
  'đã hoàn thành', 'завершено', 'tamamlanan', 'complété',
];
const ONGOING_STATUS = [
  'ongoing', 'on going', 'updating', 'продолжается', 'em lançamento', 'em andamento',
  'en cours', 'ativo', 'lançando', 'đang tiến hành', 'còn nữa', 'devam ediyor',
];

const YEAR_WORDS = ['year', 'año', 'ano', 'năm', 'yıl', 'سنة', 'سنوات'];
const MONTH_WORDS = ['month', 'mes', 'tháng', 'ay', 'شهر', 'أشهر', 'شهور'];
const WEEK_WORDS = ['week', 'semana', 'tuần', 'hafta', 'أسبوع', 'أسابيع'];
const DAY_WORDS = ['day', 'día', 'dia', 'jour', 'hari', 'gün', 'ngày', 'giorni', 'أيام', '天'];
const HOUR_WORDS = ['hour', 'hora', 'heure', 'jam', 'saat', 'giờ', 'ore', 'ساعة', 'ساعات', '小时'];
const MINUTE_WORDS = ['minute', 'minuto', 'min', 'menit', 'dakika', 'phút', 'دقيقة', 'دقائق'];
const SECOND_WORDS = ['second', 'segundo', 'sec', 'detik', 'giây', 'ثانية', 'ثوان'];

const MS = { second: 1000, minute: 60_000, hour: 3_600_000, day: 86_400_000, week: 604_800_000 };

interface ChapterProtectorData {
  ct: string; // ciphertext, base64
  s: string; // salt, hex
}

export class Manhwa18Source {
  readonly baseUrl = MANHWA18_BASE_URL;
  readonly lang: M18Lang;
  readonly genres = MANHWA18_GENRES;

  constructor(lang: M18Lang = 'en') {
    this.lang = lang;
  }

  private headers(): Record<string, string> {
    return { ...DEFAULT_HEADERS, Referer: `${this.baseUrl}/` };
  }

  private async fetchHtml(url: string): Promise<string> {
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
    return res.text();
  }

  private async postForm(url: string, form: Record<string, string>): Promise<string> {
    const body = Object.entries(form)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        ...this.headers(),
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body,
    });
    if (!res.ok) throw new Error(`POST ${url} -> ${res.status}`);
    return res.text();
  }

  /**
   * GET /webtoons/{page}?orderby=trending — or /raw/{page} for the 'ko' variant.
   * ('all' behaves like 'en' for this endpoint — matches the extension's own logic.)
   */
  async getPopularManga(page = 1): Promise<MangaList> {
    const url =
      this.lang === 'ko' ? `${this.baseUrl}/raw/${page}` : `${this.baseUrl}/webtoons/${page}?orderby=trending`;
    const html = await this.fetchHtml(url);
    return this.parseMangaList(html);
  }

  /**
   * GET /webtoons/{page} — homepage "Latest" feed, same for every lang variant.
   * De-duplicated by manga URL (the feed can list the same title more than
   * once when it has multiple recently-updated chapters).
   */
  async getLatestUpdates(page = 1): Promise<MangaList> {
    const html = await this.fetchHtml(`${this.baseUrl}/webtoons/${page}`);
    const { mangas, hasNextPage } = this.parseMangaList(html);
    const seen = new Set<string>();
    const deduped = mangas.filter((m) => (seen.has(m.url) ? false : (seen.add(m.url), true)));
    return { mangas: deduped, hasNextPage };
  }

  /**
   * Text search: GET /search?q={query}&page={page}
   * Otherwise, at most ONE of these applies, in priority order genre > order > status
   * (matches the site's own filter UI, which explicitly documents this priority):
   *   genre:  GET /webtoon-genre/{slug}/{page}
   *   order:  GET /webtoons/{page}?orderby={order}
   *   status: GET /{status}/{page}
   * With none of the above set, falls back to the popular feed.
   */
  async searchManga(query: string, page = 1, opts: Manhwa18SearchOptions = {}): Promise<MangaList> {
    let url: string;
    if (query.trim().length > 0) {
      const u = new URL(`${this.baseUrl}/search`);
      u.searchParams.set('q', query);
      u.searchParams.set('page', String(page));
      url = u.toString();
    } else if (opts.genreSlug) {
      url = `${this.baseUrl}/webtoon-genre/${opts.genreSlug}/${page}`;
    } else if (opts.order) {
      const u = new URL(`${this.baseUrl}/webtoons/${page}`);
      u.searchParams.set('orderby', opts.order);
      url = u.toString();
    } else if (opts.status) {
      url = `${this.baseUrl}/${opts.status}/${page}`;
    } else {
      return this.getPopularManga(page);
    }

    const html = await this.fetchHtml(url);
    return this.parseMangaList(html);
  }

  /** Manga details page. Pass the absolute `url` from any list/search result. */
  async getMangaDetails(mangaUrl: string): Promise<MangaDetails> {
    const html = await this.fetchHtml(mangaUrl);
    return this.parseMangaDetailsDoc(html, mangaUrl);
  }

  /**
   * Chapter list. Lives on the manga details page for most titles (returned
   * inline in the initial HTML). A minority of long-running titles lazy-load
   * chapters via AJAX instead — detected here via an empty
   * `div[id^=manga-chapters-holder]` wrapper — and are fetched with a
   * `manga_get_chapters` POST to `/wp-admin/admin-ajax.php` as a fallback.
   */
  async getChapterList(mangaUrl: string): Promise<ChapterEntry[]> {
    const html = await this.fetchHtml(mangaUrl);
    return this.parseChapterListDoc(html, mangaUrl);
  }

  async getMangaDetailsAndChapters(
    mangaUrl: string,
  ): Promise<{ details: MangaDetails; chapters: ChapterEntry[] }> {
    const html = await this.fetchHtml(mangaUrl);
    return {
      details: this.parseMangaDetailsDoc(html, mangaUrl),
      chapters: await this.parseChapterListDoc(html, mangaUrl),
    };
  }

  /**
   * Retrieves adjacent chapters (prev and next) given a manga and current chapter URL.
   * Chapter list is sorted newest-first (index 0 is newest chapter).
   */
  async getAdjacentChapters(
    mangaUrl: string,
    currentChapterUrl: string,
  ): Promise<{ prev: string | null; next: string | null }> {
    const chapters = await this.getChapterList(mangaUrl);
    // Normalize trailing slashes for comparison
    const normalize = (u: string) => u.replace(/\/+$/, '');
    const current = normalize(currentChapterUrl);
    const currentIndex = chapters.findIndex((c) => normalize(c.url) === current);

    if (currentIndex === -1) return { prev: null, next: null };

    // Newest first: prev (older) = index+1, next (newer) = index-1
    return {
      prev: currentIndex < chapters.length - 1 ? chapters[currentIndex + 1].url : null,
      next: currentIndex > 0 ? chapters[currentIndex - 1].url : null,
    };
  }

  /**
   * Page (image) list for a chapter.
   *
   * Most chapters render images directly as `<img>` tags under
   * `div.read-content`. Protected chapters instead embed a
   * `#chapter-protector-data` element containing an AES-encrypted JSON blob
   * (`{"ct": "<base64 ciphertext>", "s": "<hex salt>"}`) plus a per-page
   * nonce/password — this is Madara's "Content Protector" plugin. We decrypt
   * it client-side (OpenSSL-compatible EVP_BytesToKey + AES-256-CBC/PKCS7,
   * same scheme `openssl enc -aes-256-cbc -md md5` produces) to recover a
   * JSON array of image URLs.
   */
  async getPageList(chapterUrl: string): Promise<PageEntry[]> {
    const html = await this.fetchHtml(chapterUrl);

    const protectorEl = findFirstByIdPrefix(html, 'div', 'chapter-protector-data');
    if (!protectorEl) {
      const readContent = findFirstByClass(html, 'div', 'read-content');
      const imgTags = readContent ? this.findAllOpenTags(readContent, 'img') : [];
      return imgTags.map((tag, index) => ({ index, imageUrl: imageFromImgTag(tag, this.baseUrl) }));
    }

    const raw = getText(protectorEl); // the element's own text content holds the protector script/markup
    const password = raw.split("wpmangaprotectornonce='")[1]?.split("';")[0] ?? '';
    const blobJson = raw.split("chapter_data='")[1]?.split("';")[0]?.replace(/\\\//g, '/') ?? '';
    if (!password || !blobJson) return [];

    let data: ChapterProtectorData;
    try {
      data = JSON.parse(blobJson);
    } catch {
      return [];
    }

    let decrypted: string;
    try {
      decrypted = this.decryptChapterData(data, password);
    } catch {
      return [];
    }

    try {
      // The decrypted payload is itself a JSON-encoded string containing a
      // JSON array of URLs (double-encoded, matching the extension's own parsing).
      const inner = JSON.parse(decrypted);
      const urls: string[] = typeof inner === 'string' ? JSON.parse(inner) : inner;
      return urls.map((imageUrl, index) => ({ index, imageUrl }));
    } catch {
      return [];
    }
  }

  /** OpenSSL-compatible EVP_BytesToKey (MD5, 1 iteration) key+IV derivation, then AES-256-CBC/PKCS7 decrypt. */
  private decryptChapterData(data: ChapterProtectorData, password: string): string {
    const salt = CryptoJS.enc.Hex.parse(data.s);
    const ciphertext = CryptoJS.enc.Base64.parse(data.ct);
    const passwordWords = CryptoJS.enc.Utf8.parse(password);

    let keyIv = CryptoJS.lib.WordArray.create();
    let previous = CryptoJS.lib.WordArray.create();
    while (keyIv.sigBytes < 48) {
      const input = previous.clone().concat(passwordWords).concat(salt);
      previous = CryptoJS.MD5(input);
      keyIv = keyIv.clone().concat(previous);
    }
    const key = CryptoJS.lib.WordArray.create(keyIv.words.slice(0, 8), 32);
    const iv = CryptoJS.lib.WordArray.create(keyIv.words.slice(8, 12), 16);

    const cipherParams = CryptoJS.lib.CipherParams.create({ ciphertext });
    const decrypted = CryptoJS.AES.decrypt(cipherParams, key, {
      iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });
    return decrypted.toString(CryptoJS.enc.Utf8);
  }

  // ───────────────────────── parsing ─────────────────────────

  private findAllOpenTags(html: string, tagName: string): string[] {
    const re = new RegExp(`<${tagName}\\b[^>]*>`, 'gi');
    return html.match(re) ?? [];
  }

  private parseMangaList(html: string): MangaList {
    const items = findAllByClass(html, 'div', 'manga-item');

    const mangas = items.map((item) => {
      const linkBlock = extractBlockAt(item, 'a', 0)?.block ?? '';
      const linkOpenTag = findFirstOpenTag(linkBlock, 'a');
      const url = linkOpenTag ? absUrl(getAttr(linkOpenTag, 'href'), this.baseUrl) : '';
      // Title lives in a heading `<h3>` inside the card; fall back to the link's own text.
      const h3 = extractBlockAt(item, 'h3', 0)?.block;
      const title = h3 ? getText(h3) : getOwnText(linkBlock);

      const imgTag = findFirstOpenTag(item, 'img');
      const thumbnailUrl = imgTag ? imageFromImgTag(imgTag, this.baseUrl) : '';

      return { url, title, thumbnailUrl };
    });

    const paginationUl = findFirstByClass(html, 'ul', 'pagination');
    const nextLi = paginationUl ? findFirstByClass(paginationUl, 'li', 'next') : null;
    const hasNextPage = nextLi ? /<a\b/i.test(nextLi) : false;
    return { mangas, hasNextPage };
  }

  private parseMangaDetailsDoc(html: string, url: string): MangaDetails {
    const postTitleDiv = findFirstByClass(html, 'div', 'post-title');
    const titleHeading =
      (postTitleDiv && (extractBlockAt(postTitleDiv, 'h3', 0)?.block ?? extractBlockAt(postTitleDiv, 'h1', 0)?.block)) ??
      extractBlockAt(html, 'h1', 0)?.block ??
      '';
    const title = getOwnText(titleHeading);

    const authorLinks = findAllByClass(html, 'div', 'author-content').flatMap((d) => findAllByClass(d, 'a'));
    const author = authorLinks.map((a) => getText(a)).join(', ');

    const artistLinks = findAllByClass(html, 'div', 'artist-content').flatMap((d) => findAllByClass(d, 'a'));
    const artist = artistLinks.map((a) => getText(a)).join(', ');

    // manhwa18cc overrides the default Madara description selector to this
    // specific one (confirmed in the compiled extension) — NOT the generic
    // `.summary-content`, which is reused for the Alt/Type/Status rows below.
    const descWrapper = findFirstByClass(html, 'div', 'panel-story-description');
    const dsctDiv = descWrapper ? findFirstByClass(descWrapper, 'div', 'dsct') : null;
    const summaryParas = dsctDiv ? findAllByClass(dsctDiv, 'p') : [];
    const description = summaryParas.length > 0 ? summaryParas.map((p) => getText(p)).join('\n\n') : getText(dsctDiv ?? '');

    // `.post-content_item:contains(Label) .summary-content` — find the labeled
    // metadata row (Alt / Type), then read its content sub-element.
    const findLabeledContent = (label: string): string | null => {
      const items = findAllByClass(html, 'div', 'post-content_item');
      const match = items.find((item) => getText(item).includes(label));
      if (!match) return null;
      const content = findFirstByClass(match, 'div', 'summary-content');
      return content ? getText(content) : null;
    };
    const altText = findLabeledContent('Alt');
    const typeText = findLabeledContent('Type');
    const fullDescription = description + (altText ? `\n\nAlternative: ${altText}` : '');

    // Status is the LAST `.summary-content` block on the page (verified against
    // the site's real field order: Alt, Author, Artist, Genre, Type, Release, Status).
    const statusBlocks = findAllByClass(html, 'div', 'summary-content');
    const statusText = statusBlocks.length > 0 ? getText(statusBlocks[statusBlocks.length - 1]) : '';
    const normalizedStatus = statusText.toLowerCase();
    const status = COMPLETED_STATUS.some((w) => normalizedStatus.includes(w))
      ? 'completed'
      : ONGOING_STATUS.some((w) => normalizedStatus.includes(w))
        ? 'ongoing'
        : 'unknown';

    const genreDiv = findFirstByClass(html, 'div', 'genres-content');
    const tagDiv = findFirstByClass(html, 'div', 'tags-content');
    const genres = [
      ...(genreDiv ? findAllByClass(genreDiv, 'a').map((a) => getText(a)) : []),
      ...(tagDiv ? findAllByClass(tagDiv, 'a').map((a) => getText(a)) : []),
      ...(typeText ? [typeText] : []),
    ];

    const thumbDiv = findFirstByClass(html, 'div', 'summary_image');
    const imgTag = thumbDiv ? findFirstOpenTag(thumbDiv, 'img') : null;
    const thumbnailUrl = imgTag ? imageFromImgTag(imgTag, this.baseUrl) : '';

    return { url, title, author, artist, description: fullDescription, status, genres, thumbnailUrl };
  }

  private async parseChapterListDoc(html: string, mangaUrl: string): Promise<ChapterEntry[]> {
    let rows = findAllByClass(html, 'li', 'a-h');

    if (rows.length === 0) {
      const holder = findFirstByIdPrefix(html, 'div', 'manga-chapters-holder');
      if (holder) {
        const dataId = getAttr(findFirstOpenTag(holder, 'div') ?? '', 'data-id');
        if (dataId) {
          const ajaxHtml = await this.postForm(`${this.baseUrl}/wp-admin/admin-ajax.php`, {
            action: 'manga_get_chapters',
            manga: dataId,
          });
          rows = findAllByClass(ajaxHtml, 'li', 'a-h');
        }
      }
    }

    return rows.map((row) => {
      const linkBlock = extractBlockAt(row, 'a', 0)?.block ?? '';
      const linkOpenTag = findFirstOpenTag(linkBlock, 'a');
      const url = linkOpenTag ? absUrl(getAttr(linkOpenTag, 'href'), this.baseUrl).split('?style=')[0] : '';
      const name = getText(linkBlock);

      const imgTag = findFirstOpenTag(row, 'img');
      const imgAlt = imgTag ? getAttr(imgTag, 'alt') : null;
      const spanA = findFirstByClass(row, 'span');
      const spanATitle = spanA ? getAttr(findFirstOpenTag(spanA, 'a') ?? '', 'title') : null;
      const timeSpan = findFirstByClass(row, 'span', 'chapter-time');
      const dateText = imgAlt || spanATitle || (timeSpan ? getText(timeSpan) : '') || '';

      return { url, name, dateUpload: this.parseChapterDate(dateText) };
    });
  }

  /**
   * Handles "today"/"yesterday", relative phrases in several languages
   * ("3 days ago", "hace 2 horas", "2 tuần trước", ...), and falls back to
   * the absolute "dd MMM yyyy" format (e.g. "26 Aug 2026") the site itself uses.
   */
  private parseChapterDate(date: string | null | undefined): number | null {
    if (!date) return null;
    const normalized = date.trim().toLowerCase();
    if (!normalized) return null;

    const todayUtc = Date.now() - (Date.now() % MS.day); // midnight UTC today, approx.
    if (['today', 'hoje', 'hoy'].some((w) => normalized.startsWith(w))) return todayUtc;
    if (['yesterday', 'ontem', 'ayer', 'يوم واحد'].some((w) => normalized.startsWith(w))) {
      return todayUtc - MS.day;
    }

    const numMatch = /\d+/.exec(normalized);
    if (numMatch) {
      const amount = parseInt(numMatch[0], 10);
      const unitMs = YEAR_WORDS.some((w) => normalized.includes(w))
        ? MS.day * 365
        : MONTH_WORDS.some((w) => normalized.includes(w))
          ? MS.day * 30
          : WEEK_WORDS.some((w) => normalized.includes(w))
            ? MS.week
            : DAY_WORDS.some((w) => normalized.includes(w))
              ? MS.day
              : HOUR_WORDS.some((w) => normalized.includes(w))
                ? MS.hour
                : MINUTE_WORDS.some((w) => normalized.includes(w))
                  ? MS.minute
                  : SECOND_WORDS.some((w) => normalized.includes(w))
                    ? MS.second
                    : null;
      if (unitMs) return Date.now() - amount * unitMs;
    }

    // Absolute date fallback: "dd MMM yyyy", e.g. "26 Aug 2026".
    const m = /^(\d{1,2})\s+(\w{3})\w*\s+(\d{4})$/.exec(date.trim());
    if (m) {
      const monthIndex = MONTHS.findIndex((mo) => mo.toLowerCase() === m[2].toLowerCase().slice(0, 3));
      if (monthIndex !== -1) return Date.UTC(Number(m[3]), monthIndex, Number(m[1]));
    }
    return null;
  }
}
