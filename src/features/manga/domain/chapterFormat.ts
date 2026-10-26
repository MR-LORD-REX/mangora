const DAY_MS = 86_400_000;

function startOfDay(value: Date): number {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
}

/**
 * Formats a chapter/gallery date.
 * - Today  -> "Today"
 * - Yesterday -> "Yesterday"
 * - anything else -> "7 Feb 2026" style absolute date.
 */
export function formatChapterDate(
  value: number | string | null | undefined,
): string | null {
  if (value === null || value === undefined || value === "") return null;
  const date = typeof value === "string" ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return typeof value === "string" ? value : null;

  const todayStart = startOfDay(new Date());
  const valueStart = startOfDay(date);
  const diffDays = Math.round((todayStart - valueStart) / DAY_MS);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";

  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Parses the first decimal number found in a string, or null. */
export function parseDecimal(value: string | null | undefined): number | null {
  if (!value) return null;
  const match = value.match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Lowercases and normalizes a string for partial matching. */
export function normalizeForMatch(value: string): string {
  return value.toLocaleLowerCase().replace(/\s+/g, " ").trim();
}