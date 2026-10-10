import type { LanguageInfo } from "./mangadex.constants";

export type LocalizedString = Record<string, string>;

export type ContentRating = "safe" | "suggestive" | "erotica" | "pornographic";
export type PublicationStatus = "ongoing" | "completed" | "hiatus" | "cancelled";
export type Demographic = "shounen" | "shoujo" | "josei" | "seinen" | "none";
export type MangaState = "draft" | "submitted" | "published" | "rejected";
export type TagGroup = "format" | "genre" | "theme" | "content";
export type SortDirection = "asc" | "desc";

export type MangaRelated =
  | "monochrome"
  | "colored"
  | "preserialization"
  | "serialization"
  | "prequel"
  | "sequel"
  | "main_story"
  | "side_story"
  | "adapted_from"
  | "based_on"
  | "spin_off"
  | "doujinshi"
  | "same_franchise"
  | "shared_universe"
  | "alternate_story"
  | "alternate_version";

export interface ApiErrorDetail {
  id: string;
  status: number;
  title: string;
  detail: string | null;
  context: string | null;
}

export interface ErrorResponse {
  result: "error";
  errors: ApiErrorDetail[];
}

export interface Collection<T> {
  result: "ok";
  response: "collection";
  data: T[];
  limit: number;
  offset: number;
  total: number;
}

export interface EntityResponse<T> {
  result: "ok";
  response: "entity";
  data: T;
}

export interface RawTag {
  id: string;
  type: "tag";
  attributes: {
    name: LocalizedString;
    description: LocalizedString;
    group: TagGroup;
    version: number;
  };
  relationships: Relationship[];
}

export interface RawCoverAttributes {
  description: string;
  volume: string | null;
  fileName: string;
  locale: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface RawAuthorAttributes {
  name: string;
  imageUrl: string | null;
  biography: LocalizedString;
  twitter: string | null;
  pixiv: string | null;
  melonBook: string | null;
  fanBox: string | null;
  booth: string | null;
  namicomi: string | null;
  nicoVideo: string | null;
  skeb: string | null;
  fantia: string | null;
  tumblr: string | null;
  youtube: string | null;
  weibo: string | null;
  naver: string | null;
  website: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface RawGroupAttributes {
  name: string;
  altNames: LocalizedString[];
  locked: boolean;
  website: string | null;
  ircServer: string | null;
  ircChannel: string | null;
  discord: string | null;
  contactEmail: string | null;
  description: string | null;
  twitter: string | null;
  mangaUpdates: string | null;
  focusedLanguages: string[] | null;
  official: boolean;
  verified: boolean;
  inactive: boolean;
  exLicensed: boolean;
  publishDelay: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface RawUserAttributes {
  username: string;
  roles: string[];
  avatarFileName: string | null;
  bannerFileName: string | null;
  version: number;
}

export interface RawMangaAttributes {
  title: LocalizedString;
  altTitles: LocalizedString[];
  description: LocalizedString;
  isLocked: boolean;
  links: Record<string, string> | null;
  officialLinks: Record<string, string> | null;
  originalLanguage: string;
  lastVolume: string | null;
  lastChapter: string | null;
  publicationDemographic: Demographic | null;
  status: PublicationStatus;
  year: number | null;
  contentRating: ContentRating;
  tags: RawTag[];
  state: MangaState;
  chapterNumbersResetOnNewVolume: boolean;
  createdAt: string;
  updatedAt: string;
  version: number;
  availableTranslatedLanguages: string[];
  latestUploadedChapter: string | null;
}

export interface RawChapterAttributes {
  volume: string | null;
  chapter: string | null;
  title: string | null;
  translatedLanguage: string;
  externalUrl: string | null;
  isUnavailable: boolean;
  publishAt: string;
  readableAt: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  pages: number;
}

export interface RawListAttributes {
  name: string;
  visibility: "public" | "private";
  version: number;
}

/** Attributes present on a relationship only when the type was passed in `includes[]`. */
export interface RelationshipAttributeMap {
  cover_art: RawCoverAttributes;
  author: RawAuthorAttributes;
  artist: RawAuthorAttributes;
  scanlation_group: RawGroupAttributes;
  user: RawUserAttributes;
  creator: RawUserAttributes;
  manga: RawMangaAttributes;
}

export type RelationshipType = keyof RelationshipAttributeMap | "chapter" | "custom_list" | "tag";

export interface Relationship<T extends string = string> {
  id: string;
  type: T;
  related?: MangaRelated;
  attributes?: T extends keyof RelationshipAttributeMap
    ? RelationshipAttributeMap[T]
    : Record<string, unknown>;
}

export interface RawManga {
  id: string;
  type: "manga";
  attributes: RawMangaAttributes;
  relationships: Relationship[];
}

export interface RawChapter {
  id: string;
  type: "chapter";
  attributes: RawChapterAttributes;
  relationships: Relationship[];
}

export interface RawCover {
  id: string;
  type: "cover_art";
  attributes: RawCoverAttributes;
  relationships: Relationship[];
}

export interface RawAuthor {
  id: string;
  type: "author" | "artist";
  attributes: RawAuthorAttributes;
  relationships: Relationship[];
}

export interface RawGroup {
  id: string;
  type: "scanlation_group";
  attributes: RawGroupAttributes;
  relationships: Relationship[];
}

export interface RawList {
  id: string;
  type: "custom_list";
  attributes: RawListAttributes;
  relationships: Relationship[];
}

export interface RawAggregateChapter {
  chapter: string;
  id: string;
  isUnavailable: boolean;
  others: string[];
  count: number;
}

export interface RawAggregateVolume {
  volume: string;
  count: number;
  chapters: Record<string, RawAggregateChapter>;
}

export interface RawAggregate {
  result: "ok";
  /** MangaDex returns `[]` rather than `{}` when nothing matches the filter. */
  volumes: Record<string, RawAggregateVolume> | never[];
}

export interface RawAtHome {
  result: "ok";
  baseUrl: string;
  chapter: {
    hash: string;
    data: string[];
    dataSaver: string[];
  };
}

export interface RawStatistics {
  comments: { threadId: number; repliesCount: number } | null;
  follows: number;
  rating: {
    average: number | null;
    bayesian: number;
    /** Only returned by the single-manga endpoint, not the batch one. */
    distribution?: Record<string, number>;
  };
  unavailableChaptersCount: number;
}

/* normalized shapes ------------------------------------------------- */

export interface Person {
  id: string;
  name: string;
}

export interface Tag {
  id: string;
  name: string;
  group: TagGroup;
}

export type CoverSize = "original" | "medium" | "small";

export interface CoverImage {
  id: string;
  fileName: string;
  volume: string | null;
  locale: LanguageInfo | null;
  description: string;
  /** Full-resolution image. */
  url: string;
  /** 512px-wide JPEG derivative. */
  thumb512: string;
  /** 256px-wide JPEG derivative. */
  thumb256: string;
}

export interface MangaLink {
  key: string;
  name: string;
  value: string;
  url: string | null;
}

export interface Manga {
  id: string;
  /** Best available title: preferred language, then romanised, then anything. */
  title: string;
  /** The English title when one exists, checking altTitles too. Often null. */
  englishTitle: string | null;
  /** The title in the original script, e.g. 日本語. */
  nativeTitle: string | null;
  altTitles: string[];
  description: string;
  authors: Person[];
  artists: Person[];
  tags: Tag[];
  status: PublicationStatus;
  demographic: Demographic | null;
  contentRating: ContentRating;
  state: MangaState;
  year: number | null;
  isLocked: boolean;
  chapterNumbersResetOnNewVolume: boolean;
  lastVolume: string | null;
  lastChapter: string | null;
  latestUploadedChapterId: string | null;
  originalLanguage: LanguageInfo;
  availableLanguages: LanguageInfo[];
  links: MangaLink[];
  cover: CoverImage | null;
  related: Array<{ id: string; relation: MangaRelated }>;
  createdAt: string;
  updatedAt: string;
  /** Non-enumerable: hidden from console.log, spread and JSON.stringify. */
  raw: RawManga;
}

export interface ChapterAlternate {
  id: string;
  group: string | null;
  pages: number;
  readableAt: string;
}

export interface Chapter {
  id: string;
  chapter: string | null;
  volume: string | null;
  title: string;
  language: LanguageInfo;
  pages: number;
  group: string | null;
  groups: Person[];
  uploader: Person | null;
  mangaId: string | null;
  externalUrl: string | null;
  isUnavailable: boolean;
  /** Has pages hosted on MangaDex — false for external or empty chapters. */
  readable: boolean;
  publishAt: string;
  readableAt: string;
  createdAt: string;
  updatedAt: string;
  /** Same chapter number from other scanlation groups, when deduped. */
  alternates: ChapterAlternate[];
  /** Non-enumerable. */
  raw: RawChapter;
}

export interface AggregateChapter {
  chapter: string;
  id: string;
  otherIds: string[];
  count: number;
  isUnavailable: boolean;
}

export interface Volume {
  /** "none" for chapters not assigned to a volume. */
  volume: string;
  label: string;
  count: number;
  chapters: AggregateChapter[];
}

export interface ChapterPages {
  chapterId: string;
  hash: string;
  host: string;
  dataSaver: boolean;
  pages: string[];
}

export interface MangaList {
  id: string;
  name: string;
  visibility: "public" | "private";
  mangaIds: string[];
  raw: RawList;
}

export interface Statistics {
  mangaId: string;
  follows: number;
  average: number | null;
  bayesian: number;
  distribution: Record<string, number> | null;
  commentCount: number;
  unavailableChaptersCount: number;
}

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  nextOffset: number | null;
}

/* request params ---------------------------------------------------- */

export type MangaOrderKey =
  | "title"
  | "year"
  | "createdAt"
  | "updatedAt"
  | "latestUploadedChapter"
  | "followedCount"
  | "relevance"
  | "rating";

export type ChapterOrderKey =
  | "createdAt"
  | "updatedAt"
  | "publishAt"
  | "readableAt"
  | "volume"
  | "chapter";

export type CoverOrderKey = "createdAt" | "updatedAt" | "volume";

export type MangaOrder = Partial<Record<MangaOrderKey, SortDirection>>;
export type ChapterOrder = Partial<Record<ChapterOrderKey, SortDirection>>;
export type CoverOrder = Partial<Record<CoverOrderKey, SortDirection>>;

export type Includes =
  | "cover_art"
  | "author"
  | "artist"
  | "creator"
  | "manga"
  | "scanlation_group"
  | "user";

/** A Date, or `YYYY-MM-DDTHH:MM:SS` — the SDK strips milliseconds and `Z`, which the API rejects. */
export type ApiDate = Date | string;

export interface SearchParams {
  title?: string;
  /** Tag names ("Action") or UUIDs — names are resolved for you. */
  includedTags?: string[];
  includedTagsMode?: "AND" | "OR";
  excludedTags?: string[];
  excludedTagsMode?: "AND" | "OR";
  authors?: string[];
  artists?: string[];
  authorOrArtist?: string;
  year?: number;
  status?: PublicationStatus[];
  originalLanguage?: string[];
  excludedOriginalLanguage?: string[];
  availableTranslatedLanguage?: string[];
  publicationDemographic?: Demographic[];
  contentRating?: ContentRating[];
  ids?: string[];
  group?: string;
  hasAvailableChapters?: boolean;
  createdAtSince?: ApiDate;
  updatedAtSince?: ApiDate;
  order?: MangaOrder;
  includes?: Includes[];
  limit?: number;
  offset?: number;
}

export interface GetChaptersOptions {
  language?: string | string[];
  order?: SortDirection;
  groups?: string[];
  excludedGroups?: string[];
  excludedUploaders?: string[];
  contentRating?: ContentRating[];
  /** Keep external-only, zero-page and unavailable chapters. Default false. */
  includeUnreadable?: boolean;
  /** Include chapters whose publishAt is in the future. Default false. */
  includeFuture?: boolean;
  /** Collapse duplicate chapter numbers into one entry with `alternates`. Default true. */
  dedupe?: boolean;
  /** Stop after this many chapters. */
  maxChapters?: number;
  /** Per-request page size, 1-500. Default 500. */
  pageSize?: number;
  onProgress?: (fetched: number, total: number) => void;
  signal?: AbortSignal;
}

export interface ListChaptersParams {
  manga?: string;
  ids?: string[];
  title?: string;
  groups?: string[];
  uploader?: string;
  chapter?: string;
  volume?: string[];
  translatedLanguage?: string[];
  originalLanguage?: string[];
  excludedOriginalLanguage?: string[];
  excludedGroups?: string[];
  excludedUploaders?: string[];
  contentRating?: ContentRating[];
  includeExternalUrl?: boolean;
  includeEmptyPages?: boolean;
  includeFutureUpdates?: boolean;
  includeFuturePublishAt?: boolean;
  includeUnavailable?: boolean;
  createdAtSince?: ApiDate;
  updatedAtSince?: ApiDate;
  publishAtSince?: ApiDate;
  order?: ChapterOrder;
  includes?: Includes[];
  limit?: number;
  offset?: number;
}

export interface CoverParams {
  manga?: string[];
  ids?: string[];
  uploaders?: string[];
  locales?: string[];
  order?: CoverOrder;
  includes?: Includes[];
  limit?: number;
  offset?: number;
}

export interface PrefetchOptions {
  dataSaver?: boolean;
  concurrency?: number;
  /** Download bodies to warm the CDN cache. Default true. */
  download?: boolean;
  onProgress?: (done: number, total: number) => void;
  signal?: AbortSignal;
}

export interface PrefetchResult {
  chapterId: string;
  total: number;
  ok: number;
  failed: number;
  bytes: number;
  pages: Array<{ url: string; status: number; ok: boolean; bytes: number }>;
}

export interface MangadexOptions {
  baseUrl?: string;
  /** Per-request timeout in ms. Default 15000. */
  timeout?: number;
  /** Retries on 429/5xx/network. Default 2. */
  retries?: number;
  cache?: boolean;
  cacheMaxEntries?: number;
  requestsPerSecond?: number;
  maxConcurrent?: number;
  /** Host for cover images. Both work; `uploads` is canonical. */
  coverHost?: "uploads" | "site";
  /**
   * Host for chapter pages. `uploads` is the stable CDN; `athome` uses the
   * per-request baseUrl from /at-home, which is a Cloudflare cache that is
   * occasionally unreachable. Default "uploads".
   */
  imageHost?: "uploads" | "athome";
  /** Default contentRating filter for browse endpoints. */
  contentRating?: ContentRating[];
  /** Preferred language for titles and descriptions. Default "en". */
  language?: string;
  userAgent?: string;
}
