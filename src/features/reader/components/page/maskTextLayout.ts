/**
 * maskTextLayout.ts
 * ---------------------------------------------------------------------------
 * Geometry helpers for mask-shaped manga speech bubbles.
 *
 * The overlay needs three things from a segmentation mask:
 *   1. A white erase shape that follows the bubble and preserves its outline.
 *   2. A safe vertical band that ignores narrow tails.
 *   3. The usable width at each translated line's height, so long lines never
 *      cross the curved edge of the bubble.
 *
 * Everything here is plain math on page/display coordinates; no React Native
 * or native modules are involved.
 * ---------------------------------------------------------------------------
 */

import type { Box, Point } from "@features/translation";

export interface Span {
  left: number;
  right: number;
}

export interface MaskTextLine {
  text: string;
  left: number;
  top: number;
  width: number;
}

export interface MaskTextLayout {
  fontSize: number;
  lineHeight: number;
  lines: MaskTextLine[];
}

export function polygonBounds(polygon: Point[]): Box {
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const point of polygon) {
    if (point.x < x1) x1 = point.x;
    if (point.y < y1) y1 = point.y;
    if (point.x > x2) x2 = point.x;
    if (point.y > y2) y2 = point.y;
  }
  return { x1, y1, x2, y2 };
}

/** Interior horizontal intervals of a polygon at `y` (even-odd pairing). */
export function scanlineSpans(polygon: Point[], y: number): Span[] {
  if (polygon.length < 3) return [];
  const xs: number[] = [];
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
      const t = (y - a.y) / (b.y - a.y);
      xs.push(a.x + t * (b.x - a.x));
    }
  }
  xs.sort((a, b) => a - b);
  const spans: Span[] = [];
  for (let i = 0; i + 1 < xs.length; i += 2) {
    if (xs[i + 1] > xs[i]) spans.push({ left: xs[i], right: xs[i + 1] });
  }
  return spans;
}

/** Widest interior interval at `y`. */
export function widestSpanAtY(polygon: Point[], y: number): Span | null {
  let best: Span | null = null;
  for (const span of scanlineSpans(polygon, y)) {
    if (!best || span.right - span.left > best.right - best.left) best = span;
  }
  return best;
}

/**
 * Builds a mask-clipped erase polygon: the interior of the bubble trimmed by
 * `padX` horizontally and `padTop`/`padBottom` vertically. Filling this in
 * white removes the source text while leaving the bubble's inked border.
 */
export function insetMaskPolygon(
  polygon: Point[],
  padX: number,
  padTop: number,
  padBottom: number,
  samples = 64,
): Point[] {
  const bounds = polygonBounds(polygon);
  const top = bounds.y1 + padTop;
  const bottom = bounds.y2 - padBottom;
  if (bottom - top < 2 || !Number.isFinite(top) || !Number.isFinite(bottom)) {
    return [];
  }
  const left: Point[] = [];
  const right: Point[] = [];
  const count = Math.max(2, Math.round(samples));
  const step = (bottom - top) / (count - 1);
  for (let i = 0; i < count; i += 1) {
    const y = top + i * step;
    const span = widestSpanAtY(polygon, y);
    if (!span) continue;
    const x1 = span.left + padX;
    const x2 = span.right - padX;
    if (x2 - x1 < 2) continue;
    left.push({ x: x1, y });
    right.push({ x: x2, y });
  }
  if (left.length < 2) return [];
  return [...left, ...right.reverse()];
}

/** Converts a polygon to an SVG path (closed). */
export function polygonToPath(points: Point[]): string {
  if (points.length < 3) return "";
  const [first, ...rest] = points;
  return (
    `M ${first.x.toFixed(1)} ${first.y.toFixed(1)} ` +
    rest.map((point) => `L ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ") +
    " Z"
  );
}

function charWidth(fontSize: number, ch: string): number {
  if (ch === " ") return fontSize * 0.3;
  // Slightly conservative for Latin display fonts. Underestimating width is
  // what causes a line to wrap again inside React Native and overlap the next
  // line, which looks much worse than a marginally smaller font.
  return (ch.codePointAt(0) ?? 0) > 0xff ? fontSize : fontSize * 0.58;
}

function measure(text: string, fontSize: number): number {
  let width = 0;
  for (const ch of text) width += charWidth(fontSize, ch);
  return width;
}

/**
 * Greedy wrap against a different maximum width for each line. Returns null
 * when the text needs more lines than the mask provides.
 */
function wrapWithCapacities(
  text: string,
  fontSize: number,
  capacities: number[],
): string[] | null {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const tokens = normalized.includes(" ")
    ? normalized.split(" ")
    : Array.from(normalized);
  const spaceWidth = charWidth(fontSize, " ");
  const lines: string[] = [];
  let index = 0;
  let current = "";
  let currentWidth = 0;

  const breakLine = (): boolean => {
    lines.push(current);
    index += 1;
    current = "";
    currentWidth = 0;
    return index < capacities.length;
  };

  for (const token of tokens) {
    if (!token) continue;
    const capacity = capacities[index] ?? 0;
    if (capacity <= 0) return null;
    const tokenWidth = measure(token, fontSize);
    const gap = current ? spaceWidth : 0;
    if (currentWidth + gap + tokenWidth <= capacity) {
      current += current ? ` ${token}` : token;
      currentWidth += gap + tokenWidth;
      continue;
    }

    if (current && !breakLine()) return null;
    const nextCapacity = capacities[index] ?? 0;
    if (nextCapacity <= 0) return null;
    if (tokenWidth <= nextCapacity) {
      current = token;
      currentWidth = tokenWidth;
      continue;
    }

    // A single word is wider than this line: split it by glyph (CJK runs).
    for (const ch of token) {
      const width = charWidth(fontSize, ch);
      const lineCapacity = capacities[index] ?? 0;
      if (currentWidth + width > lineCapacity && current) {
        if (!breakLine()) return null;
      }
      const remaining = capacities[index] ?? 0;
      if (remaining <= 0) return null;
      current += ch;
      currentWidth += width;
    }
  }

  if (current) lines.push(current);
  return lines.length <= capacities.length ? lines : null;
}

function significantBand(
  polygon: Point[],
  bounds: Box,
  pad: number,
): { top: number; bottom: number; samples: number } {
  const samples = 40;
  const step = Math.max(1, (bounds.y2 - bounds.y1) / (samples - 1));
  let maxWidth = 0;
  const rows: { y: number; width: number }[] = [];
  for (let i = 0; i < samples; i += 1) {
    const y = bounds.y1 + i * step;
    const span = widestSpanAtY(polygon, y);
    const width = span ? span.right - span.left : 0;
    rows.push({ y, width });
    if (width > maxWidth) maxWidth = width;
  }
  if (maxWidth <= 0) {
    return { top: bounds.y1 + pad, bottom: bounds.y2 - pad, samples };
  }
  const significant = rows.filter((row) => row.width >= maxWidth * 0.45);
  const top = Math.max(
    bounds.y1 + pad,
    significant.length > 0 ? significant[0].y : bounds.y1 + pad,
  );
  const bottom = Math.min(
    bounds.y2 - pad,
    significant.length > 0 ? significant[significant.length - 1].y : bounds.y2 - pad,
  );
  return {
    top,
    bottom: Math.max(top + 1, bottom),
    samples,
  };
}

function capacityAt(
  polygon: Point[],
  y: number,
  pad: number,
  widthScale: number,
): number {
  const span = widestSpanAtY(polygon, y);
  if (!span) return 0;
  return Math.max(0, (span.right - span.left - pad * 2) * widthScale);
}

function lineCapacities(
  polygon: Point[],
  top: number,
  bottom: number,
  lineHeight: number,
  lineCount: number,
  pad: number,
  widthScale: number,
): number[] {
  const blockHeight = lineHeight * lineCount;
  const blockTop = (top + bottom) / 2 - blockHeight / 2;
  const capacities: number[] = [];
  for (let i = 0; i < lineCount; i += 1) {
    const center = blockTop + (i + 0.5) * lineHeight;
    // Stay inside the curved top/bottom edge of each line's own band.
    const upper = capacityAt(polygon, center - lineHeight * 0.32, pad, widthScale);
    const middle = capacityAt(polygon, center, pad, widthScale);
    const lower = capacityAt(polygon, center + lineHeight * 0.32, pad, widthScale);
    capacities.push(Math.min(upper, middle, lower));
  }
  return capacities;
}

function layoutFor(
  text: string,
  polygon: Point[],
  top: number,
  bottom: number,
  fontSize: number,
  lineCount: number,
  pad: number,
  widthScale: number,
  lineHeightMultiplier: number,
): MaskTextLayout | null {
  let currentSize = fontSize;
  let targetLines = Math.max(1, lineCount);

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const capacities = lineCapacities(
      polygon,
      top,
      bottom,
      currentSize * lineHeightMultiplier,
      targetLines,
      pad,
      widthScale,
    );
    const lines = wrapWithCapacities(text, currentSize, capacities);
    if (!lines) {
      currentSize *= 0.9;
      continue;
    }
    if (lines.length > targetLines) {
      currentSize *= 0.9;
      continue;
    }
    if (lines.length < targetLines) {
      targetLines = Math.max(1, lines.length);
      continue;
    }
    const actualLineHeight = currentSize * lineHeightMultiplier;
    if (lines.length * actualLineHeight <= bottom - top + 1) {
      const actualCount = lines.length;
      const blockHeight = actualCount * actualLineHeight;
      const blockTop = (top + bottom) / 2 - blockHeight / 2;
      const result: MaskTextLayout = {
        fontSize: currentSize,
        lineHeight: actualLineHeight,
        lines: [],
      };
      for (let i = 0; i < actualCount; i += 1) {
        const center = blockTop + (i + 0.5) * actualLineHeight;
        const span = widestSpanAtY(polygon, center);
        if (!span) return null;
        const left = span.left + pad;
        const width = Math.max(1, span.right - pad - left);
        result.lines.push({
          text: lines[i],
          left,
          top: blockTop + i * actualLineHeight,
          width,
        });
      }
      return result;
    }
    currentSize *= 0.9;
  }
  return null;
}

export interface MaskTextOptions {
  text: string;
  /** Bubble polygon in display pixels. */
  polygon: Point[];
  lineHeightMultiplier?: number;
  /** Bold/display-font width correction. */
  widthScale?: number;
  minFont?: number;
  maxFont?: number;
  preferredLineCount?: number;
  /** Page-consistent target size in display pixels. */
  preferredFont?: number;
  padRatio?: number;
  /** Fraction of the bubble's significant height the text block may use. */
  fillRatio?: number;
}

/**
 * Finds a readable layout that fits the bubble. A page-consistent target size
 * keeps the typography looking like a scanlation rather than filling every
 * bubble edge-to-edge; the source line count breaks ties between valid line
 * counts.
 */
export function layoutTextInMask(options: MaskTextOptions): MaskTextLayout {
  const {
    text,
    polygon,
    lineHeightMultiplier = 1.2,
    widthScale = 1,
    minFont = 5,
    maxFont = 160,
    preferredLineCount,
    preferredFont,
    fillRatio = 0.86,
  } = options;
  const bounds = polygonBounds(polygon);
  const minDim = Math.min(bounds.x2 - bounds.x1, bounds.y2 - bounds.y1);
  const pad = Math.max(
    2,
    Math.min(14, minDim * (options.padRatio ?? 0.055)),
  );
  const band = significantBand(polygon, bounds, pad);
  const bandHeight = Math.max(1, band.bottom - band.top);
  const maxLines = 8;
  let best: { layout: MaskTextLayout; score: number } | null = null;

  for (let lineCount = 1; lineCount <= maxLines; lineCount += 1) {
    const heightCap =
      (bandHeight * fillRatio) / (lineCount * lineHeightMultiplier);
    let lo = minFont;
    let hi = Math.min(maxFont, heightCap);
    if (hi < lo) continue;
    let fitted = 0;
    for (let iteration = 0; iteration < 14; iteration += 1) {
      const mid = (lo + hi) / 2;
      const caps = lineCapacities(
        polygon,
        band.top,
        band.bottom,
        mid * lineHeightMultiplier,
        lineCount,
        pad,
        widthScale,
      );
      if (caps.some((capacity) => capacity <= 0)) {
        hi = mid;
        continue;
      }
      const wrapped = wrapWithCapacities(text, mid, caps);
      if (wrapped && wrapped.length <= lineCount) {
        fitted = mid;
        lo = mid;
      } else {
        hi = mid;
      }
    }
    if (fitted <= 0) continue;
    // Never exceed the page target. If the target does not fit this line
    // count, layoutFor reduces it further; if it is below the minimum, the
    // binary-search maximum is used instead.
    const targetFont =
      preferredFont && preferredFont > 0
        ? Math.min(fitted, Math.max(minFont, preferredFont))
        : fitted;
    const layout = layoutFor(
      text,
      polygon,
      band.top,
      band.bottom,
      targetFont,
      lineCount,
      pad,
      widthScale,
      lineHeightMultiplier,
    );
    if (!layout) continue;
    const linePenalty = preferredLineCount
      ? Math.abs(layout.lines.length - preferredLineCount) * 0.3
      : 0;
    const fontUse = Math.min(layout.fontSize, preferredFont ?? layout.fontSize);
    const score = fontUse * 0.02 - linePenalty - lineCount * 0.005;
    if (!best || score > best.score) best = { layout, score };
  }

  if (best) return best.layout;

  // Degenerate mask: fall back to a single readable line in the widest span.
  const centerY = (bounds.y1 + bounds.y2) / 2;
  const span =
    widestSpanAtY(polygon, centerY) ?? {
      left: bounds.x1,
      right: bounds.x2,
    };
  const left = span.left + pad;
  const width = Math.max(1, span.right - pad - left);
  return {
    fontSize: minFont,
    lineHeight: minFont * lineHeightMultiplier,
    lines: [
      {
        text: text.replace(/\s+/g, " ").trim(),
        left,
        top: centerY - (minFont * lineHeightMultiplier) / 2,
        width,
      },
    ],
  };
}
