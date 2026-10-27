/**
 * Reader viewport actions and gesture wiring.
 *
 * ReaderScreen supplies the layout snapshot from `useReaderViewportState`.
 * This hook owns list refs, scroll jumps, FlatList retry recovery, the paged
 * anchor, auto-scroll and both tap-zone handlers.
 */
import { useCallback, useEffect, useRef } from "react";
import type { FlatList } from "react-native";

import type { ReaderChromeSettings } from "../components/panels/readerChrome";
import type { ReaderChromeSheetState } from "./useReaderChromeController";
import type { ReaderDisplayItem } from "../domain/layout/readerItems";
import { isPagedMode } from "../domain/legacyReadingModes";
import { resolveTapZoneAction } from "../domain/navigation/tapZones";
import type { StripReaderHandle, StripTapEvent } from "../views/strip/StripReader";
import { usePagedDisplayAnchor } from "./usePagedDisplayAnchor";
import { usePagedTap } from "./usePagedTap";
import { useReaderAutoScroll } from "./useReaderAutoScroll";

export interface ReaderViewportControlsOptions {
  chrome: ReaderChromeSettings;
  sheet: ReaderChromeSheetState;
  bodySize: { width: number; height: number };
  pagesLength: number;
  displayItems: ReaderDisplayItem[];
  pageOffsets: readonly number[];
  currentPageIndex: number;
  setCurrentPageIndex: (pageIndex: number) => void;
  currentDisplayIndex: number;
  setCurrentDisplayIndex: (displayIndex: number) => void;
  pagedMode: boolean;
  lastPageIndexRef: { current: number };
  lastDisplayIndexRef: { current: number };
  pagedListRef: { current: FlatList<ReaderDisplayItem> | null };
  stripListRef: { current: StripReaderHandle | null };
  syncPageIndexFromOffset: (offset: number) => void;
  setShowHeader: (visible: boolean) => void;
}

export function useReaderViewportControls({
  chrome,
  sheet,
  bodySize,
  pagesLength,
  displayItems,
  pageOffsets,
  currentPageIndex,
  setCurrentPageIndex,
  currentDisplayIndex,
  setCurrentDisplayIndex,
  pagedMode,
  lastPageIndexRef,
  lastDisplayIndexRef,
  pagedListRef,
  stripListRef,
  syncPageIndexFromOffset,
  setShowHeader,
}: ReaderViewportControlsOptions) {
  const scrollRetryRef = useRef(0);

  const scrollToReaderIndex = useCallback(
    (index: number, animated = false, viewPosition?: number) => {
      if (isPagedMode(chrome.readingMode)) {
        pagedListRef.current?.scrollToIndex({ index, animated, viewPosition });
      } else {
        stripListRef.current?.scrollToIndex({ index, animated, viewPosition });
      }
    },
    [chrome.readingMode, pagedListRef, stripListRef],
  );

  const scrollToReaderOffset = useCallback(
    (offset: number, animated = false) => {
      if (isPagedMode(chrome.readingMode)) {
        pagedListRef.current?.scrollToOffset({ offset, animated });
      } else {
        stripListRef.current?.scrollToOffset({ offset, animated });
      }
    },
    [chrome.readingMode, pagedListRef, stripListRef],
  );


  const handleStripScroll = useCallback(
    (offset: number) => {
      syncPageIndexFromOffset(offset);
    },
    [syncPageIndexFromOffset],
  );

  const stepReaderViewport = useCallback(
    (direction: "previous" | "next") => {
      stripListRef.current?.stepByViewport(direction);
    },
    [stripListRef],
  );
  const scrollToDisplayItem = useCallback(
    (index: number, animated = false) => {
      if (displayItems.length === 0) return;
      const target = Math.min(Math.max(index, 0), displayItems.length - 1);
      const item = displayItems[target];
      if (!item) return;
      scrollRetryRef.current = 0;
      setCurrentDisplayIndex(target);
      lastDisplayIndexRef.current = target;
      setCurrentPageIndex(item.pageIndex);
      lastPageIndexRef.current = item.pageIndex;
      if (isPagedMode(chrome.readingMode)) {
        scrollToReaderIndex(target, animated);
        return;
      }
      scrollToReaderOffset(pageOffsets[target] ?? 0, false);
    },
    [
      chrome.readingMode,
      displayItems,
      lastDisplayIndexRef,
      lastPageIndexRef,
      pageOffsets,
      scrollToReaderIndex,
      scrollToReaderOffset,
      setCurrentDisplayIndex,
      setCurrentPageIndex,
    ],
  );

  const { scrollToPage } = usePagedDisplayAnchor({
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
  });

  const handleScrollToIndexFailed = useCallback(
    ({ index, averageItemLength }: { index: number; averageItemLength: number }) => {
      const target = Math.min(
        Math.max(index, 0),
        Math.max(displayItems.length - 1, 0),
      );
      const estimated =
        pageOffsets[target] ?? Math.max(0, averageItemLength) * target;
      scrollToReaderOffset(estimated, false);
      // FlatList needs one frame after the estimated offset before the target
      // row exists. Retry once so variable-height pages land exactly.
      if (scrollRetryRef.current < 1) {
        scrollRetryRef.current += 1;
        setTimeout(() => {
          scrollToReaderIndex(target, false, 0);
        }, 120);
      }
    },
    [displayItems.length, pageOffsets, scrollToReaderIndex, scrollToReaderOffset],
  );

  const { handlePagedTap, releasePagedTapLock } = usePagedTap({
    chrome,
    configOpen: sheet.configOpen,
    bodySize,
    currentDisplayIndex,
    displayCount: displayItems.length,
    scrollToDisplayItem,
    setShowHeader,
  });

  const handleStripTap = useCallback(
    ({ x, y }: StripTapEvent) => {
      if (sheet.configOpen) return;
      const action = resolveTapZoneAction({
        layout: chrome.tapZoneLayout,
        invert: chrome.invertTapZones,
        x,
        y,
        width: bodySize.width,
        height: bodySize.height,
      });
      if (action === "toggle") {
        setShowHeader(true);
        return;
      }
      stepReaderViewport(action === "next" ? "next" : "previous");
    },
    [
      bodySize.height,
      bodySize.width,
      chrome.invertTapZones,
      chrome.tapZoneLayout,
      sheet.configOpen,
      setShowHeader,
      stepReaderViewport,
    ],
  );

  const {
    active: autoScroll,
    speed: scrollSpeed,
    setActive: setAutoScroll,
    setSpeed: setAutoScrollSpeed,
    handleScrollBeginDrag,
    handleViewportChange: handleStripViewportChange,
  } = useReaderAutoScroll({
    readingMode: chrome.readingMode,
    pageOffsets,
    contentReady: pagesLength > 0,
    viewportHeight: bodySize.height,
    stripRef: stripListRef,
    scrollToOffset: scrollToReaderOffset,
  });

  useEffect(() => {
    if (pagedMode) setAutoScroll(false);
  }, [pagedMode, setAutoScroll]);

  return {
    scrollToReaderIndex,
    scrollToReaderOffset,
    scrollToPage,
    stepReaderViewport,
    handleScrollToIndexFailed,
    handlePagedTap,
    releasePagedTapLock,
    handleStripTap,
    handleStripScroll,
    autoScroll,
    scrollSpeed,
    setAutoScroll,
    setAutoScrollSpeed,
    handleScrollBeginDrag,
    handleStripViewportChange,
  };
}
