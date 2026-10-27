/**
 * borderCrop.ts
 * ---------------------------------------------------------------------------
 * Detects uniform margins around a manga page (the white/black scanlation
 * borders Mihon removes with its crop-borders setting).
 *
 * The image is reduced to a small thumbnail before pixels are inspected, so
 * detection does not allocate another full-size bitmap. The caller is expected
 * to skip extremely tall webtoon strips; ReaderPage/SubsamplingStripImage do
 * that before calling this helper.
 *
 * The returned insets are fractions of the natural image size. They are
 * applied to both the page bitmap and its translation overlay, so OCR boxes
 * remain aligned with the source pixels.
 * ---------------------------------------------------------------------------
 */

import { AlphaType, ColorType, Skia } from "@shopify/react-native-skia";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

export interface BorderCrop {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const MAX_INSET = 0.12;
const MIN_INSET = 0.004;
const BACKGROUND_TOLERANCE = 28;
const BACKGROUND_ROW_RATIO = 0.92;
const MAX_ASPECT = 8;

const cropCache = new Map<string, BorderCrop | null>();
const pendingCrops = new Map<string, Promise<BorderCrop | null>>();

function channelDistance(
  pixels: Uint8Array,
  index: number,
  r: number,
  g: number,
  b: number,
): number {
  return (
    Math.abs(pixels[index] - r) +
    Math.abs(pixels[index + 1] - g) +
    Math.abs(pixels[index + 2] - b)
  );
}

function cornerColor(
  pixels: Uint8Array,
  width: number,
  height: number,
  x0: number,
  y0: number,
): [number, number, number] {
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  for (let y = y0; y < Math.min(height, y0 + 3); y += 1) {
    for (let x = x0; x < Math.min(width, x0 + 3); x += 1) {
      const index = (y * width + x) * 4;
      r += pixels[index];
      g += pixels[index + 1];
      b += pixels[index + 2];
      count += 1;
    }
  }
  const divisor = Math.max(1, count);
  return [r / divisor, g / divisor, b / divisor];
}

function rowBackgroundRatio(
  pixels: Uint8Array,
  width: number,
  y: number,
  r: number,
  g: number,
  b: number,
): number {
  let matches = 0;
  for (let x = 0; x < width; x += 1) {
    const index = (y * width + x) * 4;
    if (channelDistance(pixels, index, r, g, b) <= BACKGROUND_TOLERANCE) {
      matches += 1;
    }
  }
  return matches / Math.max(1, width);
}

function columnBackgroundRatio(
  pixels: Uint8Array,
  width: number,
  height: number,
  x: number,
  r: number,
  g: number,
  b: number,
): number {
  let matches = 0;
  for (let y = 0; y < height; y += 1) {
    const index = (y * width + x) * 4;
    if (channelDistance(pixels, index, r, g, b) <= BACKGROUND_TOLERANCE) {
      matches += 1;
    }
  }
  return matches / Math.max(1, height);
}

function detectFromPixels(
  pixels: Uint8Array,
  width: number,
  height: number,
): BorderCrop | null {
  if (width < 8 || height < 8) return null;

  const corners = [
    cornerColor(pixels, width, height, 0, 0),
    cornerColor(pixels, width, height, width - 3, 0),
    cornerColor(pixels, width, height, 0, height - 3),
    cornerColor(pixels, width, height, width - 3, height - 3),
  ];
  const r = corners.reduce((sum, value) => sum + value[0], 0) / 4;
  const g = corners.reduce((sum, value) => sum + value[1], 0) / 4;
  const b = corners.reduce((sum, value) => sum + value[2], 0) / 4;
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

  // Only treat near-white or near-black flat corners as page margins. A
  // full-bleed coloured page should never lose artwork to auto-crop.
  if (luminance > 55 && luminance < 195) return null;
  if (
    corners.some(
      (corner) =>
        Math.abs(corner[0] - r) + Math.abs(corner[1] - g) + Math.abs(corner[2] - b) >
        BACKGROUND_TOLERANCE * 2,
    )
  ) {
    return null;
  }

  const maxTop = Math.max(1, Math.floor(height * MAX_INSET));
  const maxSide = Math.max(1, Math.floor(width * MAX_INSET));
  let top = 0;
  while (
    top < maxTop &&
    rowBackgroundRatio(pixels, width, top, r, g, b) >= BACKGROUND_ROW_RATIO
  ) {
    top += 1;
  }
  let bottom = height - 1;
  while (
    bottom >= height - maxTop &&
    bottom > top &&
    rowBackgroundRatio(pixels, width, bottom, r, g, b) >= BACKGROUND_ROW_RATIO
  ) {
    bottom -= 1;
  }
  let left = 0;
  while (
    left < maxSide &&
    columnBackgroundRatio(pixels, width, height, left, r, g, b) >= BACKGROUND_ROW_RATIO
  ) {
    left += 1;
  }
  let right = width - 1;
  while (
    right >= width - maxSide &&
    right > left &&
    columnBackgroundRatio(pixels, width, height, right, r, g, b) >= BACKGROUND_ROW_RATIO
  ) {
    right -= 1;
  }

  const crop: BorderCrop = {
    left: left / width,
    top: top / height,
    right: (width - 1 - right) / width,
    bottom: (height - 1 - bottom) / height,
  };
  const hasCrop =
    crop.left >= MIN_INSET ||
    crop.top >= MIN_INSET ||
    crop.right >= MIN_INSET ||
    crop.bottom >= MIN_INSET;
  if (!hasCrop) return null;
  if (crop.left + crop.right > 0.25 || crop.top + crop.bottom > 0.25) {
    return null;
  }
  return crop;
}

async function analyze(uri: string): Promise<BorderCrop | null> {
  const context = ImageManipulator.manipulate(uri);
  context.resize({ width: 160 });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({
    format: SaveFormat.PNG,
    compress: 1,
  });
  const encoded = await Skia.Data.fromURI(saved.uri);
  const image = Skia.Image.MakeImageFromEncoded(encoded);
  if (!image) return null;
  const width = image.width();
  const height = image.height();
  if (width < 8 || height < 8) return null;
  const raw = image.readPixels(0, 0, {
    width,
    height,
    colorType: ColorType.RGBA_8888,
    alphaType: AlphaType.Unpremul,
  });
  if (!raw) return null;
  return detectFromPixels(raw as Uint8Array, width, height);
}

/** Returns cached border insets for `uri`, or null when no safe crop exists. */
export function detectBorderCrop(uri: string): Promise<BorderCrop | null> {
  if (cropCache.has(uri)) {
    return Promise.resolve(cropCache.get(uri) ?? null);
  }
  const inFlight = pendingCrops.get(uri);
  if (inFlight) return inFlight;

  const task = analyze(uri)
    .catch(() => null)
    .then((crop) => {
      cropCache.set(uri, crop);
      return crop;
    })
    .finally(() => {
      pendingCrops.delete(uri);
    });
  pendingCrops.set(uri, task);
  return task;
}

export function shouldAnalyzeBorderCrop(
  width: number,
  height: number,
): boolean {
  return width > 0 && height > 0 && height / width <= MAX_ASPECT;
}
