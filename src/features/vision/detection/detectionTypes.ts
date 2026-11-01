/**
 * detectionTypes.ts
 * ---------------------------------------------------------------------------
 * Detector-independent types shared by the downloadable region models.
 * ---------------------------------------------------------------------------
 */

import type { BubbleMask } from "@shared/contracts/bubbleMask";
import type {
  DetectionRole,
  RegionDetectorId,
} from "../models/regionModels";

/** A single detected text region, in original image pixels. */
export interface Detection {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** 0..1 model confidence. */
  confidence: number;
  /** Raw model class id, retained for diagnostics only. */
  classId: number;
  /**
   * Detector-independent semantic role. Consumers must use this instead of
   * interpreting classId, which differs between RT-DETR and Manga109.
   */
  role: DetectionRole;
  /**
   * Optional instance mask. The Manga109 segmenter fills this for every
   * speech bubble; box detectors leave it undefined.
   */
  mask?: BubbleMask;
}

/** Normalized result of one detection pass. */
export interface DetectionResult {
  /** Natural (decoded) width of the source image in pixels. */
  imageWidth: number;
  /** Natural (decoded) height of the source image in pixels. */
  imageHeight: number;
  /** Detections sorted by confidence, highest first. */
  boxes: Detection[];
  /** Which detector produced the boxes (diagnostics and cache identity). */
  detector?: RegionDetectorId;
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
