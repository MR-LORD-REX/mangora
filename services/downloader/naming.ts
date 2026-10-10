/**
 * naming.ts
 * ---------------------------------------------------------------------------
 * Filesystem-safe names for the visible download tree:
 *
 *   <root>/downloads/<provider>/<manga title>/<chapter> ~ <index> ~ <group>.cbz
 * ---------------------------------------------------------------------------
 */

/** Characters Android's external storage providers reject in a display name. */
const UNSAFE_CHARS = /[\\/:*?"<>|\u0000-\u001f]/g;

const MAX_SEGMENT_LENGTH = 80;

/** Strips path separators and control characters from one folder/file name. */
export function safeSegment(input: string, fallback = "untitled"): string {
  const cleaned = input
    .replace(UNSAFE_CHARS, " ")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+/, "")
    .replace(/[.\s]+$/, "")
    .trim();
  if (!cleaned) return fallback;
  if (cleaned.length <= MAX_SEGMENT_LENGTH) return cleaned;
  return cleaned.slice(0, MAX_SEGMENT_LENGTH).trim();
}

/** Provider folder name: the provider key used everywhere else in the app. */
export function providerSegment(provider: string): string {
  return safeSegment(provider, "unknown");
}

/** Manga folder name (kept identical to the visible manga title). */
export function mangaSegment(title: string, providerMangaId?: string): string {
  if (!providerMangaId) return safeSegment(title, "manga");
  return safeSegment(title, `manga-${shortHash(providerMangaId)}`);
}

export interface ChapterNameInput {
  chapterTitle: string;
  /** Chapter index / number; falls back to "1" for one-shots. */
  chapterIndex?: string | number | null;
  /** Scanlation group, or "none" when the upload has no group. */
  scanlationGroup?: string | null;
}

/** `<chapter> ~ <index> ~ <group|none>.cbz`, matching the app's folder spec. */
export function chapterFileName(input: ChapterNameInput): string {
  const title = safeSegment(input.chapterTitle, "chapter");
  const index =
    input.chapterIndex == null || `${input.chapterIndex}`.trim() === ""
      ? "1"
      : safeSegment(`${input.chapterIndex}`, "1");
  const group = input.scanlationGroup
    ? safeSegment(input.scanlationGroup, "none")
    : "none";
  return `${title} ~ ${index} ~ ${group}.cbz`;
}

/** Stable short hash used to keep same-titled manga apart in caches. */
export function shortHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36).padStart(6, "0").slice(0, 6);
}

/** Primary file extension for a page url, defaulting to `.jpg`. */
export function pageExtension(url: string, index: number): string {
  const match = url.split(/[?#]/)[0].match(/\.(jpe?g|png|webp|gif|avif|bmp)$/i);
  const extension = match ? match[1].toLowerCase() : "jpg";
  const normalised = extension === "jpeg" ? "jpg" : extension;
  return `${String(index + 1).padStart(4, "0")}.${normalised}`;
}

/** Mime type written into the SAF index for a `.cbz` archive. */
export const CBZ_MIME_TYPE = "application/vnd.comicbook+zip";
