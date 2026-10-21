/**
 * paddleRecEngine.ts
 * ---------------------------------------------------------------------------
 * Batched CTC text-line recognizer for PaddleOCR ONNX exports.
 *
 * Contract (verified against PP-OCRv6_medium_rec_onnx):
 *   input  x       float32 [B,3,48,320]   BGR, (x/255 - 0.5) / 0.5
 *   output fetch   float32 [B,T,C]        softmax per timestep
 *
 * C is read from inference.yml (dictionary length + blank + space), so the
 * engine always matches the downloaded model revision. Batches contain line
 * crops from every bubble on the page; the caller's bubble-worker setting is
 * used as the batch size. If a model rejects dynamic batch shapes we retry
 * that group one line at a time.
 * ---------------------------------------------------------------------------
 */

import * as FileSystem from "expo-file-system/legacy";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

import {
  asTensor,
  decodeSkiaImage,
  readPaddedRgba,
  type OcrRuntime,
  type OrtSession,
} from "./onnxRuntime";
import {
  createPaddleDetEngine,
  type PaddleLineBox,
} from "./paddleDetEngine";

const INPUT_HEIGHT = 48;
const INPUT_WIDTH = 320;
const INPUT_CHANNELS = 3;
const PIXEL_AREA = INPUT_HEIGHT * INPUT_WIDTH;
const VERTICAL_ASPECT = 1.25;
const MAX_BATCH_SIZE = 8;

export interface CtcResult {
  text: string;
  confidence: number;
  /** Per-line boxes in the input crop's pixel space (when detected). */
  lines?: CtcLineBox[];
}

export interface CtcLineBox {
  text: string;
  confidence: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface CtcEngine {
  /** Recognizes one bubble. `batchSize` caps its internal line batch. */
  recognize(uri: string, batchSize?: number): Promise<CtcResult>;
  /** Recognizes several bubbles, sharing batched line forwards across them. */
  recognizeBatch(uris: string[], batchSize?: number): Promise<CtcResult[]>;
  release(): Promise<void>;
}

interface LineJob {
  uri: string;
  group: number;
  owned: boolean;
  /** Line box inside the bubble crop; null when the whole crop was fed. */
  box: PaddleLineBox | null;
}

interface GroupedLine {
  result: CtcResult;
  box: PaddleLineBox | null;
}

async function cropLine(uri: string, box: PaddleLineBox): Promise<string | null> {
  const x1 = Math.max(0, Math.floor(box.x1));
  const y1 = Math.max(0, Math.floor(box.y1));
  const width = Math.max(1, Math.ceil(box.x2) - x1);
  const height = Math.max(1, Math.ceil(box.y2) - y1);
  if (width < 3 || height < 3) return null;

  const context = ImageManipulator.manipulate(uri);
  context.crop({ originX: x1, originY: y1, width, height });
  const rendered = await context.renderAsync();
  const saved = await rendered.saveAsync({
    format: SaveFormat.JPEG,
    compress: 0.95,
  });
  return saved.uri;
}

function yamlScalar(raw: string): string {
  const value = raw.trim();
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value) as string;
    } catch {
      return value.slice(1, -1);
    }
  }
  return value;
}

export function parseCharacterDict(yaml: string): string[] {
  const lines = yaml.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === "character_dict:");
  if (start < 0) throw new Error("inference.yml has no character_dict.");

  const chars: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.startsWith("  - ")) {
      if (line.trim() === "") continue;
      break;
    }
    chars.push(yamlScalar(line.slice(4)));
  }
  if (!chars.length) throw new Error("inference.yml character_dict is empty.");
  return chars;
}

/**
 * PP-OCR maps class 0 to blank, 1..N to dictionary entries, and the final
 * class to a literal space.
 */
function classToChar(classId: number, chars: string[]): string {
  if (classId === 0) return "";
  if (classId <= chars.length) return chars[classId - 1];
  if (classId === chars.length + 1) return " ";
  return "";
}

function normalizeBgrInto(
  pixels: Uint8Array,
  contentWidth: number,
  batchIndex: number,
  tensor: Float32Array,
): void {
  const batchBase = batchIndex * INPUT_CHANNELS * PIXEL_AREA;
  const width = Math.min(contentWidth, INPUT_WIDTH);

  for (let y = 0; y < INPUT_HEIGHT; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = (y * contentWidth + x) * 4;
      const offset = y * INPUT_WIDTH + x;
      // PaddleOCR decodes BGR, so channel 0 is blue and channel 2 is red.
      tensor[batchBase + offset] = (pixels[p + 2] / 255 - 0.5) / 0.5;
      tensor[batchBase + PIXEL_AREA + offset] =
        (pixels[p + 1] / 255 - 0.5) / 0.5;
      tensor[batchBase + 2 * PIXEL_AREA + offset] =
        (pixels[p] / 255 - 0.5) / 0.5;
    }
  }
}

function decodeCtcBatch(
  data: Float32Array,
  dims: readonly number[],
  chars: string[],
  batchSize: number,
): CtcResult[] {
  const classCount = chars.length + 2;
  if (
    dims.length !== 3 ||
    dims[0] !== batchSize ||
    dims[2] !== classCount
  ) {
    throw new Error(
      "Paddle recognizer output does not match its character dictionary: " +
        `${JSON.stringify(dims)} vs batch ${batchSize} and ${classCount} classes`,
    );
  }

  const steps = dims[1];
  const results: CtcResult[] = [];
  for (let batch = 0; batch < batchSize; batch += 1) {
    const base = batch * steps * classCount;
    let previous = 0;
    let text = "";
    let confidenceSum = 0;
    let emitted = 0;

    for (let t = 0; t < steps; t += 1) {
      let best = 0;
      let bestScore = -Infinity;
      const stepBase = base + t * classCount;
      for (let c = 0; c < classCount; c += 1) {
        const score = data[stepBase + c];
        if (score > bestScore) {
          bestScore = score;
          best = c;
        }
      }
      if (best !== 0 && best !== previous) {
        const char = classToChar(best, chars);
        if (char) {
          text += char;
          confidenceSum += bestScore;
          emitted += 1;
        }
      }
      previous = best;
    }

    results.push({
      text: text.trim(),
      confidence: emitted > 0 ? confidenceSum / emitted : 0,
    });
  }
  return results;
}

function mergeResults(entries: GroupedLine[]): CtcResult {
  const parts = entries
    .map((entry) => ({ ...entry, text: entry.result.text.trim() }))
    .filter((entry) => entry.text.length > 0);
  const text = parts.map((part) => part.text).join(" ").trim();
  const weight = parts.reduce((sum, part) => sum + part.text.length, 0);
  const confidence =
    weight > 0
      ? parts.reduce(
          (sum, part) => sum + part.result.confidence * part.text.length,
          0,
        ) / weight
      : 0;
  const lines = parts
    .filter((part) => part.box !== null)
    .sort((a, b) => (a.box!.y1 - b.box!.y1) || (a.box!.x1 - b.box!.x1))
    .map((part) => ({
      text: part.text,
      confidence: part.result.confidence,
      x1: part.box!.x1,
      y1: part.box!.y1,
      x2: part.box!.x2,
      y2: part.box!.y2,
    }));
  return { text, confidence, lines: lines.length > 0 ? lines : undefined };
}

export async function createCtcEngine(
  dirUri: string,
  runtime: OcrRuntime,
): Promise<CtcEngine> {
  const { ort } = runtime;
  const detector = await createPaddleDetEngine(dirUri, runtime);
  const session: OrtSession = await ort.InferenceSession.create(
    `${dirUri}inference.onnx`,
    {
      graphOptimizationLevel: "all",
      intraOpNumThreads: 4,
      interOpNumThreads: 1,
      enableCpuMemArena: true,
      enableMemPattern: true,
    } as never,
  );
  const yaml = await FileSystem.readAsStringAsync(`${dirUri}inference.yml`);
  const chars = parseCharacterDict(yaml);

  const runGroup = async (uris: string[]): Promise<CtcResult[]> => {
    if (uris.length === 0) return [];
    try {
      const data = new Float32Array(
        uris.length * INPUT_CHANNELS * PIXEL_AREA,
      );
      for (let index = 0; index < uris.length; index += 1) {
        try {
          const image = await decodeSkiaImage(runtime, uris[index]);
          const rotate90 =
            image.height() > image.width() * VERTICAL_ASPECT;
          const { pixels, contentWidth } = readPaddedRgba(
            runtime,
            image,
            INPUT_WIDTH,
            INPUT_HEIGHT,
            rotate90,
          );
          normalizeBgrInto(pixels, contentWidth, index, data);
        } catch (error) {
          // Keep the zero-filled row so one bad crop cannot desync the batch.
          console.warn("[ocr][paddle] line preprocess failed", error);
        }
      }

      const input = new ort.Tensor("float32", data, [
        uris.length,
        INPUT_CHANNELS,
        INPUT_HEIGHT,
        INPUT_WIDTH,
      ]);
      const output = await session.run({ x: input });
      const tensor = asTensor(output[session.outputNames[0]]);
      return decodeCtcBatch(
        tensor.data as Float32Array,
        tensor.dims,
        chars,
        uris.length,
      );
    } catch (error) {
      if (uris.length === 1) throw error;
      console.warn(
        "[ocr][paddle] batched forward failed; retrying lines individually",
        error,
      );
      const results: CtcResult[] = [];
      for (const uri of uris) {
        results.push(...(await runGroup([uri])));
      }
      return results;
    }
  };

  const recognizeLineBatch = async (
    uris: string[],
    requestedBatchSize: number,
  ): Promise<CtcResult[]> => {
    const batchSize = Math.min(
      MAX_BATCH_SIZE,
      Math.max(1, Math.round(requestedBatchSize)),
    );
    const results: CtcResult[] = [];
    for (let offset = 0; offset < uris.length; offset += batchSize) {
      results.push(
        ...(await runGroup(uris.slice(offset, offset + batchSize))),
      );
    }
    return results;
  };

  const recognizeBatch = async (
    bubbleUris: string[],
    requestedBatchSize = 8,
  ): Promise<CtcResult[]> => {
    const grouped: GroupedLine[][] = bubbleUris.map(() => []);
    const jobs: LineJob[] = [];

    try {
      for (let group = 0; group < bubbleUris.length; group += 1) {
        const bubbleUri = bubbleUris[group];
        let boxes: PaddleLineBox[] = [];
        try {
          boxes = await detector.detect(bubbleUri);
        } catch (error) {
          console.warn("[ocr][paddle] line detection failed", {
            bubbleUri,
            error,
          });
        }

        if (boxes.length === 0) {
          // Match the previous fallback: feed the whole bubble crop once.
          jobs.push({ uri: bubbleUri, group, owned: false, box: null });
          continue;
        }

        for (const box of boxes) {
          try {
            const lineUri = await cropLine(bubbleUri, box);
            if (lineUri) {
              jobs.push({ uri: lineUri, group, owned: true, box });
            }
          } catch (error) {
            console.warn("[ocr][paddle] line crop failed", { box, error });
          }
        }
      }

      const lineResults = await recognizeLineBatch(
        jobs.map((job) => job.uri),
        requestedBatchSize,
      );
      lineResults.forEach((result, index) => {
        const job = jobs[index];
        if (job) grouped[job.group].push({ result, box: job.box });
      });
      return grouped.map(mergeResults);
    } finally {
      await Promise.allSettled(
        jobs
          .filter((job) => job.owned)
          .map((job) => FileSystem.deleteAsync(job.uri, { idempotent: true })),
      );
    }
  };

  const recognize = async (
    uri: string,
    batchSize = 8,
  ): Promise<CtcResult> => {
    const results = await recognizeBatch([uri], batchSize);
    return results[0] ?? { text: "", confidence: 0 };
  };

  const release = async (): Promise<void> => {
    await Promise.allSettled([session.release(), detector.release()]);
  };

  return { recognize, recognizeBatch, release };
}
