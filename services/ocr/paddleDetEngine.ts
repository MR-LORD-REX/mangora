/**
 * paddleDetEngine.ts
 * ---------------------------------------------------------------------------
 * DBNet text-line detector used by the PP-OCRv5 Korean recognizer.
 *
 * The recognizer expects one tight text line at 48px height. YOLO supplies a
 * whole speech bubble, so this stage finds line boxes inside that crop before
 * the recognizer runs. It is intentionally single-session: Paddle models are
 * clamped to one OCR worker until their throughput has been measured.
 * ---------------------------------------------------------------------------
 */

import {
  asTensor,
  decodeSkiaImage,
  readStretchedRgba,
  type OcrRuntime,
  type OrtSession,
} from "./onnxRuntime";

const DET_LIMIT = 960;
const DET_MIN = 32;
const DET_STRIDE = 32;
const DET_THRESH = 0.3;
const BOX_THRESH = 0.6;
const UNCLIP_RATIO = 1.5;
const MAX_BOXES = 64;
const MEAN = [0.485, 0.456, 0.406] as const;
const STD = [0.229, 0.224, 0.225] as const;

export interface PaddleLineBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  score: number;
}

export interface PaddleDetEngine {
  detect(uri: string): Promise<PaddleLineBox[]>;
  release(): Promise<void>;
}

function inputSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, DET_LIMIT / Math.max(1, width, height));
  const clean = (value: number) =>
    Math.max(DET_MIN, Math.min(DET_LIMIT, Math.floor(value / DET_STRIDE) * DET_STRIDE));
  return {
    width: clean(width * scale),
    height: clean(height * scale),
  };
}

function normalizeBgr(pixels: Uint8Array, width: number, height: number): Float32Array {
  const area = width * height;
  const tensor = new Float32Array(3 * area);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = (y * width + x) * 4;
      const offset = y * width + x;
      tensor[offset] = (pixels[p + 2] / 255 - MEAN[0]) / STD[0];
      tensor[area + offset] = (pixels[p + 1] / 255 - MEAN[1]) / STD[1];
      tensor[2 * area + offset] = (pixels[p] / 255 - MEAN[2]) / STD[2];
    }
  }
  return tensor;
}

function unclip(box: PaddleLineBox): PaddleLineBox {
  const width = Math.max(1, box.x2 - box.x1);
  const height = Math.max(1, box.y2 - box.y1);
  const distance = (width * height * UNCLIP_RATIO) / (2 * (width + height));
  return {
    x1: box.x1 - distance,
    y1: box.y1 - distance,
    x2: box.x2 + distance,
    y2: box.y2 + distance,
    score: box.score,
  };
}

function findBoxes(
  probability: Float32Array,
  width: number,
  height: number,
): PaddleLineBox[] {
  const total = width * height;
  const visited = new Uint8Array(total);
  const stack = new Int32Array(total);
  const boxes: PaddleLineBox[] = [];

  for (let start = 0; start < total; start += 1) {
    if (visited[start] || probability[start] <= DET_THRESH) continue;
    let top = 1;
    stack[0] = start;
    visited[start] = 1;
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let scoreSum = 0;
    let count = 0;

    while (top > 0) {
      const index = stack[top - 1];
      top -= 1;
      const x = index % width;
      const y = Math.floor(index / width);
      const score = probability[index];
      scoreSum += score;
      count += 1;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;

      const left = x > 0;
      const right = x + 1 < width;
      for (let dy = -1; dy <= 1; dy += 1) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          if ((dx < 0 && !left) || (dx > 0 && !right)) continue;
          const next = ny * width + x + dx;
          if (!visited[next] && probability[next] > DET_THRESH) {
            visited[next] = 1;
            stack[top] = next;
            top += 1;
          }
        }
      }
    }

    const score = count > 0 ? scoreSum / count : 0;
    const boxWidth = maxX - minX + 1;
    const boxHeight = maxY - minY + 1;
    if (score >= BOX_THRESH && boxWidth >= 3 && boxHeight >= 3) {
      boxes.push(
        unclip({
          x1: minX,
          y1: minY,
          x2: maxX + 1,
          y2: maxY + 1,
          score,
        }),
      );
    }
  }

  return boxes
    .sort((a, b) => a.y1 - b.y1 || a.x1 - b.x1)
    .slice(0, MAX_BOXES);
}

export async function createPaddleDetEngine(
  dirUri: string,
  runtime: OcrRuntime,
): Promise<PaddleDetEngine> {
  const { ort } = runtime;
  const session: OrtSession = await ort.InferenceSession.create(
    `${dirUri}detection.onnx`,
    {
      graphOptimizationLevel: "all",
      intraOpNumThreads: 4,
      interOpNumThreads: 1,
      enableCpuMemArena: true,
      enableMemPattern: true,
    } as never,
  );

  const detect = async (uri: string): Promise<PaddleLineBox[]> => {
    const image = await decodeSkiaImage(runtime, uri);
    const size = inputSize(image.width(), image.height());
    const pixels = readStretchedRgba(runtime, image, size.width, size.height);
    const input = new ort.Tensor(
      "float32",
      normalizeBgr(pixels, size.width, size.height),
      [1, 3, size.height, size.width],
    );
    const output = await session.run({ x: input });
    const tensor = asTensor(output[session.outputNames[0]]);
    const dims = tensor.dims;
    const outHeight = dims.length >= 4 ? dims[2] : dims[1];
    const outWidth = dims.length >= 4 ? dims[3] : dims[2];
    if (!outWidth || !outHeight) return [];

    const scaleX = image.width() / outWidth;
    const scaleY = image.height() / outHeight;
    return findBoxes(tensor.data as Float32Array, outWidth, outHeight).map((box) => ({
      x1: Math.max(0, box.x1 * scaleX),
      y1: Math.max(0, box.y1 * scaleY),
      x2: Math.min(image.width(), box.x2 * scaleX),
      y2: Math.min(image.height(), box.y2 * scaleY),
      score: box.score,
    }));
  };

  return {
    detect,
    release: async () => {
      await session.release().catch(() => {});
    },
  };
}
