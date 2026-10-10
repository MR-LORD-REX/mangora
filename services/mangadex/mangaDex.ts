import {
    API_BASE,
    CONTENT_RATINGS,
    COVER_SIZES,
    DEFAULT_CONTENT_RATINGS,
    LIMITS,
    LINK_TEMPLATES,
    MANGADEX_STAFF_USER,
    RATE_LIMITS,
    SITE_BASE,
    TAG_IDS,
    UPLOADS_BASE,
    languageName,
    resolveLanguage,
    type LanguageInfo,
} from "./mangadex.constants";
import type {
    AggregateChapter,
    ApiDate,
    ApiErrorDetail,
    Chapter,
    ChapterPages,
    Collection,
    ContentRating,
    CoverImage,
    CoverParams,
    CoverSize,
    EntityResponse,
    ErrorResponse,
    GetChaptersOptions,
    Includes,
    ListChaptersParams,
    LocalizedString,
    Manga,
    MangaLink,
    MangaList,
    MangadexOptions,
    Page,
    Person,
    PrefetchOptions,
    PrefetchResult,
    RawAggregate,
    RawAtHome,
    RawAuthor,
    RawChapter,
    RawCover,
    RawCoverAttributes,
    RawGroup,
    RawList,
    RawManga,
    RawTag,
    Relationship,
    RelationshipAttributeMap,
    SearchParams,
    SortDirection,
    Tag,
    Volume,
} from "./mangadex.types";

export type MangaDexErrorCode =
  | "http_error"
  | "network_error"
  | "timeout"
  | "aborted"
  | "bad_response"
  | "no_pages"
  | "unknown_tag"
  | "invalid_request";

export class MangaDexError extends Error {
  readonly code: MangaDexErrorCode;
  readonly status: number;
  readonly errors: ApiErrorDetail[];
  readonly url: string;
  /** Milliseconds to wait before retrying, when the response said so. */
  readonly retryAfter: number | null;

  constructor(
    message: string,
    opts: {
      code: MangaDexErrorCode;
      status: number;
      url?: string;
      errors?: ApiErrorDetail[];
      retryAfter?: number | null;
    }
  ) {
    super(message);
    this.name = "MangaDexError";
    this.code = opts.code;
    this.status = opts.status;
    this.url = opts.url ?? "";
    this.errors = opts.errors ?? [];
    this.retryAfter = opts.retryAfter ?? null;
    Object.setPrototypeOf(this, MangaDexError.prototype);
  }

  /** The API's own explanation, when it gave one. */
  get detail(): string {
    return this.errors[0]?.detail ?? this.errors[0]?.title ?? this.message;
  }
  get isNotFound(): boolean {
    return this.status === 404;
  }
  get isRateLimited(): boolean {
    return this.status === 429;
  }
  get isValidation(): boolean {
    return this.status === 400;
  }
  get isServerError(): boolean {
    return this.status >= 500;
  }
  get isOffline(): boolean {
    return this.code === "network_error" || this.code === "timeout";
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Token bucket + concurrency gate. MangaDex allows ~5 requests/second globally
 * and advertises tighter per-endpoint buckets (40/min on /at-home).
 */
class RateLimiter {
  private readonly history: number[] = [];
  private readonly queue: Array<() => void> = [];
  private active = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly maxConcurrent: number
  ) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await new Promise<void>((resolve) => {
      this.queue.push(resolve);
      this.pump();
    });
    try {
      return await fn();
    } finally {
      this.active--;
      this.pump();
    }
  }

  private pump(): void {
    if (this.timer) return;
    while (this.queue.length) {
      const now = Date.now();
      while (this.history.length && now - this.history[0] >= this.windowMs) this.history.shift();
      if (this.active >= this.maxConcurrent || this.history.length >= this.max) {
        const wait =
          this.history.length >= this.max ? this.windowMs - (now - this.history[0]) + 5 : 20;
        this.timer = setTimeout(() => {
          this.timer = null;
          this.pump();
        }, Math.max(5, wait));
        return;
      }
      this.history.push(now);
      this.active++;
      (this.queue.shift() as () => void)();
    }
  }
}

class TtlCache {
  private readonly map = new Map<string, { value: unknown; expires: number }>();
  constructor(private readonly maxEntries: number) {}

  get<T>(key: string): T | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.expires < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    this.map.delete(key);
    this.map.set(key, hit);
    return hit.value as T;
  }

  set(key: string, value: unknown, ttlMs: number): void {
    if (this.map.size >= this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, { value, expires: Date.now() + ttlMs });
  }

  clear(): void {
    this.map.clear();
  }
}

const TTL = {
  tags: 24 * 60 * 60 * 1000,
  manga: 10 * 60 * 1000,
  chapter: 10 * 60 * 1000,
  feed: 5 * 60 * 1000,
  cover: 60 * 60 * 1000,
  list: 10 * 60 * 1000,
  /** At-home URLs are handed out with roughly a 15 minute lifetime. */
  atHome: 14 * 60 * 1000,
} as const;

type QueryPrimitive = string | number | boolean;
type QueryValue =
  | QueryPrimitive
  | QueryPrimitive[]
  | Record<string, QueryPrimitive>
  | undefined
  | null;
export type QueryParams = Record<string, QueryValue>;

/**
 * Serializes a query object into MangaDex's expected URL parameter format,
 * including array and nested object values used across the API.
 */
export function buildQuery(params: QueryParams): string {
  const parts: string[] = [];
  const push = (key: string, value: QueryPrimitive) =>
    parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) if (item !== undefined && item !== null) push(`${key}[]`, item);
    } else if (typeof value === "object") {
      for (const [sub, subValue] of Object.entries(value)) {
        if (subValue === undefined || subValue === null) continue;
        push(`${key}[${sub}]`, subValue);
      }
    } else if (typeof value === "boolean") {
      push(key, value ? "1" : "0");
    } else {
      push(key, value);
    }
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

/**
 * Converts a JS Date or ISO-like value into the YYYY-MM-DDTHH:mm:ss format
 * MangaDex accepts for date range filters.
 */
export function toApiDate(value: ApiDate): string {
  const raw = value instanceof Date ? value.toISOString() : String(value);
  const trimmed = raw.replace(/\.\d+/, "").replace(/Z$/i, "");
  return trimmed.includes("T") ? trimmed.slice(0, 19) : `${trimmed}T00:00:00`;
}

function parseRetryAfter(res: Response): number | null {
  const advertised = res.headers.get("x-ratelimit-retry-after");
  if (advertised) {
    const n = Number(advertised);
    if (Number.isFinite(n)) {
      // MangaDex sends an absolute unix timestamp here, not a delta.
      const ms = n > 1e9 ? n * 1000 - Date.now() : n * 1000;
      if (ms > 0) return Math.min(ms, 60_000);
    }
  }
  const standard = res.headers.get("retry-after");
  if (standard) {
    const n = Number(standard);
    if (Number.isFinite(n)) return Math.min(n * 1000, 60_000);
  }
  return null;
}

function attachRaw<T extends object, R>(obj: T, raw: R): T {
  Object.defineProperty(obj, "raw", {
    value: raw,
    enumerable: false,
    writable: false,
    configurable: true,
  });
  return obj;
}

/**
 * Returns the best available localized string from a MangaDex i18n map by
 * preferring the caller's language and common romanized fallbacks.
 */
export function resolveLocalized(
  map: LocalizedString | null | undefined,
  prefer: Array<string | null | undefined> = []
): string {
  if (!map) return "";
  for (const key of prefer) if (key && map[key]) return map[key];
  const first = Object.keys(map)[0];
  return first ? map[first] : "";
}

function relsOfType<K extends keyof RelationshipAttributeMap>(
  rels: Relationship[] | undefined,
  type: K
): Array<{ id: string; attributes?: RelationshipAttributeMap[K]; related?: string }> {
  return (rels ?? []).filter((r) => r.type === type) as Array<{
    id: string;
    attributes?: RelationshipAttributeMap[K];
    related?: string;
  }>;
}

/**
 * Builds a cover image URL for a manga using the requested size and host.
 */
export function buildCoverUrl(
  mangaId: string,
  fileName: string,
  size: CoverSize = "original",
  host: "uploads" | "site" = "uploads"
): string {
  const base = host === "site" ? SITE_BASE : UPLOADS_BASE;
  return `${base}/covers/${mangaId}/${fileName}${COVER_SIZES[size]}`;
}

function normalizeCover(
  mangaId: string,
  id: string,
  attrs: RawCoverAttributes,
  host: "uploads" | "site"
): CoverImage {
  return {
    id,
    fileName: attrs.fileName,
    volume: attrs.volume ?? null,
    locale: attrs.locale ? resolveLanguage(attrs.locale) : null,
    description: attrs.description ?? "",
    url: buildCoverUrl(mangaId, attrs.fileName, "original", host),
    thumb512: buildCoverUrl(mangaId, attrs.fileName, "medium", host),
    thumb256: buildCoverUrl(mangaId, attrs.fileName, "small", host),
  };
}

function normalizeLinks(links: Record<string, string> | null | undefined): MangaLink[] {
  if (!links) return [];
  return Object.entries(links).map(([key, value]) => {
    const template = LINK_TEMPLATES[key];
    let url: string | null = null;
    if (template?.url) {
      try {
        url = template.url(value);
      } catch {
        url = null;
      }
    } else if (/^https?:\/\//i.test(value)) {
      url = value;
    }
    return { key, name: template?.name ?? key, value, url };
  });
}

interface NormalizeContext {
  language: string;
  coverHost: "uploads" | "site";
}

function personList(
  rels: Relationship[] | undefined,
  type: "author" | "artist"
): Person[] {
  const seen = new Set<string>();
  const out: Person[] = [];
  for (const r of relsOfType(rels, type)) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push({ id: r.id, name: r.attributes?.name ?? "" });
  }
  return out;
}

/**
 * Normalizes a raw MangaDex manga payload into the app's domain model.
 */
export function normalizeManga(raw: RawManga, ctx: NormalizeContext): Manga {
  const a = raw.attributes;
  const prefer = [ctx.language, "en", "ja-ro", "ko-ro", "zh-ro", a.originalLanguage];

  const altTitles: string[] = [];
  for (const entry of a.altTitles ?? []) {
    for (const value of Object.values(entry)) {
      if (value && !altTitles.includes(value)) altTitles.push(value);
    }
  }

  const englishFromAlt = (a.altTitles ?? []).find((t) => t.en)?.en ?? null;
  const nativeFromAlt = (a.altTitles ?? []).find((t) => t[a.originalLanguage])?.[
    a.originalLanguage
  ] ?? null;

  const coverRel = relsOfType(raw.relationships, "cover_art").find((r) => r.attributes?.fileName);

  const manga: Manga = {
    id: raw.id,
    title: resolveLocalized(a.title, prefer),
    englishTitle: a.title?.en ?? englishFromAlt,
    nativeTitle: a.title?.[a.originalLanguage] ?? nativeFromAlt,
    altTitles,
    description: resolveLocalized(a.description, prefer),
    authors: personList(raw.relationships, "author"),
    artists: personList(raw.relationships, "artist"),
    tags: (a.tags ?? []).map((t) => ({
      id: t.id,
      name: resolveLocalized(t.attributes.name, [ctx.language, "en"]),
      group: t.attributes.group,
    })),
    status: a.status,
    demographic: a.publicationDemographic ?? null,
    contentRating: a.contentRating,
    state: a.state,
    year: a.year ?? null,
    isLocked: a.isLocked,
    chapterNumbersResetOnNewVolume: a.chapterNumbersResetOnNewVolume,
    lastVolume: a.lastVolume || null,
    lastChapter: a.lastChapter || null,
    latestUploadedChapterId: a.latestUploadedChapter ?? null,
    originalLanguage: resolveLanguage(a.originalLanguage),
    availableLanguages: (a.availableTranslatedLanguages ?? [])
      .filter(Boolean)
      .map((code) => resolveLanguage(code)),
    links: normalizeLinks(a.links),
    cover: coverRel
      ? normalizeCover(raw.id, coverRel.id, coverRel.attributes as RawCoverAttributes, ctx.coverHost)
      : null,
    related: relsOfType(raw.relationships, "manga")
      .filter((r) => r.related)
      .map((r) => ({ id: r.id, relation: r.related as Manga["related"][number]["relation"] })),
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    raw,
  };
  return attachRaw(manga, raw);
}

/**
 * Normalizes a raw MangaDex chapter payload into the app's chapter model.
 */
export function normalizeChapter(raw: RawChapter): Chapter {
  const a = raw.attributes;
  const groups = relsOfType(raw.relationships, "scanlation_group").map((r) => ({
    id: r.id,
    name: r.attributes?.name ?? "",
  }));
  const uploaderRel = relsOfType(raw.relationships, "user")[0];
  const mangaRel = relsOfType(raw.relationships, "manga")[0];

  const chapter: Chapter = {
    id: raw.id,
    chapter: a.chapter ?? null,
    volume: a.volume ?? null,
    title: a.title?.trim() || (a.chapter ? `Chapter ${a.chapter}` : "Oneshot"),
    language: resolveLanguage(a.translatedLanguage),
    pages: a.pages ?? 0,
    group: groups[0]?.name || null,
    groups,
    uploader: uploaderRel
      ? { id: uploaderRel.id, name: uploaderRel.attributes?.username ?? "" }
      : null,
    mangaId: mangaRel?.id ?? null,
    externalUrl: a.externalUrl ?? null,
    isUnavailable: Boolean(a.isUnavailable),
    readable: (a.pages ?? 0) > 0 && !a.externalUrl && !a.isUnavailable,
    publishAt: a.publishAt,
    readableAt: a.readableAt,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    alternates: [],
    raw,
  };
  return attachRaw(chapter, raw);
}

/** Chapter numbers are strings and may be "7.5", "Extra" or absent. */
function chapterNumber(value: string | null): number {
  if (value === null || value === "") return Number.POSITIVE_INFINITY;
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
}

function sortChapters(list: Chapter[], direction: SortDirection): Chapter[] {
  const sign = direction === "desc" ? -1 : 1;
  return list.sort((a, b) => {
    const byChapter = chapterNumber(a.chapter) - chapterNumber(b.chapter);
    if (byChapter !== 0 && Number.isFinite(byChapter)) return byChapter * sign;
    const byVolume = chapterNumber(a.volume) - chapterNumber(b.volume);
    if (byVolume !== 0 && Number.isFinite(byVolume)) return byVolume * sign;
    return a.readableAt.localeCompare(b.readableAt) * sign;
  });
}

/**
 * Collapse the same chapter number in the same language into one entry, keeping
 * the most useful release as the primary and the rest under `alternates`.
 */
function dedupeChapters(list: Chapter[]): Chapter[] {
  const buckets = new Map<string, Chapter[]>();
  const unnumbered: Chapter[] = [];

  for (const chapter of list) {
    if (!chapter.chapter) {
      unnumbered.push(chapter);
      continue;
    }
    const key = `${chapter.language.code}::${chapter.chapter}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(chapter);
    else buckets.set(key, [chapter]);
  }

  const out: Chapter[] = [...unnumbered];
  for (const bucket of buckets.values()) {
    bucket.sort(
      (a, b) =>
        Number(b.readable) - Number(a.readable) ||
        b.pages - a.pages ||
        a.readableAt.localeCompare(b.readableAt)
    );
    const [primary, ...rest] = bucket;
    // Mutate rather than spread: `raw` is non-enumerable and would be lost.
    primary.alternates = rest.map((c) => ({
      id: c.id,
      group: c.group,
      pages: c.pages,
      readableAt: c.readableAt,
    }));
    out.push(primary);
  }
  return out;
}

function toPage<R, T>(res: Collection<R>, map: (raw: R) => T): Page<T> {
  const nextOffset = res.offset + res.data.length;
  const hasMore = nextOffset < res.total && nextOffset < LIMITS.resultWindow;
  return {
    items: res.data.map(map),
    total: res.total,
    limit: res.limit,
    offset: res.offset,
    hasMore,
    nextOffset: hasMore ? nextOffset : null,
  };
}

/** MangaDex refuses `offset + limit > 10000` on every paginated endpoint. */
function windowedLimit(offset: number, limit: number, max: number): number {
  const room = LIMITS.resultWindow - offset;
  if (room <= 0) {
    throw new MangaDexError(
      `offset ${offset} is outside MangaDex's ${LIMITS.resultWindow}-result window — narrow the query instead of paging deeper.`,
      { code: "invalid_request", status: 0 }
    );
  }
  return Math.min(Math.max(1, Math.min(limit, max)), room);
}

class Mangadex {
  readonly baseUrl: string;
  private readonly timeout: number;
  private readonly retries: number;
  private readonly limiter: RateLimiter;
  private readonly atHomeLimiter: RateLimiter;
  private readonly cache: TtlCache | null;
  private readonly coverHost: "uploads" | "site";
  private readonly imageHost: "uploads" | "athome";
  private readonly defaultContentRating: ContentRating[];
  private readonly language: string;
  private readonly userAgent: string | undefined;

  constructor(options: MangadexOptions = {}) {
    this.baseUrl = (options.baseUrl ?? API_BASE).replace(/\/+$/, "");
    this.timeout = options.timeout ?? 15_000;
    this.retries = options.retries ?? 2;
    this.limiter = new RateLimiter(
      options.requestsPerSecond ?? RATE_LIMITS.global,
      1000,
      options.maxConcurrent ?? 4
    );
    this.atHomeLimiter = new RateLimiter(RATE_LIMITS.atHomePerMinute, 60_000, 2);
    this.cache = options.cache ? new TtlCache(options.cacheMaxEntries ?? 300) : null;
    this.coverHost = options.coverHost ?? "uploads";
    this.imageHost = options.imageHost ?? "uploads";
    this.defaultContentRating = options.contentRating ?? [...DEFAULT_CONTENT_RATINGS];
    this.language = options.language ?? "en";
    this.userAgent = options.userAgent;
  }

  private get ctx(): NormalizeContext {
    return { language: this.language, coverHost: this.coverHost };
  }

  /* ---- request layer ---------------------------------------------- */

  private async request<T>(
    path: string,
    params: QueryParams = {},
    opts: { ttl?: number; limiter?: RateLimiter; signal?: AbortSignal } = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${path}${buildQuery(params)}`;
    if (this.cache && opts.ttl) {
      const hit = this.cache.get<T>(url);
      if (hit !== undefined) return hit;
    }
    const limiter = opts.limiter ?? this.limiter;
    const body = await limiter.run(() => this.fetchWithRetry<T>(url, opts.signal));
    if (this.cache && opts.ttl) this.cache.set(url, body, opts.ttl);
    return body;
  }

  private async fetchWithRetry<T>(url: string, signal?: AbortSignal): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.fetchOnce<T>(url, signal);
      } catch (error) {
        const err = error as MangaDexError;
        const retryable =
          err.code === "network_error" ||
          err.code === "timeout" ||
          err.status === 429 ||
          err.status >= 500;
        if (!retryable || attempt >= this.retries) throw err;
        await sleep(err.retryAfter ?? Math.min(8000, 500 * 2 ** attempt));
      }
    }
  }

  private async fetchOnce<T>(url: string, external?: AbortSignal): Promise<T> {
    if (external?.aborted) {
      throw new MangaDexError("Request aborted", { code: "aborted", status: 0, url });
    }
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    external?.addEventListener("abort", onAbort);
    const timer = setTimeout(() => controller.abort(), this.timeout);

    let res: Response;
    try {
      res = await fetch(url, {
        signal: controller.signal,
        headers: this.userAgent ? { "User-Agent": this.userAgent } : undefined,
      });
    } catch (error) {
      if (external?.aborted) {
        throw new MangaDexError("Request aborted", { code: "aborted", status: 0, url });
      }
      const timedOut = controller.signal.aborted;
      throw new MangaDexError(
        timedOut
          ? `Request timed out after ${this.timeout}ms: ${url}`
          : `Network error: ${(error as Error)?.message ?? "unknown"}`,
        { code: timedOut ? "timeout" : "network_error", status: 0, url }
      );
    } finally {
      clearTimeout(timer);
      external?.removeEventListener("abort", onAbort);
    }

    const text = await res.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
    }

    if (!res.ok) {
      const errors = (body as ErrorResponse | null)?.errors ?? [];
      const detail = errors[0]?.detail ?? errors[0]?.title ?? res.statusText;
      throw new MangaDexError(`MangaDex ${res.status}: ${detail}`, {
        code: "http_error",
        status: res.status,
        url,
        errors,
        retryAfter: parseRetryAfter(res),
      });
    }
    if (body === null) {
      throw new MangaDexError(`Empty or non-JSON response from ${url}`, {
        code: "bad_response",
        status: res.status,
        url,
      });
    }
    return body as T;
  }

/**
 * Clears the in-memory cache for all request results.
 */
  clearCache(): void {
    this.cache?.clear();
  }

  /**
   * Checks whether the MangaDex API is reachable at the configured base URL.
   */
  async ping(): Promise<boolean> {
    const url = `${this.baseUrl}/ping`;
    const res = await this.limiter.run(() => fetch(url).catch(() => null));
    return Boolean(res?.ok);
  }

  /* ---- tags -------------------------------------------------------- */

/**
 * Fetches the full MangaDex tag catalog and resolves names for the current locale.
 */
  async getTags(): Promise<Tag[]> {
    const res = await this.request<Collection<RawTag>>("/manga/tag", {}, { ttl: TTL.tags });
    return res.data.map((t) => ({
      id: t.id,
      name: resolveLocalized(t.attributes.name, [this.language, "en"]),
      group: t.attributes.group,
    }));
  }

  /**
   * Resolves tag names or UUIDs into MangaDex tag IDs, throwing if a name is unknown.
   */
  async resolveTagIds(names: string[] | undefined): Promise<string[] | undefined> {
    if (!names?.length) return undefined;
    const out: string[] = [];
    let live: Tag[] | null = null;

    for (const name of names) {
      if (UUID_RE.test(name)) {
        out.push(name);
        continue;
      }
      const exact = TAG_IDS[name];
      if (exact) {
        out.push(exact);
        continue;
      }
      const lower = name.toLowerCase();
      const ci = Object.keys(TAG_IDS).find((k) => k.toLowerCase() === lower);
      if (ci) {
        out.push(TAG_IDS[ci]);
        continue;
      }
      live ??= await this.getTags();
      const match = live.find((t) => t.name.toLowerCase() === lower);
      if (match) {
        out.push(match.id);
        continue;
      }
      const near = [...new Set([...Object.keys(TAG_IDS), ...live.map((t) => t.name)])]
        .filter((k) => k.toLowerCase().includes(lower))
        .slice(0, 5);
      throw new MangaDexError(
        `Unknown tag "${name}"${near.length ? `. Did you mean: ${near.join(", ")}?` : ""}`,
        { code: "unknown_tag", status: 0 }
      );
    }
    return out;
  }

  /* ---- manga ------------------------------------------------------- */

/**
 * Searches MangaDex for manga using either a query object or a title string.
 */
  async search(params?: SearchParams): Promise<Page<Manga>>;
  async search(title: string, params?: Omit<SearchParams, "title">): Promise<Page<Manga>>;
  async search(
    first?: string | SearchParams,
    second?: Omit<SearchParams, "title">
  ): Promise<Page<Manga>> {
    const p: SearchParams = typeof first === "string" ? { ...second, title: first } : { ...first };
    const offset = p.offset ?? 0;
    const limit = windowedLimit(offset, p.limit ?? 20, LIMITS.manga);

    const res = await this.request<Collection<RawManga>>(
      "/manga",
      {
        title: p.title,
        authorOrArtist: p.authorOrArtist,
        authors: p.authors,
        artists: p.artists,
        year: p.year,
        includedTags: await this.resolveTagIds(p.includedTags),
        includedTagsMode: p.includedTagsMode,
        excludedTags: await this.resolveTagIds(p.excludedTags),
        excludedTagsMode: p.excludedTagsMode,
        status: p.status,
        originalLanguage: p.originalLanguage,
        excludedOriginalLanguage: p.excludedOriginalLanguage,
        availableTranslatedLanguage: p.availableTranslatedLanguage,
        publicationDemographic: p.publicationDemographic,
        ids: p.ids,
        contentRating: p.contentRating ?? this.defaultContentRating,
        group: p.group,
        hasAvailableChapters: p.hasAvailableChapters,
        createdAtSince: p.createdAtSince ? toApiDate(p.createdAtSince) : undefined,
        updatedAtSince: p.updatedAtSince ? toApiDate(p.updatedAtSince) : undefined,
        order: p.order ?? (p.title ? { relevance: "desc" } : { followedCount: "desc" }),
        includes: p.includes ?? ["cover_art", "author", "artist"],
        limit,
        offset,
      },
      { ttl: TTL.manga }
    );
    return toPage(res, (raw) => normalizeManga(raw, this.ctx));
  }

/**
 * Fetches a single manga entity and normalizes it into the app's manga model.
 */
  async getManga(mangaId: string, opts: { includes?: Includes[] } = {}): Promise<Manga> {
    const res = await this.request<EntityResponse<RawManga>>(
      `/manga/${mangaId}`,
      { includes: opts.includes ?? ["cover_art", "author", "artist"] },
      { ttl: TTL.manga }
    );
    return normalizeManga(res.data, this.ctx);
  }

  /**
   * Fetches multiple manga by ID while preserving the original input order.
   */
  async getMangaByIds(ids: string[], opts: { includes?: Includes[] } = {}): Promise<Manga[]> {
    const out: Manga[] = [];
    for (let i = 0; i < ids.length; i += LIMITS.idsBatch) {
      const chunk = ids.slice(i, i + LIMITS.idsBatch);
      const res = await this.request<Collection<RawManga>>(
        "/manga",
        {
          ids: chunk,
          limit: chunk.length,
          contentRating: [...CONTENT_RATINGS],
          includes: opts.includes ?? ["cover_art", "author", "artist"],
        },
        { ttl: TTL.manga }
      );
      for (const raw of res.data) out.push(normalizeManga(raw, this.ctx));
    }
    const order = new Map(ids.map((id, i) => [id, i]));
    return out.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }

/**
 * Retrieves a random manga that matches the configured content ratings.
 */
  async getRandomManga(opts: { contentRating?: ContentRating[]; includes?: Includes[] } = {}): Promise<Manga> {
    const res = await this.request<EntityResponse<RawManga>>("/manga/random", {
      contentRating: opts.contentRating ?? this.defaultContentRating,
      includes: opts.includes ?? ["cover_art", "author", "artist"],
    });
    return normalizeManga(res.data, this.ctx);
  }

/**
 * Searches for manga sorted by popularity, with the newest most-followed titles first.
 */
  popular(params: Omit<SearchParams, "order"> = {}): Promise<Page<Manga>> {
    return this.search({ ...params, order: { followedCount: "desc" } });
  }

/**
 * Searches for manga sorted by rating, highest-rated titles first.
 */
  topRated(params: Omit<SearchParams, "order"> = {}): Promise<Page<Manga>> {
    return this.search({ ...params, order: { rating: "desc" } });
  }

/**
 * Searches for manga ordered by creation date, newest entries first.
 */
  recentlyAdded(params: Omit<SearchParams, "order"> = {}): Promise<Page<Manga>> {
    return this.search({ ...params, order: { createdAt: "desc" } });
  }

  /* ---- chapters ---------------------------------------------------- */

  /**
   * Returns all chapters for a manga, following pagination until the result set is exhausted.
   *
   * Unreadable chapters are excluded by default and duplicate chapter numbers are collapsed
   * into a primary result plus alternate scanlation entries.
   */
  async getChapters(mangaId: string, opts: GetChaptersOptions = {}): Promise<Chapter[]> {
    const languages =
      opts.language === undefined
        ? undefined
        : Array.isArray(opts.language)
          ? opts.language
          : [opts.language];
    const direction = opts.order ?? "asc";
    const includeUnreadable = opts.includeUnreadable ?? false;
    // `groups[]` is rejected by /feed but accepted by /chapter, so a group
    // filter switches endpoints rather than filtering client-side.
    const byGroup = Boolean(opts.groups?.length);
    const path = byGroup ? "/chapter" : `/manga/${mangaId}/feed`;
    const maxPageSize = byGroup ? LIMITS.chapter : LIMITS.feed;
    const pageSize = Math.min(opts.pageSize ?? maxPageSize, maxPageSize);

    const collected: Chapter[] = [];
    let offset = 0;
    let total = 0;

    for (;;) {
      if (offset >= LIMITS.resultWindow) break;
      const limit = windowedLimit(offset, pageSize, maxPageSize);
      const res = await this.request<Collection<RawChapter>>(
        path,
        {
          manga: byGroup ? mangaId : undefined,
          groups: byGroup ? opts.groups : undefined,
          translatedLanguage: languages,
          contentRating: opts.contentRating ?? [...CONTENT_RATINGS],
          excludedGroups: opts.excludedGroups,
          excludedUploaders: opts.excludedUploaders,
          includeExternalUrl: includeUnreadable ? undefined : false,
          includeEmptyPages: includeUnreadable ? undefined : false,
          includeUnavailable: includeUnreadable ? undefined : false,
          includeFutureUpdates: opts.includeFuture ? undefined : false,
          includeFuturePublishAt: opts.includeFuture ? undefined : false,
          order: { volume: direction, chapter: direction },
          includes: ["scanlation_group", "user"],
          limit,
          offset,
        },
        { ttl: TTL.feed, signal: opts.signal }
      );

      total = res.total;
      for (const raw of res.data) collected.push(normalizeChapter(raw));
      offset += res.data.length;
      opts.onProgress?.(collected.length, total);

      if (!res.data.length || offset >= total) break;
      if (opts.maxChapters && collected.length >= opts.maxChapters) break;
    }

    let result = includeUnreadable ? collected : collected.filter((c) => c.readable);
    if (opts.dedupe ?? true) result = dedupeChapters(result);
    result = sortChapters(result, direction);
    return opts.maxChapters ? result.slice(0, opts.maxChapters) : result;
  }

  /**
   * Retrieves adjacent chapters (prev and next) given a manga, current chapter id, and language.
   */
  async getAdjacentChapters(
    mangaId: string,
    currentChapterId: string,
    language?: string
  ): Promise<{ prev: string | null; next: string | null }> {
    const chapters = await this.getChapters(mangaId, { language, order: "asc" });
    const currentIndex = chapters.findIndex((c) => c.id === currentChapterId);

    if (currentIndex === -1) return { prev: null, next: null };

    // Chapters are sorted ascending by chapter number
    return {
      prev: currentIndex > 0 ? chapters[currentIndex - 1].id : null,
      next: currentIndex < chapters.length - 1 ? chapters[currentIndex + 1].id : null,
    };
  }

  /**
   * Builds a volume-to-chapter tree from the aggregate endpoint for a manga selector UI.
   */
  async getVolumes(
    mangaId: string,
    opts: { language?: string | string[]; groups?: string[]; order?: SortDirection } = {}
  ): Promise<Volume[]> {
    const languages =
      opts.language === undefined
        ? undefined
        : Array.isArray(opts.language)
          ? opts.language
          : [opts.language];
    const res = await this.request<RawAggregate>(
      `/manga/${mangaId}/aggregate`,
      { translatedLanguage: languages, groups: opts.groups },
      { ttl: TTL.feed }
    );
    // MangaDex returns `[]` rather than `{}` when nothing matches.
    if (Array.isArray(res.volumes)) return [];

    const sign = opts.order === "desc" ? -1 : 1;
    const volumes: Volume[] = Object.values(res.volumes).map((v) => {
      const chapters: AggregateChapter[] = Object.values(v.chapters ?? {})
        .map((c) => ({
          chapter: c.chapter,
          id: c.id,
          otherIds: c.others ?? [],
          count: c.count ?? 1,
          isUnavailable: Boolean(c.isUnavailable),
        }))
        .sort((a, b) => (chapterNumber(a.chapter) - chapterNumber(b.chapter)) * sign);
      return {
        volume: v.volume ?? "none",
        label: !v.volume || v.volume === "none" ? "No volume" : `Volume ${v.volume}`,
        count: v.count ?? chapters.length,
        chapters,
      };
    });

    return volumes.sort((a, b) => (chapterNumber(a.volume) - chapterNumber(b.volume)) * sign);
  }

/**
 * Fetches a single chapter object and normalizes it for the app's chapter model.
 */
  async getChapter(chapterId: string, opts: { includes?: Includes[] } = {}): Promise<Chapter> {
    const res = await this.request<EntityResponse<RawChapter>>(
      `/chapter/${chapterId}`,
      { includes: opts.includes ?? ["scanlation_group", "manga", "user"] },
      { ttl: TTL.chapter }
    );
    return normalizeChapter(res.data);
  }

  /**
   * Lists chapters using MangaDex's general chapter search endpoint with filtering and sorting.
   */
  async listChapters(params: ListChaptersParams = {}): Promise<Page<Chapter>> {
    const offset = params.offset ?? 0;
    const limit = windowedLimit(offset, params.limit ?? 20, LIMITS.chapter);
    const res = await this.request<Collection<RawChapter>>(
      "/chapter",
      {
        manga: params.manga,
        ids: params.ids,
        title: params.title,
        groups: params.groups,
        uploader: params.uploader,
        chapter: params.chapter,
        volume: params.volume,
        translatedLanguage: params.translatedLanguage,
        originalLanguage: params.originalLanguage,
        excludedOriginalLanguage: params.excludedOriginalLanguage,
        excludedGroups: params.excludedGroups,
        excludedUploaders: params.excludedUploaders,
        contentRating: params.contentRating ?? this.defaultContentRating,
        includeExternalUrl: params.includeExternalUrl,
        includeEmptyPages: params.includeEmptyPages,
        includeFutureUpdates: params.includeFutureUpdates,
        includeFuturePublishAt: params.includeFuturePublishAt,
        includeUnavailable: params.includeUnavailable,
        createdAtSince: params.createdAtSince ? toApiDate(params.createdAtSince) : undefined,
        updatedAtSince: params.updatedAtSince ? toApiDate(params.updatedAtSince) : undefined,
        publishAtSince: params.publishAtSince ? toApiDate(params.publishAtSince) : undefined,
        order: params.order ?? { readableAt: "desc" },
        includes: params.includes ?? ["scanlation_group", "manga", "user"],
        limit,
        offset,
      },
      { ttl: TTL.chapter }
    );
    return toPage(res, (raw) => normalizeChapter(raw));
  }

  /**
   * Returns the latest readable chapter releases across MangaDex, ordered newest-first.
   */
  latestUpdates(params: Omit<ListChaptersParams, "order"> = {}): Promise<Page<Chapter>> {
    return this.listChapters({
      includeExternalUrl: false,
      includeEmptyPages: false,
      includeFutureUpdates: false,
      ...params,
      order: { readableAt: "desc" },
    });
  }

  /* ---- covers ------------------------------------------------------ */

/**
 * Fetches cover art entries and normalizes them into cover objects for one manga or a query.
 */
  async getCovers(mangaIdOrParams: string | CoverParams): Promise<CoverImage[]> {
    const params: CoverParams =
      typeof mangaIdOrParams === "string" ? { manga: [mangaIdOrParams] } : mangaIdOrParams;
    const out: CoverImage[] = [];
    let offset = params.offset ?? 0;

    for (;;) {
      const limit = windowedLimit(offset, params.limit ?? LIMITS.cover, LIMITS.cover);
      const res = await this.request<Collection<RawCover>>(
        "/cover",
        {
          manga: params.manga,
          ids: params.ids,
          uploaders: params.uploaders,
          locales: params.locales,
          order: params.order ?? { volume: "asc" },
          includes: params.includes ?? ["manga"],
          limit,
          offset,
        },
        { ttl: TTL.cover }
      );
      for (const raw of res.data) {
        const mangaId =
          relsOfType(raw.relationships, "manga")[0]?.id ?? params.manga?.[0] ?? "";
        out.push(normalizeCover(mangaId, raw.id, raw.attributes, this.coverHost));
      }
      offset += res.data.length;
      if (!res.data.length || offset >= res.total || params.limit !== undefined) break;
      if (offset >= LIMITS.resultWindow) break;
    }
    return out;
  }

/**
 * Fetches a single cover image by its MangaDex cover ID.
 */
  async getCover(coverId: string): Promise<CoverImage> {
    const res = await this.request<EntityResponse<RawCover>>(
      `/cover/${coverId}`,
      { includes: ["manga"] },
      { ttl: TTL.cover }
    );
    const mangaId = relsOfType(res.data.relationships, "manga")[0]?.id ?? "";
    return normalizeCover(mangaId, res.data.id, res.data.attributes, this.coverHost);
  }

  /**
   * Builds a cover URL from a stored file name without making an API call.
   */
  coverUrl(mangaId: string, fileName: string, size: CoverSize = "original"): string {
    return buildCoverUrl(mangaId, fileName, size, this.coverHost);
  }

  /* ---- pages ------------------------------------------------------- */

  /**
   * Resolves the page URLs for a chapter, optionally choosing the cached uploads host or the at-home host.
   */
  async getPageUrls(
    chapterId: string,
    opts: { dataSaver?: boolean; host?: "uploads" | "athome"; forcePort443?: boolean } = {}
  ): Promise<ChapterPages> {
    const dataSaver = opts.dataSaver ?? false;
    const res = await this.request<RawAtHome>(
      `/at-home/server/${chapterId}`,
      { forcePort443: opts.forcePort443 === undefined ? undefined : String(opts.forcePort443) },
      { ttl: TTL.atHome, limiter: this.atHomeLimiter }
    );

    const files = dataSaver ? res.chapter?.dataSaver : res.chapter?.data;
    if (!files?.length) {
      // at-home answers 200 with an empty data[] for external / zero-page chapters.
      throw new MangaDexError(
        `Chapter ${chapterId} has no MangaDex-hosted pages — it is hosted externally or unavailable. Check chapter.readable first.`,
        { code: "no_pages", status: 0, url: `${this.baseUrl}/at-home/server/${chapterId}` }
      );
    }

    const host = (opts.host ?? this.imageHost) === "athome" ? res.baseUrl : UPLOADS_BASE;
    const segment = dataSaver ? "data-saver" : "data";
    return {
      chapterId,
      hash: res.chapter.hash,
      host,
      dataSaver,
      pages: files.map((file) => `${host}/${segment}/${res.chapter.hash}/${file}`),
    };
  }

  /**
   * Prefetches a chapter's page images with bounded concurrency and reports the per-page results.
   */
  async prefetchChapter(chapterId: string, opts: PrefetchOptions = {}): Promise<PrefetchResult> {
    const { pages } = await this.getPageUrls(chapterId, { dataSaver: opts.dataSaver });
    const concurrency = Math.max(1, Math.min(opts.concurrency ?? 4, 8));
    const download = opts.download ?? true;
    const results: PrefetchResult["pages"] = new Array(pages.length);
    let cursor = 0;
    let done = 0;

    const worker = async (): Promise<void> => {
      for (;;) {
        const index = cursor++;
        if (index >= pages.length) return;
        if (opts.signal?.aborted) return;
        const url = pages[index];
        try {
          const res = await fetch(url, { signal: opts.signal });
          let bytes = 0;
          if (download && res.ok) {
            const buf = await res.arrayBuffer();
            bytes = buf.byteLength;
          }
          results[index] = { url, status: res.status, ok: res.ok, bytes };
        } catch {
          results[index] = { url, status: 0, ok: false, bytes: 0 };
        }
        opts.onProgress?.(++done, pages.length);
      }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, pages.length) }, worker));

    const settled = results.filter(Boolean);
    return {
      chapterId,
      total: pages.length,
      ok: settled.filter((r) => r.ok).length,
      failed: settled.filter((r) => !r.ok).length,
      bytes: settled.reduce((sum, r) => sum + r.bytes, 0),
      pages: settled,
    };
  }

  /**
   * Deprecated compatibility wrapper that returns page URLs using the older naming convention.
   */
  async get_imageLinks(chapterId: string, saver = false): Promise<string[]> {
    try {
      const { pages } = await this.getPageUrls(chapterId, { dataSaver: saver });
      return pages;
    } catch {
      return [];
    }
  }

  /* ---- lists ------------------------------------------------------- */

/**
 * Fetches a single public or private MangaDex list, including its related manga IDs.
 */
  async getList(listId: string): Promise<MangaList> {
    const res = await this.request<EntityResponse<RawList>>(
      `/list/${listId}`,
      {},
      { ttl: TTL.list }
    );
    return {
      id: res.data.id,
      name: res.data.attributes.name,
      visibility: res.data.attributes.visibility,
      mangaIds: relsOfType(res.data.relationships, "manga").map((r) => r.id),
      raw: res.data,
    };
  }

  /**
   * Resolves every manga in a list, skipping any entries that were deleted from MangaDex.
   */
  async getListManga(listId: string, opts: { includes?: Includes[] } = {}): Promise<Manga[]> {
    const list = await this.getList(listId);
    if (!list.mangaIds.length) return [];
    return this.getMangaByIds(list.mangaIds, opts);
  }

  /**
   * Returns the chapter feed for every manga included in a list.
   */
  async getListChapters(
    listId: string,
    params: Omit<ListChaptersParams, "manga" | "ids"> = {}
  ): Promise<Page<Chapter>> {
    const offset = params.offset ?? 0;
    const limit = windowedLimit(offset, params.limit ?? 20, LIMITS.feed);
    const res = await this.request<Collection<RawChapter>>(
      `/list/${listId}/feed`,
      {
        translatedLanguage: params.translatedLanguage,
        contentRating: params.contentRating ?? this.defaultContentRating,
        includeExternalUrl: params.includeExternalUrl ?? false,
        includeEmptyPages: params.includeEmptyPages ?? false,
        includeFutureUpdates: params.includeFutureUpdates ?? false,
        order: params.order ?? { readableAt: "desc" },
        includes: params.includes ?? ["scanlation_group", "manga", "user"],
        limit,
        offset,
      },
      { ttl: TTL.feed }
    );
    return toPage(res, (raw) => normalizeChapter(raw));
  }

  /**
   * Fetches a user's public custom lists, capped at the requested limit.
   */
  async getUserLists(userId: string, opts: { limit?: number } = {}): Promise<MangaList[]> {
    const res = await this.request<Collection<RawList>>(
      `/user/${userId}/list`,
      { limit: Math.min(opts.limit ?? 100, LIMITS.manga) },
      { ttl: TTL.list }
    );
    return res.data.map((raw) => ({
      id: raw.id,
      name: raw.attributes.name,
      visibility: raw.attributes.visibility,
      mangaIds: relsOfType(raw.relationships, "manga").map((r) => r.id),
      raw,
    }));
  }

  /**
   * Fetches MangaDex's curated seasonal and staff lists, such as seasonal recommendations.
   */
  async getSeasonalLists(): Promise<MangaList[]> {
    return this.getUserLists(MANGADEX_STAFF_USER);
  }

  /* ---- authors / groups -------------------------------------------- */

/**
 * Searches for authors by name and returns a lightweight person list.
 */
  async searchAuthors(name: string, opts: { limit?: number } = {}): Promise<Person[]> {
    const res = await this.request<Collection<RawAuthor>>(
      "/author",
      { name, limit: Math.min(opts.limit ?? 10, LIMITS.manga), order: { name: "asc" } },
      { ttl: TTL.manga }
    );
    return res.data.map((a) => ({ id: a.id, name: a.attributes.name }));
  }

/**
 * Searches for scanlation groups by name, optionally narrowed to a specific language.
 */
  async searchGroups(
    name: string,
    opts: { limit?: number; focusedLanguage?: string } = {}
  ): Promise<Person[]> {
    const res = await this.request<Collection<RawGroup>>(
      "/group",
      {
        name,
        focusedLanguage: opts.focusedLanguage,
        limit: Math.min(opts.limit ?? 10, LIMITS.manga),
        order: { name: "asc" },
      },
      { ttl: TTL.manga }
    );
    return res.data.map((g) => ({ id: g.id, name: g.attributes.name }));
  }
}

export * from "./mangadex.types";
export { buildCoverUrl as coverUrl, languageName, resolveLanguage };
export type { LanguageInfo };
export default Mangadex;
