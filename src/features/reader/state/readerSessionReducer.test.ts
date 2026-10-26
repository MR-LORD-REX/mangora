import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_READER_CHROME } from "@core/settings/readerChrome";

import {
  createInitialReaderSessionState,
  readerSessionReducer,
} from "./readerSessionReducer";

test("session defaults are isolated from the chrome object", () => {
  const state = createInitialReaderSessionState(DEFAULT_READER_CHROME);

  assert.equal(state.currentPageIndex, 0);
  assert.equal(state.showHeader, true);
  assert.equal(state.loading, true);
  assert.notEqual(state.chrome, DEFAULT_READER_CHROME);
});

test("page changes clamp to a non-negative integer", () => {
  const initial = createInitialReaderSessionState(DEFAULT_READER_CHROME);
  const state = readerSessionReducer(initial, {
    type: "page/set",
    pageIndex: -3.7,
  });

  assert.equal(state.currentPageIndex, 0);
  assert.equal(
    readerSessionReducer(state, { type: "page/set", pageIndex: 4.2 })
      .currentPageIndex,
    4,
  );
});

test("chrome patches merge without mutating the previous snapshot", () => {
  const initial = createInitialReaderSessionState(DEFAULT_READER_CHROME);
  const state = readerSessionReducer(initial, {
    type: "chrome/patch",
    patch: { sidePadding: 12, showPageNumber: false },
  });

  assert.equal(state.chrome.sidePadding, 12);
  assert.equal(state.chrome.showPageNumber, false);
  assert.equal(initial.chrome.sidePadding, DEFAULT_READER_CHROME.sidePadding);
});

test("chrome visibility and loading transitions are explicit", () => {
  const initial = createInitialReaderSessionState(DEFAULT_READER_CHROME);
  const hidden = readerSessionReducer(initial, {
    type: "chrome/visible/set",
    visible: false,
  });
  const shown = readerSessionReducer(hidden, { type: "chrome/toggle" });
  const loading = readerSessionReducer(shown, {
    type: "loading/set",
    loading: false,
  });

  assert.equal(hidden.showHeader, false);
  assert.equal(shown.showHeader, true);
  assert.equal(loading.loading, false);
});
