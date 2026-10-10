/**
 * nh.types.ts
 * ---------------------------------------------------------------------------
 * Two layers of types:
 *   1. `Raw*`  - exactly what the nhentai v2 JSON API returns. Never leak
 *                these into your UI; they change without notice.
 *   2. Domain  - normalized, RN-friendly models the SDK returns. Stable.
 * ---------------------------------------------------------------------------
 * Targets https://nhentai.net/api/v2 (gallery detail, list/search responses
 * and the taxonomy endpoints). List items are lean: they carry `tag_ids` but
 * no tag objects, so blocked-content filtering is id-based.
 */

import type { NhErrorCode, NhSort, NhTagType } from './nh.constants';

/* ------------------------------- raw shapes ------------------------------- */

/** A tag as returned by v2 (gallery detail and /api/v2/tags/{type}). */
export interface RawTag {
  id: number;
  type: string;
  name: string;
  /** URL slug, e.g. "big-breasts". */
  slug?: string;
  url: string;
  count: number;
  description?: string | null;
}

/** One page of a gallery as returned by the v2 gallery endpoint. */
export interface RawPage {
  /** 1-based page number. */
  number: number;
  /** Site-relative image path, e.g. "galleries/2198265/1.jpg". */
  path: string;
  width: number;
  height: number;
  /** Site-relative thumbnail path, e.g. "galleries/2198265/1t.jpg". */
  thumbnail: string;
  thumbnail_width: number;
  thumbnail_height: number;
}

/** Cover / thumbnail descriptor in the v2 gallery endpoint. */
export interface RawImageAsset {
  path: string;
  width: number;
  height: number;
}

/** Full gallery: GET /api/v2/galleries/{id}. */
export interface RawGallery {
  id: number | string;
  media_id: string;
  title: { english?: string | null; japanese?: string | null; pretty?: string | null };
  cover: RawImageAsset;
  thumbnail: RawImageAsset;
  scanlator?: string | null;
  /** Unix seconds. */
  upload_date: number;
  tags: RawTag[];
  num_pages: number;
  num_favorites: number;
  pages: RawPage[];
}

/** Lightweight item in list / search / tagged / related responses. */
export interface RawListGallery {
  id: number | string;
  media_id: string;
  english_title?: string | null;
  japanese_title?: string | null;
  /** Site-relative thumbnail path, e.g. "galleries/4157641/thumb.jpg". */
  thumbnail: string;
  thumbnail_width?: number;
  thumbnail_height?: number;
  num_pages: number;
  num_favorites: number;
  tag_ids: number[];
  /** True when the item matches the signed-in user's server-side blacklist. */
  blacklisted?: boolean;
}

export interface RawListResponse {
  result: RawListGallery[];
  num_pages: number;
  per_page: number;
  total?: number;
}

/** GET /api/v2/galleries/random returns just the id. */
export interface RawRandomResponse {
  id: number | string;
}

/** GET /api/v2/tags/{type} paginated response. */
export interface RawTagsResponse {
  result: RawTag[];
  num_pages: number;
  per_page: number;
  total?: number;
}

/* ------------------------------ domain models ----------------------------- */

export interface NhTag {
  id: number;
  /** Normalized taxonomy bucket. */
  type: NhTagType;
  /** Lowercase name, e.g. "big breasts". */
  name: string;
  /** Display-ready name, e.g. "Big Breasts". */
  label: string;
  /** Site-relative url, e.g. "/tag/big-breasts/". */
  url: string;
  /** URL slug, e.g. "big-breasts". */
  slug?: string;
  /** Number of galleries carrying this tag (used for sorting chips). */
  count: number;
}

export interface NhImage {
  /** 1-based page number. */
  page: number;
  /** Full-resolution image URL. */
  url: string;
  /** Small thumbnail URL for the reader filmstrip. */
  thumbUrl: string;
  width: number;
  height: number;
  /** Aspect ratio, precomputed so RN lists don't jump. */
  aspectRatio: number;
}

/** Lightweight item for grids/lists - cheap to render, no page array. */
export interface NhGalleryPreview {
  /** The numeric code users type, e.g. "177013". Also the /g/<code> segment. */
  id: string;
  mediaId: string;
  title: string;
  titleJapanese?: string;
  titlePretty?: string;
  coverUrl: string;
  thumbUrl: string;
  pageCount: number;
  favorites: number;
  /** Epoch milliseconds. 0 when the source list did not include a date. */
  uploadedAt: number;
  languages: string[];
  /** Tags when the payload had them (detail). Empty for list items. */
  tags: NhTag[];
  /** Convenience: canonical web URL for share sheets / "open in browser". */
  webUrl: string;
}

/** Full detail, includes every page. Returned by `getById`. */
export interface NhGallery extends NhGalleryPreview {
  pages: NhImage[];
  artists: NhTag[];
  groups: NhTag[];
  parodies: NhTag[];
  characters: NhTag[];
  categories: NhTag[];
  contentTags: NhTag[];
  scanlator?: string;
}

export interface NhPage<T> {
  items: T[];
  /** 1-based current page. */
  page: number;
  /** Total pages reported by the source. */
  totalPages: number;
  perPage: number;
  hasNextPage: boolean;
}

/* ------------------------------- query input ------------------------------ */

export interface NhSearchQuery {
  /** Free text; supports the site's syntax: `tag:"big breasts" -tag:yaoi`. */
  query?: string;
  page?: number;
  sort?: NhSort;
  /** Included as `tag:"name"` terms. */
  includeTags?: string[];
  /** Included as `-tag:"name"` terms. */
  excludeTags?: string[];
  includeArtists?: string[];
  excludeArtists?: string[];
  includeGroups?: string[];
  excludeGroups?: string[];
  includeParodies?: string[];
  excludeParodies?: string[];
  includeCharacters?: string[];
  excludeCharacters?: string[];
  includeCategories?: string[];
  excludeCategories?: string[];
  languages?: string[];
  /** Inclusive page-count range, mapped to `pages:>=x pages:<=y`. */
  minPages?: number;
  maxPages?: number;
}

/* --------------------------------- config --------------------------------- */

/** Minimal persistence contract - satisfied by AsyncStorage and MMKV wrappers. */
export interface NhStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface NhClientConfig {
  /** Base host. Defaults to https://nhentai.net. */
  host?: string;
  /** Persistence for the taxonomy cache. */
  storage?: NhStorage;
  /** Extra headers merged into every request. */
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
  /** Tag ids hard-filtered out of results. Defaults to NH_BLOCKED_TAG_IDS. */
  blockTagIds?: number[];
  /** Hook for logging/telemetry. */
  onRequest?: (info: { url: string; ms: number; status: number }) => void;
}

export interface NhTaxonomySnapshot {
  /** Epoch ms of the last successful sync. */
  updatedAt: number;
  /** Tags grouped by taxonomy type, sorted by descending gallery count. */
  byType: Record<NhTagType, NhTag[]>;
}

/* --------------------------------- errors --------------------------------- */

export interface NhErrorShape {
  code: NhErrorCode;
  message: string;
  status?: number;
  url?: string;
}
