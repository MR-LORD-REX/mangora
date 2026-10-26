/**
 * mangaBubbleSeg.ts
 * ---------------------------------------------------------------------------
 * Manga109 YOLO11 speech-bubble instance segmentation.
 *
 * Model: ML/models/manga109-bubble-segmentation/best.pt, exported to ONNX at
 * 1024x1024 (one class: balloon). Outputs:
 *   output0 float32 [1, 37, N]   box(cx,cy,w,h) + class score + 32 mask coeffs
 *   output1 float32 [1, 32, P, P] mask prototypes (P = input / 4)
 *
 * The segmenter letterboxes overlapping page tiles, decodes boxes with NMS,
 * then turns each kept mask into a simplified page-space polygon. Downstream
 * code uses that polygon both to erase the original text inside the bubble and
 * to fit translated lines against the bubble's real width.
 *
 * Note: this checkpoint is a .pt segmentation model, not the app's old YOLO
 * NMS text detector. It is exported to ONNX so onnxruntime-react-native can
 * run it without PyTorch.
 * ---------------------------------------------------------------------------
 */

import { Asset } from "expo-asset";

import type { BubbleMask } from "@shared/contracts/bubbleMask";
import type { Point } from "@shared/geometry";
import type {
  Detection,
  DetectionResult,
  YoloOptions,
} from "../detection/detectionTypes";
import { mergeDetections } from "../detection/yoloUtils";
import {
  decodeSkiaImage,
  loadOcrRuntime,
  type OcrRuntime,
  type OrtSession,
} from "../ocr/runtime/onnxRuntime";
import { ensureDecodablePageUri } from "../ocr/pageOcr";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const MODEL_FILE = require("@/assets/models/manga109-bubble-seg.onnx");

/** Must match the exported ONNX input. */
export const SEG_INPUT_SIZE = 1024;
// Enough context for a bubble crossing a tile seam without spending another
// full tile of compute on every overlap.
const TILE_OVERLAP = 192;
const MASK_PROTO_CHANNELS = 32;
const MASK_THRESHOLD = 0;
const NMS_IOU = 0.45;
const MAX_DETECTIONS = 120;
const RDP_EPSILON_PX = 1.4;

export class MangaBubbleSegError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MangaBubbleSegError";
  }
}

interface TileRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Letterbox {
  scale: number;
  padX: number;
  padY: number;
  imageWidth: number;
  imageHeight: number;
}

interface Candidate extends Detection {
  coeffs: Float32Array;
}

function buildTiles(imageWidth: number, imageHeight: number): TileRect[] {
  if (imageWidth <= SEG_INPUT_SIZE && imageHeight <= SEG_INPUT_SIZE) {
    return [{ x: 0, y: 0, width: imageWidth, height: imageHeight }];
  }
  const step = SEG_INPUT_SIZE - TILE_OVERLAP;
  const cols = Math.max(1, Math.ceil((imageWidth - TILE_OVERLAP) / step));
  const rows = Math.max(1, Math.ceil((imageHeight - TILE_OVERLAP) / step));
  const tiles: TileRect[] = [];
  const seen = new Set<string>();
  for (let row = 0; row < rows; row += 1) {
    const y = Math.min(row * step, Math.max(0, imageHeight - SEG_INPUT_SIZE));
    const height = Math.min(SEG_INPUT_SIZE, imageHeight - y);
    for (let col = 0; col < cols; col += 1) {
      const x = Math.min(col * step, Math.max(0, imageWidth - SEG_INPUT_SIZE));
      const width = Math.min(SEG_INPUT_SIZE, imageWidth - x);
      const key = `${x}|${y}|${width}|${height}`;
      if (seen.has(key)) continue;
      seen.add(key);
      tiles.push({ x, y, width, height });
    }
  }
  return tiles;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function intersectionOverUnion(a: Detection, b: Detection): number {
  const x1 = Math.max(a.x1, b.x1);
  const y1 = Math.max(a.y1, b.y1);
  const x2 = Math.min(a.x2, b.x2);
  const y2 = Math.min(a.y2, b.y2);
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const areaA = Math.max(0, a.x2 - a.x1) * Math.max(0, a.y2 - a.y1);
  const areaB = Math.max(0, b.x2 - b.x1) * Math.max(0, b.y2 - b.y1);
  const union = areaA + areaB - intersection;
  return union <= 0 ? 0 : intersection / union;
}

function nms(candidates: Candidate[], limit: number): Candidate[] {
  const sorted = [...candidates].sort((a, b) => b.confidence - a.confidence);
  const kept: Candidate[] = [];
  for (const candidate of sorted) {
    if (kept.some((other) => intersectionOverUnion(other, candidate) >= NMS_IOU)) {
      continue;
    }
    kept.push(candidate);
    if (kept.length >= limit) break;
  }
  return kept;
}

function decodeCandidates(
  data: Float32Array,
  dims: readonly number[],
  inputSize: number,
  minConfidence: number,
): Candidate[] {
  const a = dims[1] ?? 0;
  const b = dims[2] ?? 0;
  const channels = Math.min(a, b);
  const anchors = Math.max(a, b);
  if (channels < 4 + MASK_PROTO_CHANNELS || anchors <= 0) {
    throw new MangaBubbleSegError(
      `Unexpected segmentation output shape [${dims.join(", ")}]`,
    );
  }
  const classCount = channels - 4 - MASK_PROTO_CHANNELS;
  if (classCount < 1) {
    throw new MangaBubbleSegError("Segmentation output has no class scores.");
  }
  const transposed = a !== channels;
  const at = (channel: number, anchor: number) =>
    transposed
      ? data[anchor * channels + channel]
      : data[channel * anchors + anchor];

  const candidates: Candidate[] = [];
  for (let anchor = 0; anchor < anchors; anchor += 1) {
    let confidence = 0;
    for (let cls = 0; cls < classCount; cls += 1) {
      confidence = Math.max(confidence, at(4 + cls, anchor));
    }
    if (confidence < minConfidence) continue;

    const cx = at(0, anchor);
    const cy = at(1, anchor);
    const width = at(2, anchor);
    const height = at(3, anchor);
    if (!(width > 0) || !(height > 0)) continue;
    const x1 = clamp(cx - width / 2, 0, inputSize);
    const y1 = clamp(cy - height / 2, 0, inputSize);
    const x2 = clamp(cx + width / 2, 0, inputSize);
    const y2 = clamp(cy + height / 2, 0, inputSize);
    if (x2 - x1 < 1 || y2 - y1 < 1) continue;

    const coeffs = new Float32Array(MASK_PROTO_CHANNELS);
    for (let c = 0; c < MASK_PROTO_CHANNELS; c += 1) {
      coeffs[c] = at(4 + classCount + c, anchor);
    }
    candidates.push({ x1, y1, x2, y2, confidence, classId: 2, coeffs });
  }
  return candidates;
}

interface Span {
  left: number;
  right: number;
}

/**
 * Builds a page-space contour from the prototype mask. The mask is solid for a
 * speech bubble, so one horizontal run per row is enough; the longest run is
 * kept (and any rare second lobe would become its own detection).
 */
function maskPolygon(
  candidate: Candidate,
  proto: Float32Array,
  protoDims: readonly number[],
  inputSize: number,
  letterbox: Letterbox,
  tile: TileRect,
  imageWidth: number,
  imageHeight: number,
): BubbleMask | null {
  const protoHeight = protoDims[2] ?? 0;
  const protoWidth = protoDims[3] ?? 0;
  const protoArea = protoHeight * protoWidth;
  if (protoArea <= 0) return null;

  const scaleX = protoWidth / inputSize;
  const scaleY = protoHeight / inputSize;
  const px1 = clamp(Math.floor(candidate.x1 * scaleX), 0, protoWidth - 1);
  const px2 = clamp(Math.ceil(candidate.x2 * scaleX), px1 + 1, protoWidth);
  const py1 = clamp(Math.floor(candidate.y1 * scaleY), 0, protoHeight - 1);
  const py2 = clamp(Math.ceil(candidate.y2 * scaleY), py1 + 1, protoHeight);

  const spans: { y: number; span: Span }[] = [];
  for (let py = py1; py < py2; py += 1) {
    let best: Span | null = null;
    let runStart = -1;
    for (let px = px1; px <= px2; px += 1) {
      let value = 0;
      if (px < px2) {
        const base = py * protoWidth + px;
        for (let c = 0; c < MASK_PROTO_CHANNELS; c += 1) {
          value += candidate.coeffs[c] * proto[c * protoArea + base];
        }
      }
      const inside = px < px2 && value > MASK_THRESHOLD;
      if (inside && runStart < 0) runStart = px;
      if (!inside && runStart >= 0) {
        if (!best || px - runStart > best.right - best.left) {
          best = { left: runStart, right: px };
        }
        runStart = -1;
      }
    }
    if (best) spans.push({ y: py, span: best });
  }
  if (spans.length < 2) return null;

  const toPage = (px: number, py: number): Point => {
    const inputX = ((px + 0.5) / protoWidth) * inputSize;
    const inputY = ((py + 0.5) / protoHeight) * inputSize;
    return {
      x: clamp((inputX - letterbox.padX) / letterbox.scale + tile.x, 0, imageWidth),
      y: clamp((inputY - letterbox.padY) / letterbox.scale + tile.y, 0, imageHeight),
    };
  };

  const left: Point[] = [];
  const right: Point[] = [];
  for (const row of spans) {
    left.push(toPage(row.span.left, row.y));
    right.push(toPage(row.span.right, row.y));
  }
  const polygon = simplifyPolygon([...left, ...right.reverse()], RDP_EPSILON_PX);
  if (polygon.length < 3) return null;

  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const point of polygon) {
    if (point.x < x1) x1 = point.x;
    if (point.y < y1) y1 = point.y;
    if (point.x > x2) x2 = point.x;
    if (point.y > y2) y2 = point.y;
  }
  if (x2 - x1 < 2 || y2 - y1 < 2) return null;
  return {
    polygon,
    bounds: { x1, y1, x2, y2 },
    confidence: candidate.confidence,
  };
}

function pointLineDistance(point: Point, start: Point, end: Point): number {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy);
  const clamped = clamp(t, 0, 1);
  return Math.hypot(
    point.x - (start.x + clamped * dx),
    point.y - (start.y + clamped * dy),
  );
}

/** Ramer-Douglas-Peucker simplification for the mask staircase. */
function simplifyPolygon(points: Point[], epsilon: number): Point[] {
  if (points.length <= 3) return points;
  let farthest = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    const distance = pointLineDistance(points[i], points[0], points[points.length - 1]);
    if (distance > farthest) {
      farthest = distance;
      index = i;
    }
  }
  if (farthest <= epsilon) {
    return [points[0], points[points.length - 1]];
  }
  const first = simplifyPolygon(points.slice(0, index + 1), epsilon);
  const second = simplifyPolygon(points.slice(index), epsilon);
  return [...first.slice(0, -1), ...second];
}

async function prepareTileInput(
  runtime: OcrRuntime,
  source: Awaited<ReturnType<typeof decodeSkiaImage>>,
  tile: TileRect,
): Promise<{ tensor: Float32Array; letterbox: Letterbox }> {
  const { Skia, ColorType, AlphaType } = runtime.skia;
  const scale = Math.min(
    SEG_INPUT_SIZE / tile.width,
    SEG_INPUT_SIZE / tile.height,
  );
  const dstW = Math.max(1, Math.round(tile.width * scale));
  const dstH = Math.max(1, Math.round(tile.height * scale));
  const padX = Math.floor((SEG_INPUT_SIZE - dstW) / 2);
  const padY = Math.floor((SEG_INPUT_SIZE - dstH) / 2);

  const surface = Skia.Surface.MakeOffscreen(SEG_INPUT_SIZE, SEG_INPUT_SIZE);
  if (!surface) {
    throw new MangaBubbleSegError("Could not create the segmentation surface.");
  }
  const canvas = surface.getCanvas();
  canvas.clear(Skia.Color("#727272"));
  canvas.drawImageRect(
    source,
    Skia.XYWHRect(tile.x, tile.y, tile.width, tile.height),
    Skia.XYWHRect(padX, padY, dstW, dstH),
    Skia.Paint(),
    true,
  );

  const snapshot = surface.makeImageSnapshot();
  const raw = snapshot.readPixels(0, 0, {
    width: SEG_INPUT_SIZE,
    height: SEG_INPUT_SIZE,
    colorType: ColorType.RGBA_8888,
    alphaType: AlphaType.Unpremul,
  });
  if (!raw) {
    throw new MangaBubbleSegError("Could not read segmentation pixels.");
  }
  const pixels = raw as Uint8Array;
  const area = SEG_INPUT_SIZE * SEG_INPUT_SIZE;
  const tensor = new Float32Array(3 * area);
  for (let y = 0; y < SEG_INPUT_SIZE; y += 1) {
    for (let x = 0; x < SEG_INPUT_SIZE; x += 1) {
      const p = (y * SEG_INPUT_SIZE + x) * 4;
      const offset = y * SEG_INPUT_SIZE + x;
      tensor[offset] = pixels[p] / 255;
      tensor[area + offset] = pixels[p + 1] / 255;
      tensor[2 * area + offset] = pixels[p + 2] / 255;
    }
  }

  return {
    tensor,
    letterbox: {
      scale,
      padX,
      padY,
      imageWidth: tile.width,
      imageHeight: tile.height,
    },
  };
}

export class MangaBubbleSegmenter {
  private sessionPromise: Promise<OrtSession> | null = null;
  private session: OrtSession | null = null;

  private async loadSession(runtime: OcrRuntime): Promise<OrtSession> {
    if (this.session) return this.session;
    if (!this.sessionPromise) {
      this.sessionPromise = (async () => {
        const asset = Asset.fromModule(MODEL_FILE);
        if (!asset.localUri) await asset.downloadAsync();
        const modelUri = asset.localUri ?? asset.uri;
        const session = await runtime.ort.InferenceSession.create(modelUri, {
          graphOptimizationLevel: "all",
          intraOpNumThreads: 4,
          interOpNumThreads: 1,
          enableCpuMemArena: true,
          enableMemPattern: true,
        } as never);
        this.session = session;
        return session;
      })();
    }
    return this.sessionPromise;
  }

  async warmup(): Promise<void> {
    const runtime = loadOcrRuntime();
    await this.loadSession(runtime);
  }

  async detectFromUri(
    uri: string,
    options: YoloOptions = {},
  ): Promise<DetectionResult> {
    const runtime = loadOcrRuntime();
    const session = await this.loadSession(runtime);
    // Remote pages must be downloaded (and AVIF transcoded) before Skia can
    // decode them reliably. `force` also keeps extension fetches on OkHttp.
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
    const inputName = session.inputNames[0];
    const outputNames = session.outputNames;
    if (outputNames.length < 2) {
      throw new MangaBubbleSegError(
        "The segmentation model must export boxes and mask prototypes.",
      );
    }
    const minConfidence = options.minConfidence ?? 0.25;
    const maxBoxes = options.maxBoxes ?? MAX_DETECTIONS;
    const all: Detection[] = [];

    for (const tile of tiles) {
      const prepared = await prepareTileInput(runtime, source, tile);
      const feeds = {
        [inputName]: new runtime.ort.Tensor(
          "float32",
          prepared.tensor,
          [1, 3, SEG_INPUT_SIZE, SEG_INPUT_SIZE],
        ),
      };
      const results = await session.run(feeds);
      const tensors = outputNames.map(
        (name) =>
          results[name] as {
            data: Float32Array;
            dims: readonly number[];
          },
      );
      const boxTensor = tensors.find((tensor) => tensor.dims.length === 3);
      const protoTensor = tensors.find((tensor) => tensor.dims.length === 4);
      if (!boxTensor || !protoTensor) {
        throw new MangaBubbleSegError(
          "The segmentation model must export a box tensor and mask prototypes.",
        );
      }
      const candidates = nms(
        decodeCandidates(
          boxTensor.data,
          boxTensor.dims,
          SEG_INPUT_SIZE,
          minConfidence,
        ),
        maxBoxes,
      );

      for (const candidate of candidates) {
        const mask = maskPolygon(
          candidate,
          protoTensor.data,
          protoTensor.dims,
          SEG_INPUT_SIZE,
          prepared.letterbox,
          tile,
          imageWidth,
          imageHeight,
        );
        if (!mask) continue;
        all.push({
          x1: mask.bounds.x1,
          y1: mask.bounds.y1,
          x2: mask.bounds.x2,
          y2: mask.bounds.y2,
          confidence: candidate.confidence,
          classId: 2,
          mask,
        });
      }
    }

    const boxes = mergeDetections(all, maxBoxes);
    console.log("[seg][manga109] detected bubbles", {
      imageWidth,
      imageHeight,
      tiles: tiles.length,
      boxes: boxes.length,
    });
    return { imageWidth, imageHeight, boxes, detector: "manga109" };
  }
}

export const mangaBubbleSegmenter = new MangaBubbleSegmenter();

export function isMangaBubbleSegAvailable(): boolean {
  try {
    loadOcrRuntime();
    return true;
  } catch {
    return false;
  }
}
