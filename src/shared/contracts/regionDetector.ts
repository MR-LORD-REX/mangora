/** Downloadable page-region detector selected by the user. */
export type RegionDetectorId =
  | "rtdetr-comic-v4"
  | "manga109-bubble-seg";

/** Detector-independent meaning of a region box. */
export type DetectionRole = "bubble" | "text_in_bubble" | "free_text";

/** Detector used when no valid preference is stored. */
export const DEFAULT_REGION_DETECTOR_ID: RegionDetectorId = "rtdetr-comic-v4";

const REGION_DETECTOR_IDS: readonly RegionDetectorId[] = [
  "rtdetr-comic-v4",
  "manga109-bubble-seg",
];

/** Persisted-value guard shared by settings, jobs and cache identity. */
export function isRegionDetectorId(value: unknown): value is RegionDetectorId {
  return (
    typeof value === "string" &&
    REGION_DETECTOR_IDS.includes(value as RegionDetectorId)
  );
}
