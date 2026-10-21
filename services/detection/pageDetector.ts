/**
 * pageDetector.ts
 * ---------------------------------------------------------------------------
 * Reader-facing page detector.
 *
 * Primary: Manga109 YOLO11-seg speech-bubble segmentation, which gives the
 * overlay real bubble masks. Fallback: the older YOLO text detector, used only
 * when the segmentation model is unavailable or a page contains no speech
 * bubbles (narration boxes, SFX, free text). Keeping the fallback means
 * translation keeps working on pages the bubble-only model cannot describe.
 * ---------------------------------------------------------------------------
 */

import { mangaBubbleSegmenter } from "@/services/segmentation/mangaBubbleSeg";
import { yoloDetector } from "@/services/yolo/yolo";
import type { DetectionResult, YoloOptions } from "@/services/yolo/yolo.types";

export async function detectPageRegions(
  uri: string,
  options: YoloOptions = {},
): Promise<DetectionResult> {
  try {
    const result = await mangaBubbleSegmenter.detectFromUri(uri, options);
    if (result.boxes.length > 0) return result;
    console.warn(
      "[detect] Manga109 segmentation found no bubbles; using YOLO text detector",
    );
  } catch (error) {
    console.warn(
      "[detect] Manga109 segmentation unavailable; using YOLO text detector",
      error,
    );
  }
  const fallback = await yoloDetector.detectFromUri(uri, options);
  return { ...fallback, detector: "yolo" };
}
