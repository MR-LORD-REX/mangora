/**
 * Reader-facing page detector.
 *
 * Exactly one selected detector runs for a page. RT-DETR and Manga109
 * segmentation are peers; a failure is surfaced instead of falling back to a
 * different model, because that would silently change geometry and violate
 * the user's detector choice.
 */

import { getRegionDetector, type RegionDetectorId } from "../models/regionModels";
import { mangaBubbleSegmenter } from "../segmentation/mangaBubbleSeg";
import { rtdetrDetector } from "./rtdetr";
import type { DetectionResult, YoloOptions } from "./detectionTypes";

export interface DetectPageOptions extends YoloOptions {
  detectorId: RegionDetectorId;
}

export async function detectPageRegions(
  uri: string,
  options: DetectPageOptions,
): Promise<DetectionResult> {
  const { detectorId, ...yoloOptions } = options;
  const detector = getRegionDetector(detectorId);
  switch (detector.kind) {
    case "rtdetr":
      return rtdetrDetector.detectFromUri(uri, yoloOptions);
    case "segmentation":
      return mangaBubbleSegmenter.detectFromUri(uri, yoloOptions);
    default: {
      const exhaustive: never = detector.kind;
      throw new Error(`Unsupported region detector kind: ${String(exhaustive)}`);
    }
  }
}
