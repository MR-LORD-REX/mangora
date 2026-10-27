import assert from "node:assert/strict";
import test from "node:test";

import { chapterNavigationFlipped } from "./chapterDirection";

test("chapter navigation flips only for reversed horizontal paging", () => {
  assert.equal(chapterNavigationFlipped("pagedHorizontal", "rtl"), true);
  assert.equal(chapterNavigationFlipped("pagedHorizontal", "ltr"), false);
  assert.equal(chapterNavigationFlipped("webtoon", "rtl"), false);
  assert.equal(chapterNavigationFlipped("continuousVertical", "rtl"), false);
});
