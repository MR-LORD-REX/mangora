import { useCallback, useMemo, useRef, useState } from "react";

import { stripWindowForOffset } from "../../domain/layout/stripWindow";
import {
  stripCameraMetricsFor,
  stripCameraWindowFor,
  stripPageIndexForWorldY,
} from "./stripCamera";

export interface StripWindowOptions {
  offsets: readonly number[];
  itemCount: number;
  initialOffset: number;
  viewport: { width: number; height: number };
  contentHeight: number;
  onScroll: (offset: number) => void;
}

export interface StripWindowState {
  indices: number[];
  updateWindow: (offset: number, pageIndex?: number) => void;
  applyCameraWindow: (
    start: number,
    end: number,
    pageIndex: number,
  ) => void;
  syncCameraWindow: (
    scale: number,
    scrollY: number,
    translationY: number,
  ) => void;
}

/**
 * Owns the strip's mounted-row window.
 *
 * The camera can reveal rows without moving the native scroll offset, so the
 * window is derived from both the scroll position and the current camera
 * translation. Page notifications are deduplicated here to keep scroll
 * callbacks out of the render path.
 */
export function useStripWindow({
  offsets,
  itemCount,
  initialOffset,
  viewport,
  contentHeight,
  onScroll,
}: StripWindowOptions): StripWindowState {
  const lastVisibleItemRef = useRef(0);
  const [windowRange, setWindowRange] = useState(() =>
    stripWindowForOffset(
      offsets,
      itemCount,
      Math.max(0, initialOffset),
      viewport.height,
    ),
  );

  const updateWindow = useCallback(
    (offset: number, pageIndex?: number) => {
      const next = stripWindowForOffset(
        offsets,
        itemCount,
        offset,
        viewport.height,
      );
      setWindowRange((current) =>
        current.start === next.start && current.end === next.end
          ? current
          : next,
      );
      if (pageIndex === undefined || itemCount === 0) return;
      const index = Math.max(0, Math.min(itemCount - 1, pageIndex));
      if (index === lastVisibleItemRef.current) return;
      lastVisibleItemRef.current = index;
      onScroll(Math.max(0, offsets[index] ?? 0));
    },
    [itemCount, offsets, onScroll, viewport.height],
  );

  const applyCameraWindow = useCallback(
    (start: number, end: number, pageIndex: number) => {
      setWindowRange((current) =>
        current.start === start && current.end === end
          ? current
          : (() => {
              lastVisibleItemRef.current = -1;
              return { start, end };
            })(),
      );
      if (itemCount === 0) return;
      const index = Math.max(0, Math.min(itemCount - 1, pageIndex));
      if (index === lastVisibleItemRef.current) return;
      lastVisibleItemRef.current = index;
      onScroll(Math.max(0, offsets[index] ?? 0));
    },
    [itemCount, offsets, onScroll],
  );

  const syncCameraWindow = useCallback(
    (scale: number, scrollY: number, translationY: number) => {
      const window = stripCameraWindowFor(
        offsets,
        itemCount,
        stripCameraMetricsFor(scale, scrollY, viewport, contentHeight),
        translationY,
      );
      applyCameraWindow(
        window.start,
        window.end,
        stripPageIndexForWorldY(offsets, window.visibleOffset),
      );
    },
    [applyCameraWindow, contentHeight, itemCount, offsets, viewport],
  );

  const indices = useMemo(() => {
    const next: number[] = [];
    for (
      let index = windowRange.start;
      index <= windowRange.end;
      index += 1
    ) {
      next.push(index);
    }
    return next;
  }, [windowRange]);

  return { indices, updateWindow, applyCameraWindow, syncCameraWindow };
}
