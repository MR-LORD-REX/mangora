import assert from "node:assert/strict";
import test from "node:test";

import { pagedSlicesFor, sliceSourceHeight } from "./pagedSlices";

test("pages at or below the viewport stay in one slice", () => {
  assert.deepEqual(pagedSlicesFor({ width: 400, height: 800 }, 800), [
    { index: 0, count: 1, top: 0, height: 1 },
  ]);
  assert.deepEqual(pagedSlicesFor({ width: 400, height: 400 }, 800), [
    { index: 0, count: 1, top: 0, height: 1 },
  ]);
});

test("tall pages split into evenly balanced source windows", () => {
  const slices = pagedSlicesFor({ width: 400, height: 1700 }, 800);

  assert.equal(slices.length, 3);
  assert.deepEqual(
    slices.map((slice) => [slice.index, slice.count]),
    [
      [0, 3],
      [1, 3],
      [2, 3],
    ],
  );
  slices.forEach((slice, index) => {
    assert.ok(Math.abs(slice.top - index / 3) < 1e-9);
    assert.ok(Math.abs(slice.height - 1 / 3) < 1e-9);
  });
  assert.equal(
    slices.reduce(
      (total, slice) => total + slice.height,
      0,
    ),
    1,
  );
});

test("slice source height maps back to the source image", () => {
  const image = { width: 400, height: 1600 };
  const slices = pagedSlicesFor(image, 800);

  assert.equal(sliceSourceHeight(image, slices[0]!), 800);
  assert.equal(sliceSourceHeight(image, slices[1]!), 800);
});

test("invalid geometry degrades to one full slice", () => {
  assert.deepEqual(pagedSlicesFor({ width: 0, height: 0 }, 800), [
    { index: 0, count: 1, top: 0, height: 1 },
  ]);
  assert.deepEqual(pagedSlicesFor({ width: 400, height: 800 }, 0), [
    { index: 0, count: 1, top: 0, height: 1 },
  ]);
});
