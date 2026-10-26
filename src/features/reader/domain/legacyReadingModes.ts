import type { ReaderReadingMode } from "@core/settings/settingsSchema";

export type { ReaderReadingMode };

export function isPagedMode(mode: ReaderReadingMode): boolean {
  return mode === "pagedVertical" || mode === "pagedHorizontal";
}

export function isHorizontalMode(mode: ReaderReadingMode): boolean {
  return mode === "scrollHorizontal" || mode === "pagedHorizontal";
}

export function isLongStripMode(mode: ReaderReadingMode): boolean {
  return (
    mode === "webtoon" ||
    mode === "continuousVertical" ||
    mode === "scrollVertical"
  );
}

export function isGapLessMode(mode: ReaderReadingMode): boolean {
  return mode === "continuousVertical";
}
