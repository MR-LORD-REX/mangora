/**
 * Keeps a paged list anchored to the same logical page and slice when image
 * measurement inserts split rows or slices.
 */
import { useCallback, useEffect, useRef } from "react";

import type { ReaderDisplayItem } from "../domain/layout/readerItems";

interface PagedDisplayAnchorOptions {
  displayItems: ReaderDisplayItem[];
  pagesLength: number;
  currentPageIndex: number;
  currentDisplayIndex: number;
  pagedMode: boolean;
  lastDisplayIndexRef: { current: number };
  setCurrentPageIndex: (pageIndex: number) => void;
  setCurrentDisplayIndex: (displayIndex: number) => void;
  scrollToDisplayItem: (index: number, animated?: boolean) => void;
  scrollToReaderIndex: (index: number, animated?: boolean) => void;
}

export interface PagedDisplayAnchorState {
  scrollToPage: (index: number) => void;
}

export function usePagedDisplayAnchor({
  displayItems,
  pagesLength,
  currentPageIndex,
  currentDisplayIndex,
  pagedMode,
  lastDisplayIndexRef,
  setCurrentPageIndex,
  setCurrentDisplayIndex,
  scrollToDisplayItem,
  scrollToReaderIndex,
}: PagedDisplayAnchorOptions): PagedDisplayAnchorState {
  const previousDisplayItemsRef = useRef(displayItems);

  // Image measurements can turn a page into two halves or several slices after
  // it has already been displayed. Keep the pager on the same logical page and
  // slice instead of letting inserted rows shift the visible row under the
  // user.
  useEffect(() => {
    const previous = previousDisplayItemsRef.current;
    if (previous === displayItems) return;
    previousDisplayItemsRef.current = displayItems;
    if (!pagedMode || displayItems.length === 0) return;

    const visibleItem =
      previous[lastDisplayIndexRef.current] ?? previous[currentDisplayIndex];
    const visiblePage = visibleItem?.pageIndex ?? currentPageIndex;
    const visibleSlice = visibleItem?.slice?.index ?? 0;
    const sameSlice = displayItems.findIndex(
      (item) =>
        item.pageIndex === visiblePage &&
        (item.slice?.index ?? 0) === visibleSlice,
    );
    const target =
      sameSlice >= 0
        ? sameSlice
        : displayItems.findIndex((item) => item.pageIndex === visiblePage);
    if (target < 0) return;
    lastDisplayIndexRef.current = target;
    setCurrentDisplayIndex(target);
    setCurrentPageIndex(visiblePage);
    requestAnimationFrame(() => {
      scrollToReaderIndex(target, false);
    });
  }, [
    currentDisplayIndex,
    currentPageIndex,
    displayItems,
    lastDisplayIndexRef,
    pagedMode,
    scrollToReaderIndex,
    setCurrentDisplayIndex,
    setCurrentPageIndex,
  ]);

  const scrollToPage = useCallback(
    (index: number) => {
      if (pagesLength === 0) return;
      const target = Math.min(Math.max(index, 0), pagesLength - 1);
      const firstDisplayIndex = displayItems.findIndex(
        (item) => item.pageIndex === target,
      );
      scrollToDisplayItem(firstDisplayIndex >= 0 ? firstDisplayIndex : 0);
    },
    [displayItems, pagesLength, scrollToDisplayItem],
  );

  return { scrollToPage };
}
