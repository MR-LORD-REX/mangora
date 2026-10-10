/**
 * browserFetch.ts
 * ---------------------------------------------------------------------------
 * Downloading assets through React Native's networking stack on purpose.
 *
 * On Android, React Native installs the WebView's cookie jar
 * (android.webkit.CookieManager) into the shared OkHttp client that backs
 * both `fetch` and `<Image>` (FrescoModule / NetworkingModule). That is the
 * only way to send a Cloudflare `cf_clearance` cookie, because it is HttpOnly
 * and can never be read from JS.
 *
 * expo-file-system's downloader runs its own HTTP client with its own cookie
 * store, so cookie-gated hosts are streamed through RN's fetch and written to
 * disk here instead.
 * ---------------------------------------------------------------------------
 */

import { File } from "expo-file-system";

/** Hosts whose assets are served behind the app's browser cookie jar. */
const COOKIE_GATED_HOSTS = [
  /^comix\.to$/i,
  /\.comix\.to$/i,
  /^comix\.ws$/i,
  /\.comix\.ws$/i,
  /^brainrotcomics\.com$/i,
  /\.brainrotcomics\.com$/i,
];

function hostOf(url: string): string | null {
  const match = /^https?:\/\/([^/?#]+)/i.exec(url);
  return match ? match[1].toLowerCase() : null;
}

/** True when `url` must be fetched with the WebView cookie jar attached. */
export function needsBrowserCookies(url: string | null | undefined): boolean {
  if (!url) return false;
  const host = hostOf(url);
  return host
    ? COOKIE_GATED_HOSTS.some((pattern) => pattern.test(host))
    : false;
}

/**
 * Downloads `url` to `target` through RN's fetch, so the request carries the
 * WebView cookies and any caller-supplied headers. The payload is buffered in
 * JS; chapter pages are a few MB at most.
 */
export async function fetchToFile(
  url: string,
  target: File,
  headers?: Record<string, string>,
): Promise<void> {
  const response = await fetch(url, headers ? { headers } : undefined);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.toLowerCase().includes("text/html")) {
    // A 200 that is really a Cloudflare challenge page - never write it as an
    // image. Reaching this means the cookie/UA pair did not match the session.
    throw new Error(`HTML response for ${url} (Cloudflare challenge?)`);
  }
  const buffer = await response.arrayBuffer();
  if (!buffer.byteLength) {
    throw new Error(`Empty response body for ${url}`);
  }
  if (target.exists) target.delete();
  target.create({ intermediates: true, overwrite: true });
  target.write(new Uint8Array(buffer));
}
