/**
 * tapZones.ts
 * ---------------------------------------------------------------------------
 * Mihon's pager/webtoon navigation presets.
 *
 * Presets are expressed as normalised rectangles, copied from Mihon:
 *   L-shaped  - prev on the left-middle and top, next on right-middle/bottom
 *   Kindlish  - prev on the left third, next on the lower-right two thirds
 *   Edge      - next on both side thirds, prev on the bottom-centre third
 *   RightLeft - prev on the left third, next on the right third
 *   Disabled  - no page-turn zones, every tap opens the menu
 *
 * The legacy top/bottom, left/right and both presets remain for old settings.
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
  action: ReaderTapAction;
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface NormalizedRegion {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  action: Exclude<ReaderTapAction, "toggle">;
  edge: TapZoneEdge;
  /**
   * Physical left/right zones mirror in RTL. Semantic prev/next zones do not:
   * Mihon's R2L pager still maps NEXT to the next logical page.
   */
  physical?: boolean;
}

const L_REGIONS: NormalizedRegion[] = [
  { x1: 0, y1: 0, x2: 1, y2: 1 / 3, action: "prev", edge: "top" },
  { x1: 0, y1: 1 / 3, x2: 1 / 3, y2: 2 / 3, action: "prev", edge: "left" },
  { x1: 2 / 3, y1: 1 / 3, x2: 1, y2: 2 / 3, action: "next", edge: "right" },
  { x1: 0, y1: 2 / 3, x2: 1, y2: 1, action: "next", edge: "bottom" },
];

const KINDLISH_REGIONS: NormalizedRegion[] = [
  { x1: 0, y1: 1 / 3, x2: 1 / 3, y2: 1, action: "prev", edge: "left" },
  { x1: 1 / 3, y1: 1 / 3, x2: 1, y2: 1, action: "next", edge: "right" },
];

const EDGE_REGIONS: NormalizedRegion[] = [
  { x1: 0, y1: 0, x2: 1 / 3, y2: 1, action: "next", edge: "left" },
  { x1: 1 / 3, y1: 2 / 3, x2: 2 / 3, y2: 1, action: "prev", edge: "bottom" },
  { x1: 2 / 3, y1: 0, x2: 1, y2: 1, action: "next", edge: "right" },
];

const RIGHT_LEFT_REGIONS: NormalizedRegion[] = [
  {
    x1: 0,
    y1: 0,
    x2: 1 / 3,
    y2: 1,
    action: "prev",
    edge: "left",
    physical: true,
  },
  {
    x1: 2 / 3,
    y1: 0,
    x2: 1,
    y2: 1,
    action: "next",
    edge: "right",
    physical: true,
  },
];

function legacyRegions(layout: ReaderTapZoneLayout): NormalizedRegion[] {
  const inset = TAP_ZONE_INSET;
  if (layout === "leftRight") {
    return [
      {
        x1: 0,
        y1: 0,
        x2: inset,
        y2: 1,
        action: "prev",
        edge: "left",
        physical: true,
      },
      {
        x1: 1 - inset,
        y1: 0,
        x2: 1,
        y2: 1,
        action: "next",
        edge: "right",
        physical: true,
      },
    ];
  }
  if (layout === "both") {
    return [
      { x1: 0, y1: 0, x2: 1, y2: inset, action: "prev", edge: "top" },
      { x1: 0, y1: 1 - inset, x2: 1, y2: 1, action: "next", edge: "bottom" },
      {
        x1: 0,
        y1: 0,
        x2: inset,
        y2: 1,
        action: "prev",
        edge: "left",
        physical: true,
      },
      {
        x1: 1 - inset,
        y1: 0,
        x2: 1,
        y2: 1,
        action: "next",
        edge: "right",
        physical: true,
      },
    ];
  }
  return [
    { x1: 0, y1: 0, x2: 1, y2: inset, action: "prev", edge: "top" },
    { x1: 0, y1: 1 - inset, x2: 1, y2: 1, action: "next", edge: "bottom" },
  ];
}

function regionsFor(layout: ReaderTapZoneLayout): NormalizedRegion[] {
  switch (layout) {
    case "kindlish":
      return KINDLISH_REGIONS;
    case "edge":
      return EDGE_REGIONS;
    case "rightLeft":
      return RIGHT_LEFT_REGIONS;
    case "disabled":
      return [];
    case "l":
      return L_REGIONS;
    default:
      return legacyRegions(layout);
  }
}

function actionColor(action: ReaderTapAction): string {
  switch (action) {
    case "prev":
      return "rgba(255,119,51,0.42)";
    case "next":
      return "rgba(132,226,150,0.42)";
    default:
      return "rgba(149,129,141,0.38)";
  }
}

function flip(action: ReaderTapAction): ReaderTapAction {
  if (action === "prev") return "next";
  if (action === "next") return "prev";
  return action;
}

/**
 * Mihon's invert modes mirror the rectangles themselves (RectF.invert), so a
 * vertical inversion moves the top L band to the bottom instead of merely
 * swapping its action. Keeping the rectangle and action together is what makes
 * the preview overlay and the hit-testing agree.
 */
function invertedRegion(
  region: NormalizedRegion,
  invert: ReaderInvertTapZones,
): NormalizedRegion {
  if (invert === "none") return region;
  const horizontal = invert === "horizontal" || invert === "both";
  const vertical = invert === "vertical" || invert === "both";
  return {
    ...region,
    x1: horizontal ? 1 - region.x2 : region.x1,
    x2: horizontal ? 1 - region.x1 : region.x2,
    y1: vertical ? 1 - region.y2 : region.y1,
    y2: vertical ? 1 - region.y1 : region.y2,
  };
}

/** Absolute, coloured rectangles used by the tap-zone preview overlay. */
export function tapZoneRectsFor(
  layout: ReaderTapZoneLayout,
  width: number,
  height: number,
  rtl = false,
  invert: ReaderInvertTapZones = "none",
): TapZoneRect[] {
  return regionsFor(layout).map((original) => {
    const region = invertedRegion(original, invert);
    const action = region.physical && rtl ? flip(region.action) : region.action;
    return {
      edge: region.edge,
      action,
      x: region.x1 * width,
      y: region.y1 * height,
      width: (region.x2 - region.x1) * width,
      height: (region.y2 - region.y1) * height,
      color: actionColor(action),
    };
  });
}

export interface ResolveTapZoneOptions {
  layout: ReaderTapZoneLayout;
  /** Flip left/right meaning for RTL horizontal paging. */
  rtl?: boolean;
  /** Swaps which edge means previous/next. */
  invert?: ReaderInvertTapZones;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Returns the action a tap at (x, y) triggers for the active preset. */
export function resolveTapZoneAction(
  options: ResolveTapZoneOptions,
): ReaderTapAction {
  const {
    layout,
    rtl = false,
    invert = "none",
    width,
    height,
  } = options;
  if (width <= 0 || height <= 0) return "toggle";

  const nx = options.x / width;
  const ny = options.y / height;
  if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return "toggle";

  const region = regionsFor(layout)
    .map((candidate) => invertedRegion(candidate, invert))
    .find(
      (candidate) =>
        nx >= candidate.x1 &&
        nx <= candidate.x2 &&
        ny >= candidate.y1 &&
        ny <= candidate.y2,
    );
  if (!region) return "toggle";

  return region.physical && rtl ? flip(region.action) : region.action;
}
