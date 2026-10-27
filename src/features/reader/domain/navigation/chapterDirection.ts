/** Pure chapter-arrow direction rule shared by the reader screen. */

import type { ReaderPagedDirection } from "@core/settings/settingsSchema";

import type { ReaderReadingMode } from "../legacyReadingModes";

/** True when the horizontal pager is reversed, so chapter arrows flip. */
export function chapterNavigationFlipped(
  readingMode: ReaderReadingMode,
  pagedDirection: ReaderPagedDirection,
): boolean {
  return readingMode === "pagedHorizontal" && pagedDirection === "rtl";
}
