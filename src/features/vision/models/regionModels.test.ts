import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_REGION_DETECTOR_ID } from "@shared/contracts/regionDetector";
import {
  REGION_DETECTORS,
  getRegionDetector,
  regionRoleForClass,
} from "./regionModels";

test("two peer detectors are available and RT-DETR is the default", () => {
  assert.deepEqual(
    REGION_DETECTORS.map((detector) => detector.id),
    ["rtdetr-comic-v4", "manga109-bubble-seg"],
  );
  assert.equal(DEFAULT_REGION_DETECTOR_ID, "rtdetr-comic-v4");
  assert.equal(REGION_DETECTORS[0].kind, "rtdetr");
  assert.equal(REGION_DETECTORS[1].kind, "segmentation");
});

test("class ids map to detector-independent roles", () => {
  const rtdetr = getRegionDetector("rtdetr-comic-v4");
  assert.equal(regionRoleForClass(rtdetr, 0), "bubble");
  assert.equal(regionRoleForClass(rtdetr, 1), "text_in_bubble");
  assert.equal(regionRoleForClass(rtdetr, 2), "free_text");

  const segmentation = getRegionDetector("manga109-bubble-seg");
  assert.equal(regionRoleForClass(segmentation, 0), "bubble");
  assert.equal(regionRoleForClass(segmentation, 1), null);
});

test("segmentation downloads from the pinned Mangora repository", () => {
  const segmentation = getRegionDetector("manga109-bubble-seg");
  assert.match(segmentation.files[0].url, /MR-LORD-REX\/mangora\//);
  assert.match(segmentation.files[0].url, /c9877b414e0a0443aeeb4eb95e522b7fd9f8c290/);
});
