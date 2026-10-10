/**
 * nh.ts - the SDK entry point for the nhentai v2 JSON API.
 * ---------------------------------------------------------------------------
 * Two classes:
 *   - `NhClient`      - all data access (search, browse, detail, random, tags).
 *   - `TaxonomyStore` - the DYNAMIC constants layer: static seed at boot,
 *                       background refresh via /api/v2/tags/{type}, cached to
 *                       your storage adapter.
 *
 * Design notes
 *   - v2-only: every data request targets https://nhentai.net/api/v2/*. There
 *     is no HTML scraping and no Cloudflare bypass - nhentai.net serves the
 *     v2 JSON API without challenges, and mirrors like nhentai.to do not
 *     speak v2 at all.
 *   - Anonymous reads work out of the box at ~20 req/min per IP. The client
 *     throttles itself, retries 429/5xx with backoff, and never hits the API
 *     faster than `minRequestGapMs`.
 *   - Blocked-content filtering is id-based: v2 list items only carry
 *     `tag_ids`, so the blocklist (NH_BLOCKED_TAG_IDS) is a set of ids.
 *   - Every method returns normalized domain models (nh.types.ts), never raw.
 *   - Every failure is an `NhError` with a `.code` you can switch on.
 * ---------------------------------------------------------------------------
 */

import {
  NH_BLOCKED_TAG_IDS,
  NH_DEFAULT_HEADERS,
  NH_DEFAULTS,
  NH_ERROR,
  NH_NET,
  NH_PAGE_SIZE,
  NH_PATHS,
  NH_SORT,
  NH_STATIC_TAGS,
  NH_STORAGE_KEYS,
  NH_TAG_TYPES,
  type NhSort,
  type NhTagType,
} from '@/services/nh/nh.constants';
import type {
  NhClientConfig,
  NhGallery,
  NhGalleryPreview,
  NhPage,
  NhSearchQuery,
  NhStorage,
  NhTag,
  NhTaxonomySnapshot,
  RawGallery,
  RawListGallery,
  RawListResponse,
  RawRandomResponse,
  RawTagsResponse,
} from '@/services/nh/nh.types';
import {
  NhError,
  buildSearchQuery,
  createThrottle,
  fetchWithTimeout,
  mapGallery,
  mapPreview,
  mapTag,
  mergeTags,
  parseGalleryCode,
  slugify,
  toLabel,
  withQuery,
  withRetry,
} from '@/services/nh/nh.utils';

/* ========================================================================== */
/*  NhClient                                                                  */
/* ========================================================================== */

export class NhClient {
  private readonly host: string;
  private readonly timeoutMs: number;
  private readonly retries: number;
  private readonly headers: Record<string, string>;
  private readonly blockTagIds: Set<number>;
  private readonly onRequest?: (info: { url: string; ms: number; status: number }) => void;
  private readonly throttle = createThrottle();

  /**
   * @param config.host        Base host. Defaults to https://nhentai.net.
   * @param config.storage     AsyncStorage/MMKV adapter for the taxonomy cache.
   * @param config.blockTagIds Numeric tag ids hard-filtered from results.
   *                           Defaults to NH_BLOCKED_TAG_IDS; pass [] to disable.
   */
  constructor(config: NhClientConfig = {}) {
    this.host = config.host ?? NH_NET;
    this.timeoutMs = config.timeoutMs ?? NH_DEFAULTS.timeoutMs;
    this.retries = config.retries ?? NH_DEFAULTS.retries;
    this.headers = { ...NH_DEFAULT_HEADERS, ...config.headers };
    this.blockTagIds = new Set(config.blockTagIds ?? NH_BLOCKED_TAG_IDS);
    this.onRequest = config.onRequest;
  }

  /** The base host in use - handy for a debug/status row in settings. */
  get baseHost(): string {
    return this.host;
  }

  /* ------------------------------ transport ----------------------------- */

  /** One throttled, retried, JSON-only request against the v2 API. */
  private async getJson<T>(path: string): Promise<T> {
    const url = `${this.host}${path}`;
    return withRetry(async () => {
      const started = Date.now();
      const res = await this.throttle(() =>
        fetchWithTimeout(url, { headers: this.headers }, this.timeoutMs),
      );
      const body = await res.text();
      this.onRequest?.({ url, ms: Date.now() - started, status: res.status });

      if (res.status === 404) throw new NhError(NH_ERROR.NOT_FOUND, 'Not found', 404, url);
      if (res.status === 429)
        throw new NhError(NH_ERROR.RATE_LIMITED, 'Rate limited - slow down', 429, url);
      if (!res.ok) throw new NhError(NH_ERROR.UNKNOWN, `HTTP ${res.status}`, res.status, url);

      try {
        return JSON.parse(body) as T;
      } catch {
        throw new NhError(NH_ERROR.PARSE, 'Expected JSON from the nhentai API', res.status, url);
      }
    }, this.retries);
  }

  /** Filters lean v2 list items by server blacklist flag + local tag ids. */
  private previews(items: RawListGallery[]): NhGalleryPreview[] {
    return items
      .filter(
        (item) =>
          !item.blacklisted &&
          !(item.tag_ids ?? []).some((id) => this.blockTagIds.has(id)),
      )
      .map((item) => mapPreview(item, this.host));
  }

  private toPage(res: RawListResponse, page: number): NhPage<NhGalleryPreview> {
    const items = this.previews(res.result ?? []);
    const totalPages = res.num_pages ?? 1;
    return {
      items,
      page,
      totalPages,
      perPage: res.per_page ?? NH_PAGE_SIZE,
      hasNextPage: page < totalPages,
    };
  }

  private assertNotBlocked(gallery: NhGallery): void {
    if (gallery.tags.some((t) => this.blockTagIds.has(t.id))) {
      throw new NhError(
        NH_ERROR.BLOCKED_CONTENT,
        `Gallery ${gallery.id} is filtered by your content settings`,
      );
    }
  }

  /* -------------------------------- reads -------------------------------- */

  /**
   * Fetches one gallery by the code users see in the URL - `/g/<code>`.
   * Accepts a bare code, a full URL, or pasted text; anything
   * `parseGalleryCode` can understand.
   *
   * @throws NhError NOT_FOUND when the code doesn't exist,
   *                 BLOCKED_CONTENT when it matches your blocklist.
   *
   * @example
   * const g = await nh.getById('177013');
   * <FlatList data={g.pages} renderItem={({item}) => <Image source={{uri:item.url}} />} />
   */
  async getById(codeOrUrl: string | number): Promise<NhGallery> {
    const code = parseGalleryCode(String(codeOrUrl));
    if (!code) throw new NhError(NH_ERROR.NOT_FOUND, `Invalid gallery code: ${codeOrUrl}`);

    const raw = await this.getJson<RawGallery>(NH_PATHS.v2Gallery(code));
    const gallery = mapGallery(raw, this.host);
    this.assertNotBlocked(gallery);
    return gallery;
  }

  /**
   * Same as `getById` but resolves `null` instead of throwing on NOT_FOUND -
   * ideal for a "jump to code" search box where a typo is expected.
   */
  async tryGetById(codeOrUrl: string | number): Promise<NhGallery | null> {
    try {
      return await this.getById(codeOrUrl);
    } catch (err) {
      if (
        err instanceof NhError &&
        (err.code === NH_ERROR.NOT_FOUND || err.code === NH_ERROR.BLOCKED_CONTENT)
      ) {
        return null;
      }
      throw err;
    }
  }

  /**
   * Full-text / structured search. Pass either a raw `query` string using the
   * site syntax, or the structured fields - they're combined for you.
   *
   * @example
   * nh.search({ includeTags:['ahegao'], excludeTags:['yaoi'],
   *             languages:['english'], sort: NH_SORT.POPULAR_WEEK, page: 1 })
   */
  async search(input: NhSearchQuery = {}): Promise<NhPage<NhGalleryPreview>> {
    const query = buildSearchQuery(input);
    const page = input.page ?? 1;
    const sort = input.sort || undefined;

    // Nothing to filter or sort by -> the plain recent feed.
    if (!query && !sort) return this.listLatest(page);

    // A real query goes through /search; sort-only browsing uses /galleries.
    const path = query
      ? withQuery(NH_PATHS.v2Search, { query, page, sort })
      : withQuery(NH_PATHS.v2Galleries, { page, sort });
    const res = await this.getJson<RawListResponse>(path);
    return this.toPage(res, page);
  }

  /** Newest uploads feed (the site's front page, in "recent" order). */
  async listLatest(page = 1): Promise<NhPage<NhGalleryPreview>> {
    const res = await this.getJson<RawListResponse>(withQuery(NH_PATHS.v2Galleries, { page }));
    return this.toPage(res, page);
  }

  /**
   * Browse everything under one tag/artist/parody/character/group.
   * You need the numeric `tagId` - get it from any `NhTag.id` returned by a
   * gallery, or from `TaxonomyStore`.
   */
  async listByTagId(
    tagId: number,
    page = 1,
    sort: NhSort = NH_SORT.RECENT,
  ): Promise<NhPage<NhGalleryPreview>> {
    const res = await this.getJson<RawListResponse>(
      withQuery(NH_PATHS.v2Tagged, { tag_id: tagId, page, sort: sort || undefined }),
    );
    return this.toPage(res, page);
  }

  /**
   * Browse by tag *name* instead of id (e.g. from a chip the user tapped).
   * Implemented as a `tag:"name"` search, so it works without a taxonomy sync.
   */
  listByTagName(
    name: string,
    page = 1,
    sort: NhSort = NH_SORT.RECENT,
  ): Promise<NhPage<NhGalleryPreview>> {
    return this.search({ includeTags: [name], page, sort });
  }

  /**
   * "More like this" for a gallery - the site's own related list (usually 5).
   * Perfect for a horizontal carousel under the detail screen.
   */
  async getRelated(codeOrUrl: string | number): Promise<NhGalleryPreview[]> {
    const code = parseGalleryCode(String(codeOrUrl));
    if (!code) throw new NhError(NH_ERROR.NOT_FOUND, `Invalid gallery code: ${codeOrUrl}`);
    const res = await this.getJson<{ result: RawListGallery[] }>(NH_PATHS.v2Related(code));
    return this.previews(res.result ?? []);
  }

  /**
   * Random gallery. /api/v2/galleries/random returns an id, so we resolve it
   * through the regular detail endpoint.
   */
  async getRandom(): Promise<NhGallery> {
    const res = await this.getJson<RawRandomResponse>(NH_PATHS.v2Random);
    const code = res?.id;
    if (!code) throw new NhError(NH_ERROR.PARSE, 'Could not resolve a random gallery');
    return this.getById(code);
  }

  /**
   * Fetches several codes in parallel with bounded concurrency. Use for
   * hydrating a favourites/history screen from stored ids. Missing or blocked
   * codes are simply omitted rather than failing the whole batch.
   */
  async getManyByIds(codes: (string | number)[], concurrency = 4): Promise<NhGallery[]> {
    const out: NhGallery[] = [];
    const queue = [...codes];
    const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      while (queue.length) {
        const code = queue.shift()!;
        const g = await this.tryGetById(code).catch(() => null);
        if (g) out.push(g);
      }
    });
    await Promise.all(workers);
    const order = new Map(codes.map((c, i) => [String(parseGalleryCode(String(c))), i]));
    return out.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }

  /**
   * One page of the v2 tag taxonomy for a type (`tag`, `artist`, `group`,
   * `parody`, `character`, `language`, `category`). This is the raw feed
   * behind `TaxonomyStore` - call that instead unless you need one page.
   */
  async fetchTaxonomyPage(type: NhTagType, page = 1): Promise<NhTag[]> {
    const res = await this.getJson<RawTagsResponse>(
      withQuery(NH_PATHS.v2Tags(type), { page, sort: 'popular' }),
    );
    return (res.result ?? []).map(mapTag);
  }
}

/* ========================================================================== */
/*  TaxonomyStore - static + dynamic constants                                */
/* ========================================================================== */

/**
 * Keeps the app's tag/artist/parody lists fresh.
 *
 * Lifecycle:
 *   1. `snapshot` is available synchronously from the moment you construct it,
 *      seeded from `NH_STATIC_TAGS` - your filter sheet renders immediately.
 *   2. `hydrate()` loads the last cached sync from storage (fast, offline).
 *   3. `sync()` pulls /api/v2/tags/{type} in the background and merges newly
 *      added tags on top. Failure is non-fatal: you keep the static set.
 *
 * @example
 * const taxonomy = new TaxonomyStore(nh, AsyncStorage);
 * await taxonomy.hydrate();          // instant, cached
 * taxonomy.sync().catch(() => {});   // fire-and-forget refresh
 * const chips = taxonomy.get('tag'); // always non-empty
 */
export class TaxonomyStore {
  private snapshot: NhTaxonomySnapshot;
  private syncing: Promise<NhTaxonomySnapshot> | null = null;
  private listeners = new Set<(s: NhTaxonomySnapshot) => void>();

  constructor(
    private readonly client: NhClient,
    private readonly storage?: NhStorage,
    private readonly ttlMs: number = NH_DEFAULTS.taxonomyTtlMs,
  ) {
    this.snapshot = { updatedAt: 0, byType: seedByType() };
  }

  /** Current merged snapshot (static | cached | synced). Never null. */
  getSnapshot(): NhTaxonomySnapshot {
    return this.snapshot;
  }

  /** Tags of one type, sorted by popularity. Safe to call before any fetch. */
  get(type: NhTagType): NhTag[] {
    return this.snapshot.byType[type] ?? [];
  }

  /** Only the tags that came from the network (i.e. beyond the shipped seed). */
  getDynamicOnly(type: NhTagType): NhTag[] {
    const seed = new Set(NH_STATIC_TAGS);
    return this.get(type).filter((t) => !seed.has(t.name));
  }

  /** Substring search across a type - powers the tag picker's search field. */
  find(type: NhTagType, term: string, limit = 50): NhTag[] {
    const q = term.trim().toLowerCase();
    if (!q) return this.get(type).slice(0, limit);
    return this.get(type)
      .filter((t) => t.name.includes(q))
      .slice(0, limit);
  }

  /** Subscribe to snapshot changes; returns an unsubscribe fn (use in effects). */
  subscribe(fn: (s: NhTaxonomySnapshot) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** True when the cache is older than the TTL and a `sync()` is worthwhile. */
  get isStale(): boolean {
    return Date.now() - this.snapshot.updatedAt > this.ttlMs;
  }

  /** Loads the cached snapshot from storage. Call on app start before `sync`. */
  async hydrate(): Promise<NhTaxonomySnapshot> {
    const raw = await this.storage?.getItem(NH_STORAGE_KEYS.taxonomy);
    if (raw) {
      try {
        const cached = JSON.parse(raw) as NhTaxonomySnapshot;
        this.commit({
          updatedAt: cached.updatedAt,
          byType: mergeSnapshots(seedByType(), cached.byType),
        });
      } catch {
        /* corrupt cache - keep the static seed */
      }
    }
    return this.snapshot;
  }

  /**
   * Pulls pages of /api/v2/tags/{type} and merges the result.
   * Concurrent calls share one in-flight promise.
   *
   * @param types  Which taxonomies to refresh. Default: tags + languages +
   *               categories (the ones a filter sheet actually needs).
   * @param pages  How many pages per type (~120 entries each).
   */
  async sync(
    types: NhTagType[] = ['tag', 'language', 'category'],
    pages = NH_DEFAULTS.taxonomySyncPages,
  ): Promise<NhTaxonomySnapshot> {
    if (this.syncing) return this.syncing;
    this.syncing = (async () => {
      const next: Record<NhTagType, NhTag[]> = { ...this.snapshot.byType };
      for (const type of types) {
        const collected: NhTag[] = [];
        for (let p = 1; p <= pages; p++) {
          try {
            const batch = await this.client.fetchTaxonomyPage(type, p);
            if (!batch.length) break;
            collected.push(...batch);
          } catch {
            break; // partial data is fine - never let a sync failure surface
          }
        }
        if (collected.length) next[type] = mergeTags(next[type] ?? [], collected);
      }
      const snapshot: NhTaxonomySnapshot = { updatedAt: Date.now(), byType: next };
      this.commit(snapshot);
      await this.storage?.setItem(NH_STORAGE_KEYS.taxonomy, JSON.stringify(snapshot));
      return snapshot;
    })().finally(() => {
      this.syncing = null;
    });
    return this.syncing;
  }

  /** hydrate() + a background sync only when stale. The one-liner for app boot. */
  async bootstrap(): Promise<NhTaxonomySnapshot> {
    await this.hydrate();
    if (this.isStale) void this.sync().catch(() => undefined);
    return this.snapshot;
  }

  /** Wipes the cached dynamic layer, falling back to the shipped constants. */
  async reset(): Promise<void> {
    await this.storage?.removeItem(NH_STORAGE_KEYS.taxonomy);
    this.commit({ updatedAt: 0, byType: seedByType() });
  }

  private commit(snapshot: NhTaxonomySnapshot): void {
    this.snapshot = snapshot;
    this.listeners.forEach((fn) => fn(snapshot));
  }
}

function seedByType(): Record<NhTagType, NhTag[]> {
  const empty = Object.fromEntries(
    NH_TAG_TYPES.map((t) => [t, [] as NhTag[]]),
  ) as Record<NhTagType, NhTag[]>;
  empty.tag = NH_STATIC_TAGS.map((name) => {
    const slug = slugify(name);
    return {
      id: 0,
      type: 'tag' as const,
      name,
      label: toLabel(name),
      slug,
      url: `/tag/${slug}/`,
      count: 0,
    };
  });
  return empty;
}

function mergeSnapshots(
  base: Record<NhTagType, NhTag[]>,
  incoming: Record<NhTagType, NhTag[]>,
): Record<NhTagType, NhTag[]> {
  const out = { ...base };
  for (const type of NH_TAG_TYPES) out[type] = mergeTags(base[type] ?? [], incoming?.[type] ?? []);
  return out;
}

/* ========================================================================== */

/** Convenience singleton for apps that only ever talk to one mirror. */
export function createNhClient(config?: NhClientConfig): {
  client: NhClient;
  taxonomy: TaxonomyStore;
} {
  const client = new NhClient(config);
  const taxonomy = new TaxonomyStore(client, config?.storage);
  return { client, taxonomy };
}

export * from '@/services/nh/nh.constants';
export * from '@/services/nh/nh.types';
export { NhError } from '@/services/nh/nh.utils';
