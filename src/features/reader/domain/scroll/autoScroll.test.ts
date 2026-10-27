import assert from "node:assert/strict";
import test from "node:test";

import {
  autoScrollPauseMs,
  autoScrollPixelsPerSecond,
  autoScrollSegment,
} from "./autoScroll";

const offsets = [0, 1200, 2600, 4000];

test("auto-scroll scales speed linearly and clamps the setting", () => {
  assert.equal(autoScrollPixelsPerSecond(1), 18);
  assert.equal(autoScrollPixelsPerSecond(5), 90);
  assert.equal(autoScrollPixelsPerSecond(0), 18);
  assert.equal(autoScrollPixelsPerSecond(99), 90);
});

test("auto-scroll takes one bounded segment while inside a page", () => {
  const segment = autoScrollSegment({
    offset: 100,
    maxOffset: 4000,
    speed: 1,
    viewportSize: 800,
    pageOffsets: offsets,
  });
  assert.notEqual(segment, null);
  assert.ok(segment!.distance > 4);
  assert.ok(segment!.target <= 4000);
  assert.equal(segment!.pause, false);
  assert.equal(autoScrollPauseMs(segment!), 0);
});

test("auto-scroll stops at the next page boundary when it is ahead", () => {
  const segment = autoScrollSegment({
    offset: 1190,
    maxOffset: 4000,
    speed: 1,
    viewportSize: 800,
    pageOffsets: offsets,
  });
  assert.equal(segment!.target, 1200);
  assert.equal(segment!.distance, 10);
  assert.equal(segment!.pause, true);
  assert.ok(autoScrollPauseMs(segment!) > 0);
});

test("auto-scroll does not snap to a page top before the reading line", () => {
  const spanning = [0, 1000, 1800, 3000];
  const segment = autoScrollSegment({
    offset: 200,
    maxOffset: 3000,
    speed: 1,
    viewportSize: 1200,
    pageOffsets: spanning,
  });
  // Page 1 starts ahead but has not reached the reading line yet, so this
  // segment remains bounded by speed rather than jumping.
  assert.equal(segment!.target, 200 + 18 * 0.8);
});

test("auto-scroll returns null at the end and for empty content", () => {
  assert.equal(
    autoScrollSegment({
      offset: 4000,
      maxOffset: 4000,
      speed: 3,
      viewportSize: 800,
      pageOffsets: offsets,
    }),
    null,
  );
  assert.equal(
    autoScrollSegment({
      offset: 0,
      maxOffset: 0,
      speed: 1,
      viewportSize: 800,
      pageOffsets: [0],
    }),
    null,
  );
});
