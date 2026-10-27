import type { ReaderReadingMode } from "@core/settings/settingsSchema";

export type { ReaderReadingMode };

export function isPagedMode(mode: ReaderReadingMode): boolean {
  return mode === "pagedHorizontal";
}

export function isHorizontalMode(mode: ReaderReadingMode): boolean {
  return mode === "pagedHorizontal";
}

export function isLongStripMode(mode: ReaderReadingMode): boolean {
  return mode === "webtoon" || mode === "continuousVertical";
}

export function isGapLessMode(mode: ReaderReadingMode): boolean {
  return mode === "continuousVertical";
}
