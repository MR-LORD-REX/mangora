/**
 * html-utils.ts
 * ─────────────
 * Minimal, dependency-free HTML scraping helpers.
 *
 * Why this exists: cheerio (and most other HTML-parsing libs) pull in
 * Node-only internals that break under Metro/Hermes in React Native.
 * Everything here is plain string/regex manipulation — no DOM, no
 * native modules, guaranteed to run anywhere JS runs.
 *
 * This is NOT a general-purpose HTML parser. It only implements the
 * handful of operations the two scrapers actually need: finding
 * repeated "card" blocks, reading an attribute, and reading text
 * content (with or without nested-element text, mirroring jsoup's
 * .text() vs .ownText()).
 */

const ENTITY_MAP: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** Decode the common HTML entities (named + numeric/hex). */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, ent: string) => {
    if (ent[0] === '#') {
      const isHex = ent[1] === 'x' || ent[1] === 'X';
      const code = isHex ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    return ENTITY_MAP[ent] ?? match;
  });
}

/** Read an attribute value out of a single opening tag's raw HTML, e.g. `<a href="...">`. */
export function getAttr(openTagHtml: string, name: string): string | null {
  const re = new RegExp(`${name}\\s*=\\s*"([^"]*)"|${name}\\s*=\\s*'([^']*)'`, 'i');
  const m = re.exec(openTagHtml);
  if (!m) return null;
  return decodeEntities(m[1] ?? m[2] ?? '');
}

/** Just the first opening tag `<tagName ...>` in a string (attributes only, no content needed). */
export function findFirstOpenTag(html: string, tagName: string): string | null {
  const m = new RegExp(`<${tagName}\\b[^>]*>`, 'i').exec(html);
  return m ? m[0] : null;
}

/** All text content, like jsoup's `.text()` — tags become spaces, entities decoded, whitespace collapsed. */
export function getText(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Approximate jsoup's `.ownText()`: text belonging directly to this element,
 * excluding text that belongs to any nested element (e.g. a "NEW" badge <span>).
 * Works by stripping complete `<tag>...</tag>` blocks (innermost first) before
 * collecting text, so only top-level text nodes remain.
 */
export function getOwnText(html: string): string {
  // Strip the element's own outer wrapping tag first — otherwise the
  // stripping loop below immediately self-matches the whole element.
  const outer = /^\s*<(\w+)(?:\s[^>]*)?>([\s\S]*)<\/\1>\s*$/i.exec(html);
  let inner = outer ? outer[2] : html;

  let prev: string;
  do {
    prev = inner;
    inner = inner.replace(/<(\w+)(?:\s[^>]*)?>((?:(?!<\1\b)[\s\S])*?)<\/\1>/gi, '');
  } while (inner !== prev);
  return getText(inner);
}

/**
 * Find the outer HTML of the first `<tagName ...>...</tagName>` starting at
 * `fromIndex`, correctly handling nested tags of the same name (e.g. nested
 * <div>s), by tracking open/close depth rather than a naive non-greedy regex.
 */
export function extractBlockAt(
  html: string,
  tagName: string,
  fromIndex = 0,
): { block: string; start: number; end: number } | null {
  const openTagRe = new RegExp(`<${tagName}\\b[^>]*>`, 'gi');
  openTagRe.lastIndex = fromIndex;
  const first = openTagRe.exec(html);
  if (!first) return null;

  const openRe = new RegExp(`<${tagName}\\b[^>]*>`, 'gi');
  const closeRe = new RegExp(`</${tagName}\\s*>`, 'gi');
  let depth = 1;
  let pos = first.index + first[0].length;

  while (depth > 0) {
    openRe.lastIndex = pos;
    closeRe.lastIndex = pos;
    const nextOpen = openRe.exec(html);
    const nextClose = closeRe.exec(html);
    if (!nextClose) return null; // malformed / truncated HTML
    if (nextOpen && nextOpen.index < nextClose.index) {
      depth++;
      pos = nextOpen.index + nextOpen[0].length;
    } else {
      depth--;
      pos = nextClose.index + nextClose[0].length;
    }
  }
  return { block: html.slice(first.index, pos), start: first.index, end: pos };
}

/** Does a space-separated `class="..."` attribute contain this exact class token? */
function hasClass(openTagHtml: string, className: string): boolean {
  const cls = getAttr(openTagHtml, 'class');
  if (!cls) return false;
  return cls.split(/\s+/).includes(className);
}

/**
 * Find every top-level `<tagName class="...classToken...">...</tagName>` block
 * (non-overlapping, in document order). This is the workhorse for pulling
 * repeated "card" elements out of a listing page.
 */
export function findAllByClass(html: string, tagName: string, classToken?: string): string[] {
  const blocks: string[] = [];
  const openRe = new RegExp(`<${tagName}\\b[^>]*>`, 'gi');
  let idx = 0;
  while (idx < html.length) {
    openRe.lastIndex = idx;
    const m = openRe.exec(html);
    if (!m) break;
    if (!classToken || hasClass(m[0], classToken)) {
      const found = extractBlockAt(html, tagName, m.index);
      if (found) {
        blocks.push(found.block);
        idx = found.end; // skip the whole matched block — avoids re-matching nested duplicates
        continue;
      }
    }
    // No match at this tag (or malformed) — advance past just the opening tag,
    // so nested tags of the same name (e.g. a card inside a wrapper div) are still found.
    idx = m.index + m[0].length;
  }
  return blocks;
}

/** Find the first top-level `<tagName class="...classToken...">...</tagName>` block, or null. */
export function findFirstByClass(html: string, tagName: string, classToken?: string): string | null {
  return findAllByClass(html, tagName, classToken)[0] ?? null;
}

/** True if any `<tagName>` anywhere in the string has ALL of the given class tokens. */
export function hasElementWithClasses(html: string, tagName: string, classTokens: string[]): boolean {
  const openRe = new RegExp(`<${tagName}\\b[^>]*>`, 'gi');
  let m: RegExpExecArray | null;
  while ((m = openRe.exec(html))) {
    const cls = getAttr(m[0], 'class');
    if (cls) {
      const tokens = cls.split(/\s+/);
      if (classTokens.every((t) => tokens.includes(t))) return true;
    }
  }
  return false;
}

/** Find the first tag anywhere matching a CSS-id-ish `id="prefix..."` (startsWith), e.g. id^=manga-chapters-holder. */
export function findFirstByIdPrefix(html: string, tagName: string, idPrefix: string): string | null {
  const openRe = new RegExp(`<${tagName}\\b[^>]*\\bid\\s*=\\s*["']${idPrefix}[^"']*["'][^>]*>`, 'i');
  const m = openRe.exec(html);
  if (!m) return null;
  const found = extractBlockAt(html, tagName, m.index);
  return found ? found.block : null;
}

/** True if a class token appears anywhere in the given HTML fragment, on any element (a lightweight `:has(.class)` check). */
export function containsClass(html: string, className: string): boolean {
  return new RegExp(`class\\s*=\\s*["'][^"']*\\b${className}\\b[^"']*["']`, 'i').test(html);
}

/** Absolute-URL resolution (handles protocol-relative, root-relative, and relative paths). */
export function absUrl(href: string | null | undefined, baseUrl: string): string {
  if (!href) return '';
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return href;
  }
}

/** Strip a base URL down to a relative path+query, for compact storage. */
export function relUrl(absoluteUrl: string): string {
  try {
    const u = new URL(absoluteUrl);
    return u.pathname + u.search;
  } catch {
    return absoluteUrl;
  }
}

/**
 * Resolve a lazy-loaded image URL from an <img> tag's own opening-tag HTML,
 * checking the common lazy-load attributes before falling back to `src`
 * (mirrors Madara/MangaKatana's own attribute-preference order).
 */
export function imageFromImgTag(openImgTagHtml: string, baseUrl: string): string {
  const dataSrc = getAttr(openImgTagHtml, 'data-src');
  if (dataSrc) return absUrl(dataSrc, baseUrl);
  const dataLazy = getAttr(openImgTagHtml, 'data-lazy-src');
  if (dataLazy) return absUrl(dataLazy, baseUrl);
  const srcset = getAttr(openImgTagHtml, 'srcset');
  if (srcset) {
    // Pick the highest-density/widest candidate; fall back to the first.
    const candidates = srcset
      .split(',')
      .map((c) => c.trim().split(/\s+/))
      .filter((c) => c.length > 0 && c[0]);
    let best: string | null = null;
    let bestScore = -1;
    for (const [url, descriptor] of candidates) {
      const m = /^(\d+(?:\.\d+)?)[wx]$/.exec(descriptor ?? '');
      const score = m ? parseFloat(m[1]) : -1;
      if (score > bestScore) {
        bestScore = score;
        best = url;
      }
    }
    if (best) return absUrl(best, baseUrl);
    if (candidates[0]?.[0]) return absUrl(candidates[0][0], baseUrl);
  }
  return absUrl(getAttr(openImgTagHtml, 'src'), baseUrl);
}
