import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveTapZoneAction,
  tapZoneRectsFor,
} from "./tapZones";

const viewport = { width: 900, height: 1200 };

test("L-shaped zones resolve previous and next page taps", () => {
  assert.equal(
    resolveTapZoneAction({
      layout: "l",
      x: viewport.width / 2,
      y: viewport.height / 6,
      ...viewport,
    }),
    "prev",
  );
  assert.equal(
    resolveTapZoneAction({
      layout: "l",
      x: viewport.width / 2,
      y: (viewport.height * 5) / 6,
      ...viewport,
    }),
    "next",
  );
});

test("disabled zones always toggle chrome", () => {
  assert.deepEqual(tapZoneRectsFor("disabled", viewport.width, viewport.height), []);
  assert.equal(
    resolveTapZoneAction({
      layout: "disabled",
      x: 10,
      y: 10,
      ...viewport,
    }),
    "toggle",
  );
});

test("RTL flips physical side zones but not semantic top zones", () => {
  const options = { layout: "rightLeft", ...viewport, rtl: true } as const;

  assert.equal(
    resolveTapZoneAction({ ...options, x: viewport.width / 6, y: viewport.height / 2 }),
    "next",
  );
  assert.equal(
    resolveTapZoneAction({ ...options, x: (viewport.width * 5) / 6, y: viewport.height / 2 }),
    "prev",
  );
  assert.equal(
    resolveTapZoneAction({ layout: "topBottom", x: viewport.width / 2, y: viewport.height / 6, ...viewport }),
    "prev",
  );
});

test("vertical inversion moves the hit rectangle with the preview", () => {
  assert.equal(
    resolveTapZoneAction({
      layout: "topBottom",
      invert: "vertical",
      x: viewport.width / 2,
      y: (viewport.height * 5) / 6,
      ...viewport,
    }),
    "prev",
  );
  const preview = tapZoneRectsFor(
    "topBottom",
    viewport.width,
    viewport.height,
    false,
    "vertical",
  );
  assert.equal(
    preview.find((rect) => rect.y > viewport.height / 2)?.action,
    "prev",
  );
});
