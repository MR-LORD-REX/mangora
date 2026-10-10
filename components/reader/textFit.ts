/**
 * textFit.ts
 * ---------------------------------------------------------------------------
 * Deterministic auto-fit for translated manga text.
 *
 * Picks the largest font size whose (greedily wrapped) layout fits the paste
 * container. Character width is modelled per glyph: full-width glyphs (CJK)
 * take one em, Latin/digits roughly half an em. The result is a plain font
 * size - the overlay then multiplies it by the user's scale modifier.
 * ---------------------------------------------------------------------------
 */

const LINE_HEIGHT_MULTIPLIER = 1.2;

function isWideChar(ch: string): boolean {
  // Treat any non-Basic-Latin glyph as full width (CJK, kana, hangul, ...).
  return (ch.codePointAt(0) ?? 0) > 0x00ff;
}

function charWidthAt(fontSize: number, ch: string): number {
  if (ch === " ") return fontSize * 0.32;
  return isWideChar(ch) ? fontSize : fontSize * 0.55;
}

function measureWord(word: string, fontSize: number): number {
  let width = 0;
  for (const ch of word) width += charWidthAt(fontSize, ch);
  return width;
}

interface Layout {
  lines: number;
  /** Width of the widest produced line, in the same units as `fontSize`. */
  longest: number;
}

/** Greedy wrap; returns line count and widest line at the given font size. */
function estimateLayout(text: string, fontSize: number, maxWidth: number): Layout {
  const spaceWidth = charWidthAt(fontSize, " ");
  const paragraphs = text.split("\n");
  let lines = 0;
  let cur = 0;
  let longest = 0;

  const newline = () => {
    longest = Math.max(longest, cur);
    cur = 0;
    lines += 1;
  };

  paragraphs.forEach((paragraph, paragraphIndex) => {
    if (paragraphIndex > 0) newline();
    const words = paragraph.split(" ").filter((word) => word.length > 0);

    words.forEach((word, wordIndex) => {
      const wordWidth = measureWord(word, fontSize);
      const gap = wordIndex === 0 && cur === 0 ? 0 : spaceWidth;

      if (cur + gap + wordWidth <= maxWidth) {
        cur += gap + wordWidth;
        return;
      }
      if (wordWidth <= maxWidth) {
        newline();
        cur = wordWidth;
        return;
      }

      // A single word wider than the box: break it across lines (CJK runs).
      if (cur > 0) newline();
      let acc = 0;
      for (const ch of word) {
        const chWidth = charWidthAt(fontSize, ch);
        if (acc + chWidth > maxWidth && acc > 0) {
          longest = Math.max(longest, acc);
          lines += 1;
          acc = 0;
        }
        acc += chWidth;
      }
      cur = acc;
    });
  });

  // Account for the trailing (partially filled) line.
  lines += 1;
  longest = Math.max(longest, cur);
  return { lines, longest };
}

function fits(
  text: string,
  fontSize: number,
  width: number,
  height: number
): boolean {
  const layout = estimateLayout(text, fontSize, width);
  return (
    layout.longest <= width &&
    layout.lines * fontSize * LINE_HEIGHT_MULTIPLIER <= height
  );
}

export interface FitTextOptions {
  text: string;
  /** Paste container width in display px. */
  width: number;
  /** Paste container height in display px. */
  height: number;
  minFont?: number;
  maxFont?: number;
}

/**
 * Largest font size that fits the container. Returns `minFont` when even the
 * smallest size would overflow (caller can still render it).
 */
export function fitTextFontSize(options: FitTextOptions): number {
  const { text } = options;
  const minFont = options.minFont ?? 6;
  const maxFont = options.maxFont ?? 72;
  const width = Math.max(8, options.width - 2);
  const height = Math.max(8, options.height - 2);
  if (!text.trim()) return minFont;

  // Fast shrink from the maximum until the layout fits (safe upper bound).
  let fontSize = maxFont;
  for (let iteration = 0; iteration < 24 && !fits(text, fontSize, width, height); iteration += 1) {
    const layout = estimateLayout(text, fontSize, width);
    const widthLimit = layout.longest > 0 ? (width * fontSize) / layout.longest : fontSize;
    const heightLimit =
      layout.lines > 0 ? height / (layout.lines * LINE_HEIGHT_MULTIPLIER) : fontSize;
    const next = Math.max(minFont, Math.min(widthLimit, heightLimit, fontSize - 1));
    if (next >= fontSize - 0.5) break;
    fontSize = Math.max(minFont, next);
  }
  if (!fits(text, fontSize, width, height)) {
    fontSize = minFont;
  }

  // Grow back one px at a time - wrapping can free vertical space, so the
  // first fit above is not necessarily the largest.
  let best = fontSize;
  for (let candidate = fontSize + 1; candidate <= maxFont; candidate += 1) {
    if (!fits(text, candidate, width, height)) break;
    best = candidate;
  }
  return Math.round(Math.max(minFont, Math.min(maxFont, best)) * 2) / 2;
}
