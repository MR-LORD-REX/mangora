/**
 * executorchOcr.ts
 * ---------------------------------------------------------------------------
 * On-device OCR service built on `react-native-executorch` (Software Mansion).
 *
 * Pipeline per page:
 *   1. Download the page once into the app cache (shared pageOcr helper).
 *   2. Crop each YOLO text region (messy_text / text_bubble) to a local JPEG.
 *   3. Run the crop through the selected ExecuTorch OCR module
 *      (`OCRModule` or `VerticalOCRModule`), which downloads + caches its
 *      detector/recognizer .pte files in app data on first use.
 *   4. Map the returned word boxes (absolute pixels of the submitted crop)
 *      back into natural page pixels for the overlay.
 *
 * Requirements:
 *   - A development build (react-native-executorch is a native JSI module; it
 *     is not available in Expo Go).
 *   - New Architecture (already enabled in app.json).
 *   - Android arm64-v8a / iOS 17+ device or emulator.
 *
 * The native module is required lazily (never at module import time) so this
 * file can be imported from any screen without crashing when the native side
 * is missing.
 * ---------------------------------------------------------------------------
 */

import { File, Paths } from "expo-file-system";

import {
  getLocalModelDef,
  type LocalModelId,
  type LocalOcrModelDef,
} from "./executorchModels";
import {
  MIN_CROP_PX,
  cropRegionToLocalFile,
  deleteCropFile,
  downloadPageToCache,
  emptyPageOutput,
  makePageItem,
  prepareTextRegions,
  type OcrCrop,
  type OcrTextItem,
  type PageOcrOptions,
  type PageOcrOutput,
} from "./pageOcr";


/** Shape of the ExecuTorch OCR results (mirrors the package's OCRDetection). */
export interface ExecutorchOcrDetection {
  bbox: { x1: number; y1: number; x2: number; y2: number };
  text: string;
  score: number;
}

interface ExecutorchOcrModule {
  forward(imageSource: string): Promise<ExecutorchOcrDetection[]>;
  delete(): void;
}

/** Minimal surface of `react-native-executorch` that this service uses. */
interface ExecutorchRuntimeApi {
  initExecutorch: (config: { resourceFetcher: unknown }) => void;
  OCRModule: {
    fromModelName(
      sources: Record<string, unknown>,
      onDownloadProgress?: (progress: number) => void
    ): Promise<ExecutorchOcrModule>;
  };
  VerticalOCRModule: {
    fromModelName(
      sources: Record<string, unknown>,
      onDownloadProgress?: (progress: number) => void
    ): Promise<ExecutorchOcrModule>;
  };
}

export interface ExecutorchPageOptions extends PageOcrOptions {
  /** Local model to use for recognition. */
  modelId: LocalModelId;
  /** Progress callback for the first-time model download (0..1). */
  onModelProgress?: (progress: number) => void;
}

export class ExecutorchOcrError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ExecutorchOcrError";
  }
}


const NEEDS_DEV_BUILD =
  "Local OCR needs a development build with react-native-executorch linked (native JSI module is not available in Expo Go). Rebuild the app, then try again.";

let runtime: ExecutorchRuntimeApi | null = null;
let runtimeProbeDone = false;

function requireExecutorchRuntime(): ExecutorchRuntimeApi | null {
  if (runtime) return runtime;
  if (runtimeProbeDone) return null;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const execMod = require("react-native-executorch");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fetcherMod = require("react-native-executorch-expo-resource-fetcher");

    const api = execMod as ExecutorchRuntimeApi;
    const fetcher = (fetcherMod as { ExpoResourceFetcher?: unknown }).ExpoResourceFetcher;
    if (typeof api.initExecutorch === "function" && fetcher) {
      // The Expo fetcher downloads into <documents>/react-native-executorch/
      // and is idempotent: already-downloaded model files are reused.
      api.initExecutorch({ resourceFetcher: fetcher });
    } else {
      runtimeProbeDone = true;
      return null;
    }

    runtime = api;
    return runtime;
  } catch (error) {
    runtimeProbeDone = true;
    console.warn("react-native-executorch unavailable:", error);
    return null;
  }
}

/** True when the ExecuTorch native module is linked and usable on this device. */
export function isExecutorchAvailable(): boolean {
  return requireExecutorchRuntime() !== null;
}

/** Error thrown when the native runtime is missing (e.g. Expo Go). */
export function assertExecutorchAvailable(): void {
  if (!requireExecutorchRuntime()) {
    throw new ExecutorchOcrError(NEEDS_DEV_BUILD);
  }
}


const moduleCache = new Map<LocalModelId, Promise<ExecutorchOcrModule>>();
const forwardQueues = new WeakMap<ExecutorchOcrModule, Promise<void>>();

async function forwardSerially(
  module: ExecutorchOcrModule,
  imageSource: string,
): Promise<ExecutorchOcrDetection[]> {
  const previous = forwardQueues.get(module) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  forwardQueues.set(module, previous.then(() => current));

  await previous;
  try {
    return await module.forward(imageSource);
  } finally {
    release();
  }
}

/** Recognizer cache basename for a model (both ja variants share it). */
function recognizerFileName(id: LocalModelId): string | null {
  return getLocalModelDef(id)?.recognizerFile ?? null;
}

/**
 * True when the model's files are already present in the ExecuTorch download
 * directory (i.e. a previous download completed).
 */
export async function isLocalModelDownloaded(id: LocalModelId): Promise<boolean> {
  const fileName = recognizerFileName(id);
  if (!fileName) return false;
  try {
    return new File(Paths.document, "react-native-executorch", fileName).exists;
  } catch {
    return false;
  }
}

/**
 * Loads (downloading the detector + recognizer .pte files into app data on the
 * first use) and caches an ExecuTorch OCR module instance for `id`.
 * Safe to call repeatedly - concurrent calls share one download/load.
 */
export async function loadLocalModel(
  id: LocalModelId,
  onProgress?: (progress: number) => void
): Promise<ExecutorchOcrModule> {
  const def = getLocalModelDef(id);
  if (!def) {
    throw new ExecutorchOcrError(`Unknown local OCR model: ${id}`);
  }
  assertExecutorchAvailable();

  const cached = moduleCache.get(id);
  if (cached) return cached;

  const api = requireExecutorchRuntime();
  if (!api) throw new ExecutorchOcrError(NEEDS_DEV_BUILD);

  const pending = createModule(api, def, onProgress);
  moduleCache.set(id, pending);
  pending.catch(() => {
    // Allow a later retry after a failed download.
    if (moduleCache.get(id) === pending) moduleCache.delete(id);
  });
  return pending;
}

async function createModule(
  api: ExecutorchRuntimeApi,
  def: LocalOcrModelDef,
  onProgress?: (progress: number) => void
): Promise<ExecutorchOcrModule> {
  // Loaded lazily - the constant is the package's OCR_* model descriptor.
  const constant = (api as unknown as Record<string, unknown>)[def.constantKey];
  if (!constant || typeof constant !== "object") {
    throw new ExecutorchOcrError(`ExecuTorch constant ${def.constantKey} was not found.`);
  }

  const progress = onProgress ?? (() => {});
  if (def.vertical) {
    return (await api.VerticalOCRModule.fromModelName(
      { ...(constant as Record<string, unknown>), independentCharacters: true },
      progress
    )) as ExecutorchOcrModule;
  }
  return (await api.OCRModule.fromModelName(
    constant as Record<string, unknown>,
    progress
  )) as ExecutorchOcrModule;
}

/** Releases every loaded OCR module (frees the native memory). */
export async function releaseLocalModels(): Promise<void> {
  const pending = Array.from(moduleCache.values());
  moduleCache.clear();
  await Promise.allSettled(
    pending.map(async (promise) => {
      try {
        const module = await promise;
        module.delete();
      } catch {
        // Module failed to load - nothing to delete.
      }
    })
  );
}


/** Small crops are enlarged so glyphs are readable by the recognizer. */
const CROP_UPSCALE_MIN = 48;

/**
 * OCRs the text regions of one page with the given local ExecuTorch model.
 * Crops run serially (an ExecuTorch module cannot run two forwards at once);
 * a failing crop is logged and skipped instead of failing the whole page.
 */
export async function recognizePageRegions(
  options: ExecutorchPageOptions
): Promise<PageOcrOutput> {
  const { pageUrl, headers, imageWidth, imageHeight, modelId, maxCrops = 24 } = options;

  const textRegions = prepareTextRegions(options.regions, maxCrops);
  const empty = emptyPageOutput({
    pageUrl,
    imageWidth,
    imageHeight,
    skipped: textRegions.length,
  });
  if (textRegions.length === 0) return empty;

  const module = await loadLocalModel(modelId, options.onModelProgress);
  const localPageUri = await downloadPageToCache(pageUrl, headers);

  let cropsFailed = 0;
  let cropsSkipped = 0;
  let cropsRecognized = 0;
  const items: OcrTextItem[] = [];

  for (const region of textRegions) {
    let crop: OcrCrop | null = null;
    let regionItems = 0;
    const regionWidth = region.x2 - region.x1;
    const regionHeight = region.y2 - region.y1;
    if (regionWidth < MIN_CROP_PX || regionHeight < MIN_CROP_PX) {
      cropsSkipped += 1;
      continue;
    }
    try {
      crop = await cropRegionToLocalFile(localPageUri, region, imageWidth, imageHeight, {
        upscaleMinDim: CROP_UPSCALE_MIN,
      });
      const detections = await forwardSerially(module, crop.uri);
      for (const detection of detections) {
        const item = mapDetectionToPage(detection, crop, region.classId);
        if (item) {
          items.push(item);
          regionItems += 1;
        }
      }
      if (regionItems > 0) cropsRecognized += 1;
    } catch (error) {
      cropsFailed += 1;
      console.warn("ExecuTorch OCR crop failed:", { region, error });
    } finally {
      if (crop) await deleteCropFile(crop.uri);
    }
  }

  return {
    pageUrl,
    imageWidth,
    imageHeight,
    items,
    cropsRecognized,
    cropsFailed,
    cropsSkipped,
  };
}

/** Maps one ExecuTorch detection (crop pixel space) back into page pixels. */
function mapDetectionToPage(
  detection: ExecutorchOcrDetection,
  crop: OcrCrop,
  classId: number
): OcrTextItem | null {
  const text = (detection.text ?? "").trim();
  if (!text) return null;

  const bbox = detection.bbox;
  if (
    typeof bbox?.x1 !== "number" ||
    typeof bbox?.y1 !== "number" ||
    typeof bbox?.x2 !== "number" ||
    typeof bbox?.y2 !== "number"
  ) {
    return null;
  }

  return makePageItem({
    text,
    confidence: typeof detection.score === "number" ? detection.score : 1,
    level: "word",
    classId,
    x1: bbox.x1,
    y1: bbox.y1,
    x2: bbox.x2,
    y2: bbox.y2,
    crop,
  });
}