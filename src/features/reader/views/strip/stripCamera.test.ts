import assert from "node:assert/strict";
import test from "node:test";

import {
  clampStripCameraTranslation,
  stripCameraAtBase,
  stripCameraWindowFor,
  stripCameraScreenPointToWorld,
  stripCameraTranslationForScale,
  stripCameraVisibleOffset,
  stripPageIndexForWorldY,
} from "./stripCamera";

const base = {
  scale: 1,
  scrollY: 100,
  viewportWidth: 400,
  viewportHeight: 800,
  contentHeight: 5000,
};

test("camera base-scale detection tolerates pinch rounding", () => {
  assert.equal(stripCameraAtBase(1), true);
  assert.equal(stripCameraAtBase(1.009), true);
  assert.equal(stripCameraAtBase(0.991), true);
  assert.equal(stripCameraAtBase(1.02), false);
  assert.equal(stripCameraAtBase(0.98), false);
});

test("unzoomed strip camera has no translation", () => {
  assert.deepEqual(clampStripCameraTranslation(base, 40, -30), {
    x: 0,
    y: 0,
  });
  assert.equal(stripCameraVisibleOffset(base, 0), 100);
  assert.equal(stripCameraScreenPointToWorld(base, 0, 0, 20, 30).y, 130);
});

test("zoomed-out camera stays at the current strip offset", () => {
  const zoomedOut = { ...base, scale: 0.5 };
  assert.deepEqual(clampStripCameraTranslation(zoomedOut, 999, 999), {
    x: 100,
    y: 100,
  });
  assert.deepEqual(clampStripCameraTranslation(zoomedOut, -999, -999), {
    x: 100,
    y: -999,
  });
});

test("zoomed-out camera centers content that fits the viewport", () => {
  const shortStrip = { ...base, contentHeight: 400, scale: 0.5 };
  assert.deepEqual(clampStripCameraTranslation(shortStrip, 999, 999), {
    x: 100,
    y: 400,
  });
});

test("zoomed camera clamps to content edges", () => {
  const zoomed = { ...base, scale: 2 };
  assert.deepEqual(clampStripCameraTranslation(zoomed, 999, 999), {
    x: 0,
    y: 100,
  });
  assert.deepEqual(clampStripCameraTranslation(zoomed, -999, -99999), {
    x: -400,
    y: 100 + 800 - 5000 * 2,
  });
});

test("focal zoom keeps the tapped content point under the finger", () => {
  const zoomed = { ...base, scale: 2 };
  const focalX = 120;
  const focalY = 300;
  const translation = stripCameraTranslationForScale(
    base,
    0,
    0,
    2,
    focalX,
    focalY,
  );
  const before = stripCameraScreenPointToWorld(
    base,
    0,
    0,
    focalX,
    focalY,
  );
  const after = stripCameraScreenPointToWorld(
    zoomed,
    translation.x,
    translation.y,
    focalX,
    focalY,
  );

  assert.ok(Math.abs(before.x - after.x) < 0.001);
  assert.ok(Math.abs(before.y - after.y) < 0.001);
});

test("page lookup uses world offsets and clamps at both ends", () => {
  const offsets = [0, 300, 900, 1200];
  assert.equal(stripPageIndexForWorldY(offsets, -20), 0);
  assert.equal(stripPageIndexForWorldY(offsets, 0), 0);
  assert.equal(stripPageIndexForWorldY(offsets, 450), 1);
  assert.equal(stripPageIndexForWorldY(offsets, 900), 2);
  assert.equal(stripPageIndexForWorldY(offsets, 99999), 2);
});

test("camera window follows zoomed panning instead of scrollY alone", () => {
  const offsets = [0, 1000, 2000, 3000, 4000];
  const zoomed = { ...base, scale: 4, scrollY: 0 };

  // At 4x, 800px of viewport covers 200 world px. Panning to world y=900
  // must mount row 1 even though the native scroll offset is still zero.
  assert.deepEqual(stripCameraWindowFor(offsets, 4, zoomed, -3600), {
    start: 0,
    end: 3,
    visibleOffset: 900,
    visibleHeight: 200,
  });
});

test("camera window expands as the strip zooms out", () => {
  const offsets = [0, 1000, 2000, 3000, 4000];
  const zoomedOut = { ...base, scale: 0.25, scrollY: 0 };
  const window = stripCameraWindowFor(offsets, 4, zoomedOut, 0);

  assert.equal(window.visibleOffset, 0);
  assert.equal(window.visibleHeight, 3200);
  assert.equal(window.start, 0);
  assert.equal(window.end, 3);
});

