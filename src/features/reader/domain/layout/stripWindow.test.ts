import assert from "node:assert/strict";
import test from "node:test";

import { stripWindowForOffset } from "./stripWindow";

const offsets = [0, 100, 250, 600, 900];

test("strip window includes the active page and bounded neighbors", () => {
  assert.deepEqual(
    stripWindowForOffset(offsets, 4, 260, 300, 1),
    { start: 1, end: 3 },
  );
});

test("strip window clamps at both ends", () => {
  assert.deepEqual(
    stripWindowForOffset(offsets, 4, 0, 300, 1),
    { start: 0, end: 3 },
  );
  assert.deepEqual(
    stripWindowForOffset(offsets, 4, 850, 300, 1),
    { start: 2, end: 3 },
  );
});

test("strip window handles empty data and a single tall page", () => {
  assert.deepEqual(stripWindowForOffset([], 0, 0, 300), { start: 0, end: -1 });
  assert.deepEqual(
    stripWindowForOffset([0, 4000], 1, 0, 300, 2),
    { start: 0, end: 0 },
  );
});
