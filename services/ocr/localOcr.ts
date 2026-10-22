/**
 * localOcr.ts
 * ---------------------------------------------------------------------------
 * Page-level on-device OCR using PP-OCR only.
 *
 * Every detected speech bubble is cropped once, the PP-OCR DBNet detector
 * finds text lines inside that crop, and the CTC recognizer reads all lines
 * from the page in batches. The bubble-worker setting is the recognizer batch
 * size, not a pool of duplicate engines: one detector + one recognizer serve
 * the whole page.
 *
 * Recognized line boxes are mapped back to natural page pixels. Keeping
 * per-line items (instead of one merged item per bubble) gives the overlay an
 * accurate source line count for fitting translated text.
 * ---------------------------------------------------------------------------
 */

import {
  MIN_CROP_PX,
  cropRegionToLocalFile,
  deleteCropFile,
  ensureDecodablePageUri,
  emptyPageOutput,
  makePageItem,
  preparePaddleRegions,
  runConcurrently,
  type OcrCrop,
  type OcrRegion,
  type OcrTextItem,
  type PageOcrOptions,
  type PageOcrOutput,
} from "./pageOcr";
import { createCtcEngine, type CtcEngine, type CtcResult } from "./paddleRecEngine";
import { isModelDownloaded, modelDirectoryUri } from "./modelStore";
import {
  getLocalOcrModel,
  modelIdForLanguage,
  ocrRecognitionBatchSize,
  type LocalOcrModelId,
} from "./ocrModels";
import { loadOcrRuntime } from "./onnxRuntime";

const CROP_UPSCALE_MIN = 48;
const MAX_CROP_DIMENSION = 1400;

export interface LocalOcrPageOptions extends PageOcrOptions {
  /** Reader language code; selects the provider. */
  language: string;
  /** Optional override (used by diagnostics). */
  modelId?: LocalOcrModelId;
  maxCrops?: number;
  /** Bubble workers = number of text lines per recognizer forward pass. */
  concurrency?: number;
}

interface EngineSlot {
  engine: CtcEngine | null;
  loading: Promise<CtcEngine> | null;
  busy: boolean;
}

interface PreparedRegion {
  region: OcrRegion;
  crop: OcrCrop | null;
  skipped: boolean;
  failed: boolean;
}

export class LocalOcrError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "LocalOcrError";
  }
}

const enginePools = new Map<LocalOcrModelId, EngineSlot[]>();
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

async function loadEngine(id: LocalOcrModelId): Promise<CtcEngine> {
  if (!(await isModelDownloaded(id))) {
    throw new LocalOcrError(missingModelMessage(id));
  }
  const runtime = loadOcrRuntime();
  return createCtcEngine(modelDirectoryUri(id), runtime);
}

async function acquireEngine(
  id: LocalOcrModelId,
): Promise<{ slot: EngineSlot; engine: CtcEngine }> {
  const generation = poolGeneration;

  for (;;) {
    if (generation !== poolGeneration) {
      throw new LocalOcrError("The OCR engine pool was released.");
    }

    const slots = slotsFor(id);
    let slot = slots[0];
    if (!slot) {
      slot = { engine: null, loading: null, busy: true };
      slots.push(slot);
    }
    if (slot.engine && !slot.busy) {
      slot.busy = true;
      return { slot, engine: slot.engine };
    }
    if (!slot.engine && !slot.loading) {
      slot.busy = true;
      const loading = loadEngine(id);
      slot.loading = loading;
      try {
        const engine = await loading;
        slot.loading = null;
        if (generation !== poolGeneration) {
          await engine.release().catch(() => {});
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
  work: (engine: CtcEngine) => Promise<T>,
): Promise<T> {
  const lease = await acquireEngine(id);
  try {
    return await work(lease.engine);
  } finally {
    lease.slot.busy = false;
    notifyPoolChange(id);
  }
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function clampConfidence(value: number): number {
  return Math.min(1, Math.max(0, value || 1));
}

/**
 * Crops every detected region first, then lets the CTC engine batch lines
 * across all bubbles. One engine session serves the whole page.
 */
async function recognizeCtcPageRegions(args: {
  modelId: LocalOcrModelId;
  textRegions: OcrRegion[];
  localPageUri: string;
  pageUrl: string;
  imageWidth: number;
  imageHeight: number;
  batchSize: number;
}): Promise<PageOcrOutput> {
  const {
    modelId,
    textRegions,
    localPageUri,
    pageUrl,
    imageWidth,
    imageHeight,
    batchSize,
  } = args;

  // Two crop workers keep expo-image-manipulator busy without competing with
  // the single recognizer session for memory.
  const prepared = await runConcurrently(
    textRegions,
    2,
    async (region): Promise<PreparedRegion> => {
      const regionWidth = region.x2 - region.x1;
      const regionHeight = region.y2 - region.y1;
      if (regionWidth < MIN_CROP_PX || regionHeight < MIN_CROP_PX) {
        return { region, crop: null, skipped: true, failed: false };
      }
      try {
        const crop = await cropRegionToLocalFile(
          localPageUri,
          region,
          imageWidth,
          imageHeight,
          {
            upscaleMinDim: CROP_UPSCALE_MIN,
            maxDimension: MAX_CROP_DIMENSION,
          },
        );
        return { region, crop, skipped: false, failed: false };
      } catch (error) {
        console.warn("Local OCR crop failed:", { region, modelId, error });
        return { region, crop: null, skipped: false, failed: true };
      }
    },
  );

  const usable = prepared.filter(
    (entry): entry is PreparedRegion & { crop: OcrCrop } =>
      entry.crop !== null,
  );
  const indexByEntry = new Map<PreparedRegion, number>();
  usable.forEach((entry, index) => indexByEntry.set(entry, index));

  let results: CtcResult[] = [];
  let engineFailed = false;
  try {
    if (usable.length > 0) {
      results = await withPooledEngine(modelId, (engine) =>
        engine.recognizeBatch(
          usable.map((entry) => entry.crop.uri),
          batchSize,
        ),
      );
    }
  } catch (error) {
    console.warn("Local OCR page batch failed:", { modelId, error });
    engineFailed = true;
  }

  const items: OcrTextItem[] = [];
  let cropsRecognized = 0;
  let cropsFailed = 0;
  let cropsSkipped = 0;

  try {
    for (const entry of prepared) {
      if (entry.skipped) {
        cropsSkipped += 1;
        continue;
      }
      if (entry.failed || !entry.crop) {
        cropsFailed += 1;
        continue;
      }
      if (engineFailed) {
        cropsFailed += 1;
        continue;
      }
      const result = results[indexByEntry.get(entry) ?? -1];
      if (!result) {
        cropsFailed += 1;
        continue;
      }

      if (result.lines && result.lines.length > 0) {
        let emitted = 0;
        for (const line of result.lines) {
          const text = normalizeText(line.text);
          if (!text) continue;
          items.push(
            makePageItem({
              text,
              confidence: clampConfidence(line.confidence),
              level: "line",
              classId: entry.region.classId,
              x1: line.x1,
              y1: line.y1,
              x2: line.x2,
              y2: line.y2,
              crop: entry.crop,
            }),
          );
          emitted += 1;
        }
        if (emitted > 0) cropsRecognized += 1;
        continue;
      }

      const text = normalizeText(result.text);
      if (!text) continue;
      items.push(
        makePageItem({
          text,
          confidence: clampConfidence(result.confidence),
          level: "line",
          classId: entry.region.classId,
          x1: 0,
          y1: 0,
          x2: entry.crop.width,
          y2: entry.crop.height,
          crop: entry.crop,
        }),
      );
      cropsRecognized += 1;
    }
  } finally {
    await Promise.allSettled(
      prepared
        .filter((entry) => entry.crop !== null)
        .map((entry) => deleteCropFile(entry.crop!.uri)),
    );
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
    extensionSourceId,
    imageWidth,
    imageHeight,
    language,
    maxCrops = 24,
  } = options;
  const modelId = options.modelId ?? modelIdForLanguage(language);
  const textRegions = preparePaddleRegions(options.regions, maxCrops);
  const empty = emptyPageOutput({
    pageUrl,
    imageWidth,
    imageHeight,
    skipped: textRegions.length,
  });
  if (textRegions.length === 0) return empty;

  const batchSize = ocrRecognitionBatchSize(
    modelId,
    options.concurrency ?? 1,
  );
  const localPageUri = await ensureDecodablePageUri(pageUrl, {
    headers,
    extensionSourceId,
    pageUrl,
    force: !pageUrl.startsWith("file://"),
  });
  return recognizeCtcPageRegions({
    modelId,
    textRegions,
    localPageUri,
    pageUrl,
    imageWidth,
    imageHeight,
    batchSize,
  });
}
