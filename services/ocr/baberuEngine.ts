/**
 * baberuEngine.ts
 * ---------------------------------------------------------------------------
 * On-device inference for Baberu OCR (genshiai-daichi/baberu-ocr).
 *
 * Contract (verified against the published ONNX files):
 *   vision_int4.onnx           pixel_values [1,3,224,224] -> vision_embeds [1,256,512]
 *   decoder_prefill_int8.onnx  vision_embeds + input_ids [1,1] (BOS)
 *                              -> logits [1,257,14630] + 12 present_k/present_v
 *   decoder_step_int8.onnx     input_ids + position_ids + past_k/past_v
 *                              -> logits [1,1,14630] + 12 present_k/present_v
 *
 * The greedy loop mirrors the publisher's onnx_infer.py: repetition penalty
 * 1.2, a 12-token cap for repeated content characters and 16 for punctuation.
 * ---------------------------------------------------------------------------
 */

import * as FileSystem from "expo-file-system/legacy";

import {
  asTensor,
  decodeSkiaImage,
  readStretchedRgba,
  type OcrRuntime,
  type OrtSession,
} from "./onnxRuntime";

const IMAGE_SIZE = 224;
const MAX_NEW_TOKENS = 256;
const REPETITION_PENALTY = 1.2;
const CONTENT_RUN_CAP = 12;
const SYMBOL_RUN_CAP = 16;
const EOS_ID = 2;
const BOS_ID = 1;

const MEAN = [0.485, 0.456, 0.406];
const STD = [0.229, 0.224, 0.225];

interface BaberuSessions {
  vision: OrtSession;
  prefill: OrtSession;
  step: OrtSession;
  vocab: string[];
  contentIds: Set<number>;
}

type OrtTensor = InstanceType<OcrRuntime["ort"]["Tensor"]>;

export interface BaberuEngine {
  recognize(uri: string): Promise<string>;
  release(): Promise<void>;
}

function isContentChar(char: string): boolean {
  if (!char || char === "\u30fc" || char === "\u30fd" || char === "\u30fe") {
    return false;
  }
  return /[0-9A-Za-z\u00c0-\u024f\u0370-\u04ff\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/u.test(
    char,
  );
}

function argmax(values: Float32Array): number {
  let best = 0;
  let bestValue = values[0] ?? -Infinity;
  for (let i = 1; i < values.length; i += 1) {
    if (values[i] > bestValue) {
      bestValue = values[i];
      best = i;
    }
  }
  return best;
}

function int64Tensor(runtime: OcrRuntime, value: number): OrtTensor {
  return new runtime.ort.Tensor(
    "int64",
    BigInt64Array.from([BigInt(value)]),
    [1, 1],
  );
}

function normalizePixels(pixels: Uint8Array): Float32Array {
  const area = IMAGE_SIZE * IMAGE_SIZE;
  const tensor = new Float32Array(3 * area);
  for (let y = 0; y < IMAGE_SIZE; y += 1) {
    for (let x = 0; x < IMAGE_SIZE; x += 1) {
      const p = (y * IMAGE_SIZE + x) * 4;
      tensor[y * IMAGE_SIZE + x] = (pixels[p] / 255 - MEAN[0]) / STD[0];
      tensor[area + y * IMAGE_SIZE + x] =
        (pixels[p + 1] / 255 - MEAN[1]) / STD[1];
      tensor[2 * area + y * IMAGE_SIZE + x] =
        (pixels[p + 2] / 255 - MEAN[2]) / STD[2];
    }
  }
  return tensor;
}

function presentFeeds(
  runtime: OcrRuntime,
  outputs: Record<string, unknown>,
): Record<string, OrtTensor> {
  const feeds: Record<string, OrtTensor> = {};
  for (const [name, value] of Object.entries(outputs)) {
    if (!name.startsWith("present_")) continue;
    const tensor = asTensor(value);
    feeds[name.replace("present_", "past_")] = new runtime.ort.Tensor(
      "float32",
      tensor.data as Float32Array,
      tensor.dims as number[],
    );
  }
  return feeds;
}

async function loadSessions(dirUri: string, runtime: OcrRuntime): Promise<BaberuSessions> {
  const { ort } = runtime;
  const vision = await ort.InferenceSession.create(
    `${dirUri}onnx/vision_int4.onnx`,
  );
  const prefill = await ort.InferenceSession.create(
    `${dirUri}onnx/decoder_prefill_int8.onnx`,
  );
  const step = await ort.InferenceSession.create(
    `${dirUri}onnx/decoder_step_int8.onnx`,
  );
  const rawVocab = await FileSystem.readAsStringAsync(`${dirUri}tokenizer/vocab.json`);
  const vocab = JSON.parse(rawVocab) as string[];
  const contentIds = new Set<number>();
  vocab.forEach((char, index) => {
    if (isContentChar(char)) contentIds.add(index + 4);
  });
  return { vision, prefill, step, vocab, contentIds };
}

export async function createBaberuEngine(
  dirUri: string,
  runtime: OcrRuntime,
): Promise<BaberuEngine> {
  const sessions = await loadSessions(dirUri, runtime);
  const { ort } = runtime;

  const recognize = async (uri: string): Promise<string> => {
    const image = await decodeSkiaImage(runtime, uri);
    const pixels = readStretchedRgba(runtime, image, IMAGE_SIZE, IMAGE_SIZE);
    const input = new ort.Tensor(
      "float32",
      normalizePixels(pixels),
      [1, 3, IMAGE_SIZE, IMAGE_SIZE],
    );

    const visionOut = await sessions.vision.run({
      pixel_values: input,
    });
    const visionEmbeds = asTensor(visionOut[sessions.vision.outputNames[0]]);
    if (!visionEmbeds) return "";

    const prefillOut = await sessions.prefill.run({
      vision_embeds: new ort.Tensor(
        "float32",
        visionEmbeds.data as Float32Array,
        visionEmbeds.dims as number[],
      ),
      input_ids: int64Tensor(runtime, BOS_ID),
    });

    const logitsTensor = asTensor(prefillOut.logits);
    const vocabSize = sessions.vocab.length + 4;
    const lastRow = new Float32Array(
      (logitsTensor.data as Float32Array).subarray(
        (logitsTensor.dims[1] - 1) * vocabSize,
        logitsTensor.dims[1] * vocabSize,
      ),
    );
    let present = presentFeeds(runtime, prefillOut);
    let position = (visionEmbeds.dims[1] ?? 256) + 1;

    const sequence = [BOS_ID];
    const generated: number[] = [];
    const logits = lastRow;

    for (let index = 0; index < MAX_NEW_TOKENS; index += 1) {
      for (const token of new Set(sequence)) {
        const score = logits[token];
        logits[token] =
          score < 0 ? score * REPETITION_PENALTY : score / REPETITION_PENALTY;
      }

      const last = generated.length ? generated[generated.length - 1] : 0;
      const cap = sessions.contentIds.has(last)
        ? CONTENT_RUN_CAP
        : last > 3
          ? SYMBOL_RUN_CAP
          : 0;
      if (cap > 0) {
        let run = 0;
        for (let i = generated.length - 1; i >= 0; i -= 1) {
          if (generated[i] !== last) break;
          run += 1;
        }
        if (run >= cap) logits[last] = -Infinity;
      }

      const next = argmax(logits);
      if (next === EOS_ID) break;

      generated.push(next);
      sequence.push(next);
      if (generated.length >= MAX_NEW_TOKENS) break;

      const feeds: Record<string, OrtTensor> = {
        input_ids: int64Tensor(runtime, next),
        position_ids: int64Tensor(runtime, position),
      };
      for (const [name, tensor] of Object.entries(present)) {
        feeds[name] = tensor;
      }

      const stepOut = await sessions.step.run(feeds);
      const stepLogits = asTensor(stepOut.logits);
      logits.set(stepLogits.data as Float32Array);
      present = presentFeeds(runtime, stepOut);
      position += 1;
    }

    return generated
      .filter((id) => id >= 4 && id < sessions.vocab.length + 4)
      .map((id) => sessions.vocab[id - 4])
      .join("")
      .trim();
  };

  const release = async (): Promise<void> => {
    await Promise.allSettled([
      sessions.vision.release(),
      sessions.prefill.release(),
      sessions.step.release(),
    ]);
  };

  return { recognize, release };
}
