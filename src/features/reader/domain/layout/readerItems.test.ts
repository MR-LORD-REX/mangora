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
