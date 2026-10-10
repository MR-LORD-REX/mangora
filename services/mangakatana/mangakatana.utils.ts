/** Encode a relative manga/chapter path for expo-router params. */
export function encodePath(url: string): string {
  return encodeURIComponent(url);
}

/** Decode a route param back to a relative path. */
export function decodePath(slug: string): string {
  return decodeURIComponent(slug);
}

/** Normalize expo-router params that may be string or string[]. */
export function paramString(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export function formatUploadDate(epochMs: number | null): string {
  if (epochMs === null) return "";
  return new Date(epochMs).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
