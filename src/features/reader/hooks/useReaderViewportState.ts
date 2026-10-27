/**
 * Reader viewport state and layout.
 *
 * Owns body sizing, the mounted-image window, natural page dimensions, display
 * rows, prefix offsets and display/page index synchronization. ReaderScreen
 * consumes this one snapshot instead of coordinating those concerns itself.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ViewToken } from "react-native";

import { imageHeadersForPage } from "@shared/net/imageHeaders";

import type { ReaderChromeSettings } from "../components/panels/readerChrome";
import { buildPageOffsets } from "../domain/layout/pageOffsets";
import {
  buildReaderDisplayItems,
  type ReaderDisplayItem,
} from "../domain/layout/readerItems";
import { isPagedMode } from "../domain/legacyReadingModes";
import { useReaderDisplayIndex } from "./useReaderDisplayIndex";
import { useReaderPageDims } from "./useReaderPageDims";
import { useReaderScrollTracking } from "./useReaderScrollTracking";

export interface ReaderViewportStateOptions {
  pages: string[];
  source: string;
  chrome: ReaderChromeSettings;
  currentPageIndex: number;
  setCurrentPageIndex: (pageIndex: number) => void;
  initialSize: { width: number; height: number };
}

export function useReaderViewportState({
  pages,
  source,
  chrome,
  currentPageIndex,
  setCurrentPageIndex,
  initialSize,
}: ReaderViewportStateOptions) {
  const lastPageIndexRef = useRef(0);
  const lastDisplayIndexRef = useRef(0);
  const [currentDisplayIndex, setCurrentDisplayIndex] = useState(0);
  const [imageWindow, setImageWindow] = useState<Set<number>>(
    () => new Set([0, 1, 2, 3, 4]),
  );
  const [bodySize, setBodySize] = useState(initialSize);
  const pagedModeRef = useRef(false);
  const pagedMode = isPagedMode(chrome.readingMode);
  pagedModeRef.current = pagedMode;

  const { pageDims, rememberPageDims } = useReaderPageDims({
    pages,
    source,
    readingMode: chrome.readingMode,
    currentPageIndex,
    imageWindow,
  });

  // Resolve headers once per page list. Passing a freshly looked-up object on
  // every render would retrigger SubsampledImage's download effect when
  // unrelated chrome settings change.
  const pageImageHeaders = useMemo(() => {
    const byUrl = new Map<string, Record<string, string> | undefined>();
    for (const url of pages) {
      byUrl.set(url, imageHeadersForPage(source, url));
    }
    return byUrl;
  }, [pages, source]);

  const displayItems = useMemo(
    () =>
      buildReaderDisplayItems(pages, pageDims, {
        splitWidePages: chrome.splitWidePages,
        rotateWidePagesToFit: chrome.rotateWidePagesToFit,
        pagedDirection: chrome.pagedDirection,
        sliceTallPages: isPagedMode(chrome.readingMode),
        viewportHeight: bodySize.height,
        imageScaleType: chrome.imageScaleType,
        sidePadding: chrome.sidePadding,
        body: bodySize,
      }),
    [
      bodySize,
      chrome.pagedDirection,
      chrome.imageScaleType,
      chrome.readingMode,
      chrome.rotateWidePagesToFit,
      chrome.sidePadding,
      chrome.splitWidePages,
      pageDims,
      pages,
    ],
  );

  const { displayItemsRef } = useReaderDisplayIndex({
    displayItems,
    pagesLength: pages.length,
    currentPageIndex,
    currentDisplayIndex,
    lastDisplayIndexRef,
    setCurrentDisplayIndex,
  });

  /**
   * Prefix offsets for the current layout. Scroll tracking, page jumps and
   * FlatList layout all read the same table.
   */
  const pageOffsets = useMemo(
    () =>
      buildPageOffsets(
        displayItems,
        chrome.readingMode,
        chrome.sidePadding,
        bodySize,
        pageDims,
        chrome.imageScaleType,
        chrome.rotateWidePagesToFit,
        chrome.webtoonPageGap,
      ),
    [
      bodySize,
      chrome.imageScaleType,
      chrome.readingMode,
      chrome.rotateWidePagesToFit,
      chrome.sidePadding,
      chrome.webtoonPageGap,
      displayItems,
      pageDims,
    ],
  );

  const { syncPageIndexFromOffset: syncPagedOffset, getItemLayout } =
    useReaderScrollTracking({
      displayItems,
      pageOffsets,
      lastDisplayIndexRef,
      lastPageIndexRef,
      setCurrentDisplayIndex,
      setCurrentPageIndex,
    });

  const resetViewport = useCallback(() => {
    lastPageIndexRef.current = 0;
    lastDisplayIndexRef.current = 0;
    setCurrentDisplayIndex(0);
    setImageWindow(new Set([0, 1, 2, 3, 4]));
  }, []);

  const syncPageIndexFromOffset = useCallback(
    (offset: number) => {
      if (pagedModeRef.current) return;
      syncPagedOffset(offset);
    },
    [syncPagedOffset],
  );

  useEffect(() => {
    if (displayItems.length === 0) {
      setImageWindow(new Set());
      return;
    }

    // Keep the prefetch window tight: each entry can hold a decoded tiled page.
    const radius = isPagedMode(chrome.readingMode) ? 1 : 3;
    const start = Math.max(0, currentDisplayIndex - radius);
    const end = Math.min(displayItems.length - 1, currentDisplayIndex + radius);
    const nextWindow = new Set<number>();
    for (let index = start; index <= end; index += 1) {
      nextWindow.add(index);
    }

    setImageWindow((previous) => {
      if (
        previous.size === nextWindow.size &&
        [...nextWindow].every((index) => previous.has(index))
      ) {
        return previous;
      }
      return nextWindow;
    });
  }, [chrome.readingMode, currentDisplayIndex, displayItems.length]);

  // Paged modes are viewport-exact; scroll modes sync from native offsets.
  const onViewableItemsChanged = useCallback(
    ({
      viewableItems,
    }: {
      viewableItems: ViewToken<ReaderDisplayItem>[];
      changed: ViewToken<ReaderDisplayItem>[];
    }) => {
      if (!pagedModeRef.current || viewableItems.length === 0) return;
      const first = viewableItems[0];
      const displayIndex = first.index ?? 0;
      const item = first.item as ReaderDisplayItem | undefined;
      const pageIndex = item?.pageIndex ?? displayIndex;
      if (lastDisplayIndexRef.current !== displayIndex) {
        lastDisplayIndexRef.current = displayIndex;
        setCurrentDisplayIndex(displayIndex);
      }
      if (lastPageIndexRef.current !== pageIndex) {
        lastPageIndexRef.current = pageIndex;
        setCurrentPageIndex(pageIndex);
      }
    },
    [setCurrentPageIndex],
  );

  return {
    bodySize,
    setBodySize,
    currentDisplayIndex,
    setCurrentDisplayIndex,
    imageWindow,
    setImageWindow,
    pageDims,
    rememberPageDims,
    pageImageHeaders,
    displayItems,
    displayItemsRef,
    pageOffsets,
    pagedMode,
    pagedModeRef,
    getItemLayout,
    syncPageIndexFromOffset,
    lastPageIndexRef,
    lastDisplayIndexRef,
    onViewableItemsChanged,
    resetViewport,
  };
}
