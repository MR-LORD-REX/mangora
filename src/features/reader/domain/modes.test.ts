import assert from "node:assert/strict";
import test from "node:test";

import { isReaderViewMode, readerViewModeFor } from "./modes";

test("readerViewModeFor maps legacy settings to exactly two views", () => {
  assert.equal(readerViewModeFor("pagedHorizontal"), "paged");
  assert.equal(readerViewModeFor("webtoon"), "strip");
  assert.equal(readerViewModeFor("continuousVertical"), "strip");
});

test("isReaderViewMode rejects persisted legacy values", () => {
  assert.equal(isReaderViewMode("paged"), true);
  assert.equal(isReaderViewMode("strip"), true);
  assert.equal(isReaderViewMode("webtoon"), false);
});
