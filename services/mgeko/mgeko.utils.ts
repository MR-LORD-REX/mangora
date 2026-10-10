/**
 * mgeko.utils.ts
 *
 * All HTML/JSON parsing lives here, isolated from networking (mgeko.ts) so
 * you can unit-test it with saved HTML fixtures and no network at all.
 *
 * Uses `node-html-parser` (pure JS, zero dependencies) instead of cheerio.
 * Cheerio's newer versions pull in Node-only pieces (undici/encoding-sniffer)
 * that don't bundle cleanly under Metro/Hermes in React Native; node-html-parser
 * has no such dependencies and works as-is.
 */

import { parse, HTMLElement, NodeType } from 'node-html-parser';
import {
  CHAPTER_NAME_SUFFIX_TO_STRIP,
  CREDITS_IMAGE_MARKER,
  SELECTORS,
} from './mgeko.constants';
import type { Chapter, MangaDetails, MangaSummary, Page } from './mgeko.types';

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

/**
 * Resolves a possibly-relative URL (as found in an `href`/`src`/`data-src`
 * attribute) against `baseUrl`, without relying on the WHATWG `URL` global
 * (not guaranteed to exist on every RN/Hermes setup unless polyfilled).
 */
export function resolveUrl(baseUrl: string, path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith('//')) return 'https:' + path;
  const origin = baseUrl.replace(/\/+$/, '');
  return path.startsWith('/') ? origin + path : `${origin}/${path}`;
}

/**
 * Strips the site origin off an absolute URL so it can be stored/passed
 * around the same way the source extension does (relative paths only).
 * If `href` is already relative, it's returned unchanged.
 */
export function toRelativeUrl(baseUrl: string, href: string | null | undefined): string {
  if (!href) return '';
  const origin = baseUrl.replace(/\/+$/, '');
  if (href.startsWith(origin)) {
    const rest = href.slice(origin.length);
    return rest.length > 0 ? rest : '/';
  }
  return href;
}

// ---------------------------------------------------------------------------
// DOM text helpers
// ---------------------------------------------------------------------------

/**
 * Equivalent of jsoup's `Element.ownText()`: returns only the text that
 * belongs directly to this element, ignoring text inside child elements.
 * `node-html-parser`'s `.text` getter (unlike jsoup's `.text()`) includes
 * descendant text, so this walks direct child text nodes only.
 */
export function ownText(el: HTMLElement | null | undefined): string {
  if (!el) return '';
  return el.childNodes
    .filter((n) => n.nodeType === NodeType.TEXT_NODE)
    .map((n) => n.rawText)
    .join('')
    .trim();
}

/** Lowercases a word then re-capitalizes its first letter (matches the site's own genre casing). */
function titleCaseWord(word: string): string {
  if (word.length === 0) return word;
  const lower = word.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/** Applies `titleCaseWord` to every space-separated word, e.g. `"sci fi"` -> `"Sci Fi"`. */
function titleCaseGenre(text: string): string {
  return text.split(' ').map(titleCaseWord).join(' ');
}

// ---------------------------------------------------------------------------
// Listing parsers
// ---------------------------------------------------------------------------

/**
 * Parses the `.comic-card` markup returned inside the `results_html` field
 * of the `/browse-comics/data/` JSON endpoint. Used by popular, latest, and
 * any filtered/advanced search.
 */
export function parseComicCards(html: string, baseUrl: string): MangaSummary[] {
  const root = parse(html);
  return root.querySelectorAll(SELECTORS.browseCard).map((card) => {
    const titleEl = card.querySelector(SELECTORS.browseCardTitle);
    const title = titleEl?.text.trim() ?? '';
    const coverEl = card.querySelector(SELECTORS.browseCardCover);
    const thumbnailUrl = coverEl
      ? resolveUrl(baseUrl, coverEl.getAttribute('data-src')) ?? resolveUrl(baseUrl, coverEl.getAttribute('src'))
      : null;
    const anchor = card.querySelector('a');
    const url = toRelativeUrl(baseUrl, anchor?.getAttribute('href') ?? null);
    const ratingText = card.querySelector(SELECTORS.browseCardRating)?.text ?? '';
    const ratingMatch = ratingText.match(/(\d+(?:\.\d+)?)/);
    const rating = ratingMatch ? Number(ratingMatch[1]) : null;
    return { title, url, thumbnailUrl, rating };
  });
}

/**
 * Parses a full HTML page returned by the plain `/search/` endpoint
 * (`.novel-item` markup). This is a *different* markup structure than
 * `.comic-card` — the site genuinely uses two separate templates depending
 * on which endpoint served the results.
 */
export function parseSearchResultsPage(
  html: string,
  baseUrl: string
): { items: MangaSummary[]; hasNextPage: boolean } {
  const root = parse(html);
  const items = root.querySelectorAll(SELECTORS.searchItem).map((item) => {
    const title = item.querySelector(SELECTORS.searchItemTitle)?.text.trim() ?? '';
    const coverEl = item.querySelector(SELECTORS.searchItemCover);
    const thumbnailUrl = coverEl
      ? resolveUrl(baseUrl, coverEl.getAttribute('data-src')) ?? resolveUrl(baseUrl, coverEl.getAttribute('src'))
      : null;
    const anchor = item.querySelector('a');
    const url = toRelativeUrl(baseUrl, anchor?.getAttribute('href') ?? null);
    const countText =
      item.querySelector(`${SELECTORS.searchStats} strong`)?.text ?? '';
    const countMatch = countText.match(/(\d+)/);
    const chapterCount = countMatch ? Number(countMatch[1]) : null;
    return { title, url, thumbnailUrl, chapterCount };
  });
  const hasNextPage = root
    .querySelectorAll(SELECTORS.searchNextPageLink)
    .some((a) => a.text.trim() === 'Next');
  return { items, hasNextPage };
}

// ---------------------------------------------------------------------------
// Manga details
// ---------------------------------------------------------------------------

/**
 * Parses a manga's detail page. Throws if the page doesn't look like a
 * manga page at all (mirrors the source extension's own "Page not found"
 * check).
 *
 * Note on `title`: the original Android extension never scrapes a title
 * here — Tachiyomi already has it from whichever listing the user tapped,
 * and only merges in author/description/genres/status/thumbnail. This SDK
 * has no such luxury when called standalone, so it makes a best-effort
 * attempt with common heading selectors. This part is **not** verified
 * against the live site (there was nothing to reverse-engineer for it) —
 * if it comes back empty, pass the title you already have from a listing
 * instead of relying on this.
 */
export function parseMangaDetails(html: string, baseUrl: string, mangaUrl: string): MangaDetails {
  const root = parse(html);
  if (!root.querySelector(SELECTORS.mangaHeader)) {
    throw new Error('Page not found');
  }

  const bestEffortTitle =
    root.querySelector('.novel-header h1')?.text.trim() ||
    root.querySelector('h1')?.text.trim() ||
    '';

  const authorRaw = root.querySelector(SELECTORS.author)?.getAttribute('title')?.trim() ?? null;
  const author =
    authorRaw && authorRaw.toLowerCase() !== 'updating'
      ? authorRaw
          // The site leaves a stray trailing ", " on some author attributes.
          .replace(/[,\s/]+$/, '')
          .trim()
      : null;

  let description = '';
  const descEl = root.querySelector(SELECTORS.description);
  if (descEl) {
    const fullText = descEl.text;
    const marker = 'Summary is';
    const idx = fullText.indexOf(marker);
    description += idx !== -1 ? fullText.slice(idx + marker.length) : fullText;
  }

  const altRaw = ownText(root.querySelector(SELECTORS.alternativeTitle));
  if (altRaw.length > 0) {
    const parts = /[•;]/.test(altRaw) ? altRaw.split(/[•;]/) : altRaw.split(',');
    const names = parts
      .map((p) => p.trim())
      .filter((p) => p.length > 0 && p.toLowerCase() !== 'updating');
    if (names.length > 0) {
      if (description.length > 0) description += '\n\n';
      description += 'Alternative Names:';
      for (const name of names) description += `\n- ${name}`;
    }
  }
  description = description.replace(/\n{3,}/g, '\n\n').trim();

  const genres = root
    .querySelectorAll(`${SELECTORS.genreContainer} ${SELECTORS.genreLinks}`)
    .map((a) => titleCaseGenre(ownText(a)))
    .filter((g) => g.length > 0);

  const status = root.querySelector(SELECTORS.statusCompleted)
    ? ('completed' as const)
    : root.querySelector(SELECTORS.statusOngoing)
      ? ('ongoing' as const)
      : ('unknown' as const);

  const coverEl = root.querySelector(SELECTORS.cover);
  const thumbnailUrl = coverEl
    ? resolveUrl(baseUrl, coverEl.getAttribute('data-src')) ?? resolveUrl(baseUrl, coverEl.getAttribute('src'))
    : null;

  return {
    title: bestEffortTitle,
    url: toRelativeUrl(baseUrl, mangaUrl),
    thumbnailUrl,
    author,
    description,
    genres,
    status,
  };
}

// ---------------------------------------------------------------------------
// Chapters
// ---------------------------------------------------------------------------

/**
 * Parses the two exact chapter-date formats the site uses
 * (`"MMM d, yyyy, h:mm a"` / `"MMM d, yyyy, h a"`, e.g. `"Sep 5, 2026, 3:00 pm"`)
 * after normalizing the raw `datetime` attribute (stray periods removed,
 * the site's non-standard `"Sept"` abbreviation fixed to `"Sep"`).
 *
 * Returns epoch milliseconds in your device's local timezone, or `null`
 * if the string is empty or doesn't match either format (the site's own
 * extension silently falls back to `0` in this case — this SDK gives you
 * `null` instead so you can decide how to display "unknown date").
 */
const MONTHS = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
];
const CHAPTER_DATE_RE =
  /^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4}),\s*(\d{1,2})(?::(\d{2}))?\s*([AaPp][Mm])$/;

export function parseChapterDate(raw: string | null | undefined): number | null {
  if (!raw || raw.trim().length === 0) return null;
  const cleaned = raw.replace(/\./g, '').replace('Sept', 'Sep').trim();
  const match = CHAPTER_DATE_RE.exec(cleaned);
  if (!match) return null;

  const [, monthStr, dayStr, yearStr, hourStr, minuteStr, meridiem] = match;
  const monthIndex = MONTHS.indexOf(monthStr.slice(0, 3).toLowerCase());
  if (monthIndex === -1) return null;

  let hour = parseInt(hourStr, 10);
  const minute = minuteStr ? parseInt(minuteStr, 10) : 0;
  const isPm = meridiem.toLowerCase() === 'pm';
  if (isPm && hour !== 12) hour += 12;
  if (!isPm && hour === 12) hour = 0;

  const date = new Date(parseInt(yearStr, 10), monthIndex, parseInt(dayStr, 10), hour, minute);
  return date.getTime();
}

/** Parses a manga's `all-chapters/` page into a flat chapter list, newest markup first (as the site orders it). */
export function parseChapterList(html: string, baseUrl: string): Chapter[] {
  const root = parse(html);
  return root.querySelectorAll(SELECTORS.chapterListItem).map((li) => {
    const anchor = li.querySelector(SELECTORS.chapterAnchor);
    const url = toRelativeUrl(baseUrl, anchor?.getAttribute('href') ?? null);

    const titleEl = li.querySelector(SELECTORS.chapterTitle);
    const rawTitle = ownText(titleEl);
    const number = rawTitle.endsWith(CHAPTER_NAME_SUFFIX_TO_STRIP)
      ? rawTitle.slice(0, -CHAPTER_NAME_SUFFIX_TO_STRIP.length)
      : rawTitle;
    const name = `Chapter ${number}`;

    const dateAttr = li.querySelector(SELECTORS.chapterDate)?.getAttribute('datetime') ?? null;
    const uploadDate = parseChapterDate(dateAttr);

    return { name, url, uploadDate };
  });
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

/** True if a page-image URL is actually the site's inserted credits/watermark image, not real content. */
export function isCreditsImage(url: string): boolean {
  return url.includes(CREDITS_IMAGE_MARKER);
}

/** Parses a chapter reader page into an ordered list of real page images (credits image filtered out). */
export function parsePageList(html: string, baseUrl: string): Page[] {
  const root = parse(html);
  const urls = root
    .querySelectorAll(SELECTORS.pageImages)
    .map((img) => resolveUrl(baseUrl, img.getAttribute('src')))
    .filter((url): url is string => !!url && !isCreditsImage(url));
  return urls.map((imageUrl, index) => ({ index, imageUrl }));
}
