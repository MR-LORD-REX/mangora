/**
 * readerItems.ts
 * ---------------------------------------------------------------------------
 * Builds the rows rendered by the reader FlatList. A normal source page is one
 * row; with Split wide pages enabled, a measured landscape page becomes two
 * rows (one per half). OCR, translation state and progress stay keyed by the
 * original source URL, so splitting is purely a presentation concern.
 * ---------------------------------------------------------------------------
 */

import type { ReaderPagedDirection } from "@/components/reader/readerChrome";

import type { PageDims, ReaderPageSplitHalf } from "./pageGeometry";

export interface ReaderDisplayItem {
  key: string;
  url: string;
  /** Index in the source `pages` array (progress/history stay per page). */
  pageIndex: number;
  half: ReaderPageSplitHalf | null;
  /** Whether the webtoon gap belongs after this row. */
  gapAfter: boolean;
}

export interface ReaderItemOptions {
  splitWidePages: boolean;
  rotateWidePagesToFit: boolean;
  pagedDirection: ReaderPagedDirection;
}

/**
 * Mihon treats any landscape image as a two-page spread. The reading
 * direction decides which half comes first.
 */
export function splitOrderFor(
  direction: ReaderPagedDirection,
): ReaderPageSplitHalf[] {
  return direction === "rtl" ? ["right", "left"] : ["left", "right"];
}

export function isWidePage(dims: PageDims | undefined): boolean {
  return Boolean(dims && dims.width > dims.height);
}

export function buildReaderDisplayItems(
  pages: string[],
  pageDims: Record<string, PageDims>,
  options: ReaderItemOptions,
): ReaderDisplayItem[] {
  const splitEnabled =
    options.splitWidePages && !options.rotateWidePagesToFit;
  if (!splitEnabled) {
    return pages.map((url, pageIndex) => ({
      key: `${pageIndex}:full:${url}`,
      url,
      pageIndex,
      half: null,
      gapAfter: true,
    }));
  }

  const order = splitOrderFor(options.pagedDirection);
  return pages.flatMap<ReaderDisplayItem>((url, pageIndex) => {
    if (!isWidePage(pageDims[url])) {
      return [
        {
          key: `${pageIndex}:full:${url}`,
          url,
          pageIndex,
          half: null,
          gapAfter: true,
        },
      ];
    }
    return order.map((half, halfIndex) => ({
      key: `${pageIndex}:${half}:${url}`,
      url,
      pageIndex,
      half,
      // The two halves are one logical page, so only the second half gets the
      // webtoon spacer.
      gapAfter: halfIndex === order.length - 1,
    }));
  });
}
