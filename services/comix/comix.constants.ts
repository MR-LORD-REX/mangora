/**
 * comix.constants.ts
 *
 * Static configuration for the Comix (comix.to) source.
 *
 * REALITY CHECK ? read before touching the other files:
 *
 * Comix is a React (Next-style) SPA. It server-renders exactly four kinds
 * of page, each embedding its data as JSON inside
 * `<script id="initial-data">`:
 *
 *   1. Homepage (\"/\")            ? real SSR feeds (trending / follows /
 *                                      hot updates / new titles) and the
 *                                      first page of each.
 *   2. Browse (\"/browse\")         ? only the FILTER VOCABULARY and an
 *                                      empty shell; results load client-side.
 *   3. Manga title page (\"/title/<hid>-<slug>\") ? full manga detail,
 *                                      scanlation groups and recommendations.
 *                                      NO chapter list is embedded.
 *   4. Chapter reader page           ? only \"read\" metadata (manga +
 *                                      chapter identity). NO page images.
 *
 * Everything else lives behind \"/api/v1\" (list results, search, chapter
 * lists, page-image data). That API requires a per-session WAF token that
 * the site's obfuscated \"secure-*.js\" bundle generates inside a real
 * browser. Plain HTTP clients (this SDK included) get
 * `403 {"message":"Missing token."}` from the server ? even with a real
 * browser User-Agent and Referer. There is no sitemap and no public API
 * mirror; the legacy comick.io API is Cloudflare-challenged as well.
 *
 * What this SDK therefore supports, honestly:
 *   - home feed sections           via homepage SSR
 *   - manga details + recommended  via title-page SSR
 *   - chapter identity             via reader-page SSR
 *   - browse filter vocabulary     via /browse SSR
 *
 * What it deliberately does NOT fake:
 *   - search / filtered listings   (WAF-gated API)
 *   - chapter lists                (WAF-gated API)
 *   - page image URLs              (WAF-gated API)
 *
 * The UI integrates Comix by opening the real site in an in-app WebView
 * (app/(comix)/web.tsx) for search/browse/reading; a real browser engine
 * runs the site's own token logic and everything works.
 */

export const BASE_URL = "https://comix.to";
/** Mirror domain serving byte-identical markup (same API gating). */
export const MIRROR_URL = "https://comix.ws";

export const SOURCE_META = {
  id: "comix",
  name: "Comix",
  lang: "en",
} as const;

export const ENDPOINTS = {
  HOME: "/",
  /** Powers the site's search + filtered browse UI (client-side only). */
  BROWSE: "/browse",
  /** Prefix of manga and chapter pages. */
  TITLE: "/title",
} as const;

/** Id of the JSON script tag on every SSR page. */
export const INITIAL_DATA_SELECTOR = "script#initial-data";

/** Poster qualities the site emits; medium (~280px) is the sensible default. */
export const POSTER_QUALITIES = ["medium", "large"] as const;
export type PosterQuality = (typeof POSTER_QUALITIES)[number];
export const DEFAULT_POSTER_QUALITY: PosterQuality = "medium";

/** The site's own content-rating taxonomy (used in SSR query params). */
export const CONTENT_RATINGS = [
  "safe",
  "suggestive",
  "erotica",
  "pornographic",
] as const;

export const DEFAULT_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Referer: BASE_URL + "/",
  Accept: "text/html,application/xhtml+xml",
};

/**
 * User agent for every Comix WebView (the hidden bridge host and the in-app
 * browser). Both must send the SAME value: Cloudflare binds its `cf_clearance`
 * cookie to the user agent that solved the challenge, so a mismatch forces a
 * fresh challenge. Android WebView's default user agent carries a "; wv"
 * marker that the managed challenge routinely refuses.
 */
export const COMIX_WEBVIEW_USER_AGENT =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";

/**
 * Section definitions for the homepage SSR feeds. The site renders these in
 * a fixed order; we keep the same order so the UI feels native.
 */
export const HOME_SECTIONS = [
  { id: "trending", title: "Trending", apiType: "trending", kind: "top" },
  { id: "follows", title: "Most Followed", apiType: "follows", kind: "top" },
  { id: "hot", title: "Hot Updates", kind: "list", scope: "hot" },
  { id: "latest", title: "New Titles", kind: "list", scope: "latest" },
] as const;

/** The only query keys the site uses for its home feeds (defensive copy). */
export const HOME_TOP_TYPES = ["trending", "follows"] as const;
