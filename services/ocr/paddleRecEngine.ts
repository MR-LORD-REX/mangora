/**
 * paddleRecEngine.ts
 * ---------------------------------------------------------------------------
 * CTC text-line recognizer for PaddleOCR's korean_PP-OCRv5_mobile_rec ONNX
 * export.
 *
 * Contract (verified against PaddlePaddle/korean_PP-OCRv5_mobile_rec_onnx):
 *   input  x       float32 [1,3,48,320]   BGR, (x/255 - 0.5) / 0.5
 *   output fetch   float32 [1,T,11947]    softmax per timestep
 *
 * The 11,945-character dictionary is read from inference.yml, so the engine
 * always matches the model revision that was downloaded.
 * ---------------------------------------------------------------------------
 */

import * as FileSystem from "expo-file-system/legacy";

import {
  asTensor,
  decodeSkiaImage,
  readPaddedRgba,
  type OcrRuntime,
  type OrtSession,
} from "./onnxRuntime";

const INPUT_HEIGHT = 48;
const INPUT_WIDTH = 320;

export interface CtcResult {
  text: string;
  confidence: number;
}

export interface CtcEngine {
  recognize(uri: string): Promise<CtcResult>;
  release(): Promise<void>;
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

function normalizeBgr(pixels: Uint8Array, contentWidth: number): Float32Array {
  const area = INPUT_HEIGHT * INPUT_WIDTH;
  const tensor = new Float32Array(3 * area);
  const width = Math.min(contentWidth, INPUT_WIDTH);

  for (let y = 0; y < INPUT_HEIGHT; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = (y * contentWidth + x) * 4;
      const offset = y * INPUT_WIDTH + x;
      // PaddleOCR decodes BGR, so channel 0 is blue and channel 2 is red.
      tensor[offset] = (pixels[p + 2] / 255 - 0.5) / 0.5;
      tensor[area + offset] = (pixels[p + 1] / 255 - 0.5) / 0.5;
      tensor[2 * area + offset] = (pixels[p] / 255 - 0.5) / 0.5;
    }
  }
  return tensor;
}

function decodeCtc(
  data: Float32Array,
  dims: readonly number[],
  chars: string[],
): CtcResult {
  const classCount = chars.length + 2;
  const timeMajor = dims.length === 3 && dims[2] === classCount;
  const steps = timeMajor ? dims[1] : dims[2];
  if (!steps) return { text: "", confidence: 0 };

  let previous = 0;
  let text = "";
  let confidenceSum = 0;
  let emitted = 0;

  for (let t = 0; t < steps; t += 1) {
    let best = 0;
    let bestScore = -Infinity;
    for (let c = 0; c < classCount; c += 1) {
      const index = timeMajor ? t * classCount + c : c * steps + t;
      const score = data[index];
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

  return {
    text: text.trim(),
    confidence: emitted > 0 ? confidenceSum / emitted : 0,
  };
}

export async function createCtcEngine(
  dirUri: string,
  runtime: OcrRuntime,
): Promise<CtcEngine> {
  const { ort } = runtime;
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

  const recognize = async (uri: string): Promise<CtcResult> => {
    const image = await decodeSkiaImage(runtime, uri);
    const { pixels, contentWidth } = readPaddedRgba(
      runtime,
      image,
      INPUT_WIDTH,
      INPUT_HEIGHT,
    );
    const input = new ort.Tensor(
      "float32",
      normalizeBgr(pixels, contentWidth),
      [1, 3, INPUT_HEIGHT, INPUT_WIDTH],
    );

    const output = await session.run({ x: input });
    const tensor = asTensor(output[session.outputNames[0]]);
    return decodeCtc(
      tensor.data as Float32Array,
      tensor.dims,
      chars,
    );
  };

  const release = async (): Promise<void> => {
    await session.release().catch(() => {});
  };

  return { recognize, release };
}
