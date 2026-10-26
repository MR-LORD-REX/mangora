import assert from "node:assert/strict";
import test from "node:test";

import type { NativeFilter } from "@platform/extensions/types";

import {
  buildFilterSelection,
  createFilterDraft,
  filterBlocks,
  removeFilterPath,
} from "./filters";

const filters: NativeFilter[] = [
  {
    path: "0",
    name: "Genre",
    type: "group",
    children: [
      { path: "0.0", name: "Action", type: "checkbox", state: false },
      { path: "0.1", name: "Drama", type: "checkbox", state: false },
    ],
  },
  {
    path: "1",
    name: "Status",
    type: "select",
    values: ["Any", "Ongoing", "Complete"],
    state: 0,
  },
  {
    path: "2",
    name: "Sort",
    type: "sort",
    values: ["Popular", "Latest"],
    state: { index: 0, ascending: true },
  },
];

test("filter draft keeps source defaults until the user changes a value", () => {
  const draft = createFilterDraft(filters);
  assert.deepEqual(buildFilterSelection(filters, draft), {
    schema: buildFilterSelection(filters, draft).schema,
    patches: [],
    chips: [],
    summaries: [],
  });
});

test("filter selection emits only changed patches and groups chips", () => {
  const draft = createFilterDraft(filters);
  draft["0.1"] = true;
  draft["1"] = 2;
  const selection = buildFilterSelection(filters, draft);
  assert.deepEqual(selection.patches, [
    { path: "0.1", state: true },
    { path: "1", state: 2 },
  ]);
  assert.deepEqual(
    selection.chips.map((chip) => chip.path),
    ["0.1", "1"],
  );
  assert.equal(selection.summaries.length, 2);
});

test("filter patches round-trip through schema matching", () => {
  const first = buildFilterSelection(filters, {
    ...createFilterDraft(filters),
    "0.0": true,
  });
  const draft = createFilterDraft(filters, first.patches);
  const second = buildFilterSelection(filters, draft);
  assert.equal(second.schema, first.schema);
  assert.deepEqual(second.patches, first.patches);
});

test("removeFilterPath keeps related group summaries coherent", () => {
  const draft = createFilterDraft(filters);
  draft["0.0"] = true;
  draft["0.1"] = true;
  const selection = buildFilterSelection(filters, draft);
  const after = removeFilterPath(selection, "0.0");
  assert.deepEqual(
    after.chips.map((chip) => chip.path),
    ["0.1"],
  );
  assert.equal(after.summaries.length, 1);
  assert.deepEqual(after.summaries[0].paths, ["0.1"]);
});

test("filterBlocks attaches header notes to the next editable filter", () => {
  const blocks = filterBlocks([
    { path: "h", name: "Filters", type: "header" },
    { path: "a", name: "Action", type: "checkbox", state: false },
  ]);
  assert.equal(blocks.length, 1);
  assert.deepEqual(blocks[0].notes, ["Filters"]);
  assert.equal(blocks[0].filter.path, "a");
});