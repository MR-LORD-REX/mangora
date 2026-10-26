/**
 * pipeline/translationRegions.ts
 * ---------------------------------------------------------------------------
 * Turns one page's YOLO detections + OCR word items into translatable slots.
 *
 * YOLO classes (see @features/vision detectionTypes):
 *   0 clean_text  - the actual glyphs inside a speech bubble (erase target)
 *   1 messy_text  - free text with no bubble (OCR + erase target)
 *   2 text_bubble - the whole bubble (OCR crop + translation paste container)
 *
 * OCR runs over the messy (1) and bubble (2) crops only. The resulting items
 * are matched back onto their parent slot by geometry, then joined into one
 * source string per slot in reading order.
 * ---------------------------------------------------------------------------
 */

import type { Detection, DetectionResult, OcrTextItem } from "@features/vision";

import type { Box, TranslationSlot } from "../domain/types";

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

function boxWidth(box: Box): number {
  return Math.max(0, box.x2 - box.x1);
}

function boxHeight(box: Box): number {
  return Math.max(0, box.y2 - box.y1);
}

function boxArea(box: Box): number {
  return boxWidth(box) * boxHeight(box);
}

function intersectionArea(a: Box, b: Box): number {
  const w = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
  const h = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
  return w > 0 && h > 0 ? w * h : 0;
}

/** True when two boxes describe the same detection (near-identical). */
function nearDuplicate(a: Box, b: Box): boolean {
  const smallest = Math.min(boxArea(a), boxArea(b));
  if (smallest <= 0) return false;
  return intersectionArea(a, b) / smallest >= 0.75;
}

function unionBoxes(boxes: Box[]): Box {
  return {
    x1: Math.min(...boxes.map((box) => box.x1)),
    y1: Math.min(...boxes.map((box) => box.y1)),
    x2: Math.max(...boxes.map((box) => box.x2)),
    y2: Math.max(...boxes.map((box) => box.y2)),
  };
}

/** Grows a box by `ratio` of its own width/height (split evenly per side). */
function expandBox(box: Box, ratio: number): Box {
  const dx = (boxWidth(box) * ratio) / 2;
  const dy = (boxHeight(box) * ratio) / 2;
  return {
    x1: box.x1 - dx,
    y1: box.y1 - dy,
    x2: box.x2 + dx,
    y2: box.y2 + dy,
  };
}

/** Keeps a paste box inside the bubble it came from. */
function clipBox(box: Box, outer: Box): Box {
  return {
    x1: Math.max(box.x1, outer.x1),
    y1: Math.max(box.y1, outer.y1),
    x2: Math.min(box.x2, outer.x2),
    y2: Math.min(box.y2, outer.y2),
  };
}

/**
 * Text boxes that read as one group: words on a row separated by a small
 * horizontal gap, or stacked lines separated by a small vertical gap.
 */
function shouldCluster(a: Box, b: Box): boolean {
  const ix = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
  const iy = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
  if (ix > 0 && iy > 0) {
    const smallest = Math.min(boxArea(a), boxArea(b));
    if (smallest > 0 && (ix * iy) / smallest >= 0.15) return true;
  }

  const minH = Math.min(boxHeight(a), boxHeight(b)) || 1;
  const minW = Math.min(boxWidth(a), boxWidth(b)) || 1;
  const gapX = Math.max(0, Math.max(a.x1, b.x1) - Math.min(a.x2, b.x2));
  const gapY = Math.max(0, Math.max(a.y1, b.y1) - Math.min(a.y2, b.y2));

  // Same row.
  if (iy >= minH * 0.45 && gapX <= minH * 0.55) return true;
  // Adjacent lines in the same column.
  if (ix >= minW * 0.35 && gapY <= minH * 0.9) return true;
  return false;
}

/** Connected components of text boxes - one component per text group. */
function clusterBoxes(boxes: Box[]): Box[][] {
  const parent = boxes.map((_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    while (parent[index] !== index) {
      const next = parent[index];
      parent[index] = root;
      index = next;
    }
    return root;
  };
  const unite = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[rb] = ra;
  };

  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      if (shouldCluster(boxes[i], boxes[j])) unite(i, j);
    }
  }

  const groups = new Map<number, Box[]>();
  boxes.forEach((box, index) => {
    const root = find(index);
    const group = groups.get(root) ?? [];
    group.push(box);
    groups.set(root, group);
  });
  return [...groups.values()];
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
  const acceptedBubbles: Box[] = [];

  for (const bubble of boxes) {
    if (bubble.classId !== 2) continue;
    // Segmentation detections carry a page-space contour. Use its tight
    // bounds and keep the mask on the slot so the overlay can erase and fit
    // against the real bubble shape instead of a rectangle.
    const mask = bubble.mask;
    const bubbleBox = mask?.bounds ?? boxFromDetection(bubble);
    // Some pages return the same bubble twice; one overlay is enough.
    if (acceptedBubbles.some((accepted) => nearDuplicate(accepted, bubbleBox))) {
      continue;
    }
    acceptedBubbles.push(bubbleBox);
    if (mask) {
      slots.push({
        id: slots.length,
        kind: "bubble",
        pasteBox: bubbleBox,
        eraseBoxes: [],
        mask,
        sourceText: "",
      });
      continue;
    }
    const padded = inflate(bubbleBox, 0.1);
    const cleanInside = boxes
      .filter((box) => box.classId === 0 && centerInside(padded, boxFromDetection(box)))
      .map(boxFromDetection);

    // A single YOLO bubble can contain two joined bubbles. Clean-text boxes
    // reveal how many separate text groups live inside it, so split the slot
    // instead of translating both groups as one paragraph.
    const groups = clusterBoxes(cleanInside);
    if (groups.length > 1) {
      for (const group of groups) {
        slots.push({
          id: slots.length,
          kind: "bubble",
          pasteBox: clipBox(expandBox(unionBoxes(group), 0.3), bubbleBox),
          eraseBoxes: group,
          sourceText: "",
        });
      }
    } else {
      slots.push({
        id: slots.length,
        kind: "bubble",
        pasteBox: bubbleBox,
        eraseBoxes: cleanInside,
        sourceText: "",
      });
    }
  }

  const acceptedMessy: Box[] = [];
  for (const messy of boxes) {
    if (messy.classId !== 1) continue;
    const messyBox = boxFromDetection(messy);
    if (acceptedMessy.some((accepted) => nearDuplicate(accepted, messyBox))) {
      continue;
    }
    acceptedMessy.push(messyBox);
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
    const lineCount = countTextRows(items);

    return {
      ...slot,
      eraseBoxes,
      lineCount: lineCount > 0 ? lineCount : slot.lineCount,
      sourceText: assembleSlotText(items, sourceIsCjk),
    };
  });
}

/** Number of distinct reading rows in an OCR item set. */
export function countTextRows(items: OcrTextItem[]): number {
  const sorted = [...items].sort((a, b) => a.y1 - b.y1 || a.x1 - b.x1);
  const rows: OcrTextItem[][] = [];
  for (const item of sorted) {
    const row = rows.find((candidate) => overlapsRow(candidate, item));
    if (row) row.push(item);
    else rows.push([item]);
  }
  return rows.length;
}
