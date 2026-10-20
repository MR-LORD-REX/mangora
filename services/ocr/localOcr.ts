/**
 * localOcr.ts
 * ---------------------------------------------------------------------------
 * Page-level OCR for the two on-device providers.
 *
 * For every page YOLO detected, the shared pageOcr helpers crop each
 * messy_text / text_bubble region, the selected provider reads the crop, and
 * the resulting text is mapped back to page pixels as one line item per crop.
 *
 * Engines are pooled per provider. A single ONNX session cannot run two
 * forwards concurrently, so real parallelism needs independent engine sets:
 *
 *   baberu        - up to 5 lazy engine sets (3 ONNX sessions each, ~121 MB
 *                   resident per worker). Every bubble worker gets its own
 *                   decoder, so N workers actually run N recognitions.
 *   paddle-korean - exactly 1 engine set (DBNet detector + CTC recognizer)
 *                   until PP-OCR throughput has been measured on-device.
 *
 * The pool grows on demand, keeps excess slots alive when the requested worker
 * count shrinks, and releases every loaded session from
 * `releaseLocalOcrEngines()` when the reader unmounts.
 * ---------------------------------------------------------------------------
 */

import {
  MIN_CROP_PX,
  cropRegionToLocalFile,
  deleteCropFile,
  downloadPageToCache,
  emptyPageOutput,
  makePageItem,
  preparePaddleRegions,
  prepareTextRegions,
  runConcurrently,
  type OcrCrop,
  type OcrTextItem,
  type PageOcrOptions,
  type PageOcrOutput,
} from "./pageOcr";
import { createBaberuEngine, type BaberuEngine } from "./baberuEngine";
import { createCtcEngine, type CtcEngine } from "./paddleRecEngine";
import { isModelDownloaded, modelDirectoryUri } from "./modelStore";
import {
  clampOcrBubbleWorkers,
  getLocalOcrModel,
  modelIdForLanguage,
  type LocalOcrModelId,
} from "./ocrModels";
import { loadOcrRuntime } from "./onnxRuntime";

const CROP_UPSCALE_MIN = 48;
const MAX_CROP_DIMENSION = 1400;
const BABERU_CROP_DIMENSION = 256;

export interface LocalOcrPageOptions extends PageOcrOptions {
  /** Reader language code; selects the provider. */
  language: string;
  /** Optional override (used by diagnostics). */
  modelId?: LocalOcrModelId;
  maxCrops?: number;
  /**
   * Requested recognition concurrency. The pool is clamped to the provider's
   * maximum (Baberu 5, PP-OCR 1). Reader calls pass one region per request but
   * still use this to size the shared pool.
   */
  concurrency?: number;
}

interface RecognizeResult {
  text: string;
  confidence: number;
}

type Engine = BaberuEngine | CtcEngine;

interface EngineSlot {
  engine: Engine | null;
  loading: Promise<Engine> | null;
  busy: boolean;
}

interface CropOutcome {
  item: OcrTextItem | null;
  recognized: boolean;
  failed: boolean;
  skipped: boolean;
}

export class LocalOcrError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "LocalOcrError";
  }
}

const enginePools = new Map<LocalOcrModelId, EngineSlot[]>();
const poolLimits = new Map<LocalOcrModelId, number>();
const poolWaiters = new Map<LocalOcrModelId, Set<() => void>>();
/**
 * Incremented by `releaseLocalOcrEngines`. An acquire that was waiting across
 * a release must not create a new pool behind the reader's back.
 */
let poolGeneration = 0;

function slotsFor(id: LocalOcrModelId): EngineSlot[] {
  let slots = enginePools.get(id);
  if (!slots) {
    slots = [];
    enginePools.set(id, slots);
  }
  return slots;
}

function notifyPoolChange(id: LocalOcrModelId): void {
  const waiters = poolWaiters.get(id);
  if (!waiters) return;
  poolWaiters.delete(id);
  for (const resolve of waiters) resolve();
}

function waitForPoolChange(id: LocalOcrModelId): Promise<void> {
  return new Promise<void>((resolve) => {
    let waiters = poolWaiters.get(id);
    if (!waiters) {
      waiters = new Set();
      poolWaiters.set(id, waiters);
    }
    waiters.add(resolve);
  });
}

function missingModelMessage(id: LocalOcrModelId): string {
  const model = getLocalOcrModel(id);
  const label = model?.label ?? id;
  return `${label} is not downloaded yet. Open Settings > OCR models and download it once.`;
}

async function loadEngine(id: LocalOcrModelId): Promise<Engine> {
  if (!(await isModelDownloaded(id))) {
    throw new LocalOcrError(missingModelMessage(id));
  }
  const runtime = loadOcrRuntime();
  const dirUri = modelDirectoryUri(id);
  const model = getLocalOcrModel(id);
  if (!model) throw new LocalOcrError(`Unknown OCR model: ${id}`);
  return model.engine === "baberu"
    ? createBaberuEngine(dirUri, runtime)
    : createCtcEngine(dirUri, runtime);
}

async function acquireEngine(
  id: LocalOcrModelId,
  requestedLimit: number,
): Promise<{ slot: EngineSlot; engine: Engine }> {
  const limit = clampOcrBubbleWorkers(id, requestedLimit);
  poolLimits.set(id, limit);
  const generation = poolGeneration;

  for (;;) {
    if (generation !== poolGeneration) {
      throw new LocalOcrError("The OCR engine pool was released.");
    }

    const slots = slotsFor(id);
    const idle = slots.find((slot) => slot.engine !== null && !slot.busy);
    if (idle?.engine) {
      idle.busy = true;
      return { slot: idle, engine: idle.engine };
    }

    const activeLimit = poolLimits.get(id) ?? limit;
    if (slots.length < activeLimit) {
      const slot: EngineSlot = { engine: null, loading: null, busy: true };
      slots.push(slot);
      const loading = loadEngine(id);
      slot.loading = loading;
      try {
        const engine = await loading;
        slot.loading = null;
        if (generation !== poolGeneration) {
          throw new LocalOcrError(
            "The OCR engine pool was released while loading.",
          );
        }
        slot.engine = engine;
        return { slot, engine };
      } catch (error) {
        slot.loading = null;
        const index = slots.indexOf(slot);
        if (index >= 0) slots.splice(index, 1);
        notifyPoolChange(id);
        throw error;
      }
    }

    await waitForPoolChange(id);
  }
}

async function withPooledEngine<T>(
  id: LocalOcrModelId,
  limit: number,
  work: (engine: Engine) => Promise<T>,
): Promise<T> {
  const lease = await acquireEngine(id, limit);
  try {
    return await work(lease.engine);
  } finally {
    lease.slot.busy = false;
    notifyPoolChange(id);
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
  poolGeneration += 1;
  const pending: Promise<void>[] = [];

  for (const [id, slots] of enginePools) {
    for (const slot of slots) {
      if (slot.engine) {
        pending.push(slot.engine.release().catch(() => {}));
      } else if (slot.loading) {
        pending.push(
          slot.loading
            .then(async (engine) => {
              await engine.release().catch(() => {});
            })
            .catch(() => {}),
        );
      }
      slot.engine = null;
      slot.loading = null;
    }
    slots.length = 0;
    notifyPoolChange(id);
  }

  enginePools.clear();
  poolLimits.clear();
  await Promise.allSettled(pending);
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
  const textRegions =
    model?.engine === "ctc"
      ? preparePaddleRegions(options.regions, maxCrops)
      : prepareTextRegions(options.regions, maxCrops);
  const empty = emptyPageOutput({
    pageUrl,
    imageWidth,
    imageHeight,
    skipped: textRegions.length,
  });
  if (textRegions.length === 0) return empty;

  const concurrency = clampOcrBubbleWorkers(
    modelId,
    options.concurrency ?? 1,
  );
  const localPageUri = await downloadPageToCache(pageUrl, headers);

  const outcomes = await runConcurrently(
    textRegions,
    concurrency,
    async (region): Promise<CropOutcome> => {
      const regionWidth = region.x2 - region.x1;
      const regionHeight = region.y2 - region.y1;
      if (regionWidth < MIN_CROP_PX || regionHeight < MIN_CROP_PX) {
        return {
          item: null,
          recognized: false,
          failed: false,
          skipped: true,
        };
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
            maxDimension:
              model?.engine === "baberu"
                ? BABERU_CROP_DIMENSION
                : MAX_CROP_DIMENSION,
          },
        );
        const result = await withPooledEngine(modelId, concurrency, (engine) =>
          recognizeCrop(engine, crop!.uri),
        );
        const text = normalizeText(result.text);
        if (!text) {
          return {
            item: null,
            recognized: false,
            failed: false,
            skipped: false,
          };
        }

        return {
          item: makePageItem({
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
          recognized: true,
          failed: false,
          skipped: false,
        };
      } catch (error) {
        console.warn("Local OCR crop failed:", { region, modelId, error });
        return {
          item: null,
          recognized: false,
          failed: true,
          skipped: false,
        };
      } finally {
        if (crop) await deleteCropFile(crop.uri);
      }
    },
  );

  const items: OcrTextItem[] = [];
  let cropsRecognized = 0;
  let cropsFailed = 0;
  let cropsSkipped = 0;
  for (const outcome of outcomes) {
    if (outcome.item) items.push(outcome.item);
    if (outcome.recognized) cropsRecognized += 1;
    if (outcome.failed) cropsFailed += 1;
    if (outcome.skipped) cropsSkipped += 1;
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
