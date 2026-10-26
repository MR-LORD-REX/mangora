/**
 * domain/types.ts
 * ---------------------------------------------------------------------------
 * Shared types for the reader translation pipeline. Kept engine-agnostic so a
 * cloud translator (TR_API /v1/translate) can replace the on-device engine
 * later without touching reader components.
 * ---------------------------------------------------------------------------
 */

import type { TranslationEngine } from "@shared/contracts/translationEngine";
import type { BubbleMask } from "@shared/contracts/bubbleMask";
import type { Box } from "@shared/geometry";

export type { BubbleMask } from "@shared/contracts/bubbleMask";
export type { Box, Point } from "@shared/geometry";

/** Engine used for one translated page. */
export type ReaderTranslateMode = TranslationEngine;

/** Paste target kind - decides inset (bubble ~90%) vs full box (messy). */
export type TranslationSlotKind = "bubble" | "messy";

/**
 * A single unit of translation on a page (one speech bubble or one messy /
 * free-text region). Geometry is in natural page pixels.
 */
export interface TranslationSlot {
  /** Stable id used to map OCR items and separator markers. */
  id: number;
  kind: TranslationSlotKind;
  /** Box the translated text is pasted into (bubbles are inset ~90%). */
  pasteBox: Box;
  /** Boxes painted white to erase the original text before pasting. */
  eraseBoxes: Box[];
  /**
   * Segmentation mask for speech bubbles. When present the overlay erases a
   * mask-clipped interior (preserving the bubble outline) and lays translated
   * lines out against the mask's width at each line's height.
   */
  mask?: BubbleMask;
  /** Number of source text lines, used as a hint for the translated layout. */
  lineCount?: number;
  /** OCR text assembled for this slot (reading order). */
  sourceText: string;
}

/** Per-slot progress state used by the page overlay. */
export interface TranslationRegionState extends TranslationSlot {
  translatedText: string | null;
  status: "queued" | "processing" | "done" | "error";
}

/** Whole-page translation state, keyed by page url in the reader. */
export interface PageTranslationState {
  url: string;
  imageWidth: number;
  imageHeight: number;
  mode: ReaderTranslateMode;
  busy: boolean;
  visible: boolean;
  /** Coarse pipeline stage for the progress chip. */
  stage: "queued" | "detect" | "ocr" | "translate" | "done" | "skipped" | "error";
  /** Human readable progress / status line. */
  message: string | null;
  regions: TranslationRegionState[];
}

/** Callable translate primitive (engine injected by the caller). */
export type TranslateTextFn = (
  from: string,
  to: string,
  text: string,
  options?: { type?: string; timeout?: number }
) => Promise<string>;
