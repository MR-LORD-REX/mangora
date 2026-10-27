/**
 * Translation cache adapter for the reader pipeline.
 *
 * This module is the only place that translates live page/bubble records into
 * the SQLite cache shape. The hook keeps the same request fields (including
 * prompt versioning, chapter page keys and legacy fallback) as before.
 */

import {
  deleteTranslationPage,
  findTranslationPage,
  pruneTranslationCache,
  saveTranslationPage,
  translationPageKey,
} from "@/services/db/repositories/translationRepository";

import type { ReaderIdentity } from "@/utils/reader/readerIdentity";

import type { OcrBubbleRecord, OcrPageRecord } from "./types";

interface CacheContext {
  identity: ReaderIdentity;
  sourceLanguage: string;
  targetLanguage: string;
}

function storedRegions(page: OcrPageRecord) {
  return [...page.bubbles.values()]
    .filter((bubble) => bubble.status === "translated" && bubble.translatedText)
    .map((bubble) => ({
      regionId: bubble.id,
      kind: bubble.kind,
      sourceText: bubble.text,
      translatedText: bubble.translatedText,
      pasteBox: bubble.pasteBox,
      eraseBoxes: bubble.eraseBoxes,
      mask: bubble.mask,
      lineCount: bubble.lineCount,
    }));
}

export async function savePageToCache(
  page: OcrPageRecord,
  context: CacheContext,
): Promise<void> {
  const regions = storedRegions(page);
  if (regions.length === 0) return;
  await saveTranslationPage({
    mangaId: context.identity.mangaId,
    chapterId: context.identity.chapterId,
    pageUrl: page.url,
    pageKey: translationPageKey(context.identity.chapterId, page.pageIndex),
    sourceLanguage: context.sourceLanguage,
    targetLanguage: context.targetLanguage,
    model: page.modelId,
    imageWidth: page.imageWidth,
    imageHeight: page.imageHeight,
    regions,
  });
  void pruneTranslationCache(context.identity.mangaId);
  console.log("[reader][tr] cache saved", {
    pageIndex: page.pageIndex,
    bubbles: regions.length,
  });
}

export async function loadPageFromCache(input: {
  identity: ReaderIdentity;
  url: string;
  pageIndex: number;
  sourceLanguage: string;
  targetLanguage: string;
}) {
  return findTranslationPage({
    mangaId: input.identity.mangaId,
    pageUrl: input.url,
    pageKey: translationPageKey(input.identity.chapterId, input.pageIndex),
    sourceLanguage: input.sourceLanguage,
    targetLanguage: input.targetLanguage,
    chapterId: input.identity.chapterId,
    legacyPageIndex: input.pageIndex,
  });
}

export async function deletePageFromCache(input: {
  identity: ReaderIdentity;
  url: string;
  pageIndex: number;
  sourceLanguage: string;
  targetLanguage: string;
}): Promise<void> {
  await deleteTranslationPage({
    mangaId: input.identity.mangaId,
    pageUrl: input.url,
    pageKey: translationPageKey(input.identity.chapterId, input.pageIndex),
    sourceLanguage: input.sourceLanguage,
    targetLanguage: input.targetLanguage,
  });
}

/** Converts a cached page back into the live bubble map. */
export function bubblesFromCachedRegions(input: {
  regions: {
    regionId: number;
    kind: "bubble" | "messy";
    sourceText: string;
    translatedText: string | null;
    pasteBox: OcrBubbleRecord["pasteBox"];
    eraseBoxes: OcrBubbleRecord["eraseBoxes"];
    mask?: OcrBubbleRecord["mask"];
    lineCount?: number;
  }[];
  url: string;
  pageIndex: number;
  sourceLanguage: string;
  targetLanguage: string;
}): Map<number, OcrBubbleRecord> {
  const bubbles = new Map<number, OcrBubbleRecord>();
  for (const region of input.regions) {
    if (!region.sourceText.trim()) continue;
    bubbles.set(region.regionId, {
      id: region.regionId,
      pageIndex: input.pageIndex,
      url: input.url,
      pageNumber: input.pageIndex + 1,
      text: region.sourceText,
      sourceLanguage: input.sourceLanguage,
      targetLanguage: input.targetLanguage,
      kind: region.kind,
      pasteBox: region.pasteBox,
      eraseBoxes: region.eraseBoxes,
      mask: region.mask,
      lineCount: region.lineCount,
      confidence: 1,
      status: region.translatedText ? "translated" : "error",
      translatedText: region.translatedText,
    });
  }
  return bubbles;
}

export function regionsFromCachedRegions(
  regions: Awaited<ReturnType<typeof findTranslationPage>> extends infer T
    ? T extends { regions: infer R }
      ? R
      : never
    : never,
) {
  return regions.map((region) => ({
    id: region.regionId,
    kind: region.kind,
    pasteBox: region.pasteBox,
    eraseBoxes: region.eraseBoxes,
    mask: region.mask,
    lineCount: region.lineCount,
    sourceText: region.sourceText,
    translatedText: region.translatedText,
    status: (region.translatedText ? "done" : "error") as
      | "done"
      | "error",
  }));
}
