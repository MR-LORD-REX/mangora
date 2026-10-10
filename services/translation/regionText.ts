/**
 * regionText.ts
 * ---------------------------------------------------------------------------
 * Turns one page's YOLO detections + OCR word items into translatable slots.
 *
 * YOLO classes (see services/yolo/yolo.types.ts):
 *   0 clean_text  - the actual glyphs inside a speech bubble (erase target)
 *   1 messy_text  - free text with no bubble (OCR + erase target)
 *   2 text_bubble - the whole bubble (OCR crop + translation paste container)
 *
 * OCR runs over the messy (1) and bubble (2) crops only. The resulting items
 * are matched back onto their parent slot by geometry, then joined into one
 * source string per slot in reading order.
 * ---------------------------------------------------------------------------
 */

import type { OcrTextItem } from "@/services/ocr/pageOcr";
import type { Detection, DetectionResult } from "@/services/yolo/yolo.types";

import type { Box, TranslationSlot } from "./translation.types";

function boxFromDetection(box: Detection): Box {
  return { x1: box.x1, y1: box.y1, x2: box.x2, y2: box.y2 };
}

function boxCenter(box: Box): { cx: number; cy: number } {
  return { cx: (box.x1 + box.x2) / 2, cy: (box.y1 + box.y2) / 2 };
}

function centerInside(outer: Box, inner: Box): boolean {
  const { cx, cy } = boxCenter(inner);
  return (
    cx >= outer.x1 && cx <= outer.x2 && cy >= outer.y1 && cy <= outer.y2
  );
}

function distance(a: Box, b: Box): number {
  const ac = boxCenter(a);
  const bc = boxCenter(b);
  return Math.hypot(ac.cx - bc.cx, ac.cy - bc.cy);
}

/** Slightly inflates a box so word boxes near an edge still count. */
function inflate(box: Box, ratio: number): Box {
  const w = box.x2 - box.x1;
  const h = box.y2 - box.y1;
  const dx = (w * ratio) / 2;
  const dy = (h * ratio) / 2;
  return {
    x1: box.x1 - dx,
    y1: box.y1 - dy,
    x2: box.x2 + dx,
    y2: box.y2 + dy,
  };
}

/**
 * Builds one slot per text_bubble / messy_text detection.
 * - Bubble slots erase the clean_text boxes living inside them and paste into
 *   the bubble box (the overlay insets it to ~90%).
 * - Messy slots erase and paste into the messy box.
 */
export function buildTranslationSlots(detection: DetectionResult): TranslationSlot[] {
  const boxes = detection.boxes ?? [];
  const slots: TranslationSlot[] = [];

  for (const bubble of boxes) {
    if (bubble.classId !== 2) continue;
    const bubbleBox = boxFromDetection(bubble);
    const padded = inflate(bubbleBox, 0.1);
    const cleanInside = boxes
      .filter((box) => box.classId === 0 && centerInside(padded, boxFromDetection(box)))
      .map(boxFromDetection);
    slots.push({
      id: slots.length,
      kind: "bubble",
      pasteBox: bubbleBox,
      eraseBoxes: cleanInside,
      sourceText: "",
    });
  }

  for (const messy of boxes) {
    if (messy.classId !== 1) continue;
    const messyBox = boxFromDetection(messy);
    slots.push({
      id: slots.length,
      kind: "messy",
      pasteBox: messyBox,
      eraseBoxes: [messyBox],
      sourceText: "",
    });
  }

  slots.sort((a, b) => a.pasteBox.y1 - b.pasteBox.y1 || a.pasteBox.x1 - b.pasteBox.x1);
  return slots;
}

/** True when the item's y-span overlaps the row by at least a third. */
function overlapsRow(row: OcrTextItem[], item: OcrTextItem): boolean {
  const rowTop = Math.min(...row.map((i) => i.y1));
  const rowBottom = Math.max(...row.map((i) => i.y2));
  const overlap = Math.min(rowBottom, item.y2) - Math.max(rowTop, item.y1);
  if (overlap <= 0) return false;
  const smallestSpan = Math.min(rowBottom - rowTop, item.y2 - item.y1);
  return overlap / smallestSpan >= 0.35;
}

/**
 * Joins the OCR words of one slot into a single source string.
 * Items are grouped into rows (reading order top -> bottom), words inside a
 * row are ordered left -> right. CJK sources are joined without spaces.
 */
export function assembleSlotText(
  items: OcrTextItem[],
  sourceIsCjk: boolean
): string {
  const sorted = [...items].sort((a, b) => a.y1 - b.y1 || a.x1 - b.x1);
  const rows: OcrTextItem[][] = [];
  for (const item of sorted) {
    const row = rows.find((candidate) => overlapsRow(candidate, item));
    if (row) {
      row.push(item);
    } else {
      rows.push([item]);
    }
  }
  rows.sort((a, b) => a[0].y1 - b[0].y1);

  const separator = sourceIsCjk ? "" : " ";
  const lines: string[] = [];
  for (const row of rows) {
    row.sort((a, b) => a.x1 - b.x1);
    const text = row
      .map((item) => item.text.trim())
      .filter(Boolean)
      .join(separator);
    if (text) lines.push(text);
  }
  return lines.join("\n");
}

/**
 * Assigns OCR items to the slot whose paste box contains them (fallback:
 * nearest slot). Items whose own classId identifies the crop type are given
 * priority: classId 2 -> bubble slots, classId 1 -> messy slots.
 */
export function assignItemsToSlots(
  slots: TranslationSlot[],
  items: OcrTextItem[]
): Map<number, OcrTextItem[]> {
  const assigned = new Map<number, OcrTextItem[]>();
  if (slots.length === 0) return assigned;

  const add = (slotId: number, item: OcrTextItem) => {
    const list = assigned.get(slotId) ?? [];
    list.push(item);
    assigned.set(slotId, list);
  };

  for (const item of items) {
    const itemBox: Box = { x1: item.x1, y1: item.y1, x2: item.x2, y2: item.y2 };
    const preferredKind: "bubble" | "messy" | null =
      item.classId === 2 ? "bubble" : item.classId === 1 ? "messy" : null;
    const candidates = preferredKind
      ? slots.filter((slot) => slot.kind === preferredKind)
      : slots;

    let best = candidates.find((slot) => centerInside(slot.pasteBox, itemBox));
    if (!best && candidates.length > 0) {
      best = candidates.reduce((closest, slot) =>
        distance(slot.pasteBox, itemBox) < distance(closest.pasteBox, itemBox)
          ? slot
          : closest
      );
    }
    if (best) add(best.id, item);
  }
  return assigned;
}

/** Fills slot sourceText from assigned OCR items (best effort per slot). */
export function fillSlotTexts(
  slots: TranslationSlot[],
  assigned: Map<number, OcrTextItem[]>,
  sourceIsCjk: boolean
): TranslationSlot[] {
  return slots.map((slot) => {
    const items = assigned.get(slot.id) ?? [];
    if (items.length === 0) return slot;

    // Bubble without clean_text detections: erase exactly what OCR found.
    let eraseBoxes = slot.eraseBoxes;
    if (slot.kind === "bubble" && eraseBoxes.length === 0) {
      eraseBoxes = items.map((item) => ({
        x1: item.x1,
        y1: item.y1,
        x2: item.x2,
        y2: item.y2,
      }));
    }

    return {
      ...slot,
      eraseBoxes,
      sourceText: assembleSlotText(items, sourceIsCjk),
    };
  });
}
