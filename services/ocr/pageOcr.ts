/**
 * pageOcr.ts
 * ---------------------------------------------------------------------------
 * Backend-agnostic helpers + types shared by the on-device OCR engines.
 *
 * Every backend gets the same input: a YOLO `DetectionResult` + the page URL.
 * The shared pipeline here downloads the page once, crops each text region
 * with expo-image-manipulator and returns crop files; each OCR backend then
 * reads those crops and maps its own detections back into page coordinates.
 * ---------------------------------------------------------------------------
 */

import { File, Paths } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

import { downloadToFile } from "@/services/net/browserFetch";
import { fetchExtensionPageImage } from "@/services/extensions/native";
import { isAvifUri, transcodeAvifToPng } from "@/services/images/avif";


/** A YOLO text-region box in natural page pixels. */
export interface OcrRegion {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** YOLO class id: 0 = clean_text, 1 = messy_text. */
  classId: number;
  /** 0..1 model confidence, used to prioritise when crops are capped. */
  confidence?: number;
}

export type OcrRecognitionLevel = "word" | "line";

/** One recognized word/line mapped back into natural page pixels. */
export interface OcrTextItem {
  text: string;
  /** 0..1 confidence. */
  confidence: number;
  level: OcrRecognitionLevel;
  /** YOLO class id of the crop this item came from. */
  classId: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface PageOcrOptions {
  pageUrl: string;
  /** Headers used to fetch the page (e.g. Referer for hotlink-protected hosts). */
  headers?: Record<string, string>;
  /** Natural width of the decoded page - use the YOLO result dimensions. */
  imageWidth: number;
  /** Natural height of the decoded page. */
  imageHeight: number;
  /** Text regions to OCR. Only messy_text / text_bubble (classId 1/2) run. */
  regions: OcrRegion[];
  /** Cap on crops sent to the recognizer. Default 24. */
  maxCrops?: number;
}

export interface PageOcrOutput {
  pageUrl: string;
  /** Natural page dimensions the overlay should map back to. */
  imageWidth: number;
  imageHeight: number;
  items: OcrTextItem[];
  /** Number of crops that produced at least one text element. */
  cropsRecognized: number;
  /** Number of crops whose OCR call failed. */
  cropsFailed: number;
  /** Number of regions skipped (too small / over the cap). */
  cropsSkipped: number;
}


/** Thrown when a page-level OCR run cannot complete. */
export class OcrError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "OcrError";
  }
}


export interface DecodablePageOptions {
  headers?: Record<string, string>;
  /** Extension source id: image bytes go through its OkHttp client. */
  extensionSourceId?: string;
  /** Page url, required for extension image interceptors. */
  pageUrl?: string;
  /**
   * Fetch through the extension client even when the url has no `.avif`
   * suffix. Used as a decode fallback after Skia rejects the remote image.
   */
  force?: boolean;
}

let tempPageSeq = 0;

/**
 * Returns a uri the reader / YOLO / OCR can actually decode.
 *
 * The reader now hands every consumer the same local reader-cache file:// uri.
 * This helper therefore does not keep a page cache of its own: local files are
 * returned as-is (AVIF is transcoded), and a remote url only falls back to a
 * short-lived temporary download for legacy callers.
 */
export async function ensureDecodablePageUri(
  uri: string,
  options: DecodablePageOptions = {},
): Promise<string> {
  const avif = isAvifUri(uri);
  if (uri.startsWith("file://")) {
    return avif ? transcodeAvifToPng(uri) : uri;
  }
  if (!avif && !options.force) return uri;
  if (options.extensionSourceId) {
    const image = await fetchExtensionPageImage(
      options.extensionSourceId,
      uri,
      options.pageUrl ?? uri,
    );
    const localAvif = image.mime === "image/avif" || isAvifUri(image.path);
    return localAvif ? transcodeAvifToPng(image.path) : image.path;
  }
  tempPageSeq += 1;
  const target = new File(
    Paths.cache,
    "ocr-page-" + Date.now() + "-" + tempPageSeq + ".img",
  );
  await downloadToFile(uri, target, options.headers);
  if (!target.exists || target.size <= 0) {
    throw new OcrError("Downloading the page image failed: " + uri);
  }
  return avif ? transcodeAvifToPng(target.uri) : target.uri;
}

export const MIN_CROP_PX = 6;

/**
 * Keeps only the OCR-able YOLO regions (messy_text/text_bubble = classId 1/2),
 * sorts them by confidence and caps the count. Regions are returned top-first
 * so vertical manga text keeps reading order even when several crops map to
 * the same column.
 */
export function prepareTextRegions(regions: OcrRegion[], maxCrops = 24): OcrRegion[] {
  return regions
    .filter((region) => region.classId === 1 || region.classId === 2)
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
    .slice(0, Math.max(1, maxCrops))
    .sort((a, b) => a.y1 - b.y1 || a.x1 - b.x1);
}

/**
 * Region selector for the Paddle detector + recognizer pair.
 *
 * DBNet finds text lines *inside* whatever crop it receives, so a whole YOLO
 * bubble is the correct input. Clean-text boxes are only a fallback for pages
 * where YOLO emitted no bubble/messy boxes at all.
 */
export function preparePaddleRegions(
  regions: OcrRegion[],
  maxCrops = 24,
): OcrRegion[] {
  const bubbles = prepareTextRegions(regions, maxCrops);
  if (bubbles.length > 0) return bubbles;
  return regions
    .filter((region) => region.classId === 0)
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
    .slice(0, Math.max(1, maxCrops))
    .sort((a, b) => a.y1 - b.y1 || a.x1 - b.x1);
}


const CROP_PADDING_PX = 3;

/** Result of cropping one region out of the cached local page. */
export interface OcrCrop {
  uri: string;
  /** Pixel size of the saved crop file. */
  width: number;
  height: number;
  /** Where the crop starts in the natural page image. */
  originX: number;
  originY: number;
  /** 1 when the crop was not upscaled, >1 when it was enlarged. */
  scale: number;
}

export interface CropOptions {
  /** Upscale crops whose smallest side is below this many pixels. Default 48. */
  upscaleMinDim?: number;
  /** Max scale applied to small crops. Default 3. */
  maxUpscale?: number;
  /** Downscale crops larger than this many pixels on their longest side. Default 0 = off. */
  maxDimension?: number;
}

/** Crops one region out of the cached page and saves it as a temp JPEG. */
export async function cropRegionToLocalFile(
  localPageUri: string,
  region: OcrRegion,
  pageWidth: number,
  pageHeight: number,
  options: CropOptions = {}
): Promise<OcrCrop> {
  const { upscaleMinDim = 0, maxUpscale = 3, maxDimension = 0 } = options;

  const x1 = Math.max(0, Math.floor(region.x1) - CROP_PADDING_PX);
  const y1 = Math.max(0, Math.floor(region.y1) - CROP_PADDING_PX);
  const x2 = Math.min(pageWidth, Math.ceil(region.x2) + CROP_PADDING_PX);
  const y2 = Math.min(pageHeight, Math.ceil(region.y2) + CROP_PADDING_PX);
  const cropWidth = x2 - x1;
  const cropHeight = y2 - y1;

  if (cropWidth < MIN_CROP_PX || cropHeight < MIN_CROP_PX) {
    throw new OcrError("Text region is too small to crop.");
  }

  let outWidth = cropWidth;
  let outHeight = cropHeight;

  if (upscaleMinDim > 0) {
    const smallest = Math.min(cropWidth, cropHeight);
    if (smallest < upscaleMinDim) {
      const scaleUp = Math.min(maxUpscale, upscaleMinDim / smallest);
      outWidth = Math.round(cropWidth * scaleUp);
      outHeight = Math.round(cropHeight * scaleUp);
    }
  }
  if (maxDimension > 0) {
    const longest = Math.max(outWidth, outHeight);
    if (longest > maxDimension) {
      const shrink = maxDimension / longest;
      outWidth = Math.max(1, Math.round(outWidth * shrink));
      outHeight = Math.max(1, Math.round(outHeight * shrink));
    }
  }

  // Saved pixels -> original crop pixels factor. A saved coordinate `l`
  // corresponds to crop coordinate `l / scale`.
  const scale = outWidth / cropWidth;

  const context = ImageManipulator.manipulate(localPageUri);
  context.crop({ originX: x1, originY: y1, width: cropWidth, height: cropHeight });
  if (outWidth !== cropWidth || outHeight !== cropHeight) {
    context.resize({ width: outWidth, height: outHeight });
  }
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({
    format: SaveFormat.JPEG,
    compress: 0.9,
  });

  return {
    uri: saved.uri,
    width: saved.width || outWidth,
    height: saved.height || outHeight,
    originX: x1,
    originY: y1,
    scale,
  };
}

/** Removes a temporary crop file (best effort). */
export async function deleteCropFile(uri: string): Promise<void> {
  try {
    const cropFile = new File(uri);
    if (cropFile.exists) cropFile.delete();
  } catch {
    // Best effort.
  }
}

export function roundPx(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Converts a box in crop-image pixels into a page-pixel OcrTextItem. */
export function makePageItem(opts: {
  text: string;
  confidence: number;
  level: OcrRecognitionLevel;
  classId: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  crop: OcrCrop;
}): OcrTextItem {
  return {
    text: opts.text,
    confidence: opts.confidence,
    level: opts.level,
    classId: opts.classId,
    x1: roundPx(opts.crop.originX + opts.x1 / opts.crop.scale),
    y1: roundPx(opts.crop.originY + opts.y1 / opts.crop.scale),
    x2: roundPx(opts.crop.originX + opts.x2 / opts.crop.scale),
    y2: roundPx(opts.crop.originY + opts.y2 / opts.crop.scale),
  };
}

/** Runs `worker` over `items` with a bounded number of in-flight promises. */
export async function runConcurrently<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const output: R[] = new Array(items.length);
  let next = 0;

  async function pump(): Promise<void> {
    while (next < items.length) {
      const index = next;
      next += 1;
      output[index] = await worker(items[index], index);
    }
  }

  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  const workers: Promise<void>[] = [];
  for (let i = 0; i < workerCount; i += 1) workers.push(pump());
  await Promise.all(workers);
  return output;
}

/** Builds the standard empty result used when there is nothing to OCR. */
export function emptyPageOutput(options: {
  pageUrl: string;
  imageWidth: number;
  imageHeight: number;
  skipped: number;
}): PageOcrOutput {
  return {
    pageUrl: options.pageUrl,
    imageWidth: options.imageWidth,
    imageHeight: options.imageHeight,
    items: [],
    cropsRecognized: 0,
    cropsFailed: 0,
    cropsSkipped: options.skipped,
  };
}
