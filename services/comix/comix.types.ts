/**
 * comix.types.ts
 *
 * Shared types for the Comix (comix.to) SDK.
 *
 * IMPORTANT: every type here is based on JSON actually observed on the live
 * site (server-rendered `initial-data` payloads). Nothing is guessed from
 * a decompiled extension. See the file header in comix.constants.ts for
 * what the SDK can and cannot do today.
 */

/** A genre / demographic / format / author / artist taxonomy entry as stored by the site. */
export interface ComixTaxonomyItem {
  id: number;
  /** Display name, e.g. \"Action\", \"Baek Seoha\". */
  title: string;
  /** URL slug, e.g. \"action\", \"baek-seoha\"; null when the site didn't emit one. */
  slug: string | null;
}

/** Publication status as emitted by the site (see \"statuses\" in the browse filter options). */
export type ComixStatus =
  | "releasing"
  | "finished"
  | "on_hiatus"
  | "discontinued"
  | "not_yet_released"
  | "unknown";

/** The site's four-tier content rating. */
export type ComixContentRating =
  | "safe"
  | "suggestive"
  | "erotica"
  | "pornographic";

/** Content types shown in the site's own filter UI. */
export type ComixType = "manga" | "manhwa" | "manhua" | "other";

/**
 * A manga entry exactly as the homepage SSR feed returns it. \"url\" is the
 * relative page path (e.g. \"/title/l7re-you-think-its-easy-rewriting-a-story\"),
 * which is also the identity the site uses everywhere.
 */
export interface MangaSummary {
  id: number;
  hid: string;
  title: string;
  altTitles: string[];
  url: string;
  thumbnailUrl: string | null;
  type: ComixType | null;
  status: ComixStatus;
  contentRating: ComixContentRating | null;
  year: number | null;
  latestChapter: number | null;
  hasChapters: boolean;
  followsTotal: number | null;
  ratedScore: number | null;
  ratedCount: number | null;
  /** Site-formatted label such as \"14h ago\" (no raw timestamp is served). */
  updatedLabel: string | null;
  /** Site-formatted label such as \"11mos ago\". */
  createdLabel: string | null;
}

/** A scanlation group that has chapters for a manga. */
export interface ComixScanlationGroup {
  id: number;
  name: string;
  slug: string | null;
}

/** Full manga data embedded on the manga title page. */
export interface MangaDetails extends MangaSummary {
  synopsis: string | null;
  originalLanguage: string | null;
  genres: ComixTaxonomyItem[];
  demographics: ComixTaxonomyItem[];
  formats: ComixTaxonomyItem[];
  authors: ComixTaxonomyItem[];
  artists: ComixTaxonomyItem[];
  publishers: ComixTaxonomyItem[];
  /** First chapter reader path, e.g. \"/title/<hid>-<slug>/<id>-chapter-0\". */
  firstChapterUrl: string | null;
  /** Latest chapter reader path. */
  latestChapterUrl: string | null;
  /** External metadata links (AniList / MAL / MangaUpdates / MangaDex / MangaBaka). */
  externalLinks: {
    al: string | null;
    mal: string | null;
    mu: string | null;
    md: string | null;
    mb: string | null;
  };
}

/** One server-rendered home screen section. */
export interface FeedSection {
  /** Stable key: trending | follows | hot | latest. */
  id: string;
  title: string;
  items: MangaSummary[];
  /** True when a \"load more\" exists on the site (SSR only ships page 1). */
  hasNextPage: boolean;
}

/** The parsed homepage. */
export interface HomeFeed {
  sections: FeedSection[];
  fetchedAt: number;
}

/** Everything the manga title page embeds (detail + side rails). */
export interface MangaPageData {
  details: MangaDetails;
  recommended: MangaSummary[];
  groups: ComixScanlationGroup[];
}

/** Filter vocabulary the /browse page ships before it hydrates. */
export interface BrowseMeta {
  genres: ComixTaxonomyItem[];
  demographics: ComixTaxonomyItem[];
  formats: ComixTaxonomyItem[];
  /** e.g. { value: "releasing", label: "Releasing" } */
  statuses: { value: string; label: string }[];
  types: { value: string; label: string }[];
  years: string[];
  /** Sort choices as [apiValue, label] pairs, e.g. \"score:desc\" / \"Highest rated\". */
  sorts: { value: string; label: string }[];
  perPage: number;
}

/**
 * The metadata a chapter reader page SSR's without the image API:
 * manga + chapter identity only. The page images themselves are served by
 * a WAF-signed API the SDK cannot call (see comix.constants.ts).
 */
export interface ChapterReadMeta {
  mangaId: number;
  mangaHid: string;
  chapterId: number;
  chapterNumber: number | null;
}

/** Identity parsed from a reader URL such as \"/title/<hid>-<slug>/<id>-chapter-<n>\". */
export interface ChapterRef {
  chapterId: number;
  chapterNumber: number | null;
  /** The same relative reader URL. */
  url: string;
}

/** Minimal fetch signature, matching the other provider SDKs. */
export type FetchLike = (
  input: string,
  init?: { method?: string; headers?: Record<string, string> }
) => Promise<{
  ok: boolean;
  status: number;
  url: string;
  text: () => Promise<string>;
}>;

export interface ComixClientOptions {
  baseUrl?: string;
  headers?: Record<string, string>;
  fetchImpl?: FetchLike;
  /**
   * Loads a page's raw HTML. The app passes the WebView-bridge loader so the
   * request runs inside the browser session that cleared Cloudflare's managed
   * challenge (a plain HTTP request now gets a 403 challenge page).
   */
  htmlLoader?: (url: string) => Promise<string>;
}

/** Raw shape of the \"initial-data\" JSON blob. */
export interface ComixInitialData {
  page?: string;
  queries?: Record<string, unknown>;
  read?: {
    mangaId?: number;
    mangaHid?: string;
    chapterId?: number;
    chapterNumber?: number | null;
  };
  [key: string]: unknown;
}
