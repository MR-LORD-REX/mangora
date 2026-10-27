export interface StripCameraMetrics {
  scale: number;
  scrollY: number;
  viewportWidth: number;
  viewportHeight: number;
  contentHeight: number;
}

export interface StripCameraPoint {
  x: number;
  y: number;
}

export interface StripCameraWindow {
  start: number;
  end: number;
  visibleOffset: number;
  visibleHeight: number;
}

/** Pinch gestures rarely land on an exact 1.0; treat this as fit scale. */
export const STRIP_CAMERA_BASE_EPSILON = 0.01;

export function stripCameraMetricsFor(
  scale: number,
  scrollY: number,
  viewport: { width: number; height: number },
  contentHeight: number,
): StripCameraMetrics {
  "worklet";
  return {
    scale,
    scrollY,
    viewportWidth: viewport.width,
    viewportHeight: viewport.height,
    contentHeight,
  };
}

export function stripCameraAtBase(scale: number): boolean {
  "worklet";
  return Math.abs(scale - 1) <= STRIP_CAMERA_BASE_EPSILON;
}

export function clampStripCameraTranslation(
  metrics: StripCameraMetrics,
  translationX: number,
  translationY: number,
): StripCameraPoint {
  "worklet";
  if (metrics.scale === 1) return { x: 0, y: 0 };
  const scaledWidth = metrics.viewportWidth * metrics.scale;
  const scaledHeight = metrics.contentHeight * metrics.scale;
  const x =
    scaledWidth <= metrics.viewportWidth
      ? (metrics.viewportWidth - scaledWidth) / 2
      : Math.max(
          metrics.viewportWidth - scaledWidth,
          Math.min(0, translationX),
        );
  const y =
    scaledHeight <= metrics.viewportHeight
      ? metrics.scrollY + (metrics.viewportHeight - scaledHeight) / 2
      : Math.max(
          metrics.scrollY + metrics.viewportHeight - scaledHeight,
          Math.min(metrics.scrollY, translationY),
        );
  return { x, y };
}

export function stripCameraScreenPointToWorld(
  metrics: StripCameraMetrics,
  translationX: number,
  translationY: number,
  screenX: number,
  screenY: number,
): StripCameraPoint {
  "worklet";
  return {
    x: (screenX - translationX) / metrics.scale,
    y: (metrics.scrollY + screenY - translationY) / metrics.scale,
  };
}

export function stripCameraTranslationForScale(
  metrics: StripCameraMetrics,
  translationX: number,
  translationY: number,
  nextScale: number,
  focalX: number,
  focalY: number,
): StripCameraPoint {
  "worklet";
  const content = stripCameraScreenPointToWorld(
    metrics,
    translationX,
    translationY,
    focalX,
    focalY,
  );
  const nextTranslationX = focalX - nextScale * content.x;
  const nextTranslationY =
    focalY + metrics.scrollY - nextScale * content.y;
  return clampStripCameraTranslation(
    { ...metrics, scale: nextScale },
    nextTranslationX,
    nextTranslationY,
  );
}

export function stripCameraVisibleOffset(
  metrics: StripCameraMetrics,
  translationY: number,
): number {
  "worklet";
  return Math.max(
    0,
    (metrics.scrollY - translationY) / metrics.scale,
  );
}

export function stripPageIndexForWorldY(
  offsets: readonly number[],
  worldY: number,
): number {
  "worklet";
  if (offsets.length <= 1) return 0;
  const pageCount = offsets.length - 1;
  let low = 0;
  let high = pageCount - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if ((offsets[middle + 1] ?? Number.POSITIVE_INFINITY) > worldY) {
      high = middle;
    } else {
      low = middle + 1;
    }
  }
  return Math.max(0, Math.min(pageCount - 1, low));
}

/**
 * Rows that intersect the camera rectangle plus a small overscan. This must
 * use the transformed camera, not scrollY alone: while zoomed, panning moves
 * translateY without moving the native ScrollView.
 *
 * JS-only: this runs in the React effect, while the animated reaction keeps an
 * inlined copy so Reanimated never has to capture a cross-function worklet.
 */
export function stripCameraWindowFor(
  offsets: readonly number[],
  itemCount: number,
  metrics: StripCameraMetrics,
  translationY: number,
): StripCameraWindow {
  const visibleOffset = stripCameraVisibleOffset(metrics, translationY);
  const visibleHeight =
    metrics.viewportHeight / Math.max(0.01, metrics.scale);
  if (itemCount <= 0) {
    return { start: 0, end: -1, visibleOffset, visibleHeight };
  }
  const overscan = Math.max(
    2,
    Math.ceil(metrics.scale <= 1 ? 2 : 2 / metrics.scale),
  );
  return {
    start: Math.max(
      0,
      stripPageIndexForWorldY(offsets, visibleOffset) - overscan,
    ),
    end: Math.min(
      itemCount - 1,
      stripPageIndexForWorldY(offsets, visibleOffset + visibleHeight) +
        overscan,
    ),
    visibleOffset,
    visibleHeight,
  };
}
