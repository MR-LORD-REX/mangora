import assert from "node:assert/strict";
import test from "node:test";

import {
  selectPreviousContextPages,
  selectPreviousContextPagesUnique,
} from "./contextPages";

test("context pages exclude the current page and sort by page index", () => {
  const selected = selectPreviousContextPages(
    [
      { pageIndex: 1, value: "one" },
      { pageIndex: 4, value: "future" },
      { pageIndex: 3, value: "three" },
      { pageIndex: 2, value: "two" },
      { pageIndex: 3, value: "duplicate-three" },
    ],
    3,
    2,
  );
  assert.deepEqual(selected.map((entry) => entry.value), ["one", "two"]);
});

test("deduplicated context prefers richer page text and keeps the window", () => {
  const selected = selectPreviousContextPagesUnique(
    [
      { pageIndex: 1, value: { page: 1, bubbles: 2 } },
      { pageIndex: 1, value: { page: 1, bubbles: 5 } },
      { pageIndex: 2, value: { page: 2, bubbles: 3 } },
      { pageIndex: 3, value: { page: 3, bubbles: 4 } },
    ],
    4,
    2,
    (left, right) => left.bubbles > right.bubbles,
  );
  assert.deepEqual(selected, [
    { page: 2, bubbles: 3 },
    { page: 3, bubbles: 4 },
  ]);
});
