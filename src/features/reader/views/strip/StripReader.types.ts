import type { ReactNode } from "react";

import type { ReaderDisplayItem } from "../../domain/layout/readerItems";

export interface StripReaderHandle {
  scrollToOffset: (options: { offset: number; animated?: boolean }) => void;
  scrollToIndex: (options: {
    index: number;
    animated?: boolean;
    viewPosition?: number;
  }) => void;
  stepByViewport: (direction: "previous" | "next") => void;
  /** Latest rendered scroll offset and the clamped content end. */
  getScrollMetrics: () => { offset: number; maxOffset: number };
}

export interface StripTapEvent {
  /** Tap coordinates inside the strip viewport, not inside a page row. */
  x: number;
  y: number;
  /** Display item under the tapped world point. */
  index: number;
}

export interface StripViewportState {
  /** Latest native ScrollView offset, even while the camera is zoomed. */
  offset: number;
  /** True when pinch rounding has returned the camera to fit scale. */
  atBase: boolean;
  /** True while a pinch or camera pan is in progress. */
  interacting: boolean;
}

export interface StripReaderProps {
  items: ReaderDisplayItem[];
  offsets: readonly number[];
  viewport: { width: number; height: number };
  resetKey: string;
  initialOffset?: number;
  onScroll: (offset: number) => void;
  /** Called after the native ScrollView reports its current offset. */
  onScrollOffset?: (offset: number) => void;
  /** Reports camera interaction and settlement for auto-scroll coordination. */
  onViewportChange?: (state: StripViewportState) => void;
  onScrollBeginDrag: () => void;
  onTap: (event: StripTapEvent) => void;
  onLongPress: (index: number) => void;
  renderPage: (item: ReaderDisplayItem, index: number) => ReactNode;
}