/**
 * yolo.utils.ts
 * ---------------------------------------------------------------------------
 * Pure post-processing for the YOLO NMS export. No Skia / onnxruntime here,
 * so this stays unit-testable.
 * ---------------------------------------------------------------------------
 */

import type { Detection, YoloOptions } from "./yolo.types";

/** Letterbox transform used at preprocess time (must be fed back verbatim). */
export interface Letterbox {
  /** Uniform scale applied to the source image. */
  scale: number;
  /** Horizontal padding added around the scaled image (input space). */
  padX: number;
  /** Vertical padding added around the scaled image (input space). */
  padY: number;
  imageWidth: number;
  imageHeight: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Decodes the raw [1, 300, 6] output rows of an Ultralytics NMS export and
 * maps them back into original-image coordinates.
 *
 * Handles both [1, N, 6] and [1, 6, N] layouts defensively. Empty rows (the
 * NMS export pads to a fixed 300) carry confidence 0 and are dropped.
 */
export function decodeOutput(
  data: Float32Array,
  dims: readonly number[],
  letterbox: Letterbox,
  options: YoloOptions = {},
): Detection[] {
  const { scale, padX, padY, imageWidth, imageHeight } = letterbox;
  const minConfidence = options.minConfidence ?? 0.25;
  const maxBoxes = options.maxBoxes ?? 200;

  const a = dims[1] ?? 0;
  const b = dims[2] ?? 0;
  // Standard exports are [1, N, 6]; some pipelines transpose to [1, 6, N].
  const transposed = a === 6;
  const rows = transposed ? b : b === 6 ? a : 0;
  if (!rows) {
    throw new Error(`Unexpected YOLO output shape [${dims.join(", ")}]`);
  }
  const at = (row: number, col: number) =>
    transposed ? data[col * rows + row] : data[row * 6 + col];

  const boxes: Detection[] = [];
  for (let r = 0; r < rows; r++) {
    const confidence = at(r, 4) ?? 0;
    const classId = Math.round(at(r, 5) ?? -1);
    if (confidence < minConfidence || classId < 0) continue;

    const x1 = clamp((at(r, 0) - padX) / scale, 0, imageWidth);
    const y1 = clamp((at(r, 1) - padY) / scale, 0, imageHeight);
    const x2 = clamp((at(r, 2) - padX) / scale, 0, imageWidth);
    const y2 = clamp((at(r, 3) - padY) / scale, 0, imageHeight);
    const width = x2 - x1;
    const height = y2 - y1;
    if (width < 1 || height < 1) continue;
    if (x1 >= imageWidth || y1 >= imageHeight) continue;

    boxes.push({ x1, y1, x2, y2, confidence, classId });
  }

  boxes.sort((a, b) => b.confidence - a.confidence);
  return boxes.slice(0, maxBoxes);
}

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
 * Merges per-tile detections back into source coordinates. Adjacent tiles
 * overlap, so a bubble that crosses a tile seam can be reported by two
 * tiles; duplicates (same class, IoU >= 0.45) are dropped, keeping the
 * higher-confidence copy.
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
