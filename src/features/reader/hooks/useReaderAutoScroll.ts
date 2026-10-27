import { useCallback, useEffect, useRef, useState } from "react";

import { isPagedMode, type ReaderReadingMode } from "../domain/legacyReadingModes";
import {
  autoScrollPauseMs,
  autoScrollSegment,
} from "../domain/scroll/autoScroll";
import type { StripReaderHandle, StripViewportState } from "../views/strip/StripReader";

export interface ReaderAutoScrollOptions {
  readingMode: ReaderReadingMode;
  pageOffsets: readonly number[];
  /** True once the chapter has displayable pages. */
  contentReady: boolean;
  viewportHeight: number;
  stripRef: React.RefObject<StripReaderHandle | null>;
  scrollToOffset: (offset: number, animated?: boolean) => void;
}

export interface ReaderAutoScrollState {
  active: boolean;
  speed: number;
  setActive: (active: boolean) => void;
  setSpeed: (speed: number) => void;
  handleScrollBeginDrag: () => void;
  handleViewportChange: (state: StripViewportState) => void;
}

/**
 * Coordinates reader auto-scroll with the strip camera.
 *
 * The native ScrollView owns each bounded animation. JS only schedules the
 * next segment and pauses while the user drags or the strip camera is zoomed;
 * it never writes an offset every frame.
 */
export function useReaderAutoScroll({
  readingMode,
  pageOffsets,
  contentReady,
  viewportHeight,
  stripRef,
  scrollToOffset,
}: ReaderAutoScrollOptions): ReaderAutoScrollState {
  const [active, setActiveState] = useState(false);
  const activeRef = useRef(false);
  const pausedByDragRef = useRef(false);
  const cameraZoomedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generationRef = useRef(0);
  const schedulerRef = useRef<() => void>(() => {});
  const [speed, setSpeedState] = useState(() => 1);
  const speedRef = useRef(1);

  const setActive = useCallback((nextActive: boolean) => {
    setActiveState(nextActive);
  }, []);

  const setSpeed = useCallback((nextSpeed: number) => {
    const normalized = Math.min(5, Math.max(1, nextSpeed));
    setSpeedState(normalized);
    speedRef.current = normalized;
  }, []);

  const schedule = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (
      !activeRef.current ||
      pausedByDragRef.current ||
      cameraZoomedRef.current ||
      isPagedMode(readingMode)
    ) {
      return;
    }
    const scrollHost = stripRef.current;
    if (!scrollHost) return;
    const generation = generationRef.current;
    const metrics = scrollHost.getScrollMetrics();
    const segment = autoScrollSegment({
      offset: metrics.offset,
      maxOffset: metrics.maxOffset,
      speed: speedRef.current,
      viewportSize: viewportHeight,
      pageOffsets,
    });
    if (!segment) {
      activeRef.current = false;
      setActiveState(false);
      return;
    }
    scrollToOffset(segment.target, true);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (generation !== generationRef.current) return;
      schedule();
    }, 380 + autoScrollPauseMs(segment));
  }, [pageOffsets, readingMode, scrollToOffset, stripRef, viewportHeight]);

  schedulerRef.current = schedule;

  const handleScrollBeginDrag = useCallback(() => {
    setActiveState(false);
    activeRef.current = false;
  }, []);

  const handleViewportChange = useCallback(
    ({ atBase, interacting }: StripViewportState) => {
      if (interacting || !atBase) {
        cameraZoomedRef.current = true;
        if (timerRef.current) {
          clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        generationRef.current += 1;
        return;
      }
      if (!cameraZoomedRef.current) return;
      cameraZoomedRef.current = false;
      if (activeRef.current) {
        generationRef.current += 1;
        schedulerRef.current();
      }
    },
    [],
  );

  useEffect(() => {
    activeRef.current = active;
    generationRef.current += 1;
    if (active && contentReady && !isPagedMode(readingMode)) {
      pausedByDragRef.current = false;
      cameraZoomedRef.current = false;
      schedule();
    } else if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, [active, contentReady, readingMode, schedule]);

  useEffect(
    () => () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    },
    [],
  );

  return {
    active,
    speed,
    setActive,
    setSpeed,
    handleScrollBeginDrag,
    handleViewportChange,
  };
}
