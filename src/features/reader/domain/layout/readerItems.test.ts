import assert from "node:assert/strict";
import test from "node:test";

import {
  buildReaderDisplayItems,
  splitOrderFor,
} from "./readerItems";

test("splitOrderFor follows the selected page direction", () => {
  assert.deepEqual(splitOrderFor("ltr"), ["left", "right"]);
  assert.deepEqual(splitOrderFor("rtl"), ["right", "left"]);
});

test("wide pages become two rows keyed to one source page", () => {
  const items = buildReaderDisplayItems(
    ["portrait", "spread"],
    { portrait: { width: 800, height: 1200 }, spread: { width: 1600, height: 900 } },
    {
      splitWidePages: true,
      rotateWidePagesToFit: false,
      pagedDirection: "rtl",
    },
  );

  assert.deepEqual(
    items.map((item) => [item.key, item.pageIndex, item.half, item.gapAfter]),
    [
      ["0:full:portrait", 0, null, true],
      ["1:right:spread", 1, "right", false],
      ["1:left:spread", 1, "left", true],
    ],
  );
});

test("rotation disables splitting so one rotated row remains", () => {
  const items = buildReaderDisplayItems(
    ["spread"],
    { spread: { width: 1600, height: 900 } },
    {
      splitWidePages: true,
      rotateWidePagesToFit: true,
      pagedDirection: "ltr",
    },
  );

  assert.equal(items.length, 1);
  assert.equal(items[0]?.half, null);
});

test("measured tall portrait pages become slices with one logical page", () => {
  const items = buildReaderDisplayItems(
    ["tall"],
    { tall: { width: 600, height: 2400 } },
    {
      splitWidePages: false,
      rotateWidePagesToFit: false,
      pagedDirection: "ltr",
      sliceTallPages: true,
      viewportHeight: 800,
      imageScaleType: "fitScreen",
      sidePadding: 0,
      body: { width: 400, height: 800 },
    },
  );

  assert.equal(items.length, 2);
  assert.deepEqual(
    items.map((item) => [item.key, item.pageIndex, item.slice?.index, item.gapAfter]),
    [
      ["0:slice:0:tall", 0, 0, false],
      ["0:slice:1:tall", 0, 1, true],
    ],
  );
});

test("unmeasured and wide pages remain unsliced", () => {
  const items = buildReaderDisplayItems(
    ["unknown", "spread"],
    { spread: { width: 1600, height: 900 } },
    {
      splitWidePages: false,
      rotateWidePagesToFit: false,
      pagedDirection: "ltr",
      sliceTallPages: true,
      viewportHeight: 800,
      body: { width: 400, height: 800 },
    },
  );

  assert.deepEqual(
    items.map((item) => [item.key, item.slice]),
    [
      ["0:full:unknown", null],
      ["1:full:spread", null],
    ],
  );
});
