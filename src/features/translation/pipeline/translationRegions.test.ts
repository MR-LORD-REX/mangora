import assert from "node:assert/strict";
import test from "node:test";

import type { DetectionResult } from "@features/vision";
import {
  assignItemsToSlots,
  buildTranslationSlots,
  fillSlotTexts,
  midpointBox,
  ocrRegionsForSlots,
} from "./translationRegions";

function detection(
  role: "bubble" | "text_in_bubble" | "free_text",
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  classId = 0,
): DetectionResult["boxes"][number] {
  return { x1, y1, x2, y2, confidence: 0.9, classId, role };
}

function page(boxes: DetectionResult["boxes"]): DetectionResult {
  return { imageWidth: 1000, imageHeight: 1000, boxes };
}

test("midpoint box averages corresponding bubble and text edges", () => {
  assert.deepEqual(
    midpointBox(
      { x1: 10, y1: 20, x2: 110, y2: 220 },
      { x1: 30, y1: 60, x2: 90, y2: 180 },
    ),
    { x1: 20, y1: 40, x2: 100, y2: 200 },
  );
});

test("bubble and bubble-text detections share one midpoint paste box", () => {
  const slots = buildTranslationSlots(
    page([
      detection("bubble", 10, 20, 110, 220, 2),
      detection("text_in_bubble", 30, 60, 90, 180, 0),
    ]),
  );
  assert.equal(slots.length, 1);
  assert.deepEqual(slots[0].pasteBox, { x1: 20, y1: 40, x2: 100, y2: 200 });
  assert.deepEqual(slots[0].eraseBoxes, [{ x1: 30, y1: 60, x2: 90, y2: 180 }]);
});

test("free text keeps its detected box for OCR and rendering", () => {
  const slots = buildTranslationSlots(
    page([detection("free_text", 120, 300, 260, 360, 1)]),
  );
  assert.equal(slots.length, 1);
  assert.equal(slots[0].kind, "messy");
  assert.deepEqual(slots[0].pasteBox, { x1: 120, y1: 300, x2: 260, y2: 360 });
  assert.deepEqual(slots[0].eraseBoxes, [{ x1: 120, y1: 300, x2: 260, y2: 360 }]);
});

test("OCR crops preserve bubble and free-text slot roles", () => {
  const slots = buildTranslationSlots(
    page([
      detection("bubble", 10, 20, 110, 220, 2),
      detection("free_text", 120, 300, 260, 360, 1),
    ]),
  );
  const regions = ocrRegionsForSlots(slots);

  assert.deepEqual(
    regions.map((region) => region.role),
    ["bubble", "free_text"],
  );
});

test("free-text OCR items stay in free-text slots when bubbles also exist", () => {
  const slots = buildTranslationSlots(
    page([
      detection("bubble", 10, 20, 110, 220, 2),
      detection("free_text", 120, 300, 260, 360, 1),
    ]),
  );
  const assigned = assignItemsToSlots(slots, [
    {
      text: "Outside",
      confidence: 0.9,
      level: "line",
      classId: 1,
      role: "free_text",
      x1: 130,
      y1: 310,
      x2: 250,
      y2: 350,
    },
  ]);

  const freeTextSlot = slots.find((slot) => slot.kind === "messy");
  assert.ok(freeTextSlot);
  assert.equal(assigned.get(freeTextSlot.id)?.length, 1);
});

test("segmentation mask bubbles also use a paired text midpoint", () => {
  const slots = buildTranslationSlots(
    page([
      {
        ...detection("bubble", 10, 10, 210, 210, 0),
        mask: {
          polygon: [
            { x: 10, y: 10 },
            { x: 210, y: 10 },
            { x: 210, y: 210 },
          ],
          bounds: { x1: 10, y1: 10, x2: 210, y2: 210 },
          confidence: 0.9,
        },
      },
      detection("text_in_bubble", 50, 50, 150, 150, 0),
    ]),
  );
  assert.equal(slots.length, 1);
  assert.equal(slots[0].mask != null, true);
  assert.deepEqual(slots[0].pasteBox, { x1: 30, y1: 30, x2: 180, y2: 180 });
});

test("segmentation OCR text moves the paste box to the bubble/text midpoint", () => {
  const bubble = { x1: 10, y1: 20, x2: 210, y2: 220 };
  const slots = buildTranslationSlots(
    page([
      {
        ...detection("bubble", bubble.x1, bubble.y1, bubble.x2, bubble.y2, 0),
        mask: {
          polygon: [
            { x: 10, y: 20 },
            { x: 210, y: 20 },
            { x: 210, y: 220 },
          ],
          bounds: bubble,
          confidence: 0.9,
        },
      },
    ]),
  );
  assert.equal(slots[0].resolvePasteFromOcr, true);

  const filled = fillSlotTexts(
    slots,
    new Map([
      [
        0,
        [
          {
            text: "Hello",
            confidence: 0.9,
            level: "line",
            classId: 0,
            role: "bubble",
            x1: 50,
            y1: 60,
            x2: 150,
            y2: 180,
          },
        ],
      ],
    ]),
    false,
  );

  assert.deepEqual(filled[0].pasteBox, { x1: 30, y1: 40, x2: 180, y2: 200 });
  assert.equal(filled[0].sourceText, "Hello");
});
