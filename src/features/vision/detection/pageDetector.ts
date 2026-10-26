/**
 * pageDetector.ts
 * ---------------------------------------------------------------------------
 * Reader-facing page detector.
 *
 * Runs Manga109 bubble segmentation and YOLO text detection concurrently.
 * Manga109 remains the source of bubble detections and masks; only YOLO's
 * messy_text regions are added when Manga109 detects bubbles. When Manga109
 * fails or finds none, the complete YOLO result remains the fallback.
 * ---------------------------------------------------------------------------
 */

import { mangaBubbleSegmenter } from "../segmentation/mangaBubbleSeg";
import { yoloDetector } from "./yolo";
import type { DetectionResult, YoloOptions } from "./detectionTypes";

export async function detectPageRegions(
  uri: string,
  options: YoloOptions = {},
): Promise<DetectionResult> {
  const [mangaResult, yoloResult] = await Promise.allSettled([
    mangaBubbleSegmenter.detectFromUri(uri, options),
    yoloDetector.detectFromUri(uri, options),
  ]);

  if (mangaResult.status === "fulfilled" && mangaResult.value.boxes.length > 0) {
    if (yoloResult.status === "rejected") {
      console.warn("[detect] YOLO text detection failed; keeping Manga109 bubbles", {
        error: yoloResult.reason,
      });
      return mangaResult.value;
    }
    const messyText = yoloResult.value.boxes.filter(
      (box) => box.classId === 1,
    );
    const boxes = [...mangaResult.value.boxes, ...messyText].sort(
      (a, b) => b.confidence - a.confidence,
    );
    console.log("[detect] combined Manga109 bubbles and YOLO free text", {
      bubbles: mangaResult.value.boxes.length,
      messyText: messyText.length,
    });
    return { ...mangaResult.value, boxes, detector: "manga109" };
  }

  if (mangaResult.status === "rejected") {
    console.warn(
      "[detect] Manga109 segmentation unavailable; using complete YOLO result",
      mangaResult.reason,
    );
  } else {
    console.warn(
      "[detect] Manga109 segmentation found no bubbles; using complete YOLO result",
    );
  }
  if (yoloResult.status === "rejected") throw yoloResult.reason;
  return { ...yoloResult.value, detector: "yolo" };
}
