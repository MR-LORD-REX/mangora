/**
 * pagedSlices.ts
 * ---------------------------------------------------------------------------
 * Presentation slices for tall pages in paged mode.
 *
 * A source page keeps one logical identity (`pageIndex`) for progress,
 * history, translation and page actions. Very tall pages are additionally
 * exposed as viewport-sized slices so they can be displayed and panned-in
 * without clipping. Each slice references a normalized source rectangle; no
 * second image is fetched.
 * ---------------------------------------------------------------------------
 */

export interface PagedSourceSlice {
  /** Slice position inside the logical page (0-based). */
  index: number;
  /** Number of slices for this logical page. */
  count: number;
  /** Normalized source-image crop, 0..1. */
  top: number;
  height: number;
}

export interface PagedSourceLayout {
  width: number;
  height: number;
}

const MIN_SLICE_HEIGHT = 1;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Split a rendered page height into balanced viewport-sized slices. Slices
 * cover the entire image exactly once with no overlap, so translation overlays
 * can use one normalized crop per slice. Balancing avoids a one-pixel tail
 * slice when a page is only slightly taller than the viewport.
 */
export function pagedSlicesFor(
  image: PagedSourceLayout,
  viewportHeight: number,
): PagedSourceSlice[] {
  const imageHeight = image.height;
  const viewport = viewportHeight;
  if (
    !Number.isFinite(imageHeight) ||
    imageHeight <= MIN_SLICE_HEIGHT ||
    !Number.isFinite(viewport) ||
    viewport <= MIN_SLICE_HEIGHT
  ) {
    return [{ index: 0, count: 1, top: 0, height: 1 }];
  }
  const count = Math.max(1, Math.ceil(imageHeight / viewport));
  if (count === 1) {
    return [{ index: 0, count: 1, top: 0, height: 1 }];
  }
  const sliceHeight = imageHeight / count;
  return Array.from({ length: count }, (_, index) => {
    const rawTop = (index * sliceHeight) / imageHeight;
    const rawBottom = Math.min(1, ((index + 1) * sliceHeight) / imageHeight);
    const top = clamp(rawTop, 0, 1);
    const bottom = Math.max(top, rawBottom);
    return {
      index,
      count,
      top,
      height: bottom - top,
    };
  });
}

/**
 * Number of source pixels represented by a normalized slice.
 */
export function sliceSourceHeight(
  image: PagedSourceLayout,
  slice: PagedSourceSlice,
): number {
  return image.height * slice.height;
}
