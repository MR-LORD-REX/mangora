/**
 * localOcr.ts
 * ---------------------------------------------------------------------------
 * Page-level OCR for the two on-device providers.
 *
 * For every page YOLO detected, the shared pageOcr helpers crop each
 * messy_text / text_bubble region, the selected provider reads the crop, and
 * the resulting text is mapped back to page pixels as one line item per crop.
 *
 * Engines are lazy: nothing is loaded until a page is actually scanned, and a
 * missing model produces an actionable "download it in Settings" error instead
 * of a network request. Inference is serialized per provider because a single
 * ONNX session cannot run two forwards at the same time.
 * ---------------------------------------------------------------------------
 */

import {
  MIN_CROP_PX,
  cropRegionToLocalFile,
  deleteCropFile,
  downloadPageToCache,
  emptyPageOutput,
  makePageItem,
  prepareTextRegions,
  type OcrCrop,
  type OcrRegion,
  type OcrTextItem,
  type PageOcrOptions,
  type PageOcrOutput,
} from "./pageOcr";
import { createBaberuEngine, type BaberuEngine } from "./baberuEngine";
import { createCtcEngine, type CtcEngine } from "./paddleRecEngine";
import { isModelDownloaded, modelDirectoryUri } from "./modelStore";
import {
  getLocalOcrModel,
  modelIdForLanguage,
  type LocalOcrModelId,
} from "./ocrModels";
import { loadOcrRuntime } from "./onnxRuntime";

const CROP_UPSCALE_MIN = 48;
const MAX_CROP_DIMENSION = 1400;

/**
 * CTC recognizers read one text line at a time. YOLO's clean_text boxes are
 * already line/cluster rectangles, so they are a better input than the whole
 * bubble. The bubble detections remain the fallback for pages without them.
 */
function prepareCleanTextRegions(
  regions: OcrRegion[],
  maxCrops: number,
): OcrRegion[] {
  return regions
    .filter((region) => region.classId === 0)
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))
    .slice(0, Math.max(1, maxCrops))
    .sort((a, b) => a.y1 - b.y1 || a.x1 - b.x1);
}

export interface LocalOcrPageOptions extends PageOcrOptions {
  /** Reader language code; selects the provider. */
  language: string;
  /** Optional override (used by diagnostics). */
  modelId?: LocalOcrModelId;
  maxCrops?: number;
}

interface RecognizeResult {
  text: string;
  confidence: number;
}

type Engine = BaberuEngine | CtcEngine;

export class LocalOcrError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "LocalOcrError";
  }
}

const engineCache = new Map<LocalOcrModelId, Promise<Engine>>();
const engineQueues = new Map<LocalOcrModelId, Promise<void>>();

function missingModelMessage(id: LocalOcrModelId): string {
  const model = getLocalOcrModel(id);
  const label = model?.label ?? id;
  return `${label} is not downloaded yet. Open Settings > OCR models and download it once.`;
}

async function loadEngine(id: LocalOcrModelId): Promise<Engine> {
  const cached = engineCache.get(id);
  if (cached) return cached;

  const task = (async () => {
    if (!(await isModelDownloaded(id))) {
      throw new LocalOcrError(missingModelMessage(id));
    }
    const runtime = loadOcrRuntime();
    const dirUri = modelDirectoryUri(id);
    const model = getLocalOcrModel(id);
    if (!model) throw new LocalOcrError(`Unknown OCR model: ${id}`);
    return model.engine === "baberu"
      ? await createBaberuEngine(dirUri, runtime)
      : await createCtcEngine(dirUri, runtime);
  })();

  engineCache.set(id, task);
  task.catch(() => {
    if (engineCache.get(id) === task) engineCache.delete(id);
  });
  return task;
}

async function withEngineLock<T>(
  id: LocalOcrModelId,
  work: () => Promise<T>,
): Promise<T> {
  const previous = engineQueues.get(id) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  engineQueues.set(id, previous.then(() => current));

  await previous;
  try {
    return await work();
  } finally {
    release();
  }
}

async function recognizeCrop(
  engine: Engine,
  uri: string,
): Promise<RecognizeResult> {
  const result = await engine.recognize(uri);
  if (typeof result === "string") {
    return { text: result, confidence: 1 };
  }
  return result;
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Releases every loaded engine (call when leaving the reader for good). */
export async function releaseLocalOcrEngines(): Promise<void> {
  const pending = Array.from(engineCache.values());
  engineCache.clear();
  await Promise.allSettled(
    pending.map(async (promise) => {
      try {
        const engine = await promise;
        await engine.release();
      } catch {
        // The engine never loaded; nothing to release.
      }
    }),
  );
}

/** True once every file of `id` is present and size-verified. */
export { isModelDownloaded } from "./modelStore";

/**
 * OCRs the text regions of one page with the provider selected by language.
 * A failing crop is logged and skipped instead of failing the whole page.
 */
export async function recognizePageRegions(
  options: LocalOcrPageOptions,
): Promise<PageOcrOutput> {
  const {
    pageUrl,
    headers,
    imageWidth,
    imageHeight,
    language,
    maxCrops = 24,
  } = options;
  const modelId = options.modelId ?? modelIdForLanguage(language);
  const model = getLocalOcrModel(modelId);
  const cleanRegions =
    model?.engine === "ctc"
      ? prepareCleanTextRegions(options.regions, maxCrops)
      : [];
  const textRegions =
    cleanRegions.length > 0
      ? cleanRegions
      : prepareTextRegions(options.regions, maxCrops);
  const empty = emptyPageOutput({
    pageUrl,
    imageWidth,
    imageHeight,
    skipped: textRegions.length,
  });
  if (textRegions.length === 0) return empty;

  const engine = await loadEngine(modelId);
  const localPageUri = await downloadPageToCache(pageUrl, headers);

  let cropsFailed = 0;
  let cropsSkipped = 0;
  let cropsRecognized = 0;
  const items: OcrTextItem[] = [];

  for (const region of textRegions) {
    const regionWidth = region.x2 - region.x1;
    const regionHeight = region.y2 - region.y1;
    if (regionWidth < MIN_CROP_PX || regionHeight < MIN_CROP_PX) {
      cropsSkipped += 1;
      continue;
    }

    let crop: OcrCrop | null = null;
    try {
      crop = await cropRegionToLocalFile(
        localPageUri,
        region,
        imageWidth,
        imageHeight,
        {
          upscaleMinDim: CROP_UPSCALE_MIN,
          maxDimension: MAX_CROP_DIMENSION,
        },
      );
      const result = await withEngineLock(modelId, () =>
        recognizeCrop(engine, crop!.uri),
      );
      const text = normalizeText(result.text);
      if (!text) continue;

      items.push(
        makePageItem({
          text,
          confidence: Math.min(1, Math.max(0, result.confidence || 1)),
          level: "line",
          classId: region.classId,
          x1: 0,
          y1: 0,
          x2: crop.width,
          y2: crop.height,
          crop,
        }),
      );
      cropsRecognized += 1;
    } catch (error) {
      cropsFailed += 1;
      console.warn("Local OCR crop failed:", { region, modelId, error });
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
