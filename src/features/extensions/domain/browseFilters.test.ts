import assert from "node:assert/strict";
import test from "node:test";

import type {
  ExtensionCatalogEntry,
  InstalledExtensionRecord,
} from "@platform/extensions/types";
import type { MissingExtensionGroup } from "../library/migration";

import {
  buildExtensionRows,
  buildInstalledByPackage,
  buildMigrateRows,
  buildSourceRows,
  buildSourceSections,
  collectLanguages,
  installLabel,
} from "./browseFilters";

const catalogEntry: ExtensionCatalogEntry = {
  name: "Reader Pack",
  packageName: "app.reader.pack",
  versionName: "1.0.0",
  versionCode: "10",
  contentWarning: null,
  extensionLib: "lib",
  repoUrl: "https://example.test/index.json",
  signingKey: null,
  resources: { apkUrl: "https://example.test/reader.apk" },
  sources: [
    { id: "1", name: "Alpha", language: "en" },
    { id: "2", name: "Beta", language: "ja" },
  ],
};

const installedRecord: InstalledExtensionRecord = {
  packageName: "app.reader.pack",
  name: "Reader Pack",
  versionName: "1.0.0",
  versionCode: "10",
  sourceDir: "/data/sources",
  extensionLib: "lib",
  signatureSha256: null,
  error: null,
  nsfw: false,
  sources: [
    {
      id: "1",
      name: "Alpha",
      lang: "en",
      packageName: "app.reader.pack",
      nsfw: false,
    },
    {
      id: "2",
      name: "Beta",
      lang: "ja",
      packageName: "app.reader.pack",
      nsfw: false,
    },
  ],
};

test("buildSourceRows filters content, language and query", () => {
  const rows = buildSourceRows([installedRecord], "all", "ja", "beta");
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.source.id, "2");
});

test("buildSourceSections pins and groups without duplicating rows", () => {
  const rows = buildSourceRows([installedRecord], "all", "all", "");
  const sections = buildSourceSections(rows, new Set(["1"]), { "2": 4 });
  assert.deepEqual(
    sections.map((section) => [section.title, section.data.length]),
    [
      ["Pinned", 1],
      ["Last used", 1],
      ["Other", 1],
    ],
  );
});

test("catalog filtering and install labels account for upgrades", () => {
  const map = buildInstalledByPackage([installedRecord]);
  assert.equal(buildExtensionRows([catalogEntry], map, "installed", "all", "all", "").length, 1);
  assert.equal(installLabel(catalogEntry, map), "Installed");
  assert.equal(
    installLabel(
      { ...catalogEntry, versionCode: "11", versionName: "1.1.0" },
      map,
    ),
    "Update",
  );
});

test("missing source rows map back to their catalog extension", () => {
  const missing: MissingExtensionGroup[] = [
    {
      sourceId: "1",
      provider: "ext:1",
      records: [
        {
          provider: "ext:1",
          sourceId: "1",
          providerMangaId: "m1",
          title: "Series",
          thumbnailUrl: null,
        },
      ],
    },
  ];
  const rows = buildMigrateRows(missing, [catalogEntry], "series");
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.extension?.packageName, "app.reader.pack");
});

test("languages are unique and sorted", () => {
  assert.deepEqual(
    collectLanguages([catalogEntry], [installedRecord]),
    ["en", "ja"],
  );
});
