/**
 * yolo.types.ts
 * ---------------------------------------------------------------------------
 * Types + per-class constants for manga text-region detection with
 * assets/models/yolo.onnx (Ultralytics YOLO, NMS export).
 *
 * Model contract:
 *   input  "images"  float32 [1, 3, 640, 640]  (RGB, 0..1, letterboxed)
 *   output "output0" float32 [1, 300, 6]        (x1, y1, x2, y2, conf, class)
 * ---------------------------------------------------------------------------
 */

/** Class id order matches the model's names metadata. */
export const YOLO_CLASS_NAMES = ["clean_text", "messy_text", "text_bubble"] as const;
export type YoloClassName = (typeof YOLO_CLASS_NAMES)[number];

/** Display labels for the class ids above. */
export const YOLO_CLASS_LABELS = ["Clean text", "Messy text", "Text bubble"] as const;

/** One distinct border color per class, aligned by index. */
export const YOLO_CLASS_COLORS = ["#fbbf24", "#34d399", "#60a5fa"] as const;

/** A single detected text region, in original image pixels. */
export interface Detection {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** 0..1 model confidence. */
  confidence: number;
  /** Index into YOLO_CLASS_NAMES. */
  classId: number;
}

/** Normalized result of one detection pass. */
export interface DetectionResult {
  /** Natural (decoded) width of the source image in pixels. */
  imageWidth: number;
  /** Natural (decoded) height of the source image in pixels. */
  imageHeight: number;
  /** Detections sorted by confidence, highest first. */
  boxes: Detection[];
}

/** Per-call knobs for the detector. */
export interface YoloOptions {
  /** Keep boxes with confidence >= this. Default 0.25. */
  minConfidence?: number;
  /** Cap on returned boxes. Default 200. */
  maxBoxes?: number;
  /** Request headers used when an AVIF page has to be downloaded first. */
  headers?: Record<string, string>;
  /** Extension source id, so AVIF fetches use its image client. */
  extensionSourceId?: string;
}
