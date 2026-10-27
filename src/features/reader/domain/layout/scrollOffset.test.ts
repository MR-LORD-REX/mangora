import assert from "node:assert/strict";
import test from "node:test";

import { displayIndexForOffset } from "./scrollOffset";

const OFFSETS = [0, 100, 350, 700, 1000];

test("offset lookup finds the row containing the reading line", () => {
  assert.equal(displayIndexForOffset(OFFSETS, 0), 0);
  assert.equal(displayIndexForOffset(OFFSETS, 99), 0);
  assert.equal(displayIndexForOffset(OFFSETS, 100), 1);
  assert.equal(displayIndexForOffset(OFFSETS, 699), 2);
  assert.equal(displayIndexForOffset(OFFSETS, 700), 3);
});

test("offset lookup clamps outside the strip", () => {
  assert.equal(displayIndexForOffset(OFFSETS, -50), 0);
  assert.equal(displayIndexForOffset(OFFSETS, 10_000), 3);
});

test("offset lookup handles empty and single-row strips", () => {
  assert.equal(displayIndexForOffset([], 50), 0);
  assert.equal(displayIndexForOffset([0], 50), 0);
  assert.equal(displayIndexForOffset([0, 200], 50), 0);
  assert.equal(displayIndexForOffset([0, 200], 200), 0);
});
