import assert from "node:assert/strict";
import test from "node:test";

import {
  clampStripCameraTranslation,
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

test("unzoomed strip camera has no translation", () => {
  assert.deepEqual(clampStripCameraTranslation(base, 40, -30), {
    x: 0,
    y: 0,
  });
  assert.equal(stripCameraVisibleOffset(base, 0), 100);
  assert.equal(stripCameraScreenPointToWorld(base, 0, 0, 20, 30).y, 130);
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

