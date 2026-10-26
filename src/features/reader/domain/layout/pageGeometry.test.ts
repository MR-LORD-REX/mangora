import assert from "node:assert/strict";
import test from "node:test";

import { pageGeometry } from "./pageGeometry";

const body = { width: 400, height: 800 };

test("strip pages share a fit-width world column", () => {
  const geometry = pageGeometry(
    "page",
    "webtoon",
    10,
    body,
    { page: { width: 1000, height: 2000 } },
    "original",
  );

  assert.deepEqual(geometry, {
    itemW: 400,
    itemH: 720,
    imgW: 360,
    imgH: 720,
    overlayW: 360,
    overlayH: 720,
    zoom: false,
    rotate: false,
  });
});

test("paged fit modes keep the viewport slot and image box separate", () => {
  const fitWidth = pageGeometry(
    "page",
    "pagedHorizontal",
    0,
    body,
    { page: { width: 1000, height: 2000 } },
    "fitWidth",
  );
  const original = pageGeometry(
    "page",
    "pagedHorizontal",
    0,
    body,
    { page: { width: 1000, height: 2000 } },
    "original",
  );

  assert.deepEqual(fitWidth, {
    itemW: 400,
    itemH: 800,
    imgW: 400,
    imgH: 800,
    overlayW: 400,
    overlayH: 800,
    zoom: false,
    rotate: false,
  });
  assert.equal(original.imgW, 1000);
  assert.equal(original.imgH, 2000);
  assert.equal(original.zoom, true);
});

test("split halves map the full source overlay while showing one half", () => {
  const geometry = pageGeometry(
    "spread",
    "pagedHorizontal",
    0,
    body,
    { spread: { width: 1000, height: 500 } },
    "fitScreen",
    false,
    "left",
  );

  assert.equal(geometry.imgW, 400);
  assert.equal(geometry.imgH, 400);
  assert.equal(geometry.overlayW, 800);
  assert.equal(geometry.overlayH, 400);
});

test("rotation wins over splitting and uses the rotated natural box", () => {
  const geometry = pageGeometry(
    "spread",
    "pagedHorizontal",
    0,
    body,
    { spread: { width: 1000, height: 500 } },
    "fitWidth",
    true,
    "left",
  );

  assert.equal(geometry.rotate, true);
  assert.equal(geometry.imgW, 400);
  assert.equal(geometry.imgH, 800);
  assert.equal(geometry.overlayW, 400);
});

test("pure geometry accepts an explicit viewport fallback", () => {
  const geometry = pageGeometry(
    "unknown",
    "webtoon",
    0,
    { width: 0, height: 0 },
    {},
    "fitScreen",
    false,
    null,
    { width: 300, height: 600 },
  );

  assert.equal(geometry.itemW, 300);
  assert.equal(geometry.itemH, 420);
  assert.equal(geometry.imgW, 300);
});
