/**
 * philia.ts
 *
 * SDK for Philia Scans (https://philiascans.org).
 *
 * Rewritten against the live JSON API (see philia.types.ts). React Native:
 *
 *   const client = new PhiliaScansClient({ fetchImpl: fetch });
 *   const page1 = await client.getLatestUpdates(1);
 *   const chapters = await client.getChapterList(slug);
 *   const pages = await client.getChapterPages(chapters.items[0].id);
 *
 * Public content (lists, search, details, chapter lists, free chapters) works
 * with a plain fetch. Locked chapters and DRM material need an authenticated
 * fetch (pass `authFetch`); page images may be tile-scrambled - see
 * getPageKeys().
 */

import {
  BASE_URL,
  DEFAULT_HEADERS,
  FetchLike,
  PhiliaChapter,
  PhiliaChapterListResult,
  PhiliaClientOptions,
  PhiliaContentType,
  PhiliaDrmResponse,
  PhiliaListParams,
  PhiliaMangaDetails,
  PhiliaMangaStatus,
  PhiliaMangaSummary,
  PhiliaPage,
  PhiliaPageKeysResponse,
  PhiliaTaxonomyRef,
  PhiliaTokenResponse,
} from "./philia.types";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function bool(v: unknown): boolean {
  return v === true;
}

function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function parseDateMs(v: unknown): number | null {
  const s = str(v);
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.getTime();
}

const STATUS_SET = new Set(["on_going", "completed", "on_hold", "canceled"]);

function asStatus(v: unknown): PhiliaMangaStatus {
  // The API returns upper-case values ("ON_GOING"); the app uses lower-case.
  const s = (str(v) ?? "").toLowerCase();
  return STATUS_SET.has(s) ? (s as PhiliaMangaStatus) : "unknown";
}

const TYPE_SET = new Set(["manga", "manhwa", "manhua", "webtoon", "comic"]);

function asType(v: unknown): PhiliaContentType {
  const s = (str(v) ?? "").toLowerCase();
  return TYPE_SET.has(s) ? (s as PhiliaContentType) : "other";
}

function mapTaxonomy(v: unknown): PhiliaTaxonomyRef[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter(isRecord)
    .map((item) => ({
      id: num(item.id) ?? 0,
      slug: str(item.slug) ?? "",
      name: str(item.name) ?? str(item.title) ?? "",
    }))
    .filter((x) => x.name.length > 0);
}

function mapSummary(raw: unknown): PhiliaMangaSummary | null {
  if (!isRecord(raw)) return null;
  const slug = str(raw.slug) ?? String(raw.id ?? "");
  if (!slug) return null;
  return {
    id: num(raw.id) ?? 0,
    slug,
    title: str(raw.title) ?? "Untitled",
    coverImageUrl: str(raw.coverImageUrl),
    status: asStatus(raw.status),
    type: asType(raw.type),
    ratingAvg: num(raw.ratingAvg),
    ratingCount: num(raw.ratingCount),
    viewsWeek: num(raw.viewsWeek),
    viewsTotal: num(raw.viewsTotal),
    chapterCount: num(raw.chapterCount),
    latestChapterAt: parseDateMs(raw.latestChapterAt),
    genres: mapTaxonomy(raw.genres),
  };
}

function mapDetails(raw: unknown): PhiliaMangaDetails {
  const base = mapSummary(raw);
  const rec = isRecord(raw) ? raw : {};
  return {
    ...(base ?? {
      id: 0,
      slug: "",
      title: "Untitled",
      coverImageUrl: null,
      status: "unknown" as PhiliaMangaStatus,
      type: "other" as PhiliaContentType,
      ratingAvg: null,
      ratingCount: null,
      viewsWeek: null,
      viewsTotal: null,
      chapterCount: null,
      latestChapterAt: null,
      genres: [],
    }),
    synopsis: str(rec.synopsis),
    alternativeTitles: strArr(rec.alternativeTitles),
    year: num(rec.year),
    contentRating: str(rec.contentRating),
    authors: mapTaxonomy(rec.authors),
    artists: mapTaxonomy(rec.artists),
    tags: mapTaxonomy(rec.tags),
  };
}

function mapChapter(raw: unknown): PhiliaChapter | null {
  if (!isRecord(raw)) return null;
  const id = num(raw.id);
  if (id == null) return null;
  return {
    id,
    number: num(raw.number) ?? 0,
    title: str(raw.title),
    slug: str(raw.slug),
    language: str(raw.lang),
    publishedAt: parseDateMs(raw.publishedAt),
    coinPrice: num(raw.coinPrice),
    purchased: bool(raw.purchased),
    isEarlyAccess: bool(raw.isEarlyAccess),
    pageCount: isRecord(raw._count) ? num(raw._count.pages) : null,
    readerToken: str(raw.readerToken),
  };
}

function mapPage(raw: unknown, index: number): PhiliaPage | null {
  if (!isRecord(raw)) return null;
  const url = str(raw.url);
  if (!url) return null;
  return {
    index,
    url,
    mime: str(raw.mime),
    width: num(raw.width),
    height: num(raw.height),
    blurDataUrl: str(raw.blurDataUrl),
  };
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export class PhiliaScansClient {
  private readonly base: string;
  private readonly api: string;
  private readonly headers: Record<string, string>;
  private readonly fetchImpl: FetchLike;
  private readonly authFetch: FetchLike | null;

  constructor(options: PhiliaClientOptions = {}) {
    this.base = options.baseUrl ?? BASE_URL;
    this.api = this.base.replace(/\/+$/, "") + "/api";
    this.headers = { ...DEFAULT_HEADERS, ...options.headers };
    this.fetchImpl =
      options.fetchImpl ?? (globalThis.fetch as unknown as FetchLike);
    this.authFetch = options.authFetch ?? null;
    if (!this.fetchImpl) {
      throw new Error(
        "No fetch implementation. Pass one via new PhiliaScansClient({ fetchImpl }).",
      );
    }
  }

  private async requestJson<T>(
    path: string,
    init: { method?: string; auth?: boolean; body?: unknown } = {},
  ): Promise<T> {
    const fetcher = init.auth && this.authFetch ? this.authFetch : this.fetchImpl;
    const url = path.startsWith("http") ? path : `${this.api}${path}`;
    const headers: Record<string, string> = {
      ...this.headers,
      ...(init.body != null ? { "Content-Type": "application/json" } : {}),
    };

    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await fetcher(url, {
        method: init.method ?? "GET",
        headers,
        ...(init.body != null ? { body: JSON.stringify(init.body) } : {}),
      });

      if (res.status === 429) {
        if (attempt < 2) {
          await sleep(1500 * (attempt + 1));
          continue;
        }
        throw new Error("Philia Scans: rate limited. Try again shortly.");
      }

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        if (body.includes("Log in via WebView")) {
          throw new Error("Philia Scans: session expired. Re-authenticate.");
        }
        throw new Error(`Philia Scans HTTP ${res.status}: ${url}`);
      }

      const text = await res.text();
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new Error(`Philia Scans: invalid JSON from ${url}`);
      }
    }
    throw new Error("Philia Scans: max retries exceeded.");
  }

  /** GET /api/manga with the full filter/search vocabulary. */
  async searchManga(params: PhiliaListParams = {}): Promise<{
    items: PhiliaMangaSummary[];
    total: number;
    page: number;
    perPage: number;
    totalPages: number;
  }> {
    const p = new URLSearchParams();
    p.set("page", String(params.page ?? 1));
    p.set("perPage", String(params.perPage ?? 24));
    if (params.orderby) p.set("orderby", params.orderby);
    if (params.q && params.q.trim()) p.set("q", params.q.trim());
    if (params.types?.length) params.types.forEach((t) => p.append("types", t));
    if (params.statuses?.length)
      params.statuses.forEach((s) => p.append("statuses", s));
    if (params.genres?.length)
      params.genres.forEach((g) => p.append("genres", g));

    const raw = await this.requestJson<Record<string, unknown>>(
      `/manga?${p.toString()}`,
    );
    const items = Array.isArray(raw.items)
      ? raw.items.map(mapSummary).filter((x): x is PhiliaMangaSummary => x !== null)
      : [];
    return {
      items,
      total: num(raw.total) ?? items.length,
      page: num(raw.page) ?? (params.page ?? 1),
      perPage: num(raw.perPage) ?? (params.perPage ?? 24),
      totalPages: num(raw.totalPages) ?? 1,
    };
  }

  /** Trending list (orderby=trending). */
  getPopularManga(page = 1) {
    return this.searchManga({ page, orderby: "trending" });
  }

  /** Newest releases (orderby=recently_updated). */
  getLatestUpdates(page = 1) {
    return this.searchManga({ page, orderby: "recently_updated" });
  }

  /** GET /api/manga/{slug}. */
  async getMangaDetails(slugOrUrl: string): Promise<PhiliaMangaDetails> {
    const slug = extractSlug(slugOrUrl);
    const raw = await this.requestJson<unknown>(`/manga/${encodeURIComponent(slug)}`);
    return mapDetails(raw);
  }

  /** GET /api/manga/{slug}/chapters (no query params; newest first). */
  async getChapterList(slugOrUrl: string): Promise<PhiliaChapterListResult> {
    const slug = extractSlug(slugOrUrl);
    const raw = await this.requestJson<Record<string, unknown>>(
      `/manga/${encodeURIComponent(slug)}/chapters`,
    );
    const items = Array.isArray(raw.items)
      ? raw.items.map(mapChapter).filter((x): x is PhiliaChapter => x !== null)
      : [];
    return {
      items: dedupeChapters(items),
      total: num(raw.total) ?? items.length,
      volumes: Array.isArray(raw.volumes) ? raw.volumes : [],
    };
  }

  /**
   * POST /api/chapters/{id}/refresh-pages
   * Returns fresh signed media URLs for the chapter's pages.
   */
  async getChapterPages(chapterId: number | string): Promise<PhiliaPage[]> {
    const id = parseChapterId(chapterId);
    if (id == null) throw new Error(`Philia Scans: bad chapter id: ${chapterId}`);
    const raw = await this.requestJson<Record<string, unknown>>(
      `/chapters/${id}/refresh-pages`,
      { method: "POST", auth: true },
    );
    const pages = Array.isArray(raw.pages) ? raw.pages : [];
    return pages
      .map((page, i) => mapPage(page, i))
      .filter((x): x is PhiliaPage => x !== null)
      .map((page) => ({ ...page, url: this.absoluteMediaUrl(page.url) }));
  }

  /** GET /api/chapters/{id}/page-keys - chapter key + scramble metadata. */
  async getPageKeys(chapterId: number | string): Promise<PhiliaPageKeysResponse> {
    const id = parseChapterId(chapterId);
    if (id == null) throw new Error(`Philia Scans: bad chapter id: ${chapterId}`);
    const raw = await this.requestJson<Record<string, unknown>>(
      `/chapters/${id}/page-keys`,
      { auth: true },
    );
    const key = str(raw.chapterKeyB64);
    if (!key) throw new Error(`Philia Scans: missing chapterKeyB64 for ${id}`);
    return {
      chapterKeyB64: key,
      scrambled: bool(raw.scrambled),
      gridSize: num(raw.gridSize) ?? 0,
      sessionDefault: bool(raw.sessionDefault),
    };
  }

  /** POST /api/reader/access-token (works anonymously on free content). */
  async getReaderAccessToken(): Promise<PhiliaTokenResponse> {
    const raw = await this.requestJson<Record<string, unknown>>(
      "/reader/access-token",
      { method: "POST", auth: true },
    );
    const token = str(raw.token);
    if (!token) throw new Error("Philia Scans: reader access token missing.");
    return { token, expiresAt: num(raw.expiresAt) };
  }

  /** GET /api/chapters/{id}/get-drm?session= - DRM key material. */
  async getDrmSession(
    chapterId: number | string,
    sessionId: string,
  ): Promise<PhiliaDrmResponse> {
    const id = parseChapterId(chapterId);
    if (id == null) throw new Error(`Philia Scans: bad chapter id: ${chapterId}`);
    const raw = await this.requestJson<Record<string, unknown>>(
      `/chapters/${id}/get-drm?session=${encodeURIComponent(sessionId)}`,
      { auth: true },
    );
    const payloadA = str(raw.payloadA);
    if (!payloadA) throw new Error("Philia Scans: incomplete DRM response.");
    return {
      payloadA,
      payloadB: str(raw.payloadB) ?? "",
      gridSize: num(raw.gridSize),
      sessionId: str(raw.sessionId),
    };
  }

  /** Makes a relative media path absolute (page URLs are `/api/media/...`). */
  absoluteMediaUrl(url: string): string {
    if (/^https?:\/\//i.test(url)) return url;
    if (url.startsWith("/")) return this.base + url;
    return `${this.base}/${url}`;
  }

  /** Absolute manga page URL. */
  mangaUrl(slug: string): string {
    return `${this.base}/manga/${slug}`;
  }

  /** Absolute chapter reader URL. */
  chapterUrl(chapterId: number): string {
    return `${this.base}/series/${chapterId}`;
  }

  /** Highest-id entry per chapter number, newest first. */
  static dedupeChapters(chapters: PhiliaChapter[]): PhiliaChapter[] {
    return dedupeChapters(chapters);
  }

  /** Display title, e.g. "Chapter 42 - Title". */
  static chapterTitle(ch: PhiliaChapter): string {
    return chapterTitle(ch);
  }
}

/** Keeps the highest-id upload per chapter number, sorted newest first. */
export function dedupeChapters(chapters: PhiliaChapter[]): PhiliaChapter[] {
  const byNumber = new Map<number, PhiliaChapter>();
  for (const ch of chapters) {
    const existing = byNumber.get(ch.number);
    if (!existing || ch.id > existing.id) byNumber.set(ch.number, ch);
  }
  return Array.from(byNumber.values()).sort((a, b) => b.number - a.number);
}

/** Display title for a chapter row. */
export function chapterTitle(ch: PhiliaChapter): string {
  const base = ch.title?.trim()
    ? `Chapter ${ch.number} - ${ch.title.trim()}`
    : `Chapter ${ch.number}`;
  return ch.coinPrice && ch.coinPrice > 0 ? `🔒 ${base}` : base;
}

/** Strips a full URL down to its slug. */
export function extractSlug(input: string): string {
  const trimmed = input.replace(/^\/+/, "").replace(/\/+$/, "");
  const match = trimmed.match(/^(?:manga\/)?([^/?#]+)/);
  return match ? decodeURIComponent(match[1]) : trimmed;
}

/** Parses a numeric chapter id from a `/series/{id}` URL or bare id. */
export function parseChapterId(input: string | number): number | null {
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  const m = input.match(/(\d+)/);
  if (!m) return null;
  const id = Number(m[1]);
  return Number.isFinite(id) ? id : null;
}

export default PhiliaScansClient;