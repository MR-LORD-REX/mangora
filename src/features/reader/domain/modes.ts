import type { ReaderReadingMode } from "@core/settings/settingsSchema";

export type ReaderViewMode = "paged" | "strip";

export function isReaderViewMode(value: unknown): value is ReaderViewMode {
  return value === "paged" || value === "strip";
}

export function readerViewModeFor(
  readingMode: ReaderReadingMode,
): ReaderViewMode {
  return readingMode === "pagedHorizontal" ? "paged" : "strip";
}
