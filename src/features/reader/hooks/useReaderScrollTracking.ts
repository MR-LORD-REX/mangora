/**
 * FlatList offset to display-row mapping for the reader.
 *
 * The prefix table is rebuilt only when page geometry changes, while scroll
 * events use a binary search over it. The same table feeds paged jumps and
 * FlatList's getItemLayout so all three stay in sync.
 */
import { useCallback } from "react";

import type { ReaderDisplayItem } from "../domain/layout/readerItems";
import { displayIndexForOffset } from "../domain/layout/scrollOffset";

export interface ReaderScrollTrackingOptions {
  displayItems: ReaderDisplayItem[];
  pageOffsets: number[];
  lastDisplayIndexRef: { current: number };
  lastPageIndexRef: { current: number };
  setCurrentDisplayIndex: (index: number) => void;
  setCurrentPageIndex: (index: number) => void;
}

export function useReaderScrollTracking({
  displayItems,
  pageOffsets,
  lastDisplayIndexRef,
  lastPageIndexRef,
  setCurrentDisplayIndex,
  setCurrentPageIndex,
}: ReaderScrollTrackingOptions) {
  const syncPageIndexFromOffset = useCallback(
    (offset: number) => {
      if (displayItems.length === 0) return;
      const low = displayIndexForOffset(pageOffsets, offset);
      if (lastDisplayIndexRef.current !== low) {
        lastDisplayIndexRef.current = low;
        setCurrentDisplayIndex(low);
      }
      const pageIndex = displayItems[low]?.pageIndex ?? 0;
      if (lastPageIndexRef.current !== pageIndex) {
        lastPageIndexRef.current = pageIndex;
        setCurrentPageIndex(pageIndex);
      }
    },
    [
      displayItems,
      lastDisplayIndexRef,
      lastPageIndexRef,
      pageOffsets,
      setCurrentDisplayIndex,
      setCurrentPageIndex,
    ],
  );

  const getItemLayout = useCallback(
    (
      _data: ArrayLike<ReaderDisplayItem> | null | undefined,
      index: number,
    ) => {
      const offset = pageOffsets[index] ?? 0;
      const next = pageOffsets[index + 1] ?? offset;
      return { length: Math.max(next - offset, 1), offset, index };
    },
    [pageOffsets],
  );

  return { syncPageIndexFromOffset, getItemLayout };
}
