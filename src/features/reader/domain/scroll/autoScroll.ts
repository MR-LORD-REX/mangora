/**
 * Auto-scroll segment planning.
 *
 * The native ScrollView owns the animation. JS only asks for the next bounded
 * segment, then waits for it to settle before scheduling another one. Keeping
 * this arithmetic pure prevents a 60 Hz loop from competing with the scroll
 * animator.
 */

export interface AutoScrollSegment {
  /** Destination offset in scroll-content pixels. */
  target: number;
  /** Pixels this segment is expected to travel. */
  distance: number;
  /** Stop at the destination until the next segment is scheduled. */
  pause: boolean;
}

export interface AutoScrollSegmentInput {
  /** Current scroll offset in content pixels. */
  offset: number;
  /** Maximum valid scroll offset for the current content. */
  maxOffset: number;
  /** Auto-scroll speed multiplier (1..5). */
  speed: number;
  /** Bounded segment length so a page boundary can pause there. */
  viewportSize: number;
  /** World offsets for each display row, including the terminating offset. */
  pageOffsets: readonly number[];
  /** Distance below the viewport top that marks the current reading line. */
  inset?: number;
}

const PIXELS_PER_SECOND = 18;
const MIN_SEGMENT_PX = 4;
const MAX_SEGMENT_SECONDS = 0.8;
const PAGE_PAUSE_MS = 420;

export function autoScrollPixelsPerSecond(speed: number): number {
  const normalized = Math.min(5, Math.max(1, Number.isFinite(speed) ? speed : 1));
  return PIXELS_PER_SECOND * normalized;
}

export function autoScrollSegment({
  offset,
  maxOffset,
  speed,
  viewportSize,
  pageOffsets,
  inset = 0,
}: AutoScrollSegmentInput): AutoScrollSegment | null {
  const current = Math.max(0, Math.min(offset, maxOffset));
  if (current >= maxOffset) return null;

  const maxDistance = Math.max(
    1,
    autoScrollPixelsPerSecond(speed) * MAX_SEGMENT_SECONDS,
  );
  const viewport = Math.max(1, viewportSize);
  const boundary = nextPageBoundary(pageOffsets, current, viewport, inset);
  let target = Math.min(maxOffset, current + maxDistance);
  let pause = false;

  if (boundary !== null && boundary < target) {
    target = boundary;
    pause = true;
  }

  // Never emit a zero-distance command. A one-pixel step keeps the native
  // animator moving when rounding leaves less than a visible pixel.
  if (target - current < MIN_SEGMENT_PX) {
    target = Math.min(maxOffset, current + MIN_SEGMENT_PX);
    if (target <= current) return null;
  }

  return {
    target,
    distance: target - current,
    pause,
  };
}

export function autoScrollPauseMs(segment: AutoScrollSegment): number {
  return segment.pause ? PAGE_PAUSE_MS : 0;
}

/**
 * First page top that reaches the reading line near the viewport top. Landing
 * there gives the reader a brief look at each new page instead of sliding
 * straight past it. The page currently crossing the reading line is skipped:
 * snapping to its top would move backwards.
 */
function nextPageBoundary(
  offsets: readonly number[],
  offset: number,
  viewportSize: number,
  inset: number,
): number | null {
  if (offsets.length <= 1) return null;
  // Offsets contain one trailing total, so rows are 0..length-2.
  const rowEnd = offsets.length - 1;
  const readingLine = Math.max(1, Math.min(inset, viewportSize / 3));
  const boundaryOffset = offset + readingLine;
  for (let index = 1; index < rowEnd; index += 1) {
    const start = offsets[index] ?? 0;
    if (start <= boundaryOffset) continue;
    // The next row top only becomes a safe landing target once it is within
    // the current viewport. Otherwise the segment runs to its normal limit.
    return start < offset + viewportSize ? start : null;
  }
  return null;
}
