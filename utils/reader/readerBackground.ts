/**
 * readerBackground.ts
 * ---------------------------------------------------------------------------
 * Resolves the reader's background colour preference to a concrete hex value.
 * ---------------------------------------------------------------------------
 */

import type { ReaderChromeSettings } from "@/components/reader/readerChrome";

/** Reader background colour for the given preference. */
export function readerBackgroundColor(
  color: ReaderChromeSettings["backgroundColor"],
): string {
  switch (color) {
    case "gray":
      return "#3a3f47";
    case "white":
      return "#ffffff";
    case "auto":
    case "black":
    default:
      return "#000000";
  }
}
