/**
 * Pure page/bubble state helpers for the reader translation pipeline.
 */

import type {
  Box,
  PageTranslationState,
  TranslationRegionState,
  TranslationSlot,
} from "@features/translation";
import type { OcrRegion } from "@features/vision";

import type {
  OcrBubbleRecord,
  OcrPageRecord,
  PipelineConfig,
} from "./types";

export const MAX_CROPS_PER_PAGE = 24;

/** True when a YOLO OCR region can contribute text to a translation slot. */
export function regionTouchesSlot(region: OcrRegion, box: Box): boolean {
  const cx = (region.x1 + region.x2) / 2;
  const cy = (region.y1 + region.y2) / 2;
  const padX = (box.x2 - box.x1) * 0.08;
  const padY = (box.y2 - box.y1) * 0.08;
  if (
    cx >= box.x1 - padX &&
    cx <= box.x2 + padX &&
    cy >= box.y1 - padY &&
    cy <= box.y2 + padY
  ) {
    return true;
  }
  const width = Math.min(region.x2, box.x2) - Math.max(region.x1, box.x1);
  const height = Math.min(region.y2, box.y2) - Math.max(region.y1, box.y1);
  if (width <= 0 || height <= 0) return false;
  const regionArea = (region.x2 - region.x1) * (region.y2 - region.y1);
  return regionArea > 0 && (width * height) / regionArea >= 0.5;
}

/** slot id -> OCR region indexes that can contribute text to that slot. */
export function mapSlotRegions(
  slots: TranslationSlot[],
  regions: OcrRegion[],
): Map<number, number[]> {
  const slotRegions = new Map<number, number[]>();
  for (const slot of slots) {
    const indexes: number[] = [];
    regions.forEach((region, index) => {
      if (regionTouchesSlot(region, slot.pasteBox)) indexes.push(index);
    });
    slotRegions.set(slot.id, indexes);
  }
  return slotRegions;
}

export function createPageDefaults(
  url: string,
  config: PipelineConfig,
): PageTranslationState {
  return {
    url,
    imageWidth: 0,
    imageHeight: 0,
    mode: config.engine,
    busy: false,
    visible: false,
    stage: "queued",
    message: null,
    regions: [],
  };
}

export function createBubbleRecord(
  page: OcrPageRecord,
  slot: TranslationSlot,
  config: PipelineConfig,
): OcrBubbleRecord {
  return {
    id: slot.id,
    pageIndex: page.pageIndex,
    url: page.url,
    pageNumber: page.pageIndex + 1,
    text: slot.sourceText,
    sourceLanguage: config.sourceLanguage,
    targetLanguage: config.targetLanguage,
    kind: slot.kind,
    pasteBox: slot.pasteBox,
    eraseBoxes: slot.eraseBoxes,
    mask: slot.mask,
    lineCount: slot.lineCount,
    confidence: 1,
    status: "ready",
    translatedText: null,
  };
}

export function buildPageRegions(
  page: OcrPageRecord,
): TranslationRegionState[] {
  return page.slots.map((slot) => {
    const record = page.bubbles.get(slot.id);
    if (!record) {
      return {
        ...slot,
        translatedText: null,
        status: page.ocrComplete ? "error" : "queued",
      };
    }
    return {
      ...slot,
      sourceText: record.text,
      eraseBoxes: record.eraseBoxes,
      translatedText: record.translatedText,
      status:
        record.status === "translated"
          ? "done"
          : record.status === "error"
            ? "error"
            : record.status === "translating"
              ? "processing"
              : "queued",
    };
  });
}

export interface PageProgress {
  bubblesTotal: number;
  bubblesTranslated: number;
  bubblesFailed: number;
}

export function countBubbleProgress(
  pages: Iterable<OcrPageRecord>,
): PageProgress {
  let bubblesTotal = 0;
  let bubblesTranslated = 0;
  let bubblesFailed = 0;
  for (const page of pages) {
    for (const bubble of page.bubbles.values()) {
      bubblesTotal += 1;
      if (bubble.status === "translated") bubblesTranslated += 1;
      if (bubble.status === "error") bubblesFailed += 1;
    }
  }
  return { bubblesTotal, bubblesTranslated, bubblesFailed };
}
