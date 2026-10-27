import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPageOffsets,
  layoutForDisplayItem,
} from "./pageOffsets";
import { pageGeometry } from "./pageGeometry";

const body = { width: 400, height: 800 };

test("paged offsets use slot width and ignore webtoon gaps", () => {
  const offsets = buildPageOffsets(
    [
      { url: "one", half: null, slice: null, gapAfter: true },
      { url: "two", half: null, slice: null, gapAfter: true },
    ],
    "pagedHorizontal",
    0,
    body,
    {
      one: { width: 1000, height: 2000 },
      two: { width: 1000, height: 2000 },
    },
    "fitScreen",
    false,
    40,
  );

  assert.deepEqual(offsets, [0, 400, 800]);
});

test("strip offsets include the webtoon gap after each row", () => {
  const offsets = buildPageOffsets(
    [
      { url: "one", half: null, slice: null, gapAfter: true },
      { url: "two", half: null, slice: null, gapAfter: true },
    ],
    "webtoon",
    10,
    body,
    {
      one: { width: 1000, height: 2000 },
      two: { width: 1000, height: 2000 },
    },
    "fitScreen",
    false,
    24,
  );

  assert.deepEqual(offsets, [0, 744, 1488]);
});

test("gap-less continuous strips omit the configured gap", () => {
  const offsets = buildPageOffsets(
    [{ url: "one", half: null, slice: null, gapAfter: true }],
    "continuousVertical",
    10,
    body,
    { one: { width: 1000, height: 2000 } },
    "fitScreen",
    false,
    24,
  );

  assert.deepEqual(offsets, [0, 720]);
});

test("unmeasured rows keep a positive layout length", () => {
  const offsets = buildPageOffsets(
    [{ url: "unknown", half: null, slice: null, gapAfter: false }],
    "pagedHorizontal",
    0,
    body,
    {},
  );

  assert.equal(offsets.length, 2);
  assert.equal(offsets[0], 0);
  assert.ok((offsets[1] ?? 0) > 0);
});

test("row layout matches the shared page geometry", () => {
  const item = {
    url: "spread",
    half: "left" as const,
    slice: null,
    gapAfter: true,
  };
  const dims = { spread: { width: 1000, height: 500 } };
  const expected = pageGeometry(
    item.url,
    "pagedHorizontal",
    0,
    body,
    dims,
    "fitScreen",
    false,
    item.half,
    undefined,
    null,
  );

  assert.deepEqual(
    layoutForDisplayItem(item, "pagedHorizontal", 0, body, dims),
    expected,
  );
});