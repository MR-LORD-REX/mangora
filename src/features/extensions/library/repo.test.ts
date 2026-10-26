import assert from "node:assert/strict";
import test from "node:test";

import {
  mergeCatalog,
  normalizeRepoUrl,
  parseExtensionRepo,
  parseRepoJson,
} from "./catalogIndex";

test("parseRepoJson quotes long source ids without changing version codes", () => {
  const parsed = parseRepoJson(
    '{"id":1234567890123456789,"versionCode":42}',
  ) as Record<string, unknown>;
  assert.equal(parsed.id, "1234567890123456789");
  assert.equal(parsed.versionCode, 42);
});

test("normalizeRepoUrl converts GitHub blob and home URLs", () => {
  assert.equal(
    normalizeRepoUrl("https://github.com/owner/repo/blob/repo/index.json"),
    "https://raw.githubusercontent.com/owner/repo/repo/index.json",
  );
  assert.equal(
    normalizeRepoUrl("https://github.com/owner/repo"),
    "https://raw.githubusercontent.com/owner/repo/repo/index.json",
  );
  assert.equal(normalizeRepoUrl("  "), "");
});

test("parseExtensionRepo preserves raw string source ids", () => {
  const repo = parseExtensionRepo(
    '{"name":"Test repo","signingKey":" ABC ","extensionList":{"extensions":[{"name":"Example","packageName":"app.example","versionCode":7,"versionName":"1.2","resources":{"apkUrl":"https://example.test/a.apk"},"sources":[{"id":1234567890123456789,"name":"English","language":"en"}]},{"name":"Incomplete","resources":{}}]}}',
    "https://example.test/index.json",
    "https://example.test",
  );
  assert.equal(repo.extensions.length, 1);
  assert.equal(repo.signingKey, "abc");
  assert.equal(repo.extensions[0].sources[0].id, "1234567890123456789");
  assert.equal(repo.extensions[0].versionCode, "7");
});

test("mergeCatalog keeps the newest version of a package", () => {
  const base = {
    resources: { apkUrl: "https://example.test/a.apk" },
    extensionLib: "1.6",
    versionName: "1",
    sources: [],
  };
  const merged = mergeCatalog([
    {
      url: "one",
      sourceUrl: "one",
      name: "Repo one",
      signingKey: null,
      fetchedAt: 1,
      extensions: [
        { ...base, name: "Example", packageName: "app.example", versionCode: "1" },
      ],
    },
    {
      url: "two",
      sourceUrl: "two",
      name: "Repo two",
      signingKey: "key",
      fetchedAt: 1,
      extensions: [
        { ...base, name: "Example", packageName: "app.example", versionCode: "2" },
        { ...base, name: "Other", packageName: "app.other", versionCode: "1" },
      ],
    },
  ]);
  assert.deepEqual(
    merged.map((entry) => [entry.packageName, entry.versionCode, entry.repoUrl]),
    [
      ["app.example", "2", "two"],
      ["app.other", "1", "two"],
    ],
  );
});