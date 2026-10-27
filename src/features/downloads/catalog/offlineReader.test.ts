import assert from "node:assert/strict";
import test from "node:test";

import type { Download } from "@core/db/schema";
import { offlineReaderTarget } from "./offlineReader";

const download: Download = {
  id: "ext:123:series:chapter/5?x=1",
  mangaId: "ext:123:series",
  provider: "ext:123",
  providerMangaId: "series/a?x=1&y=2",
  providerChapterId: "chapter/5?x=1&y=2",
  mangaTitle: "Series",
  thumbnailUrl: "https://cdn.example.test/cover.jpg",
  thumbnailPath: "file:///local/cover.jpg",
  chapterTitle: "Chapter 5",
  chapterIndex: "5",
  chapterNumber: 5,
  scanlationGroup: "Scan Team",
  chapterGroupKey: "5",
  languageCode: "en",
  pageCount: 20,
  downloadedPages: 20,
  byteSize: 1_024,
  status: "completed",
  error: null,
  fileUri: "file:///downloads/chapter.cbz",
  fileName: "chapter.cbz",
  folderUri: "file:///downloads",
  pagesDirUri: "file:///cache/pages",
  createdAt: 1,
  updatedAt: 2,
  completedAt: 3,
};

test("offline reader target preserves opaque identity and encoded params", () => {
  const target = offlineReaderTarget(download);

  assert.equal(target.provider, "ext:123");
  assert.equal(target.providerMangaId, download.providerMangaId);
  assert.equal(target.providerChapterId, download.providerChapterId);
  assert.equal(target.mangaTitle, "Series");
  assert.equal(target.chapterTitle, "Chapter 5");
  assert.equal(target.chapterNumber, 5);
  assert.equal(target.scanlationGroup, "Scan Team");
  assert.equal(target.chapterGroupKey, "5");
  assert.equal(target.languageCode, "en");
  assert.equal(target.thumbnailUrl, "file:///local/cover.jpg");
  assert.deepEqual(target.readerParams, {
    id: "chapter%2F5%3Fx%3D1%26y%3D2",
    source: "ext:123",
    mangaId: "series%2Fa%3Fx%3D1%26y%3D2",
    mangaTitle: "Series",
    chapterTitle: "Chapter 5",
    chapterNumber: 5,
    language: "en",
    thumbnailUrl: "file:///local/cover.jpg",
  });
});

test("offline reader target omits absent optional reader parameters", () => {
  const target = offlineReaderTarget({
    ...download,
    thumbnailPath: null,
    thumbnailUrl: null,
    chapterNumber: null,
    scanlationGroup: null,
    chapterGroupKey: null,
    languageCode: null,
  });

  assert.equal(target.thumbnailUrl, null);
  assert.deepEqual(target.readerParams, {
    id: "chapter%2F5%3Fx%3D1%26y%3D2",
    source: "ext:123",
    mangaId: "series%2Fa%3Fx%3D1%26y%3D2",
    mangaTitle: "Series",
    chapterTitle: "Chapter 5",
  });
});
