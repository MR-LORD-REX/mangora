/**
 * pageGeometry.ts
 * ---------------------------------------------------------------------------
 * Pure per-mode geometry for one reader page.
 *
 * This mirrors Mihon's two viewer families:
 *   - Pager readers use one viewport-sized slot per page and honour the
 *     selected image scale (fit width / fit height / fit screen / original).
 *   - Long-strip readers always fit the image to the available width, exactly
 *     like Mihon's webtoon viewer. A very tall page is one strip row; the
 *     native subsampling renderer only decodes the visible region.
 *
 * Translation overlays are mapped against `overlayW/H`. For a normal page that
 * is the rendered image box; for a split wide page it is the full spread while
 * `imgW/H` describe the visible half. The renderer clips image and overlay
 * together, so a geometry change can never pull them apart.
 * ---------------------------------------------------------------------------
 */

import type {
  ReaderImageScaleType,
  ReaderReadingMode,
} from "@core/settings/settingsSchema";

import { isLongStripMode } from "../legacyReadingModes";

export interface PageSliceGeometry {
  /** Source-space top in natural paged pixels. */
  sourceTop: number;
  /** Source-space height in natural paged pixels. */
  sourceHeight: number;
  /** Display-space top inside the full rendered page. */
  displayTop: number;
  /** Display-space height of the slice. */
  displayHeight: number;
}

export interface PageGeometry {
  itemW: number;
  itemH: number;
  imgW: number;
  imgH: number;
  overlayW: number;
  overlayH: number;
  zoom: boolean;
  /** The page is drawn rotated 90 degrees; imgW/imgH are the rotated box. */
  rotate: boolean;
  /** Present only for a tall paged-mode slice. */
  slice?: PageSliceGeometry | null;
}

export interface PageDims {
  width: number;
  height: number;
}

/** A half of a wide (double-page) image, used by Split wide pages. */
export type ReaderPageSplitHalf = "left" | "right";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function widthBudget(bodyW: number, sidePadding: number): number {
  const factor = 1 - clamp(sidePadding, 0, 100) / 100;
  return Math.max(120, bodyW * factor);
}

function contain(
  naturalW: number,
  naturalH: number,
  boxW: number,
  boxH: number,
): { width: number; height: number } {
  const scale = Math.min(boxW / naturalW, boxH / naturalH);
  return { width: naturalW * scale, height: naturalH * scale };
}

function scaled(
  naturalW: number,
  naturalH: number,
  scaleType: ReaderImageScaleType,
  budgetW: number,
  budgetH: number,
): { width: number; height: number } {
  switch (scaleType) {
    case "fitWidth": {
      const width = budgetW;
      return { width, height: (naturalH * width) / naturalW };
    }
    case "fitHeight": {
      const height = budgetH;
      return { width: (naturalW * height) / naturalH, height };
    }
    case "original":
      return { width: naturalW, height: naturalH };
    case "fitScreen":
    default:
      return contain(naturalW, naturalH, budgetW, budgetH);
  }
}

function pagedImageScale(
  scaleType: ReaderImageScaleType,
  naturalW: number,
  naturalH: number,
  budgetW: number,
  budgetH: number,
  rotate: boolean,
): ReaderImageScaleType {
  if (rotate || naturalW <= 0) return scaleType;
  if (scaleType === "original") return "fitWidth";
  // Tall pages are more useful as fit-width pages with vertical panning than
  // as a fit-screen sliver. Short pages keep the normal contain fit.
  if (scaleType === "fitScreen" && (naturalH * budgetW) / naturalW > budgetH) {
    return "fitWidth";
  }
  return scaleType;
}

export function pageGeometry(
  url: string,
  mode: ReaderReadingMode,
  sidePadding: number,
  body: { width: number; height: number },
  dims: Record<string, PageDims>,
  imageScaleType: ReaderImageScaleType = "fitScreen",
  rotateWidePagesToFit = false,
  splitHalf: ReaderPageSplitHalf | null = null,
  fallbackBody: PageDims = { width: 390, height: 844 },
  slice: { top: number; height: number } | null = null,
): PageGeometry {
  const bodyW = body.width || fallbackBody.width;
  const bodyH = body.height || fallbackBody.height;
  const measured = dims[url];
  const naturalW = measured?.width ?? 0;
  const naturalH = measured?.height ?? 0;
  const hasDims = naturalW > 0 && naturalH > 0;
  const budgetW = widthBudget(bodyW, sidePadding);
  const rotate = rotateWidePagesToFit && hasDims && naturalW > naturalH;
  // Rotation and splitting are mutually exclusive, matching Mihon's page
  // processing order (rotate wins when both are enabled).
  const split = !rotate && splitHalf !== null && hasDims;
  const targetNaturalW = rotate
    ? naturalH
    : split
      ? naturalW / 2
      : naturalW;
  const targetNaturalH = rotate ? naturalW : naturalH;
  const overlayMultiplier = split ? 2 : 1;

  // Mihon's webtoon and continuous viewers force fit-width. This is the key
  // to stable long-strip columns: every page shares the same width and only
  // its own aspect ratio decides the row height.
  if (isLongStripMode(mode)) {
    if (!hasDims) {
      const placeholderH = budgetW * 1.4;
      return {
        itemW: bodyW,
        itemH: placeholderH,
        imgW: budgetW,
        imgH: placeholderH,
        overlayW: budgetW,
        overlayH: placeholderH,
        zoom: false,
        rotate: false,
      };
    }
    const imgW = budgetW;
    const imgH = (targetNaturalH * imgW) / targetNaturalW;
    return {
      itemW: bodyW,
      itemH: imgH,
      imgW,
      imgH,
      overlayW: imgW * overlayMultiplier,
      overlayH: imgH,
      zoom: false,
      rotate,
    };
  }

  // A paged slice is a viewport-sized window into the same source image. The
  // overlay keeps the full source box; the image layer is offset by the source
  // crop so translation geometry stays normalized to the original page.
  if (slice) {
    const fullImage = scaled(
      targetNaturalW,
      targetNaturalH,
      pagedImageScale(
        imageScaleType,
        targetNaturalW,
        targetNaturalH,
        budgetW,
        bodyH,
        rotate,
      ),
      budgetW,
      bodyH,
    );
    const sourceTop = slice.top * targetNaturalH;
    const sourceHeight = slice.height * targetNaturalH;
    return {
      itemW: bodyW,
      itemH: bodyH,
      imgW: fullImage.width,
      imgH: Math.max(1, fullImage.height * slice.height),
      overlayW: fullImage.width * overlayMultiplier,
      overlayH: fullImage.height,
      slice: {
        sourceTop,
        sourceHeight,
        displayTop: fullImage.height * slice.top,
        displayHeight: fullImage.height * slice.height,
      },
      zoom: imageScaleType === "original",
      rotate,
    };
  }

  if (!hasDims) {
    const placeholder = contain(0.71, 1, budgetW, bodyH);
    return {
      itemW: bodyW,
      itemH: bodyH,
      imgW: placeholder.width,
      imgH: placeholder.height,
      overlayW: placeholder.width,
      overlayH: placeholder.height,
      zoom: false,
      rotate: false,
    };
  }

  const image = scaled(
    targetNaturalW,
    targetNaturalH,
    pagedImageScale(
      imageScaleType,
      targetNaturalW,
      targetNaturalH,
      budgetW,
      bodyH,
      rotate,
    ),
    budgetW,
    bodyH,
  );
  return {
    itemW: bodyW,
    itemH: bodyH,
    imgW: image.width,
    imgH: image.height,
    overlayW: image.width * overlayMultiplier,
    overlayH: image.height,
    zoom: imageScaleType === "original",
    rotate,
  };
}
