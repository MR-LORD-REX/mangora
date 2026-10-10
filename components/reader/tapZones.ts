/**
 * tapZones.ts
 * ---------------------------------------------------------------------------
 * Geometry + hit-testing for the paged reader tap zones.
 *
 * Every preset reserves a 30% band from each chosen screen edge as a
 * page-turn zone; the remaining middle space toggles the header/footer
 * chrome. Only three presets exist:
 *
 *   topBottom - top 30% and bottom 30% bands
 *   leftRight - left 30% and right 30% columns
 *   both      - all four edges (30% from every side)
 *
 * Top/left edges map to the previous page, bottom/right edges to the next
 * page. When reading RTL paged-horizontal the left/right mapping flips, and
 * "invert tap zones" can flip either axis.
 * ---------------------------------------------------------------------------
 */

import type {
  ReaderInvertTapZones,
  ReaderTapZoneLayout,
} from "./readerChrome";

export const TAP_ZONE_INSET = 0.3;

export type TapZoneEdge = "top" | "bottom" | "left" | "right";
export type ReaderTapAction = "prev" | "next" | "toggle";

export interface TapZoneRect {
  edge: TapZoneEdge;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Absolute rectangles (in the given viewport) for the flash preview. */
export function tapZoneRectsFor(
  layout: ReaderTapZoneLayout,
  width: number,
  height: number,
): TapZoneRect[] {
  const insetW = width * TAP_ZONE_INSET;
  const insetH = height * TAP_ZONE_INSET;
  switch (layout) {
    case "leftRight":
      return [
        { edge: "left", x: 0, y: 0, width: insetW, height },
        { edge: "right", x: width - insetW, y: 0, width: insetW, height },
      ];
    case "both":
      return [
        { edge: "top", x: 0, y: 0, width, height: insetH },
        { edge: "bottom", x: 0, y: height - insetH, width, height: insetH },
        { edge: "left", x: 0, y: 0, width: insetW, height },
        { edge: "right", x: width - insetW, y: 0, width: insetW, height },
      ];
    case "topBottom":
    default:
      return [
        { edge: "top", x: 0, y: 0, width, height: insetH },
        { edge: "bottom", x: 0, y: height - insetH, width, height: insetH },
      ];
  }
}

export interface ResolveTapZoneOptions {
  layout: ReaderTapZoneLayout;
  /** Flip the left/right edges (RTL paged-horizontal reading). */
  rtl?: boolean;
  /** Swaps which edge means previous/next. */
  invert?: ReaderInvertTapZones;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Returns the action a tap at (x, y) triggers for the active preset. */
export function resolveTapZoneAction(options: ResolveTapZoneOptions): ReaderTapAction {
  const { layout, rtl = false, invert = "none", width, height } = options;
  if (width <= 0 || height <= 0) return "toggle";

  const nx = options.x / width;
  const ny = options.y / height;
  const nearTop = ny <= TAP_ZONE_INSET;
  const nearBottom = ny >= 1 - TAP_ZONE_INSET;
  const nearLeft = nx <= TAP_ZONE_INSET;
  const nearRight = nx >= 1 - TAP_ZONE_INSET;

  const inHorizontal = invert === "horizontal" || invert === "both";
  const inVertical = invert === "vertical" || invert === "both";

  const hasHorizontalBands = layout === "leftRight" || layout === "both";
  const hasVerticalBands = layout === "topBottom" || layout === "both";

  if (hasHorizontalBands && (nearLeft || nearRight)) {
    // Horizontal edges win over vertical edges when a corner overlaps two
    // bands ("both" preset) so a top-right tap behaves like a right-edge tap.
    const leftIsPrev = rtl ? inHorizontal : !inHorizontal;
    if (nearLeft) return leftIsPrev ? "prev" : "next";
    return leftIsPrev ? "next" : "prev";
  }
  if (hasVerticalBands && (nearTop || nearBottom)) {
    if (nearTop) return inVertical ? "next" : "prev";
    return inVertical ? "prev" : "next";
  }
  return "toggle";
}
