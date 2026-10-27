import assert from "node:assert/strict";
import test from "node:test";

import type { DownloadedMangaSummary } from "@core/db/repositories/downloadRepository";
import {
  downloadedMangaToLibraryCards,
  hasActiveLibraryFilters,
} from "./libraryCards";

const downloaded: DownloadedMangaSummary = {
  mangaId: "ext:123:series",
  provider: "ext:123",
  providerMangaId: "series",
  title: "Needle in a Stack",
  thumbnailUrl: "https://cdn.example.test/cover.jpg",
  thumbnailPath: "file:///local/cover.jpg",
  chapterCount: 42,
  byteSize: 1_024,
  updatedAt: 9_876,
};

test("downloaded cards preserve identity and prefer the local cover", () => {
  const cards = downloadedMangaToLibraryCards([downloaded], " NEEDLE ");

  assert.deepEqual(cards, [
    {
      id: "ext:123:series",
      provider: "ext:123",
      providerMangaId: "series",
      title: "Needle in a Stack",
      thumbnailUrl: "file:///local/cover.jpg",
      addedAt: 9_876,
      totalChapters: 42,
      unreadChapters: 0,
    },
  ]);
  assert.deepEqual(
    downloadedMangaToLibraryCards([downloaded], "missing"),
    [],
  );
});

test("library filters are active only for a provider or non-default sort", () => {
  assert.equal(hasActiveLibraryFilters("", "addedDesc"), false);
  assert.equal(hasActiveLibraryFilters("ext:123", "addedDesc"), true);
  assert.equal(hasActiveLibraryFilters("", "titleAsc"), true);
});
