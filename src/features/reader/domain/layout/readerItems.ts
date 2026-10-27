/**
 * readerItems.ts
 * ---------------------------------------------------------------------------
 * Builds the rows rendered by the reader FlatList. A normal source page is one
 * row; with Split wide pages enabled, a measured landscape page becomes two
 * rows (one per half). OCR, translation state and progress stay keyed by the
 * original source URL, so splitting is purely a presentation concern.
 * ---------------------------------------------------------------------------
 */

import type {
  ReaderImageScaleType,
  ReaderPagedDirection,
} from "@core/settings/settingsSchema";

import {
  pageGeometry,
  type PageDims,
  type ReaderPageSplitHalf,
} from "./pageGeometry";
import {
  pagedSlicesFor,
  type PagedSourceSlice,
} from "./pagedSlices";

export interface ReaderDisplayItem {
  key: string;
  url: string;
  /** Index in the source `pages` array (progress/history stay per page). */
  pageIndex: number;
  half: ReaderPageSplitHalf | null;
  /** Tall-page presentation slice; null means the whole page. */
  slice: PagedSourceSlice | null;
  /** Whether the webtoon gap belongs after this row. */
  gapAfter: boolean;
}

export interface ReaderItemOptions {
  splitWidePages: boolean;
  rotateWidePagesToFit: boolean;
  pagedDirection: ReaderPagedDirection;
  /** Enables tall-page slices in paged mode. */
  sliceTallPages?: boolean;
  viewportHeight?: number;
  imageScaleType?: ReaderImageScaleType;
  sidePadding?: number;
  body?: PageDims;
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
  const sliceTallPages =
    Boolean(options.sliceTallPages) &&
    (options.viewportHeight ?? 0) > 0 &&
    Boolean(options.body);
  const buildItem = (url: string, pageIndex: number): ReaderDisplayItem[] => {
    const dims = pageDims[url];
    // Slicing before dimensions arrive would create a placeholder row and then
    // reflow the pager after decode. Wait for measured portrait pages; wide
    // pages go through the split branch below.
    if (!sliceTallPages || !dims || dims.width >= dims.height) {
      return [
        {
          key: `${pageIndex}:full:${url}`,
          url,
          pageIndex,
          half: null,
          slice: null,
          gapAfter: true,
        },
      ];
    }
    const geometry = pageGeometry(
      url,
      "pagedHorizontal",
      options.sidePadding ?? 0,
      options.body!,
      pageDims,
      options.imageScaleType,
      options.rotateWidePagesToFit,
      null,
    );
    const slices = pagedSlicesFor(
      {
        width: geometry.imgW,
        height: geometry.overlayH,
      },
      options.viewportHeight!,
    );
    if (slices.length <= 1) {
      return [
        {
          key: `${pageIndex}:full:${url}`,
          url,
          pageIndex,
          half: null,
          slice: null,
          gapAfter: true,
        },
      ];
    }
    return slices.map((slice, index) => ({
      key: `${pageIndex}:slice:${index}:${url}`,
      url,
      pageIndex,
      half: null,
      slice,
      gapAfter: index === slices.length - 1,
    }));
  };
  if (!splitEnabled) {
    return pages.flatMap(buildItem);
  }

  const order = splitOrderFor(options.pagedDirection);
  return pages.flatMap<ReaderDisplayItem>((url, pageIndex) => {
    if (!isWidePage(pageDims[url])) {
      return buildItem(url, pageIndex);
    }
    return order.map((half, halfIndex) => ({
      key: `${pageIndex}:${half}:${url}`,
      url,
      pageIndex,
      half,
      slice: null,
      // The two halves are one logical page, so only the second half gets the
      // webtoon spacer.
      gapAfter: halfIndex === order.length - 1,
    }));
  });
}
