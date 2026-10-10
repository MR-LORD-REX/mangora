/**
 * imageHeaders.ts
 * ---------------------------------------------------------------------------
 * Per-source HTTP headers for page images and remote covers.
 *
 * Cloudflare-gated sources (Comix) must also send the exact browser
 * User-Agent that solved the challenge: `cf_clearance` is bound to it. The
 * cookie itself needs no help - React Native installs the Android WebView's
 * cookie jar into the shared OkHttp client behind both `fetch` and `<Image>`
 * (see FrescoModule / NetworkingModule), so an HttpOnly cookie like
 * `cf_clearance` is attached automatically. Only the UA + Referer land here.
 * ---------------------------------------------------------------------------
 */

import { COMIX_WEBVIEW_USER_AGENT } from "@/services/comix/comix.constants";
import { BRAINROT_WEBVIEW_USER_AGENT } from "@/services/brainrot/brainrot.constants";
import { DEFAULT_HEADERS as PHILIA_HEADERS } from "@/services/philia/philia.types";

function comixHeaders(): Record<string, string> {
  return {
    Referer: "https://comix.to/",
    "User-Agent": COMIX_WEBVIEW_USER_AGENT,
  };
}

function philiaHeaders(): Record<string, string> {
  return {
    Referer: "https://philiascans.org/",
    "User-Agent": PHILIA_HEADERS["User-Agent"],
  };
}

function manhwa18Headers(): Record<string, string> {
  return { Referer: "https://manhwa18.cc/" };
}

/**
 * BrainRotComics is Cloudflare-gated. The hidden bridge clears the challenge
 * once and stores cf_clearance (attached automatically by the shared OkHttp
 * cookie jar); images only need to send the same UA + Referer that solved it.
 */
function brainrotHeaders(): Record<string, string> {
  return {
    Referer: "https://brainrotcomics.com/",
    "User-Agent": BRAINROT_WEBVIEW_USER_AGENT,
  };
}

/** Returns the request headers needed to load page images for a source. */
export function imageHeadersForSource(
  source: string,
): Record<string, string> | undefined {
  if (source === "manhwa18") return manhwa18Headers();
  if (source === "comix") return comixHeaders();
  if (source === "brainrot") return brainrotHeaders();
  if (source === "philia") return philiaHeaders();
  return undefined;
}

/**
 * Headers for an arbitrary remote image URL, resolved by host. List and card
 * thumbnails frequently carry only a URL (no provider id), so this keeps them
 * authenticated too. Local `file://` / `content://` URIs get nothing.
 */
export function imageHeadersForUrl(
  url: string | null | undefined,
): Record<string, string> | undefined {
  if (!url) return undefined;
  const match = /^https?:\/\/([^/?#]+)/i.exec(url);
  if (!match) return undefined;
  const host = match[1].toLowerCase();
  if (
    host === "comix.to" ||
    host.endsWith(".comix.to") ||
    host === "comix.ws" ||
    host.endsWith(".comix.ws")
  ) {
    return comixHeaders();
  }
  if (host === "manhwa18.cc" || host.endsWith(".manhwa18.cc")) {
    return manhwa18Headers();
  }
  if (host === "brainrotcomics.com" || host.endsWith(".brainrotcomics.com")) {
    return brainrotHeaders();
  }
  if (host === "philiascans.org" || host.endsWith(".philiascans.org")) {
    return philiaHeaders();
  }
  return undefined;
}

/**
 * Headers for one page-image URL of a given source. Comix serves chapter
 * pages from rotating third-party CDN hosts that answer a bare request with
 * `200` but reject the same request with `403` as soon as a `Referer` is
 * attached, so the Comix Referer is only sent to comix's own hosts. Every
 * other source keeps its previous per-source headers.
 */
export function imageHeadersForPage(
  source: string,
  url: string | null | undefined,
): Record<string, string> | undefined {
  if (source === "comix") return imageHeadersForUrl(url);
  return imageHeadersForSource(source);
}

/**
 * A ready `<Image source={...}>` value with per-host headers folded in. Safe
 * for local URIs (returns `{ uri }` untouched).
 */
export function imageSourceForUrl(
  url: string | null | undefined,
): { uri: string; headers?: Record<string, string> } {
  const uri = url ?? "";
  const headers = imageHeadersForUrl(uri);
  return headers ? { uri, headers } : { uri };
}
