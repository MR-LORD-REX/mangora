/**
 * ocrModels.ts
 * ---------------------------------------------------------------------------
 * Catalog of the two on-device OCR providers the reader can use.
 *
 * Both providers run through onnxruntime-react-native. Model files are not
 * bundled with the APK: Settings -> OCR models downloads only the provider the
 * user needs into the app's documents directory.
 *
 *   paddle-v6     - PP-OCRv6 medium CTC recognizer plus the PP-OCRv5 mobile
 *                   text-line detector (DBNet). Japanese, Chinese and English
 *                   (including vertical text). About 82 MB.
 *   paddle-korean - PP-OCRv5 Korean mobile recognizer (CTC) plus the same
 *                   detector. Korean + Latin scripts. About 18 MB total.
 *
 * URLs point at the publishers' Hugging Face repositories so the app never
 * hosts model weights itself. Keep `bytes` in sync with the upstream files:
 * the downloader treats a size mismatch as an incomplete download.
 * ---------------------------------------------------------------------------
 */

export type LocalOcrModelId = "paddle-v6" | "paddle-korean";

export type LocalOcrEngine = "ctc";

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

const PADDLE_V6_REC_BASE =
  "https://huggingface.co/PaddlePaddle/PP-OCRv6_medium_rec_onnx/resolve/50c7eacafc52fa7bcf4194e8cd08e46f8558504b";
const PADDLE_KOREAN_BASE =
  "https://huggingface.co/PaddlePaddle/korean_PP-OCRv5_mobile_rec_onnx/resolve/main";
const PADDLE_DET_BASE =
  "https://huggingface.co/PaddlePaddle/PP-OCRv5_mobile_det_onnx/resolve/e6f4fa85f00e168c862bc462aebca69eef9b3d3d";

const PADDLE_V6_FILES: LocalOcrModelFile[] = [
  {
    path: "detection.onnx",
    url: `${PADDLE_DET_BASE}/inference.onnx`,
    bytes: 4_826_518,
  },
  {
    path: "inference.onnx",
    url: `${PADDLE_V6_REC_BASE}/inference.onnx`,
    bytes: 76_554_979,
  },
  {
    path: "inference.yml",
    url: `${PADDLE_V6_REC_BASE}/inference.yml`,
    bytes: 150_580,
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
    id: "paddle-v6",
    label: "PP-OCRv6 Medium",
    detail:
      "PaddleOCR v6 medium recognizer with a PP-OCRv5 line detector for Japanese, Chinese and English.",
    engine: "ctc",
    languages: ["ja", "zh", "zh-tw", "en"],
    languageLabel: "Japanese / Chinese / English",
    bytes: totalBytes(PADDLE_V6_FILES),
    files: PADDLE_V6_FILES,
    license: "Apache-2.0",
    homepage: "https://huggingface.co/PaddlePaddle/PP-OCRv6_medium_rec_onnx",
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
 * Japanese, Chinese and English use PP-OCRv6 medium. Korean and every
 * Latin-script language use the PP-OCRv5 Korean recognizer. Unknown codes
 * fall back to PP-OCRv6 because its CJK dictionary is the wider one.
 */
export function modelIdForLanguage(code: string | null | undefined): LocalOcrModelId {
  const base = baseLanguageCode(code);
  if (base === "ko") return "paddle-korean";
  if (base === "en") return "paddle-v6";
  if (base === "ja" || base === "jp" || base === "zh") return "paddle-v6";
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
  return latin.has(base) ? "paddle-korean" : "paddle-v6";
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

/**
 * Slider maximum. Both PP-OCR providers use the value as the recognition
 * batch size, not a count of independent engines.
 */
export function maxOcrBubbleWorkers(id: LocalOcrModelId): number {
  return getLocalOcrModel(id) ? 8 : 1;
}

/** Clamp a requested bubble-worker count to the selected engine's limit. */
export function clampOcrBubbleWorkers(
  id: LocalOcrModelId,
  workers: number,
): number {
  const limit = maxOcrBubbleWorkers(id);
  return Math.min(limit, Math.max(1, Math.round(workers)));
}

/**
 * A Paddle engine contains one detector + one recognizer session. Bubble
 * "workers" therefore size a batch, not a pool of extra engines.
 */
export function ocrEngineConcurrency(
  id: LocalOcrModelId,
  workers: number,
): number {
  void id;
  void workers;
  return 1;
}

/** Text lines sent per recognizer forward pass. */
export function ocrRecognitionBatchSize(
  id: LocalOcrModelId,
  workers: number,
): number {
  return getLocalOcrModel(id) ? clampOcrBubbleWorkers(id, workers) : 1;
}
