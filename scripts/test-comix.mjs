/**
 * test-comix.mjs
 *
 * Smoke tests for the Comix SDK.
 *
 * Offline mode (default) runs every parser against saved live fixtures in
 * services/comix/fixtures, so it works with no network and no test runner:
 *
 *     node scripts/test-comix.mjs
 *
 * Live mode additionally exercises the real HTTP client against comix.to:
 *
 *     node scripts/test-comix.mjs --live
 *
 * Exit code is 0 when every assertion passes.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, "..", "services", "comix", "fixtures");
const live = process.argv.includes("--live");

const {
  parseHomeFeed,
  parseMangaPage,
  parseBrowseMeta,
  parseChapterReadMeta,
  parseChapterRef,
  searchUrl,
  resolveUrl,
} = await import("../services/comix/comix.utils.ts");
const { ComixClient } = await import("../services/comix/comix.ts");

function fixture(name) {
  return fs.readFileSync(path.join(fixturesDir, name), "utf8");
}

let checks = 0;
function ok(condition, message) {
  assert.ok(condition, message);
  checks += 1;
}

// --- Home feed -----------------------------------------------------------
const home = parseHomeFeed(fixture("home.html"));
ok(home.sections.length === 4, "home has 4 sections");
const byId = Object.fromEntries(home.sections.map((s) => [s.id, s]));
ok(byId.trending?.items.length === 50, "trending ships 50 items");
ok(byId.follows?.items.length === 50, "follows ships 50 items");
ok(byId.hot?.items.length >= 20, "hot updates ships a page of items");
ok(byId.latest?.items.length >= 5, "new titles ships items");

const sample = byId.trending.items[0];
ok(sample.title.length > 0, "item has title");
ok(sample.url.startsWith("/title/"), "item url is /title/...");
ok(typeof sample.thumbnailUrl === "string" && sample.thumbnailUrl.length > 0, "item has poster");
ok(sample.contentRating === "safe" || sample.contentRating === "suggestive", "item content rating parsed");
console.log(`home ok  (trending=${byId.trending.items.length}, hot=${byId.hot.items.length}, latest=${byId.latest.items.length})`);
console.log("  sample:", sample.title, "|", sample.url, "|", sample.updatedLabel);

// --- Manga title page ----------------------------------------------------
const page = parseMangaPage(fixture("manga.html"));
ok(page.details.title.includes("Rewriting A Story"), "detail title parsed");
ok(page.details.authors.length > 0, "authors parsed");
ok(page.details.genres.length > 0, "genres parsed");
ok(page.details.firstChapterUrl?.includes("-chapter-0"), "firstChapterUrl parsed");
ok(page.details.latestChapterUrl?.includes("-chapter-87"), "latestChapterUrl parsed");
ok(page.details.externalLinks.mal?.startsWith("https://"), "external links parsed");
ok(Array.isArray(page.recommended) && page.recommended.length > 0, "recommended parsed");
ok(page.groups.length >= 1, "scanlation groups parsed");
console.log("manga ok:", page.details.title);
console.log("  authors:", page.details.authors.map((a) => a.title).join(", "));
console.log("  groups:", page.groups.length, "| recommended:", page.recommended.length);

// --- Browse filter vocabulary -------------------------------------------
const browse = parseBrowseMeta(fixture("browse.html"));
ok(browse.genres.length >= 20, "browse genres vocabulary parsed");
ok(browse.sorts.length >= 5, "browse sorts vocabulary parsed");
ok(browse.years.includes("2025"), "browse years parsed");
ok(browse.statuses.some((s) => s.value === "releasing"), "browse statuses parsed");
console.log(`browse ok (genres=${browse.genres.length}, demographics=${browse.demographics.length}, formats=${browse.formats.length}, sorts=${browse.sorts.length})`);

// --- Chapter reader metadata --------------------------------------------
const chapter = parseChapterReadMeta(fixture("chapter.html"));
ok(chapter?.mangaId === 2468, "chapter read mangaId");
ok(chapter?.mangaHid === "l7re", "chapter read mangaHid");
ok(chapter?.chapterId === 9777916, "chapter read chapterId");
ok(chapter?.chapterNumber === 0, "chapter read chapterNumber");
const ref = parseChapterRef(
  "/title/l7re-you-think-its-easy-rewriting-a-story/9777916-chapter-0",
);
ok(ref?.chapterId === 9777916 && ref?.chapterNumber === 0, "parseChapterRef");
console.log("chapter ok:", JSON.stringify(chapter));

// --- URL helpers ---------------------------------------------------------
const base = "https://comix.to";
ok(searchUrl(base, "solo") === `${base}/browse?keyword=solo`, "searchUrl encodes keyword");
ok(resolveUrl(base, "/title/x/1-chapter-2") === `${base}/title/x/1-chapter-2`, "resolveUrl joins paths");
console.log("urls ok");

if (live) {
  const client = new ComixClient();
  const liveFeed = await client.getHomeFeed();
  ok(liveFeed.sections.length === 4 && liveFeed.sections[0].items.length > 0, "live home feed");
  const first = liveFeed.sections[0].items[0];
  const livePage = await client.getMangaPage(first.url);
  ok(livePage.details.hid === first.hid, "live manga page matches feed hid");
  const liveBrowse = await client.getBrowseMeta();
  ok(liveBrowse.genres.length > 0, "live browse meta");
  console.log("live ok:", first.title);
} else {
  console.log("\n(live skipped; run with --live to hit comix.to)");
}

console.log(`\nPASSED ${checks} checks`);