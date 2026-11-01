/**
 * RT-DETR comic region detector.
 *
 * Contract from the published model and ML/DETECT/benchmark.py:
 *   images             float32 [1, 3, 640, 640], RGB, stretched, 0..1
 *   orig_target_sizes  int64   [1, 2], [width, height]
 *   outputs            labels int64, boxes float32 xyxy, scores float32
 *
 * The graph post-processes boxes into source coordinates. Keep the defensive
 * normalized-box branch for exports that omit that post-processing.
 */

import type { Detection, DetectionResult, YoloOptions } from "./detectionTypes";
import { getRegionDetector, type RegionDetectorDef } from "../models/regionModels";
import { regionDetectorFileUri } from "../models/regionModelStore";
import { ensureDecodablePageUri } from "../ocr/pageOcr";
import {
  decodeSkiaImage,
  loadOcrRuntime,
  type OcrRuntime,
  type OrtSession,
  type SkiaImage,
} from "../ocr/runtime/onnxRuntime";
import {
  rtDetrTensorData,
  RtDetrError,
  type RtDetrTensorValue,
} from "./rtdetrTensor";

export { RtDetrError } from "./rtdetrTensor";

const INPUT_SIZE = 640;
const DEFAULT_MAX_BOXES = 200;
const DEFAULT_MIN_CONFIDENCE = 0.25;

interface TileRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const TILE_MAX_SIZE = 1600;
const TILE_OVERLAP = 384;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function buildTiles(imageWidth: number, imageHeight: number): TileRect[] {
  if (imageWidth <= TILE_MAX_SIZE && imageHeight <= TILE_MAX_SIZE) {
    return [{ x: 0, y: 0, width: imageWidth, height: imageHeight }];
  }
  const stepX = TILE_MAX_SIZE - TILE_OVERLAP;
  const stepY = TILE_MAX_SIZE - TILE_OVERLAP;
  const cols = Math.max(1, Math.ceil((imageWidth - TILE_OVERLAP) / stepX));
  const rows = Math.max(1, Math.ceil((imageHeight - TILE_OVERLAP) / stepY));
  const tiles: TileRect[] = [];
  const seen = new Set<string>();
  for (let row = 0; row < rows; row += 1) {
    const y = Math.min(row * stepY, Math.max(0, imageHeight - TILE_MAX_SIZE));
    const height = Math.min(TILE_MAX_SIZE, imageHeight - y);
    for (let col = 0; col < cols; col += 1) {
      const x = Math.min(col * stepX, Math.max(0, imageWidth - TILE_MAX_SIZE));
      const width = Math.min(TILE_MAX_SIZE, imageWidth - x);
      const key = `${x}|${y}|${width}|${height}`;
      if (seen.has(key)) continue;
      seen.add(key);
      tiles.push({ x, y, width, height });
    }
  }
  return tiles;
}

/**
 * Stretch-resizes a tile to 640x640 RGB and returns the CHW tensor. RT-DETR's
 * published preprocessing does not letterbox; using it here would be wrong.
 */
function prepareTile(
  runtime: OcrRuntime,
  source: SkiaImage,
  tile: TileRect,
): Float32Array {
  const { Skia, ColorType, AlphaType } = runtime.skia;
  const surface = Skia.Surface.MakeOffscreen(INPUT_SIZE, INPUT_SIZE);
  if (!surface) throw new RtDetrError("Could not create an RT-DETR surface.");

  const canvas = surface.getCanvas();
  canvas.drawImageRect(
    source,
    Skia.XYWHRect(tile.x, tile.y, tile.width, tile.height),
    Skia.XYWHRect(0, 0, INPUT_SIZE, INPUT_SIZE),
    Skia.Paint(),
    true,
  );
  const raw = surface.makeImageSnapshot().readPixels(0, 0, {
    width: INPUT_SIZE,
    height: INPUT_SIZE,
    colorType: ColorType.RGBA_8888,
    alphaType: AlphaType.Unpremul,
  });
  if (!raw) throw new RtDetrError("Could not read RT-DETR pixels.");
  const pixels = raw as Uint8Array;
  const area = INPUT_SIZE * INPUT_SIZE;
  const tensor = new Float32Array(3 * area);
  for (let y = 0; y < INPUT_SIZE; y += 1) {
    for (let x = 0; x < INPUT_SIZE; x += 1) {
      const pixel = (y * INPUT_SIZE + x) * 4;
      const offset = y * INPUT_SIZE + x;
      tensor[offset] = pixels[pixel] / 255;
      tensor[area + offset] = pixels[pixel + 1] / 255;
      tensor[2 * area + offset] = pixels[pixel + 2] / 255;
    }
  }
  return tensor;
}

function findOutput(
  outputs: Record<string, unknown>,
  names: string[],
  preferred: string,
): { name: string; value: unknown } {
  const exact = names.find((name) => name === preferred);
  const byName = names.find((name) => name.toLowerCase().includes(preferred));
  const name = exact ?? byName;
  if (!name) {
    throw new RtDetrError(
      `RT-DETR output ${preferred} is missing (found: ${names.join(", ")}).`,
    );
  }
  return { name, value: outputs[name] };
}

function decodeTile(
  labels: ArrayLike<RtDetrTensorValue>,
  boxes: ArrayLike<RtDetrTensorValue>,
  scores: ArrayLike<RtDetrTensorValue>,
  tile: TileRect,
  detector: RegionDetectorDef,
  options: YoloOptions,
): Detection[] {
  const minConfidence = options.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  const maxBoxes = options.maxBoxes ?? DEFAULT_MAX_BOXES;
  const count = labels.length;
  if (
    boxes.length < count * 4 ||
    scores.length < count
  ) {
    throw new RtDetrError("RT-DETR output arrays have inconsistent lengths.");
  }
  const detections: Detection[] = [];
  for (let index = 0; index < count; index += 1) {
    const confidence = Number(scores[index]);
    const rawClass = Number(labels[index]);
    if (!Number.isFinite(confidence) || confidence < minConfidence) continue;
    const role = detector.classRoles[rawClass];
    if (!role) continue;

    let x1 = Number(boxes[index * 4]);
    let y1 = Number(boxes[index * 4 + 1]);
    let x2 = Number(boxes[index * 4 + 2]);
    let y2 = Number(boxes[index * 4 + 3]);
    if (![x1, y1, x2, y2].every(Number.isFinite)) continue;

    // Exported graphs normally return absolute source coordinates. Some
    // re-exports return normalized values, so handle those defensively.
    const maxCoordinate = Math.max(Math.abs(x1), Math.abs(y1), Math.abs(x2), Math.abs(y2));
    if (maxCoordinate <= 1.01) {
      x1 *= tile.width;
      x2 *= tile.width;
      y1 *= tile.height;
      y2 *= tile.height;
    }
    x1 = clamp(x1 + tile.x, tile.x, tile.x + tile.width);
    y1 = clamp(y1 + tile.y, tile.y, tile.y + tile.height);
    x2 = clamp(x2 + tile.x, tile.x, tile.x + tile.width);
    y2 = clamp(y2 + tile.y, tile.y, tile.y + tile.height);
    if (x2 - x1 < 1 || y2 - y1 < 1) continue;
    detections.push({
      x1,
      y1,
      x2,
      y2,
      confidence,
      classId: rawClass,
      role,
    });
  }
  detections.sort((a, b) => b.confidence - a.confidence);
  return detections.slice(0, maxBoxes);
}

function mergeTileDetections(
  boxes: Detection[],
  maxBoxes: number,
): Detection[] {
  const kept: Detection[] = [];
  for (const box of [...boxes].sort((a, b) => b.confidence - a.confidence)) {
    const duplicate = kept.some(
      (other) =>
        other.role === box.role &&
        intersectionOverUnion(other, box) >= 0.45,
    );
    if (!duplicate) kept.push(box);
    if (kept.length >= maxBoxes) break;
  }
  return kept;
}

function intersectionOverUnion(a: Detection, b: Detection): number {
  const width = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
  const height = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
  if (width <= 0 || height <= 0) return 0;
  const intersection = width * height;
  const union =
    (a.x2 - a.x1) * (a.y2 - a.y1) +
    (b.x2 - b.x1) * (b.y2 - b.y1) -
    intersection;
  return union > 0 ? intersection / union : 0;
}

export class RtDetrDetector {
  private session: OrtSession | null = null;
  private sessionPromise: Promise<OrtSession> | null = null;

  private async loadSession(
    runtime: OcrRuntime,
    detector: RegionDetectorDef,
  ): Promise<OrtSession> {
    if (this.session) return this.session;
    if (!this.sessionPromise) {
      this.sessionPromise = runtime.ort.InferenceSession.create(
        regionDetectorFileUri(detector.id, "model.onnx"),
        {
          graphOptimizationLevel: "all",
          intraOpNumThreads: 4,
          interOpNumThreads: 1,
          enableCpuMemArena: true,
          enableMemPattern: true,
        } as never,
      ).then((session) => {
        this.session = session;
        return session;
      });
    }
    return this.sessionPromise;
  }

  async warmup(): Promise<void> {
    const runtime = loadOcrRuntime();
    await this.loadSession(runtime, getRegionDetector("rtdetr-comic-v4"));
  }

  async detectFromUri(
    uri: string,
    options: YoloOptions = {},
  ): Promise<DetectionResult> {
    const detector = getRegionDetector("rtdetr-comic-v4");
    const runtime = loadOcrRuntime();
    const session = await this.loadSession(runtime, detector);
    const localUri = await ensureDecodablePageUri(uri, {
      headers: options.headers,
      extensionSourceId: options.extensionSourceId,
      pageUrl: uri,
      force: !uri.startsWith("file://"),
    });
    const source = await decodeSkiaImage(runtime, localUri);
    const imageWidth = source.width();
    const imageHeight = source.height();
    const tiles = buildTiles(imageWidth, imageHeight);
    const outputNames = [...session.outputNames];
    const imageInput =
      session.inputNames.find((name) => name === "images") ??
      session.inputNames[0];
    const sizeInput =
      session.inputNames.find((name) => name === "orig_target_sizes") ??
      session.inputNames[1];
    if (!imageInput || !sizeInput) {
      throw new RtDetrError(
        "RT-DETR requires image and original-size inputs.",
      );
    }

    const all: Detection[] = [];
    for (const tile of tiles) {
      const starts = performance.now?.() ?? Date.now();
      const tensor = prepareTile(runtime, source, tile);
      const outputs = await session.run({
        [imageInput]: new runtime.ort.Tensor("float32", tensor, [
          1,
          3,
          INPUT_SIZE,
          INPUT_SIZE,
        ]),
        [sizeInput]: new runtime.ort.Tensor(
          "int64",
          BigInt64Array.from([BigInt(tile.width), BigInt(tile.height)]),
          [1, 2],
        ),
      } as never);
      const labelsOutput = findOutput(
        outputs,
        outputNames,
        "labels",
      );
      const boxesOutput = findOutput(
        outputs,
        outputNames,
        "boxes",
      );
      const scoresOutput = findOutput(
        outputs,
        outputNames,
        "scores",
      );
      void starts;
      all.push(
        ...decodeTile(
          rtDetrTensorData(labelsOutput.value, labelsOutput.name),
          rtDetrTensorData(boxesOutput.value, boxesOutput.name),
          rtDetrTensorData(scoresOutput.value, scoresOutput.name),
          tile,
          detector,
          options,
        ),
      );
    }

    const boxes = mergeTileDetections(
      all,
      options.maxBoxes ?? DEFAULT_MAX_BOXES,
    );
    console.log("[detect][rtdetr] regions", {
      imageWidth,
      imageHeight,
      tiles: tiles.length,
      boxes: boxes.length,
    });
    return {
      imageWidth,
      imageHeight,
      boxes,
      detector: detector.id,
    };
  }

  async release(): Promise<void> {
    if (this.session) {
      await this.session.release().catch(() => {});
      this.session = null;
    }
    this.sessionPromise = null;
  }
}

export const rtdetrDetector = new RtDetrDetector();
