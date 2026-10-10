/**
 * pageTranslate.ts
 * ---------------------------------------------------------------------------
 * Engine-agnostic helpers for translating one manga page.
 *
 * Per page ("context aware") translation sends every slot text of the page in
 * one request, separated by [[index]] markers, so the translator sees the
 * neighbouring bubbles as context. The reply is split back on the same
 * markers. Requests are chunked only to stay inside the free web endpoint's
 * practical URL/text limits.
 *
 * Per bubble translation is just translateSingleText() called per slot.
 * ---------------------------------------------------------------------------
 */

import type { TranslateTextFn } from "./translation.types";

/** A single translate request will not exceed this many source characters. */
export const PAGE_CHAR_BUDGET = 900;

/** Long timeout: the local engine loads a translate page in a hidden WebView. */
export const TRANSLATE_TIMEOUT_MS = 20000;

function markerText(index: number): string {
  return `[[${index}]]`;
}

const MARKER_REGEX = /\[\[(\d+)\]\]/g;

/** Translates one text blob (per-bubble mode). */
export async function translateSingleText(
  translate: TranslateTextFn,
  from: string,
  to: string,
  text: string
): Promise<string> {
  if (!text.trim()) return "";
  return translate(from, to, text, {
    type: "google",
    timeout: TRANSLATE_TIMEOUT_MS,
  });
}

/** Splits a marker-joined translation back into per-index strings. */
export function splitMarkers(translated: string): Map<number, string> {
  const parts = new Map<number, string>();
  const matches: { start: number; end: number; index: number }[] = [];
  MARKER_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = MARKER_REGEX.exec(translated)) !== null) {
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      index: Number(match[1]),
    });
  }
  for (let i = 0; i < matches.length; i += 1) {
    const textStart = matches[i].end;
    const textEnd = i + 1 < matches.length ? matches[i + 1].start : translated.length;
    const text = translated.slice(textStart, textEnd).trim();
    if (text) parts.set(matches[i].index, text);
  }
  return parts;
}

/** Groups slot indexes into requests that respect the char budget. */
function buildChunks(texts: string[], budget: number): number[][] {
  const chunks: number[][] = [];
  let current: number[] = [];
  let size = 0;
  texts.forEach((text, index) => {
    const overhead = markerText(index).length + 2;
    if (current.length > 0 && size + text.length + overhead > budget) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    current.push(index);
    size += text.length + overhead;
  });
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/**
 * Translates all slot texts of a page in as few requests as possible and
 * returns an array aligned with `texts` (null marks a failed slot).
 */
export async function translateJoinedTexts(options: {
  translate: TranslateTextFn;
  from: string;
  to: string;
  texts: string[];
  budget?: number;
}): Promise<(string | null)[]> {
  const { translate, from, to, texts } = options;
  const budget = options.budget ?? PAGE_CHAR_BUDGET;
  const output: (string | null)[] = new Array(texts.length).fill(null);

  const chunks = buildChunks(texts, budget);
  for (const chunk of chunks) {
    const joined = chunk
      .map((originalIndex, markerIndex) => `${markerText(markerIndex)}\n${texts[originalIndex]}`)
      .join("\n");

    let translated = "";
    try {
      translated = await translate(from, to, joined, {
        type: "google",
        timeout: TRANSLATE_TIMEOUT_MS,
      });
    } catch (error) {
      console.warn("Page translate request failed:", error);
      translated = "";
    }

    const parts = splitMarkers(translated);
    const markerIndexByOriginal = new Map<number, number>();
    chunk.forEach((originalIndex, markerIndex) =>
      markerIndexByOriginal.set(originalIndex, markerIndex)
    );

    if (parts.size === 0 && chunk.length > 1) {
      // Markers did not survive - translate each slot individually instead.
      for (const originalIndex of chunk) {
        try {
          output[originalIndex] = await translateSingleText(
            translate,
            from,
            to,
            texts[originalIndex]
          );
        } catch (error) {
          console.warn("Fallback per-slot translate failed:", error);
          output[originalIndex] = null;
        }
      }
    } else {
      for (const originalIndex of chunk) {
        const markerIndex = markerIndexByOriginal.get(originalIndex) ?? originalIndex;
        output[originalIndex] = parts.get(markerIndex) ?? null;
      }
    }
  }
  return output;
}
