/**
 * regionModels.ts
 * ---------------------------------------------------------------------------
 * Catalog of downloadable page-region detectors.
 *
 * RT-DETR and Manga109 segmentation are peers: the reader runs exactly one of
 * them for a page. Keeping their class maps and preprocessing contracts here
 * prevents detector-specific class ids from leaking into the translation
 * pipeline.
 * ---------------------------------------------------------------------------
 */

import {
  DEFAULT_REGION_DETECTOR_ID,
  isRegionDetectorId,
  type DetectionRole,
  type RegionDetectorId,
} from "@shared/contracts/regionDetector";

export type { DetectionRole, RegionDetectorId };

export type RegionDetectorKind = "rtdetr" | "segmentation";

export interface RegionModelFile {
  /** Relative path inside the detector directory. */
  path: string;
  url: string;
  bytes: number;
  sha256: string;
}

export interface RegionDetectorDef {
  id: RegionDetectorId;
  label: string;
  detail: string;
  kind: RegionDetectorKind;
  speedProfile: "fast" | "quality" | "masking";
  /** Input contract consumed by the adapter. */
  input: {
    width: number;
    height: number;
    layout: "letterbox" | "stretch";
    color: "rgb" | "bgr";
  };
  /** Raw class id -> semantic role. Segmentation models may only use bubble. */
  classRoles: Record<number, DetectionRole>;
  files: RegionModelFile[];
  bytes: number;
  license: string;
  homepage: string;
  revision: string;
}

const GITHUB_RAW_BASE =
  "https://raw.githubusercontent.com/MR-LORD-REX/mangora/c9877b414e0a0443aeeb4eb95e522b7fd9f8c290/assets/models";

const RTDETR_FILE: RegionModelFile = {
  path: "model.onnx",
  url:
    "https://huggingface.co/ogkalu/comic-text-and-bubble-detector/resolve/16e8a622f91fabc6b5b65c96d32d1183f8843546/detector-v4-s_int8.onnx",
  bytes: 11_120_765,
  sha256: "5FE9E4F576E49D4E7E8B0E029D6D3CDC252ABD4694113E1CAE120E62C931EA79",
};

const MANGA109_FILE: RegionModelFile = {
  path: "model.onnx",
  url: `${GITHUB_RAW_BASE}/manga109-bubble-seg.onnx`,
  bytes: 11_845_328,
  sha256: "1B9BA4FA91F6523A3CAF9E7A530F200F9CC707212E5EC1BF82F9C770C2621609",
};

export const REGION_DETECTORS: RegionDetectorDef[] = [
  {
    id: "rtdetr-comic-v4",
    label: "RT-DETR Comic v4",
    detail: "Higher-quality box detector for bubbles, bubble text and free text.",
    kind: "rtdetr",
    speedProfile: "quality",
    input: { width: 640, height: 640, layout: "stretch", color: "rgb" },
    classRoles: { 0: "bubble", 1: "text_in_bubble", 2: "free_text" },
    files: [RTDETR_FILE],
    bytes: RTDETR_FILE.bytes,
    license: "See upstream model card",
    homepage:
      "https://huggingface.co/ogkalu/comic-text-and-bubble-detector",
    revision: "16e8a622f91fabc6b5b65c96d32d1183f8843546",
  },
  {
    id: "manga109-bubble-seg",
    label: "Manga109 segmentation",
    detail: "Bubble-first detector with masks for precise text erasing and fitting.",
    kind: "segmentation",
    speedProfile: "masking",
    input: { width: 1024, height: 1024, layout: "letterbox", color: "rgb" },
    classRoles: { 0: "bubble" },
    files: [MANGA109_FILE],
    bytes: MANGA109_FILE.bytes,
    license: "See upstream model card",
    homepage: "https://github.com/MR-LORD-REX/mangora",
    revision: "c9877b414e0a0443aeeb4eb95e522b7fd9f8c290",
  },
];

export { DEFAULT_REGION_DETECTOR_ID, isRegionDetectorId };

const DETECTOR_BY_ID = new Map<RegionDetectorId, RegionDetectorDef>(
  REGION_DETECTORS.map((detector) => [detector.id, detector]),
);

export function getRegionDetector(
  id: RegionDetectorId,
): RegionDetectorDef {
  const detector = DETECTOR_BY_ID.get(id);
  if (!detector) throw new Error(`Unknown region detector: ${id}`);
  return detector;
}

export function regionRoleForClass(
  detector: RegionDetectorDef,
  classId: number,
): DetectionRole | null {
  return detector.classRoles[classId] ?? null;
}
