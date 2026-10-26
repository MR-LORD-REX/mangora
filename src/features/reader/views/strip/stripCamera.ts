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

export function clampStripCameraTranslation(
  metrics: StripCameraMetrics,
  translationX: number,
  translationY: number,
): StripCameraPoint {
  "worklet";
  if (metrics.scale <= 1) return { x: 0, y: 0 };
  const minX = metrics.viewportWidth * (1 - metrics.scale);
  const minY =
    metrics.scrollY +
    metrics.viewportHeight -
    metrics.contentHeight * metrics.scale;
  const maxY = metrics.scrollY;
  return {
    x: Math.max(minX, Math.min(0, translationX)),
    y: Math.max(minY, Math.min(maxY, translationY)),
  };
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
