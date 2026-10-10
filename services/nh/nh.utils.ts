/**
 * nh.utils.ts
 * ---------------------------------------------------------------------------
 * Pure helpers for the nhentai v2 API: URL building, raw -> domain mapping,
 * retry/throttle and error normalization. Everything here is side-effect free
 * so it stays unit-testable on Hermes. No HTML parsing lives here anymore -
 * v2 answers JSON for every endpoint the SDK uses.
 * ---------------------------------------------------------------------------
 */

import {
    NH_DEFAULTS,
    NH_ERROR,
    NH_IMAGE_HOSTS,
    NH_NET,
    NH_PATHS,
    NH_TAG_TYPES,
    NH_THUMB_HOSTS,
    type NhErrorCode,
    type NhTagType,
} from './nh.constants';
import type {
    NhGallery,
    NhGalleryPreview,
    NhImage,
    NhSearchQuery,
    NhTag,
    RawGallery,
    RawListGallery,
    RawTag,
} from './nh.types';

/* --------------------------------- errors --------------------------------- */

/** Every rejection from the SDK is an `NhError`, so UI can switch on `.code`. */
export class NhError extends Error {
  readonly code: NhErrorCode;
  readonly status: number | undefined;
  readonly url: string | undefined;

  constructor(code: NhErrorCode, message: string, status?: number, url?: string) {
    super(message);
    this.name = 'NhError';
    this.code = code;
    this.status = status;
    this.url = url;
  }

  /** True when retrying later could plausibly work. */
  get isRetryable(): boolean {
    return (
      this.code === NH_ERROR.NETWORK ||
      this.code === NH_ERROR.TIMEOUT ||
      this.code === NH_ERROR.RATE_LIMITED ||
      (this.status !== undefined && this.status >= 500)
    );
  }
}

/** Human-readable message for an error thrown by the NH SDK - safe to show
 *  directly in the UI (used by the list and detail screens). */
export function toFriendlyMessage(err: unknown): string {
  if (err instanceof NhError) {
    switch (err.code) {
      case NH_ERROR.TIMEOUT:
        return 'Request timed out. Check your connection and retry.';
      case NH_ERROR.NETWORK:
        return 'Network error. Check your connection and retry.';
      case NH_ERROR.RATE_LIMITED:
        return 'Rate limited by the server (about 20 requests/minute anonymously). Wait a moment and retry.';
      case NH_ERROR.NOT_FOUND:
        return 'Gallery not found. It may have been removed.';
      case NH_ERROR.BLOCKED_CONTENT:
        return 'This gallery is filtered by your content settings.';
      default:
        return err.message || 'Something went wrong.';
    }
  }
  return err instanceof Error ? err.message : 'Something went wrong.';
}

/* -------------------------------- basics ---------------------------------- */

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Title-cases a tag name for display: "big breasts" -> "Big Breasts". */
export function toLabel(name: string): string {
  return name.replace(/(^|[\s\-/])([a-z])/g, (_m, p, c: string) => p + c.toUpperCase());
}

/** Lowercases and slugifies a tag name: "Big Breasts" -> "big-breasts". */
export function slugify(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Extracts the numeric code from anything a user might paste:
 *  "177013", "https://nhentai.net/g/177013/", "#177013". */
export function parseGalleryCode(input: string): string | null {
  const trimmed = String(input).trim();
  const fromUrl = trimmed.match(/\/g\/(\d+)/);
  if (fromUrl?.[1]) return fromUrl[1];
  const bare = trimmed.match(/(\d{2,7})/);
  return bare?.[1] ?? null;
}

/** Retries `fn` with exponential backoff, but only for retryable failures. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  retries: number = NH_DEFAULTS.retries,
  baseDelay: number = NH_DEFAULTS.retryBaseDelayMs,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const retryable = err instanceof NhError ? err.isRetryable : true;
      if (!retryable || attempt === retries) break;
      await sleep(baseDelay * Math.pow(2, attempt) + Math.random() * 200);
    }
  }
  throw lastError;
}

/** Serializes calls and enforces a minimum gap between them (rate-limit aware). */
export function createThrottle(minGapMs: number = NH_DEFAULTS.minRequestGapMs) {
  let chain: Promise<unknown> = Promise.resolve();
  let last = 0;
  return function throttle<T>(fn: () => Promise<T>): Promise<T> {
    const run = chain.then(async () => {
      const wait = minGapMs - (Date.now() - last);
      if (wait > 0) await sleep(wait);
      try {
        return await fn();
      } finally {
        last = Date.now();
      }
    });
    chain = run.catch(() => undefined);
    return run as Promise<T>;
  };
}

/** `fetch` with an AbortController timeout, normalized into `NhError`. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = NH_DEFAULTS.timeoutMs,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    const aborted = (err as Error)?.name === 'AbortError';
    throw new NhError(
      aborted ? NH_ERROR.TIMEOUT : NH_ERROR.NETWORK,
      aborted ? `Request timed out after ${timeoutMs}ms` : `Network request failed: ${String(err)}`,
      undefined,
      url,
    );
  } finally {
    clearTimeout(timer);
  }
}

/* ----------------------------- URL building ------------------------------- */

/** Deterministically spreads load across a CDN pool (same trick as the site). */
function pickHost(hosts: readonly string[], mediaId: string): string {
  const n = parseInt(mediaId, 10) || 0;
  return hosts[n % hosts.length] ?? hosts[0]!;
}

/** Turns a v2 relative path (e.g. "galleries/2198265/1.jpg") into an absolute
 *  CDN URL. `kind` picks the image (i*) vs thumbnail (t*) host pool. */
export function toCdnUrl(path: string, kind: 'image' | 'thumb', mediaId: string): string {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  const hosts = kind === 'image' ? NH_IMAGE_HOSTS : NH_THUMB_HOSTS;
  return `${pickHost(hosts, mediaId)}/${path.replace(/^\/+/, '')}`;
}

/** Canonical shareable web URL for a code. */
export function buildWebUrl(id: string | number, host = NH_NET): string {
  return `${host}${NH_PATHS.gallery(id)}`;
}

/**
 * Turns a structured `NhSearchQuery` into the site's single `query` string.
 * e.g. { includeTags:['ahegao'], excludeTags:['yaoi'], languages:['english'] }
 *      -> `tag:"ahegao" -tag:"yaoi" language:"english"`
 */
export function buildSearchQuery(q: NhSearchQuery): string {
  const parts: string[] = [];
  if (q.query?.trim()) parts.push(q.query.trim());
  q.includeTags?.forEach((t) => parts.push(`tag:"${t}"`));
  q.excludeTags?.forEach((t) => parts.push(`-tag:"${t}"`));
  q.includeArtists?.forEach((t) => parts.push(`artist:"${t}"`));
  q.excludeArtists?.forEach((t) => parts.push(`-artist:"${t}"`));
  q.includeGroups?.forEach((t) => parts.push(`group:"${t}"`));
  q.excludeGroups?.forEach((t) => parts.push(`-group:"${t}"`));
  q.includeParodies?.forEach((t) => parts.push(`parody:"${t}"`));
  q.excludeParodies?.forEach((t) => parts.push(`-parody:"${t}"`));
  q.includeCharacters?.forEach((t) => parts.push(`character:"${t}"`));
  q.excludeCharacters?.forEach((t) => parts.push(`-character:"${t}"`));
  q.includeCategories?.forEach((t) => parts.push(`category:"${t}"`));
  q.excludeCategories?.forEach((t) => parts.push(`-category:"${t}"`));
  q.languages?.forEach((l) => parts.push(`language:"${l}"`));
  if (typeof q.minPages === 'number') parts.push(`pages:>=${q.minPages}`);
  if (typeof q.maxPages === 'number') parts.push(`pages:<=${q.maxPages}`);
  return parts.join(' ').trim();
}

/** Appends a query object to a path, skipping empty values. */
export function withQuery(path: string, params: Record<string, string | number | undefined>): string {
  const pairs = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return pairs.length ? `${path}?${pairs.join('&')}` : path;
}

/* ------------------------------- mapping ---------------------------------- */

function normalizeTagType(raw: string): NhTagType {
  const t = raw.toLowerCase() as NhTagType;
  return (NH_TAG_TYPES as readonly string[]).includes(t) ? t : 'tag';
}

export function mapTag(raw: RawTag): NhTag {
  return {
    id: raw.id,
    type: normalizeTagType(raw.type),
    name: raw.name.toLowerCase(),
    label: toLabel(raw.name),
    url: raw.url || '',
    ...(raw.slug ? { slug: raw.slug } : {}),
    count: raw.count ?? 0,
  };
}

/** True when the detail payload is a full gallery (not a lean list item). */
function asDetail(raw: RawGallery | RawListGallery): RawGallery | null {
  return Array.isArray((raw as RawGallery).tags) ? (raw as RawGallery) : null;
}

function pickTitle(raw: RawGallery | RawListGallery, detail: RawGallery | null): string {
  if (detail) {
    const t = detail.title;
    return t?.pretty || t?.english || t?.japanese || `#${raw.id}`;
  }
  const item = raw as RawListGallery;
  return item.english_title || item.japanese_title || `#${raw.id}`;
}

/** v2 JSON gallery/list item -> list-friendly preview (no page array built). */
export function mapPreview(raw: RawGallery | RawListGallery, host = NH_NET): NhGalleryPreview {
  const detail = asDetail(raw);
  const mediaId = String(raw.media_id);
  const tags = detail ? (detail.tags ?? []).map(mapTag) : [];
  const thumbPath = detail ? detail.thumbnail?.path : (raw as RawListGallery).thumbnail;
  const coverPath = detail ? detail.cover?.path : thumbPath;
  const title = pickTitle(raw, detail);

  return {
    id: String(raw.id),
    mediaId,
    title,
    ...(detail?.title?.japanese ? { titleJapanese: detail.title.japanese } : {}),
    ...(detail?.title?.pretty ? { titlePretty: detail.title.pretty } : {}),
    coverUrl: toCdnUrl(coverPath || thumbPath || '', 'thumb', mediaId),
    thumbUrl: toCdnUrl(thumbPath || coverPath || '', 'thumb', mediaId),
    pageCount: raw.num_pages ?? 0,
    favorites: raw.num_favorites ?? 0,
    uploadedAt: detail?.upload_date ? detail.upload_date * 1000 : 0,
    languages: tags.filter((t) => t.type === 'language').map((t) => t.name),
    tags,
    webUrl: buildWebUrl(raw.id, host),
  };
}

/** v2 full gallery JSON -> full detail with every page URL resolved. */
export function mapGallery(raw: RawGallery, host = NH_NET): NhGallery {
  const preview = mapPreview(raw, host);
  const mediaId = preview.mediaId;
  const pages: NhImage[] = (raw.pages ?? []).map((p) => ({
    page: p.number,
    url: toCdnUrl(p.path, 'image', mediaId),
    thumbUrl: toCdnUrl(p.thumbnail, 'thumb', mediaId),
    width: p.width,
    height: p.height,
    aspectRatio: p.height ? p.width / p.height : 0.7,
  }));
  const of = (type: NhTagType) => preview.tags.filter((t) => t.type === type);
  return {
    ...preview,
    pages,
    artists: of('artist'),
    groups: of('group'),
    parodies: of('parody'),
    characters: of('character'),
    categories: of('category'),
    contentTags: of('tag'),
    ...(raw.scanlator ? { scanlator: raw.scanlator } : {}),
  };
}

/** Merges static seed tags with freshly fetched ones, dynamic wins on clash. */
export function mergeTags(staticTags: NhTag[], dynamicTags: NhTag[]): NhTag[] {
  const map = new Map<string, NhTag>();
  for (const t of staticTags) map.set(`${t.type}:${t.name}`, t);
  for (const t of dynamicTags) map.set(`${t.type}:${t.name}`, t);
  return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
