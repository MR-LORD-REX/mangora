/**
 * chapterLabel.ts
 * ---------------------------------------------------------------------------
 * Reader title helpers.
 * ---------------------------------------------------------------------------
 */

/** Derives "Chapter N" from a route title when no explicit chapter title exists. */
export function chapterNumberLabel(rawTitle: string, chapterId: string): string {
  if (!rawTitle || rawTitle === chapterId) return "Chapter 1";
  const match = rawTitle.match(/chapter\s+([0-9]+(?:\.[0-9]+)?)/i);
  if (match) return "Chapter " + match[1];
  return rawTitle;
}

/**
 * Best-effort chapter label for an in-reader next/previous jump when the
 * catalog has no row for the target chapter yet. URL-based providers usually
 * carry the chapter number in the path, so pull it out; otherwise use the
 * last path segment.
 */
export function chapterTitleFromId(rawId: string): string {
  let value = rawId;
  try {
    value = decodeURIComponent(rawId);
  } catch {
    value = rawId;
  }
  const numbered = value.match(/chapter[-_/ ]?([0-9]+(?:\.[0-9]+)?)/i);
  if (numbered) return `Chapter ${numbered[1]}`;
  const segment = value.split(/[?#]/)[0].split("/").filter(Boolean).pop();
  if (segment && segment.length <= 24) return segment;
  return "Chapter";
}