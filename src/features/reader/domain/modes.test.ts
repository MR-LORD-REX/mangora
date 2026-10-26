import assert from "node:assert/strict";
import test from "node:test";

import { isReaderViewMode, readerViewModeFor } from "./modes";

test("readerViewModeFor maps legacy settings to exactly two views", () => {
  assert.equal(readerViewModeFor("pagedVertical"), "paged");
  assert.equal(readerViewModeFor("pagedHorizontal"), "paged");
  assert.equal(readerViewModeFor("scrollHorizontal"), "paged");
  assert.equal(readerViewModeFor("webtoon"), "strip");
  assert.equal(readerViewModeFor("continuousVertical"), "strip");
  assert.equal(readerViewModeFor("scrollVertical"), "strip");
});

test("isReaderViewMode rejects persisted legacy values", () => {
  assert.equal(isReaderViewMode("paged"), true);
  assert.equal(isReaderViewMode("strip"), true);
  assert.equal(isReaderViewMode("webtoon"), false);
});
