/**
 * Page scan (YOLO) and bubble OCR stages.
 *
 * These workers only look at the shared runtime surface. Queue scheduling,
 * cache restore, and page completion stay in the pipeline controller so the
 * stages cannot accidentally reset or reorder the run.
 */

import {
  detectPageRegions,
  getLocalOcrModel,
  isModelDownloaded,
  modelIdForLanguage,
  preparePaddleRegions,
  recognizePageRegions,
  releaseDecodablePageUri,
  type DetectionResult,
  type OcrRegion,
} from "@features/vision";
import { buildTranslationSlots } from "@features/translation";

import { imageHeadersForPage } from "@/utils/reader/imageHeaders";

import {
  MAX_CROPS_PER_PAGE,
  mapSlotRegions,
} from "./pageState";
import type {
  OcrPageRecord,
  OcrTask,
  ReaderTranslationRuntime,
  ScanTask,
} from "./types";

function extensionSourceIdFor(source: string): string | undefined {
  return source.startsWith("ext:") ? source.slice(4) : undefined;
}

function enqueueOcrBatches(
  runtime: ReaderTranslationRuntime,
  page: Pick<
    OcrPageRecord,
    "url" | "pageIndex" | "regions" | "pendingRegions"
  >,
  detection: DetectionResult,
  generation: number,
  regionIndexes: number[],
): void {
  const batchSize = runtime.effectiveOcrBubbleWorkers;
  for (let offset = 0; offset < regionIndexes.length; offset += batchSize) {
    const entries = regionIndexes
      .slice(offset, offset + batchSize)
      .map((regionIndex) => {
        const region = page.regions[regionIndex];
        return region ? { regionIndex, region } : null;
      })
      .filter(
        (entry): entry is { regionIndex: number; region: OcrRegion } =>
          entry !== null,
      );
    const first = entries[0];
    if (!first) continue;
    runtime.queues.ocr.push(
      {
        url: page.url,
        pageIndex: page.pageIndex,
        regionIndex: first.regionIndex,
        region: first.region,
        regionBatch: entries.length > 1 ? entries : undefined,
        detection,
        generation,
      },
      `${page.url}:${first.regionIndex}:${first.region.x1}:${first.region.y1}:${entries.length}`,
    );
  }
}

export async function scanPage(
  runtime: ReaderTranslationRuntime,
  source: string,
  task: ScanTask,
): Promise<void> {
  const { url, pageIndex, generation } = task;
  if (!runtime.isCurrentRun(generation)) return;
  console.log("[reader][scan] start", { pageIndex });
  const restored = await runtime.restoreCachedPage(url, pageIndex, generation);
  if (restored) {
    runtime.finishSinglePage(url);
    return;
  }
  // The OCR RAM cache already has this page (for example after a stopped
  // run). Reuse the YOLO/OCR result instead of scanning the page again.
  const existing = runtime.ocrStore.get(url);
  if (existing && !existing.ocrComplete) {
    const detection = runtime.detection.get(url);
    if (detection && existing.regions.length > 0) {
      if (existing.pendingRegions.size === 0) {
        runtime.finishPageOcr(existing, generation);
        return;
      }
      existing.status = "ocr";
      runtime.updatePage(url, {
        mode: runtime.config.engine,
        imageWidth: existing.imageWidth,
        imageHeight: existing.imageHeight,
        busy: true,
        visible: true,
        stage: "ocr",
        message: `Resuming text (${existing.pendingRegions.size} region${existing.pendingRegions.size === 1 ? "" : "s"})\u2026`,
        regions: runtime.buildPageRegions(existing),
      });
      console.log("[reader][scan] resume OCR", {
        pageIndex,
        pending: existing.pendingRegions.size,
        total: existing.regionsTotal,
      });
      const pendingIndexes = [...existing.pendingRegions].sort(
        (a, b) => a - b,
      );
      enqueueOcrBatches(runtime, existing, detection, generation, pendingIndexes);
      return;
    }
  }
  if (existing && existing.ocrComplete) {
    const bubbles = [...existing.bubbles.values()];
    for (const bubble of bubbles) {
      if (bubble.status === "translating" || bubble.status === "error") {
        bubble.status = "ready";
      }
    }
    const pending = bubbles.filter(
      (bubble) => bubble.status === "ready" || bubble.status === "error",
    );
    console.log("[reader][scan] reuse OCR", {
      pageIndex,
      bubbles: bubbles.length,
      pending: pending.length,
    });
    if (pending.length === 0) {
      runtime.refreshPageState(existing);
      runtime.finishSinglePage(url);
      return;
    }
    existing.status = "translate";
    runtime.updatePage(url, {
      mode: runtime.config.engine,
      imageWidth: existing.imageWidth,
      imageHeight: existing.imageHeight,
      busy: true,
      visible: true,
      stage: "translate",
      message: `Translating ${pending.length} bubble${pending.length === 1 ? "" : "s"}\u2026`,
      regions: runtime.buildPageRegions(existing),
    });
    const pageTask = { url, pageIndex, generation };
    if (runtime.config.engine === "free") {
      runtime.queues.free.push(pageTask, url);
    } else {
      runtime.queues.ai.push(pageTask, url);
    }
    return;
  }
  if (!runtime.isCurrentRun(generation)) return;
  const modelId = modelIdForLanguage(runtime.config.sourceLanguage);
  if (!(await isModelDownloaded(modelId))) {
    if (!runtime.isCurrentRun(generation)) return;
    const label = getLocalOcrModel(modelId)?.label ?? modelId;
    console.warn("[reader][scan] OCR model missing", {
      pageIndex,
      modelId,
    });
    runtime.markPageError(
      url,
      `${label} is not downloaded. Open Settings > OCR models and download it, then retry this page.`,
    );
    return;
  }

  runtime.updatePage(url, {
    mode: runtime.config.engine,
    busy: true,
    visible: false,
    stage: "detect",
    message: "Scanning page\u2026",
    regions: [],
  });
  try {
    const detection = await detectPageRegions(url, {
      headers: imageHeadersForPage(source, url),
      extensionSourceId: extensionSourceIdFor(source),
    });
    if (!runtime.isCurrentRun(generation)) return;
    runtime.detection.set(url, detection);
    const slots = buildTranslationSlots(detection).filter(
      (slot) =>
        slot.pasteBox.x2 > slot.pasteBox.x1 &&
        slot.pasteBox.y2 > slot.pasteBox.y1,
    );
    const regions = preparePaddleRegions(detection.boxes, MAX_CROPS_PER_PAGE);
    if (regions.length === 0 || slots.length === 0) {
      await releaseDecodablePageUri(url);
      runtime.markPageError(
        url,
        `No text regions found on page ${pageIndex + 1}. Use retry after rescanning.`,
      );
      return;
    }
    const page: OcrPageRecord = {
      url,
      pageIndex,
      chapterId: runtime.identity.chapterId,
      seq: runtime.nextOcrSequence(),
      imageWidth: detection.imageWidth,
      imageHeight: detection.imageHeight,
      slots,
      regions,
      bubbles: new Map(),
      items: [],
      regionsTotal: regions.length,
      regionsDone: 0,
      regionsFailed: 0,
      ocrComplete: false,
      pendingRegions: new Set(regions.map((_, index) => index)),
      slotRegions: mapSlotRegions(slots, regions),
      status: "ocr",
      modelId: null,
    };
    runtime.ocrStore.set(url, page);
    runtime.updatePage(url, {
      imageWidth: detection.imageWidth,
      imageHeight: detection.imageHeight,
      stage: "ocr",
      busy: true,
      visible: true,
      message: `Reading text (${regions.length} region${regions.length === 1 ? "" : "s"})\u2026`,
      regions: slots.map((slot) => ({
        ...slot,
        translatedText: null,
        status: "queued" as const,
      })),
    });
    console.log("[reader][scan] done", {
      pageIndex,
      slots: slots.length,
      ocrRegions: regions.length,
    });
    enqueueOcrBatches(
      runtime,
      page,
      detection,
      generation,
      regions.map((_, index) => index),
    );
  } catch (error) {
    if (!runtime.isCurrentRun(generation)) return;
    await releaseDecodablePageUri(url);
    console.warn("[reader][scan] failed", { pageIndex, error });
    runtime.markPageError(
      url,
      error instanceof Error ? error.message : "Page scan failed.",
    );
  }
}

export async function recognizeBubbleBatch(
  runtime: ReaderTranslationRuntime,
  source: string,
  task: OcrTask,
): Promise<void> {
  const { url, pageIndex, detection, generation } = task;
  if (!runtime.isCurrentRun(generation)) return;
  const page = runtime.ocrStore.get(url);
  if (!page) return;
  const entries = task.regionBatch ?? [
    { regionIndex: task.regionIndex, region: task.region },
  ];
  try {
    const result = await recognizePageRegions({
      pageUrl: url,
      headers: imageHeadersForPage(source, url),
      extensionSourceId: extensionSourceIdFor(source),
      imageWidth: detection.imageWidth,
      imageHeight: detection.imageHeight,
      regions: entries.map((entry) => entry.region),
      language: runtime.config.sourceLanguage,
      maxCrops: entries.length,
      concurrency: runtime.effectiveOcrBubbleWorkers,
    });
    if (!runtime.isCurrentRun(generation)) return;
    page.items.push(...result.items);
    page.regionsDone += entries.length;
    for (const entry of entries) {
      page.pendingRegions.delete(entry.regionIndex);
    }
    console.log("[reader][ocr] region done", {
      pageIndex,
      regions: entries.length,
      items: result.items.length,
      done: page.regionsDone,
      total: page.regionsTotal,
    });
  } catch (error) {
    if (!runtime.isCurrentRun(generation)) return;
    page.regionsFailed += entries.length;
    for (const entry of entries) {
      page.pendingRegions.delete(entry.regionIndex);
    }
    console.warn("[reader][ocr] region failed", {
      pageIndex,
      regions: entries.length,
      error,
    });
  }
  if (page.regionsDone + page.regionsFailed >= page.regionsTotal) {
    runtime.finishPageOcr(page, generation);
  }
}
