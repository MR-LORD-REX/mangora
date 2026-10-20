/**
 * ocrModels.ts
 * ---------------------------------------------------------------------------
 * Catalog of the two on-device OCR providers the reader can use.
 *
 * Both providers run through onnxruntime-react-native. Model files are not
 * bundled with the APK: Settings -> OCR models downloads only the provider the
 * user needs into the app's documents directory.
 *
 *   baberu        - vision encoder + INT8 KV decoder, trained for Japanese,
 *                   Chinese and English manga bubbles. 122 MB (INT4 vision).
 *   paddle-korean - PP-OCRv5 Korean mobile recognizer (CTC) plus the
 *                   PP-OCRv5 mobile text-line detector (DBNet). Korean + Latin
 *                   scripts. About 18 MB total.
 *
 * URLs point at the publishers' Hugging Face repositories so the app never
 * hosts model weights itself. Keep `bytes` in sync with the upstream files:
 * the downloader treats a size mismatch as an incomplete download.
 * ---------------------------------------------------------------------------
 */

export type LocalOcrModelId = "baberu" | "paddle-korean";

export type LocalOcrEngine = "baberu" | "ctc";

export interface LocalOcrModelFile {
  /** Relative path inside the model directory (also used as the ONNX name). */
  path: string;
  /** HTTPS source. Hugging Face `resolve/main` URLs follow a CDN redirect. */
  url: string;
  /** Exact byte size of the published file. */
  bytes: number;
}

export interface LocalOcrModelDef {
  id: LocalOcrModelId;
  label: string;
  /** One-line description shown in Settings. */
  detail: string;
  engine: LocalOcrEngine;
  /** Reader language codes this provider can recognize. */
  languages: string[];
  /** Compact language strip for the UI. */
  languageLabel: string;
  /** Total download size, derived from `files`. */
  bytes: number;
  files: LocalOcrModelFile[];
  license: string;
  homepage: string;
}

const BABERU_BASE = "https://huggingface.co/genshiai-daichi/baberu-ocr/resolve/main";
const PADDLE_KOREAN_BASE =
  "https://huggingface.co/PaddlePaddle/korean_PP-OCRv5_mobile_rec_onnx/resolve/main";
const PADDLE_DET_BASE =
  "https://huggingface.co/PaddlePaddle/PP-OCRv5_mobile_det_onnx/resolve/main";

const BABERU_FILES: LocalOcrModelFile[] = [
  {
    path: "onnx/vision_int4.onnx",
    url: `${BABERU_BASE}/onnx/vision_int4.onnx`,
    bytes: 52_293_486,
  },
  {
    path: "onnx/decoder_prefill_int8.onnx",
    url: `${BABERU_BASE}/onnx/decoder_prefill_int8.onnx`,
    bytes: 35_133_596,
  },
  {
    path: "onnx/decoder_step_int8.onnx",
    url: `${BABERU_BASE}/onnx/decoder_step_int8.onnx`,
    bytes: 34_715_466,
  },
  {
    path: "tokenizer/vocab.json",
    url: `${BABERU_BASE}/tokenizer/vocab.json`,
    bytes: 130_761,
  },
];

const PADDLE_KOREAN_FILES: LocalOcrModelFile[] = [
  {
    path: "detection.onnx",
    url: `${PADDLE_DET_BASE}/inference.onnx`,
    bytes: 4_826_518,
  },
  {
    path: "inference.onnx",
    url: `${PADDLE_KOREAN_BASE}/inference.onnx`,
    bytes: 13_418_787,
  },
  {
    path: "inference.yml",
    url: `${PADDLE_KOREAN_BASE}/inference.yml`,
    bytes: 96_039,
  },
];

function totalBytes(files: LocalOcrModelFile[]): number {
  return files.reduce((sum, file) => sum + file.bytes, 0);
}

export const LOCAL_OCR_MODELS: LocalOcrModelDef[] = [
  {
    id: "baberu",
    label: "Baberu OCR",
    detail: "Manga bubble OCR for Japanese, Chinese and English.",
    engine: "baberu",
    languages: ["ja", "zh", "zh-tw", "en"],
    languageLabel: "Japanese / Chinese / English",
    bytes: totalBytes(BABERU_FILES),
    files: BABERU_FILES,
    license: "Apache-2.0",
    homepage: "https://huggingface.co/genshiai-daichi/baberu-ocr",
  },
  {
    id: "paddle-korean",
    label: "PP-OCRv5 Korean",
    detail:
      "PaddleOCR line detector + recognizer for Korean and Latin scripts.",
    engine: "ctc",
    languages: [
      "ko",
      "en",
      "fr",
      "de",
      "es",
      "it",
      "pt",
      "nl",
      "pl",
      "tr",
      "vi",
      "id",
      "ms",
      "tl",
      "fil",
    ],
    languageLabel: "Korean / Latin scripts",
    bytes: totalBytes(PADDLE_KOREAN_FILES),
    files: PADDLE_KOREAN_FILES,
    license: "Apache-2.0",
    homepage: "https://huggingface.co/PaddlePaddle/korean_PP-OCRv5_mobile_rec_onnx",
  },
];

const MODEL_BY_ID = new Map<LocalOcrModelId, LocalOcrModelDef>(
  LOCAL_OCR_MODELS.map((model) => [model.id, model]),
);

export function getLocalOcrModel(
  id: LocalOcrModelId,
): LocalOcrModelDef | null {
  return MODEL_BY_ID.get(id) ?? null;
}

function baseLanguageCode(code: string | null | undefined): string {
  return String(code ?? "").trim().toLowerCase().split("-")[0];
}

/**
 * Provider that should read a chapter written in `code`.
 *
 * Japanese, Chinese and English are the Baberu languages. Korean and every
 * Latin-script language use the PP-OCRv5 Korean recognizer. Unknown codes
 * fall back to Baberu (it is the safer multi-script model).
 */
export function modelIdForLanguage(code: string | null | undefined): LocalOcrModelId {
  const base = baseLanguageCode(code);
  if (base === "ko") return "paddle-korean";
  if (base === "en") return "baberu";
  if (base === "ja" || base === "jp" || base === "zh") return "baberu";
  const latin = new Set([
    "fr",
    "de",
    "es",
    "it",
    "pt",
    "nl",
    "pl",
    "tr",
    "vi",
    "id",
    "ms",
    "tl",
    "fil",
  ]);
  return latin.has(base) ? "paddle-korean" : "baberu";
}

/** Formats a byte count for the Settings rows (decimal megabytes). */
export function formatModelBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Shown when a selectable language has no provider. */
export function modelForLanguageLabel(code: string | null | undefined): string {
  return getLocalOcrModel(modelIdForLanguage(code))?.label ?? "OCR model";
}

/** Baberu keeps one set of ONNX sessions per worker (~121 MB each). */
export const BABERU_RAM_MB_PER_ENGINE = 121;

/** A Paddle engine contains both detector and recognizer sessions. */
export function maxOcrBubbleWorkers(id: LocalOcrModelId): number {
  return getLocalOcrModel(id)?.engine === "baberu" ? 5 : 1;
}

/** Clamp a requested bubble-worker count to the selected engine's limit. */
export function clampOcrBubbleWorkers(
  id: LocalOcrModelId,
  workers: number,
): number {
  const limit = maxOcrBubbleWorkers(id);
  return Math.min(limit, Math.max(1, Math.round(workers)));
}

/** Estimated resident memory for Baberu workers, or null for single-engine PP. */
export function ocrBubbleRamMb(
  id: LocalOcrModelId,
  workers: number,
): number | null {
  if (getLocalOcrModel(id)?.engine !== "baberu") return null;
  return clampOcrBubbleWorkers(id, workers) * BABERU_RAM_MB_PER_ENGINE;
}
