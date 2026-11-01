/**
 * Shared box post-processing for region detectors.
 *
 * These helpers are intentionally free of Skia and ONNX Runtime so they stay
 * usable by the segmentation decoder and unit tests.
 */

import type { Detection } from "./detectionTypes";

/** Intersection-over-union between two detection boxes (0..1). */
export function intersectionOverUnion(a: Detection, b: Detection): number {
  const x1 = Math.max(a.x1, b.x1);
  const y1 = Math.max(a.y1, b.y1);
  const x2 = Math.min(a.x2, b.x2);
  const y2 = Math.min(a.y2, b.y2);
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const areaA = Math.max(0, a.x2 - a.x1) * Math.max(0, a.y2 - a.y1);
  const areaB = Math.max(0, b.x2 - b.x1) * Math.max(0, b.y2 - b.y1);
  const union = areaA + areaB - intersection;
  return union <= 0 ? 0 : intersection / union;
}

/**
 * Merges per-tile detections back into source coordinates.
 *
 * Adjacent tiles overlap, so a bubble that crosses a tile seam can be reported
 * by two tiles. Duplicates with the same class and IoU >= 0.45 are dropped,
 * keeping the higher-confidence copy.
 */
export function mergeDetections(
  boxes: Detection[],
  maxBoxes = 200,
): Detection[] {
  const sorted = [...boxes].sort((a, b) => b.confidence - a.confidence);
  const kept: Detection[] = [];
  for (const box of sorted) {
    const duplicate = kept.some(
      (other) =>
        other.classId === box.classId &&
        intersectionOverUnion(other, box) >= 0.45,
    );
    if (duplicate) continue;
    kept.push(box);
    if (kept.length >= maxBoxes) break;
  }
  return kept;
}
