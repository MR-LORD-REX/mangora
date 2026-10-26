import type { Box, Point } from "@shared/geometry";

/**
 * Speech-bubble mask produced by the Manga109 segmentation model.
 * `polygon` and `bounds` are in natural source-image pixels.
 */
export interface BubbleMask {
  polygon: Point[];
  bounds: Box;
  /** 0..1 segmentation confidence. */
  confidence: number;
}
