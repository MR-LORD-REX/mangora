import assert from "node:assert/strict";
import test from "node:test";

import type { ViewerChapterRow } from "@shared/contracts";
import {
  extremeChapter,
  flattenGroups,
  groupNumber,
  groupRows,
  sortGroups,
} from "./chapterGroups";

function chapter(
  key: string,
  overrides: Partial<ViewerChapterRow> = {},
): ViewerChapterRow {
  return {
    key,
    kind: "chapter",
    title: key,
    ...overrides,
  };
}

test("groupRows merges duplicate uploads into one main chapter", () => {
  const groups = groupRows([
    chapter("a", { number: 45, scanGroup: "Alpha" }),
    chapter("b", { number: 45, scanGroup: "Beta" }),
    chapter("c", { number: 46 }),
  ]);

  assert.deepEqual(
    groups.map((group) => [group.key, group.rows.length]),
    [
      ["45", 2],
      ["46", 1],
    ],
  );
  assert.equal(groupNumber(groups[0]!), 45);
});

test("flattenGroups adds headers only for grouped or explicit sections", () => {
  const rows = flattenGroups(
    groupRows([
      chapter("a", { number: 1 }),
      chapter("b", { number: 2 }),
      chapter("c", { number: 2 }),
    ]),
  );

  assert.deepEqual(
    rows.map((row) => [row.kind, row.title, row.nested]),
    [
      ["chapter", "a", false],
      ["section", "Chapter 2", undefined],
      ["chapter", "b", true],
      ["chapter", "c", true],
    ],
  );
});

test("sortGroups supports number, date and stable alphabetical order", () => {
  const groups = groupRows([
    chapter("z", { number: 1, date: 300, title: "Alpha" }),
    chapter("a", { number: 3, date: 100, title: "Zulu" }),
    chapter("m", { number: 2, date: 200, title: "Mike" }),
  ]);

  assert.deepEqual(
    sortGroups(groups, "number", "desc").map((group) => group.key),
    ["3", "2", "1"],
  );
  assert.deepEqual(
    sortGroups(groups, "date", "asc").map((group) => group.key),
    ["3", "2", "1"],
  );
  assert.deepEqual(
    sortGroups(groups, "alpha", "asc").map((group) => group.key),
    ["1", "2", "3"],
  );
});

test("extremeChapter uses numeric order and falls back to source order", () => {
  const rows = [
    chapter("first", { number: 9 }),
    chapter("latest", { number: 12 }),
    chapter("special"),
  ];

  assert.equal(extremeChapter(rows, true)?.key, "latest");
  assert.equal(extremeChapter(rows, false)?.key, "first");
  assert.equal(extremeChapter([chapter("only")], true)?.key, "only");
});
