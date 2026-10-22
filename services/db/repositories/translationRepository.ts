/**
 * translationRepository.ts
 * ---------------------------------------------------------------------------
 * Persists the reader's per-page translation cache and the Gemini usage rows.
 *
 * Page cache
 * ----------
 * After a page is translated (free or AI) the reader upserts one
 * translation_pages row plus its translation_regions. Rows are keyed by
 * (mangaId, page url, sourceLanguage, targetLanguage, promptVersion); a later
 * visit to the same page with the same source -> target pair restores the
 * overlay straight from SQLite (coordinates included) without spending OCR or
 * an API call.
 *
 * Usage
 * -----
 * Every Gemini attempt writes a translation_usage row (model, timestamp,
 * success, tokens) which backs the RPM / TPM / RPD meters in the translation
 * options panel.
 * ---------------------------------------------------------------------------
 */

import { and, asc, desc, eq, gte, like, notInArray, sql } from "drizzle-orm";

import { db } from "../client";
import {
  translationPages,
  translationRegions,
  translationUsage,
} from "../schema";
import type {
  Box,
  BubbleMask,
} from "@/services/translation/translation.types";
import type { GeminiModelId } from "@/services/translation/geminiModels";

/** Bump when the stored geometry/prompt contract changes. */
export const TRANSLATION_CACHE_PROMPT_VERSION = "v3";

export interface StoredTranslationRegion {
  regionId: number;
  sourceText: string;
  translatedText: string | null;
  kind: "bubble" | "messy";
  pasteBox: Box;
  eraseBoxes: Box[];
  mask?: BubbleMask;
  lineCount?: number;
}

export interface SaveTranslationPageInput {
  mangaId: string;
  chapterId?: string | null;
  pageUrl: string;
  sourceLanguage: string;
  targetLanguage: string;
  model?: string | null;
  imageWidth: number;
  imageHeight: number;
  regions: StoredTranslationRegion[];
}

export interface CachedTranslationPage {
  id: string;
  mangaId: string;
  chapterId: string | null;
  pageUrl: string;
  sourceLanguage: string;
  targetLanguage: string;
  model: string | null;
  imageWidth: number;
  imageHeight: number;
  regions: StoredTranslationRegion[];
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

async function findPageId(input: {
  mangaId: string;
  pageUrl: string;
  sourceLanguage: string;
  targetLanguage: string;
}): Promise<string | null> {
  const rows = await db
    .select({ id: translationPages.id })
    .from(translationPages)
    .where(
      and(
        eq(translationPages.mangaId, input.mangaId),
        eq(translationPages.pageKey, input.pageUrl),
        eq(translationPages.sourceLanguage, input.sourceLanguage),
        eq(translationPages.targetLanguage, input.targetLanguage),
        eq(
          translationPages.promptVersion,
          TRANSLATION_CACHE_PROMPT_VERSION,
        ),
      ),
    )
    .limit(1);
  return rows[0]?.id ?? null;
}

function regionGeometry(region: StoredTranslationRegion): string {
  return JSON.stringify({
    kind: region.kind,
    pasteBox: region.pasteBox,
    eraseBoxes: region.eraseBoxes,
    mask: region.mask,
    lineCount: region.lineCount,
  });
}

function parseRegionGeometry(raw: string): {
  kind: StoredTranslationRegion["kind"];
  pasteBox: Box;
  eraseBoxes: Box[];
  mask?: BubbleMask;
  lineCount?: number;
} {
  const parsed = JSON.parse(raw) as {
    kind?: StoredTranslationRegion["kind"];
    pasteBox?: Box;
    eraseBoxes?: Box[];
    mask?: BubbleMask;
    lineCount?: number;
  };
  const mask =
    parsed.mask &&
    Array.isArray(parsed.mask.polygon) &&
    parsed.mask.polygon.length >= 3 &&
    parsed.mask.bounds
      ? parsed.mask
      : undefined;
  return {
    kind: parsed.kind === "messy" ? "messy" : "bubble",
    pasteBox: parsed.pasteBox ?? { x1: 0, y1: 0, x2: 0, y2: 0 },
    eraseBoxes: Array.isArray(parsed.eraseBoxes) ? parsed.eraseBoxes : [],
    mask,
    lineCount:
      typeof parsed.lineCount === "number" && parsed.lineCount > 0
        ? Math.round(parsed.lineCount)
        : undefined,
  };
}

/** Upserts one translated page (+ regions) into the DB cache. */
export async function saveTranslationPage(
  input: SaveTranslationPageInput,
): Promise<void> {
  const now = Date.now();
  const existingId = await findPageId(input);
  let pageId = existingId;

  if (pageId) {
    await db
      .update(translationPages)
      .set({
        chapterId: input.chapterId ?? null,
        pageUrl: input.pageUrl,
        model: input.model ?? null,
        imageWidth: input.imageWidth,
        imageHeight: input.imageHeight,
        updatedAt: now,
      })
      .where(eq(translationPages.id, pageId));
    await db
      .delete(translationRegions)
      .where(eq(translationRegions.pageId, pageId));
  } else {
    pageId = newId("tp");
    await db.insert(translationPages).values({
      id: pageId,
      mangaId: input.mangaId,
      chapterId: input.chapterId ?? null,
      pageKey: input.pageUrl,
      pageUrl: input.pageUrl,
      sourceLanguage: input.sourceLanguage,
      targetLanguage: input.targetLanguage,
      model: input.model ?? null,
      promptVersion: TRANSLATION_CACHE_PROMPT_VERSION,
      imageWidth: input.imageWidth,
      imageHeight: input.imageHeight,
      createdAt: now,
      updatedAt: now,
    });
  }

  if (input.regions.length > 0) {
    await db.insert(translationRegions).values(
      input.regions.map((region) => ({
        id: newId("tr"),
        pageId: pageId as string,
        regionId: region.regionId,
        sourceText: region.sourceText,
        translatedText: region.translatedText,
        geometryJson: regionGeometry(region),
        createdAt: now,
        updatedAt: now,
      })),
    );
  }
}

/**
 * Returns the cached translation for a page when the same source -> target
 * pair was translated before, otherwise null.
 */
export async function findTranslationPage(input: {
  mangaId: string;
  pageUrl: string;
  sourceLanguage: string;
  targetLanguage: string;
  /** Used to find records created before reader pages stopped using cache paths. */
  chapterId?: string;
  legacyPageIndex?: number;
}): Promise<CachedTranslationPage | null> {
  let pageId = await findPageId(input);
  if (!pageId && input.chapterId && input.legacyPageIndex != null) {
    const pageNumber = String(input.legacyPageIndex + 1).padStart(4, "0");
    const legacyRows = await db
      .select({ id: translationPages.id })
      .from(translationPages)
      .where(
        and(
          eq(translationPages.mangaId, input.mangaId),
          eq(translationPages.chapterId, input.chapterId),
          eq(translationPages.sourceLanguage, input.sourceLanguage),
          eq(translationPages.targetLanguage, input.targetLanguage),
          eq(
            translationPages.promptVersion,
            TRANSLATION_CACHE_PROMPT_VERSION,
          ),
          like(
            translationPages.pageKey,
            `%/reader-cache/%/images/${pageNumber}.%`,
          ),
        ),
      )
      .orderBy(desc(translationPages.updatedAt))
      .limit(1);
    pageId = legacyRows[0]?.id ?? null;
  }
  if (!pageId) return null;

  const [pageRow, regionRows] = await Promise.all([
    db
      .select()
      .from(translationPages)
      .where(eq(translationPages.id, pageId))
      .limit(1),
    db
      .select()
      .from(translationRegions)
      .where(eq(translationRegions.pageId, pageId))
      .orderBy(asc(translationRegions.regionId)),
  ]);
  const page = pageRow[0];
  if (!page) return null;

  return {
    id: page.id,
    mangaId: page.mangaId,
    chapterId: page.chapterId,
    pageUrl: page.pageUrl,
    sourceLanguage: page.sourceLanguage,
    targetLanguage: page.targetLanguage,
    model: page.model,
    imageWidth: page.imageWidth,
    imageHeight: page.imageHeight,
    regions: regionRows.map((row) => {
      const geometry = parseRegionGeometry(row.geometryJson);
      return {
        regionId: row.regionId,
        sourceText: row.sourceText,
        translatedText: row.translatedText,
        ...geometry,
      };
    }),
  };
}

/** Keeps at most `keep` cached pages per manga (oldest dropped). */
export async function pruneTranslationCache(
  mangaId: string,
  keep = 400,
): Promise<void> {
  try {
    const keepRows = await db
      .select({ id: translationPages.id })
      .from(translationPages)
      .where(eq(translationPages.mangaId, mangaId))
      .orderBy(desc(translationPages.updatedAt))
      .limit(keep);
    if (keepRows.length === 0) return;
    await db
      .delete(translationPages)
      .where(
        and(
          eq(translationPages.mangaId, mangaId),
          notInArray(
            translationPages.id,
            keepRows.map((row) => row.id),
          ),
        ),
      );
  } catch (error) {
    console.warn("Failed to prune translation cache:", error);
  }
}

// ---------------------------------------------------------------------------
// Usage rows (RPM / TPM / RPD meters)
// ---------------------------------------------------------------------------

/** Cached page count, shown next to the "clear cache" action in Settings. */
export async function countTranslationCachePages(): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(translationPages);
  return rows[0]?.count ?? 0;
}

/**
 * Drops every cached translated page (regions cascade with their page) and
 * returns how many pages were removed. Usage meters are left untouched.
 */
export async function clearTranslationCache(): Promise<number> {
  const removed = await countTranslationCachePages();
  await db.delete(translationPages);
  return removed;
}

/** Cached page count for one manga, shown in Settings > Translation. */
export async function countTranslationCachePagesForManga(
  mangaId: string,
): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(translationPages)
    .where(eq(translationPages.mangaId, mangaId));
  return rows[0]?.count ?? 0;
}

/** Drops every cached page of one manga. Regions cascade with the page. */
export async function clearTranslationCacheForManga(
  mangaId: string,
): Promise<number> {
  const removed = await countTranslationCachePagesForManga(mangaId);
  await db
    .delete(translationPages)
    .where(eq(translationPages.mangaId, mangaId));
  return removed;
}

/** Drops one cached page so the retry action can force a fresh run. */
export async function deleteTranslationPage(input: {
  mangaId: string;
  pageUrl: string;
  sourceLanguage: string;
  targetLanguage: string;
}): Promise<void> {
  await db
    .delete(translationPages)
    .where(
      and(
        eq(translationPages.mangaId, input.mangaId),
        eq(translationPages.pageKey, input.pageUrl),
        eq(translationPages.sourceLanguage, input.sourceLanguage),
        eq(translationPages.targetLanguage, input.targetLanguage),
        eq(
          translationPages.promptVersion,
          TRANSLATION_CACHE_PROMPT_VERSION,
        ),
      ),
    );
}

export interface InsertTranslationUsageInput {
  model: GeminiModelId;
  occurredAt: number;
  success: boolean;
  inputTokens?: number;
  outputTokens?: number;
  errorCode?: string;
}

export async function insertTranslationUsage(
  input: InsertTranslationUsageInput,
): Promise<void> {
  const now = Date.now();
  await db.insert(translationUsage).values({
    id: newId("tu"),
    model: input.model,
    occurredAt: input.occurredAt,
    success: input.success,
    inputTokens: input.inputTokens ?? null,
    outputTokens: input.outputTokens ?? null,
    errorCode: input.errorCode ?? null,
    createdAt: now,
  });
}

/** Number of attempts (successful or not) for a model since `sinceMs`. */
export async function countTranslationUsageSince(
  model: string,
  sinceMs: number,
): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(translationUsage)
    .where(
      and(
        eq(translationUsage.model, model),
        gte(translationUsage.occurredAt, sinceMs),
      ),
    );
  return rows[0]?.count ?? 0;
}

/** Input tokens recorded for a model since `sinceMs` (failed rows have none). */
export async function sumTranslationInputTokensSince(
  model: string,
  sinceMs: number,
): Promise<number> {
  const rows = await db
    .select({
      total: sql<number>`coalesce(sum(${translationUsage.inputTokens}), 0)`,
    })
    .from(translationUsage)
    .where(
      and(
        eq(translationUsage.model, model),
        gte(translationUsage.occurredAt, sinceMs),
      ),
    );
  return rows[0]?.total ?? 0;
}
