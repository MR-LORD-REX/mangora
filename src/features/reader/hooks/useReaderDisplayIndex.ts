/**
 * Keeps the display row and source page aligned while split/slice layout
 * changes.
 *
 * The paged slice anchor deliberately lives in `usePagedDisplayAnchor`, which
 * is declared after `scrollToDisplayItem`. Keeping each effect at its original
 * screen position preserves reader effect ordering during the screen split.
 */
import { useEffect, useMemo, useRef } from "react";

import type { ReaderDisplayItem } from "../domain/layout/readerItems";

interface ReaderDisplayIndexOptions {
  displayItems: ReaderDisplayItem[];
  pagesLength: number;
  currentPageIndex: number;
  currentDisplayIndex: number;
  lastDisplayIndexRef: { current: number };
  setCurrentDisplayIndex: (displayIndex: number) => void;
}

export interface ReaderDisplayIndexState {
  displayItemsRef: { current: ReaderDisplayItem[] };
}

export function useReaderDisplayIndex({
  displayItems,
  pagesLength,
  currentPageIndex,
  currentDisplayIndex,
  lastDisplayIndexRef,
  setCurrentDisplayIndex,
}: ReaderDisplayIndexOptions): ReaderDisplayIndexState {
  const displayItemsRef = useRef(displayItems);
  displayItemsRef.current = displayItems;

  /**
   * First display row for each source page. `usePagedDisplayAnchor` uses the
   * same rows for scrubber jumps; keeping the table here gives the screen one
   * owner for display-index alignment.
   */
  const firstDisplayIndexByPage = useMemo(() => {
    const first = new Array<number>(pagesLength).fill(0);
    for (let index = displayItems.length - 1; index >= 0; index -= 1) {
      first[displayItems[index].pageIndex] = index;
    }
    return first;
  }, [displayItems, pagesLength]);

  // A split or slice can change the row count after the first image
  // measurement. Keep the visible source page selected while preserving the
  // current slice when possible.
  useEffect(() => {
    const item = displayItems[currentDisplayIndex];
    if (item && item.pageIndex === currentPageIndex) return;
    const previous = displayItemsRef.current[currentDisplayIndex];
    const sliceIndex = previous?.slice?.index ?? 0;
    const sameSlice = displayItems.findIndex(
      (candidate) =>
        candidate.pageIndex === currentPageIndex &&
        (candidate.slice?.index ?? 0) === sliceIndex,
    );
    const next =
      sameSlice >= 0
        ? sameSlice
        : firstDisplayIndexByPage[currentPageIndex] ?? 0;
    lastDisplayIndexRef.current = next;
    setCurrentDisplayIndex(next);
  }, [
    currentDisplayIndex,
    currentPageIndex,
    displayItems,
    firstDisplayIndexByPage,
    lastDisplayIndexRef,
    setCurrentDisplayIndex,
  ]);

  return { displayItemsRef };
}
