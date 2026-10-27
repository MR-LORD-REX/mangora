/**
 * browserFetch.ts
 * ---------------------------------------------------------------------------
 * Downloads assets through React Native's networking stack so requests carry
 * the Android WebView cookie jar. Cloudflare-gated hosts are registered at
 * runtime by the extension/network layer; no provider hosts are hard-coded.
 * ---------------------------------------------------------------------------
 */

import { File } from "expo-file-system";

const cookieGatedHosts = new Set<string>();

/** Marks a host (lowercase, no port) as requiring WebView cookies. */
export function registerCookieGatedHost(host: string): void {
  const value = host.trim().toLowerCase();
  if (value) cookieGatedHosts.add(value);
}

function hostOf(url: string): string | null {
  const match = /^https?:\/\/([^/?#]+)/i.exec(url);
  return match ? match[1].toLowerCase() : null;
}

/** True when `url` must be fetched with the WebView cookie jar attached. */
export function needsBrowserCookies(url: string | null | undefined): boolean {
  if (!url) return false;
  const host = hostOf(url);
  return host ? cookieGatedHosts.has(host) : false;
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
    // A 200 that is really a challenge page - never write it as an image.
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

/**
 * Native file download with a Cloudflare-safe retry. expo-file-system uses
 * OkHttp without the WebView cookie jar, so a host that just passed a
 * challenge can still return 403 here. React Native's fetch carries those
 * cookies; retry through it before surfacing the failure.
 */
export async function downloadToFile(
  url: string,
  target: File,
  headers?: Record<string, string>,
): Promise<void> {
  if (needsBrowserCookies(url)) {
    await fetchToFile(url, target, headers);
    return;
  }
  try {
    await File.downloadFileAsync(url, target, {
      headers,
      idempotent: true,
    });
    if (!target.exists || target.size <= 0) {
      throw new Error(`Empty download for ${url}`);
    }
  } catch (error) {
    console.warn(
      "[net] native download failed; retrying with WebView cookies:",
      error,
    );
    await fetchToFile(url, target, headers);
  }
}
