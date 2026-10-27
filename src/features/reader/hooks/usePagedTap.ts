/**
 * Paged tap policy and animation gate.
 *
 * Tap zones resolve against the viewport. A page turn may be latched while a
 * native transition is running so repeated taps cannot queue multiple jumps.
 * The latch clears on the transition timeout and on momentum settle.
 */
import { useCallback, useEffect, useRef } from "react";

import type { ReaderChromeSettings } from "../components/panels/readerChrome";
import { resolveTapZoneAction } from "../domain/navigation/tapZones";

export interface PagedTapOptions {
  chrome: ReaderChromeSettings;
  configOpen: boolean;
  bodySize: { width: number; height: number };
  currentDisplayIndex: number;
  displayCount: number;
  scrollToDisplayItem: (index: number, animated?: boolean) => void;
  setShowHeader: (show: boolean) => void;
}

export interface PagedTapState {
  handlePagedTap: (x: number, y: number) => void;
  releasePagedTapLock: () => void;
}

export function usePagedTap({
  chrome,
  configOpen,
  bodySize,
  currentDisplayIndex,
  displayCount,
  scrollToDisplayItem,
  setShowHeader,
}: PagedTapOptions): PagedTapState {
  const inFlightRef = useRef(false);
  const unlockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const releasePagedTapLock = useCallback(() => {
    inFlightRef.current = false;
    if (unlockTimerRef.current) {
      clearTimeout(unlockTimerRef.current);
      unlockTimerRef.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      if (unlockTimerRef.current) clearTimeout(unlockTimerRef.current);
    },
    [],
  );

  const handlePagedTap = useCallback(
    (x: number, y: number) => {
      if (configOpen) return;
      if (inFlightRef.current) return;
      const rtl =
        chrome.readingMode === "pagedHorizontal" &&
        chrome.pagedDirection === "rtl";
      const action = resolveTapZoneAction({
        layout: chrome.tapZoneLayout,
        invert: chrome.invertTapZones,
        rtl,
        x,
        y,
        width: bodySize.width,
        height: bodySize.height,
      });
      const move = (target: number) => {
        if (!chrome.animatePageTransitions) {
          scrollToDisplayItem(target);
          return;
        }
        inFlightRef.current = true;
        if (unlockTimerRef.current) clearTimeout(unlockTimerRef.current);
        unlockTimerRef.current = setTimeout(releasePagedTapLock, 700);
        scrollToDisplayItem(target, true);
      };
      if (action === "prev") {
        if (currentDisplayIndex > 0) move(currentDisplayIndex - 1);
      } else if (action === "next") {
        if (currentDisplayIndex < displayCount - 1) {
          move(currentDisplayIndex + 1);
        }
      } else {
        setShowHeader(true);
      }
    },
    [
      bodySize.height,
      bodySize.width,
      chrome.animatePageTransitions,
      chrome.invertTapZones,
      chrome.pagedDirection,
      chrome.readingMode,
      chrome.tapZoneLayout,
      configOpen,
      currentDisplayIndex,
      displayCount,
      releasePagedTapLock,
      scrollToDisplayItem,
      setShowHeader,
    ],
  );

  return { handlePagedTap, releasePagedTapLock };
}