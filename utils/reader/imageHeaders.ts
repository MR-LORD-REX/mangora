/**
 * imageHeaders.ts
 * ---------------------------------------------------------------------------
 * Per-source HTTP headers for extension page images and remote covers.
 * Hand-written provider header sets were removed; every registered extension
 * header is resolved by exact URL, then by host.
 * ---------------------------------------------------------------------------
 */

const extensionHeadersByUrl = new Map<string, Record<string, string>>();
const extensionHeadersByHost = new Map<string, Record<string, string>>();
const extensionSourceHeaders = new Map<string, Record<string, string>>();
const extensionPageUrls = new Map<string, string>();

function hostOf(url: string): string | null {
  const match = /^https?:\/\/([^/?#]+)/i.exec(url);
  return match ? match[1].toLowerCase() : null;
}

/** Registers request headers returned by an extension for one URL/host. */
export function registerExtensionHeaders(
  url: string | null | undefined,
  headers: Record<string, string> | null | undefined,
) {
  if (!url || !headers || Object.keys(headers).length === 0) return;
  extensionHeadersByUrl.set(url, headers);
  const host = hostOf(url);
  if (host) extensionHeadersByHost.set(host, headers);
}

/** Registers the default header set for an `ext:<sourceId>` provider. */
export function registerExtensionSourceHeaders(
  provider: string,
  headers: Record<string, string> | null | undefined,
) {
  if (!headers || Object.keys(headers).length === 0) return;
  extensionSourceHeaders.set(provider, headers);
}

/** Remembers the page URL (Referer) paired with an extension image URL. */
export function registerExtensionPageUrl(
  imageUrl: string | null | undefined,
  pageUrl: string | null | undefined,
) {
  if (!imageUrl || !pageUrl) return;
  extensionPageUrls.set(imageUrl, pageUrl);
}

export function extensionPageUrlFor(
  imageUrl: string | null | undefined,
): string | undefined {
  if (!imageUrl) return undefined;
  return extensionPageUrls.get(imageUrl);
}

/** Returns the request headers needed to load page images for a source. */
export function imageHeadersForSource(
  source: string,
): Record<string, string> | undefined {
  if (source.startsWith("ext:")) return extensionSourceHeaders.get(source);
  return undefined;
}

/** Headers for an arbitrary remote image URL, resolved by URL then host. */
export function imageHeadersForUrl(
  url: string | null | undefined,
): Record<string, string> | undefined {
  if (!url) return undefined;
  const exact = extensionHeadersByUrl.get(url);
  if (exact) return exact;
  const host = hostOf(url);
  return host ? extensionHeadersByHost.get(host) : undefined;
}

/** Headers for one page-image URL of a given extension source. */
export function imageHeadersForPage(
  source: string,
  url: string | null | undefined,
): Record<string, string> | undefined {
  if (!source.startsWith("ext:")) return undefined;
  const exact = imageHeadersForUrl(url);
  if (exact) return exact;
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
