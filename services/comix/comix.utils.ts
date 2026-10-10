/**
 * comix.utils.ts
 *
 * All Comix parsing lives here, separated from networking (comix.ts) so it
 * can be tested against saved fixtures (see services/comix/fixtures and
 * scripts/test-comix.mjs). The shapes below were verified against live
 * comix.to SSR payloads on 2026-09-06.
 */

import {
  DEFAULT_POSTER_QUALITY,
  HOME_SECTIONS,
  type PosterQuality,
} from "./comix.constants";
import type {
  BrowseMeta,
  ChapterReadMeta,
  ChapterRef,
  ComixContentRating,
  ComixInitialData,
  ComixScanlationGroup,
  ComixStatus,
  ComixTaxonomyItem,
  FeedSection,
  HomeFeed,
  MangaDetails,
  MangaPageData,
  MangaSummary,
} from "./comix.types";

// ---------------------------------------------------------------------------
// initial-data extraction
// ---------------------------------------------------------------------------

/** Extracts and parses the `<script id="initial-data">` JSON blob. */
export function extractInitialData(html: string): ComixInitialData | null {
  const match = html.match(
    /<script[^>]*id="initial-data"[^>]*>([\s\S]*?)<\/script>/i,
  );
  if (!match) return null;
  try {
    return JSON.parse(match[1]) as ComixInitialData;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Decodes one React-Query cache key. Keys look like
 * `["manga","top",{"type":"trending",...}]` ? i.e. a JSON array where the
 * last element may be an options object.
 */
export function decodeQueryKey(rawKey: string): unknown[] | null {
  try {
    const parsed: unknown = JSON.parse(rawKey);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // Not every key is JSON (some are plain strings).
  }
  return null;
}

/** A decoded entry from the `queries` cache map. */
export interface QueryEntry {
  /** Decoded key array, e.g. ["manga","top",{type:"trending"}]. */
  segments: unknown[];
  rawKey: string;
  value: unknown;
}

/** Iterates every cache entry whose key decodes to a JSON array. */
export function listQueryEntries(data: ComixInitialData | null): QueryEntry[] {
  const queries = data?.queries ?? {};
  const entries: QueryEntry[] = [];
  for (const [rawKey, value] of Object.entries(queries)) {
    const segments = decodeQueryKey(rawKey);
    if (!segments) continue;
    entries.push({ segments, rawKey, value });
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Raw manga shape guards and mapping
// ---------------------------------------------------------------------------

interface RawManga {
  id?: unknown;
  hid?: string;
  title?: string;
  altTitles?: unknown;
  url?: string;
  poster?: { small?: string; medium?: string; large?: string };
  type?: string;
  status?: string;
  contentRating?: string;
  year?: number;
  latestChapter?: number;
  hasChapters?: boolean;
  followsTotal?: number;
  ratedScore?: number;
  ratedCount?: number;
  chapterUpdatedAtFormatted?: string;
  createdAtFormatted?: string;
  updatedAtFormatted?: string;
  synopsis?: string;
  originalLanguage?: string;
  firstChapterUrl?: string;
  latestChapterUrl?: string;
  links?: { al?: unknown; mal?: unknown; mu?: unknown; md?: unknown; mb?: unknown };
  genres?: unknown;
  demographics?: unknown;
  formats?: unknown;
  authors?: unknown;
  artists?: unknown;
  publishers?: unknown;
  [key: string]: unknown;
}

export function isRawManga(value: unknown): value is RawManga {
  if (!isRecord(value)) return false;
  return (
    typeof value.hid === "string" &&
    typeof value.title === "string"
  );
}

const STATUS_SET = new Set<ComixStatus>([
  "releasing",
  "finished",
  "on_hiatus",
  "discontinued",
  "not_yet_released",
]);

function asStatus(raw: unknown): ComixStatus {
  const value = typeof raw === "string" ? raw : String(raw ?? "");
  return (STATUS_SET.has(value as ComixStatus) ? value : "unknown") as ComixStatus;
}

const RATING_SET = new Set<ComixContentRating>([
  "safe",
  "suggestive",
  "erotica",
  "pornographic",
]);

function asRating(raw: unknown): ComixContentRating | null {
  return typeof raw === "string" && RATING_SET.has(raw as ComixContentRating)
    ? (raw as ComixContentRating)
    : null;
}

const TYPE_SET = new Set<string>(["manga", "manhwa", "manhua", "other"]);

function firstString(value: unknown): string | null {
  if (typeof value === "string") return value || null;
  return null;
}

function toNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toBoolean(value: unknown): boolean {
  return value === true;
}

/** Maps one raw SSR manga object to the typed summary. */
export function mapMangaSummary(
  manga: RawManga,
  posterQuality: PosterQuality = DEFAULT_POSTER_QUALITY,
): MangaSummary {
  const poster = isRecord(manga.poster) ? manga.poster : undefined;
  const thumb = poster
    ? (firstString(poster[posterQuality]) ??
      firstString(poster.medium) ??
      firstString(poster.large))
    : null;

  const altTitles = Array.isArray(manga.altTitles)
    ? manga.altTitles.filter((v): v is string => typeof v === "string")
    : [];

  return {
    id: toNumber(manga.id) ?? 0,
    hid: manga.hid ?? "",
    title: manga.title ?? "Untitled",
    altTitles,
    url: manga.url ?? "",
    thumbnailUrl: thumb,
    type: TYPE_SET.has(String(manga.type ?? "")) ? (manga.type as MangaSummary["type"]) : null,
    status: asStatus(manga.status),
    contentRating: asRating(manga.contentRating),
    year: toNumber(manga.year),
    latestChapter: toNumber(manga.latestChapter),
    hasChapters: toBoolean(manga.hasChapters),
    followsTotal: toNumber(manga.followsTotal),
    ratedScore: toNumber(manga.ratedScore),
    ratedCount: toNumber(manga.ratedCount),
    updatedLabel: firstString(manga.chapterUpdatedAtFormatted),
    createdLabel: firstString(manga.createdAtFormatted),
  };
}

function mapTaxonomyItems(raw: unknown): ComixTaxonomyItem[] {
  if (!Array.isArray(raw)) return [];
  const out: ComixTaxonomyItem[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const id = toNumber(item.id);
    const title = firstString(item.title) ?? firstString(item.label);
    if (id === null || !title) continue;
    out.push({ id, title, slug: firstString(item.slug) });
  }
  return out;
}

/** Full-detail mapper used on manga title pages (fields verified live). */
export function mapMangaDetails(
  manga: RawManga,
  posterQuality: PosterQuality = DEFAULT_POSTER_QUALITY,
): MangaDetails {
  const summary = mapMangaSummary(manga, posterQuality);
  const links = isRecord(manga.links) ? manga.links : undefined;
  const externalLinks = {
    al: links ? firstString(links.al) : null,
    mal: links ? firstString(links.mal) : null,
    mu: links ? firstString(links.mu) : null,
    md: links ? firstString(links.md) : null,
    mb: links ? firstString(links.mb) : null,
  };
  return {
    ...summary,
    synopsis: firstString(manga.synopsis),
    originalLanguage: firstString(manga.originalLanguage),
    genres: mapTaxonomyItems(manga.genres),
    demographics: mapTaxonomyItems(manga.demographics),
    formats: mapTaxonomyItems(manga.formats),
    authors: mapTaxonomyItems(manga.authors),
    artists: mapTaxonomyItems(manga.artists),
    publishers: mapTaxonomyItems(manga.publishers),
    firstChapterUrl: firstString(manga.firstChapterUrl),
    latestChapterUrl: firstString(manga.latestChapterUrl),
    externalLinks,
  };
}

/** Picks the poster URL out of a raw manga in listing contexts. */
export function posterUrlOf(
  manga: RawManga,
  posterQuality: PosterQuality = DEFAULT_POSTER_QUALITY,
): string | null {
  if (!isRecord(manga.poster)) return null;
  return (
    firstString(manga.poster[posterQuality]) ??
    firstString(manga.poster.medium) ??
    firstString(manga.poster.large) ??
    null
  );
}

// ---------------------------------------------------------------------------
// Homepage feeds
// ---------------------------------------------------------------------------

interface RawListPayload {
  items?: unknown;
  meta?: unknown;
}

/**
 * Parses the homepage SSR and returns the four native feed sections:
 * Trending, Most Followed, Hot Updates and New Titles.
 */
export function parseHomeFeed(html: string): HomeFeed {
  const data = extractInitialData(html);
  const entries = listQueryEntries(data);
  const sections: FeedSection[] = [];

  const pickTop = (apiType: string): MangaSummary[] => {
    for (const entry of entries) {
      if (entry.segments[0] !== "manga" || entry.segments[1] !== "top") continue;
      const options = isRecord(entry.segments[2]) ? entry.segments[2] : {};
      if (options.type !== apiType) continue;
      if (!Array.isArray(entry.value)) continue;
      return entry.value.filter(isRawManga).map((raw) => mapMangaSummary(raw));
    }
    return [];
  };

  const pickList = (wantScope: "hot" | "latest"): { items: MangaSummary[]; meta?: unknown } => {
    for (const entry of entries) {
      if (entry.segments[0] !== "manga" || entry.segments[1] !== "list") continue;
      const params = isRecord(entry.segments[2]) ? entry.segments[2] : {};
      const order = isRecord(params.order) ? params.order : {};
      const isHot = wantScope === "hot" && params.scope === "hot";
      const isLatest =
        wantScope === "latest" &&
        params.scope === undefined &&
        order.created_at === "desc";
      if (!isHot && !isLatest) continue;
      const payload = isRecord(entry.value) ? (entry.value as RawListPayload) : {};
      const items = Array.isArray(payload.items)
        ? payload.items.filter(isRawManga).map((raw) => mapMangaSummary(raw))
        : [];
      return { items, meta: payload.meta };
    }
    return { items: [] };
  };

  for (const section of HOME_SECTIONS) {
    let items: MangaSummary[] = [];
    if (section.kind === "top") {
      items = pickTop(section.apiType);
    } else {
      items = pickList(section.scope as "hot" | "latest").items;
    }
    sections.push({
      id: section.id,
      title: section.title,
      items,
      // SSR ships only the first page of each section; the site fetches
      // the rest through its gated API, so "hasNextPage" is unknowable.
      hasNextPage: false,
    });
  }

  return { sections, fetchedAt: Date.now() };
}

// ---------------------------------------------------------------------------
// Manga title page
// ---------------------------------------------------------------------------

/** Returns the raw detail object for a manga page (hid-based query). */
function findMangaDetailRaw(entries: QueryEntry[]): RawManga | null {
  for (const entry of entries) {
    if (entry.segments[0] !== "manga" || entry.segments[1] !== "detail") continue;
    if (isRawManga(entry.value)) return entry.value;
  }
  return null;
}

/** Parses the manga title page: details + recommended + scanlation groups. */
export function parseMangaPage(html: string): MangaPageData {
  const data = extractInitialData(html);
  const entries = listQueryEntries(data);
  const raw = findMangaDetailRaw(entries);
  if (!raw) {
    throw new Error(
      "Comix: manga detail data is missing from this page. The site markup " +
        "may have changed; check services/comix/fixtures/manga.html.",
    );
  }

  const details = mapMangaDetails(raw);

  const recommended: MangaSummary[] = [];
  const groups: ComixScanlationGroup[] = [];

  for (const entry of entries) {
    if (entry.segments[0] !== "manga") continue;
    if (entry.segments[1] === "recommended" && isRecord(entry.value)) {
      const items = entry.value.items;
      if (Array.isArray(items)) {
        for (const item of items) {
          if (isRawManga(item)) recommended.push(mapMangaSummary(item));
        }
      }
    } else if (entry.segments[1] === "groups" && Array.isArray(entry.value)) {
      for (const item of entry.value) {
        if (!isRecord(item)) continue;
        const id = toNumber(item.id);
        const name = firstString(item.name);
        if (id === null || !name) continue;
        groups.push({ id, name, slug: firstString(item.slug) });
      }
    }
  }

  return { details, recommended, groups };
}

/** Chapter identity parsed from a reader URL. */
export function parseChapterRef(url: string): ChapterRef | null {
  const clean = url.replace(/^\/+/, "");
  const match = clean.match(/(\d+)-chapter-(\d+(?:\.\d+)?)\/*$/);
  if (!match) return null;
  const chapterId = Number(match[1]);
  if (!Number.isFinite(chapterId)) return null;
  return {
    chapterId,
    chapterNumber: Number.isFinite(Number(match[2]))
      ? Number(match[2])
      : null,
    url: "/" + clean,
  };
}

// ---------------------------------------------------------------------------
// Chapter reader page
// ---------------------------------------------------------------------------

/** Reads the \"read\" metadata SSR'd on a chapter reader page. */
export function parseChapterReadMeta(html: string): ChapterReadMeta | null {
  const data = extractInitialData(html);
  const read = data?.read;
  if (!isRecord(read)) return null;
  const mangaId = toNumber(read.mangaId);
  const chapterId = toNumber(read.chapterId);
  if (mangaId === null || chapterId === null) return null;
  return {
    mangaId,
    mangaHid: firstString(read.mangaHid) ?? "",
    chapterId,
    chapterNumber: toNumber(read.chapterNumber),
  };
}

// ---------------------------------------------------------------------------
// Browse page (filter vocabulary only)
// ---------------------------------------------------------------------------

function mapLabelValueOptions(raw: unknown): { value: string; label: string }[] {
  if (!Array.isArray(raw)) return [];
  const out: { value: string; label: string }[] = [];
  for (const item of raw) {
    if (Array.isArray(item) && item.length >= 2) {
      const value = firstString(item[0]);
      const label = firstString(item[1]);
      if (value && label) out.push({ value, label });
    } else if (isRecord(item)) {
      const value = firstString(item.id) ?? firstString(item.value);
      const label = firstString(item.label);
      if (value && label) out.push({ value, label });
    }
  }
  return out;
}

/** Parses the filter vocabulary shipped by /browse before hydration. */
export function parseBrowseMeta(html: string): BrowseMeta {
  const data = extractInitialData(html);
  const list = isRecord(data?.list) ? data.list : {};
  const options = isRecord(list.options) ? list.options : {};
  const params = isRecord(list.params) ? list.params : {};

  return {
    genres: mapTaxonomyItems(options.genres),
    demographics: mapTaxonomyItems(options.demographics),
    formats: mapTaxonomyItems(options.formats),
    statuses: mapLabelValueOptions(options.statuses),
    types: mapLabelValueOptions(options.types),
    years: Array.isArray(options.years)
      ? options.years.filter((v): v is string => typeof v === "string")
      : [],
    sorts: mapLabelValueOptions(options.sorts),
    perPage: toNumber(params.limit) ?? 28,
  };
}

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

/** Joins an origin and a relative path safely. */
export function resolveUrl(baseUrl: string, path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const origin = baseUrl.replace(/\/+$/, "");
  const cleanPath = path.replace(/^\/+/, "");
  return cleanPath ? `${origin}/${cleanPath}` : origin;
}

/** Absolute URL of a manga title page given its relative \"url\". */
export function mangaPageUrl(baseUrl: string, mangaUrl: string): string {
  return resolveUrl(baseUrl, mangaUrl);
}

/** Search URL that the real site hydrates from (keyword only, verified). */
export function searchUrl(baseUrl: string, query: string): string {
  const trimmed = query.trim();
  const params = new URLSearchParams();
  if (trimmed) params.set("keyword", trimmed);
  const qs = params.toString();
  return `${baseUrl}${qs ? `/browse?${qs}` : "/browse"}`;
}

/** The default browse page (site's own full filter UI). */
export function browseUrl(baseUrl: string): string {
  return `${baseUrl}/browse`;
}
