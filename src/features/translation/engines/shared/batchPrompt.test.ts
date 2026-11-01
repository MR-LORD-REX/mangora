import assert from "node:assert/strict";
import test from "node:test";

import {
  parseBatchJson,
  validateBatchResults,
  type TranslationPagePayload,
} from "./batchPrompt";

const batch: TranslationPagePayload[] = [
  {
    label: "page_0",
    pageIndex: 4,
    regions: [
      { regionId: 1, text: "One" },
      { regionId: 2, text: "Two" },
    ],
  },
];

test("validator accepts every requested region exactly once", () => {
  const parsed = parseBatchJson(
    '{"results":[{"label":"page_0","regionId":2,"text":"B"},{"label":"page_0","regionId":1,"text":"A"}]}',
  );
  assert.equal(validateBatchResults(parsed, batch).length, 2);
});

test("validator rejects missing, duplicate, unknown and malformed results", () => {
  const cases: { raw: string; message: RegExp }[] = [
    {
      raw: '{"results":[{"label":"page_0","regionId":1,"text":"A"}]}',
      message: /omitted/,
    },
    {
      raw: '{"results":[{"label":"page_0","regionId":1,"text":"A"},{"label":"page_0","regionId":1,"text":"A"}]}',
      message: /duplicated/,
    },
    {
      raw: '{"results":[{"label":"page_0","regionId":1,"text":"A"},{"label":"page_0","regionId":2,"text":"B"},{"label":"page_0","regionId":99,"text":"X"}]}',
      message: /unknown/,
    },
    {
      raw: '{"results":[{"label":"page_0","regionId":"1","text":"A"}]}',
      message: /malformed/,
    },
  ];
  for (const entry of cases) {
    assert.throws(
      () => validateBatchResults(parseBatchJson(entry.raw), batch),
      entry.message,
    );
  }
});
