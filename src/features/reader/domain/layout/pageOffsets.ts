/**
 * Prefix offsets for rendered reader rows.
 *
 * Offset tables are shared by scroll tracking, paged jumps and FlatList
 * layout. Keeping the row geometry and gap rules here prevents those three
 * consumers from drifting apart.
 */
import type {
  ReaderImageScaleType,
  ReaderReadingMode,
} from "@core/settings/settingsSchema";

import {
  isGapLessMode,
  isHorizontalMode,
  isLongStripMode,
} from "../legacyReadingModes";
import {
  pageGeometry,
  type PageDims,
  type PageGeometry,
  type ReaderPageSplitHalf,
} from "./pageGeometry";

export interface PageLayoutItem {
  url: string;
  half: ReaderPageSplitHalf | null;
  slice: { top: number; height: number } | null;
  gapAfter: boolean;
}

/** Resolves geometry for one display row, including split and slice layout. */
export function layoutForDisplayItem(
  item: Pick<PageLayoutItem, "url" | "half" | "slice">,
  mode: ReaderReadingMode,
  sidePadding: number,
  body: PageDims,
  dims: Record<string, PageDims>,
  imageScaleType: ReaderImageScaleType = "fitScreen",
  rotateWidePagesToFit = false,
): PageGeometry {
  return pageGeometry(
    item.url,
    mode,
    sidePadding,
    body,
    dims,
    imageScaleType,
    rotateWidePagesToFit,
    item.half,
    undefined,
    item.slice,
  );
}

/**
 * Builds prefix offsets for every display row plus the content extent.
 *
 * Long-strip rows add the configured webtoon gap after the row; paged rows
 * use their viewport-sized slot width. A one-pixel floor keeps offsets
 * strictly increasing for lookup and FlatList layout.
 */
export function buildPageOffsets(
  items: readonly PageLayoutItem[],
  mode: ReaderReadingMode,
  sidePadding: number,
  body: PageDims,
  dims: Record<string, PageDims>,
  imageScaleType: ReaderImageScaleType = "fitScreen",
  rotateWidePagesToFit = false,
  webtoonPageGap = 0,
): number[] {
  const horizontal = isHorizontalMode(mode);
  const rowGap =
    isLongStripMode(mode) && !isGapLessMode(mode) ? webtoonPageGap : 0;
  const offsets = new Array<number>(items.length + 1);
  offsets[0] = 0;
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    const geometry = layoutForDisplayItem(
      item,
      mode,
      sidePadding,
      body,
      dims,
      imageScaleType,
      rotateWidePagesToFit,
    );
    const gap = item.gapAfter ? rowGap : 0;
    const length = horizontal ? geometry.itemW : geometry.itemH + gap;
    offsets[index + 1] = offsets[index] + Math.max(length, 1);
  }
  return offsets;
}