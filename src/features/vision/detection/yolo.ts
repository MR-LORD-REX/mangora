/**
 * yolo.ts
 * ---------------------------------------------------------------------------
 * YoloDetector - on-device manga text-region detection.
 *
 * Runs assets/models/yolo.onnx (Ultralytics YOLO NMS export, classes:
 * clean_text / messy_text / text_bubble) through onnxruntime-react-native.
 *
 * Pipeline per call:
 *   1. Decode the source image with Skia (remote or local uri).
 *   2. Letterbox it to 640x640 (gray padding, Ultralytics convention).
 *   3. Read RGBA pixels, build the CHW float tensor and run inference.
 *   4. Decode the NMS output rows back into original-image coordinates.
 *
 * IMPORTANT: Skia and onnxruntime-react-native are native modules that are
 * NOT present in Expo Go. They are required lazily at call time (never at
 * module load), so importing this file can never crash the reader - tapping
 * the YOLO button in Expo Go just shows a friendly error instead.
 * ---------------------------------------------------------------------------
 */

import { Asset } from "expo-asset";

import type { Detection, DetectionResult, YoloClassName, YoloOptions } from "./detectionTypes";
import { YOLO_CLASS_NAMES } from "./detectionTypes";
import {
  decodeOutput,
  mergeDetections,
  type Letterbox,
} from "./yoloUtils";
import { ensureDecodablePageUri } from "../ocr/pageOcr";

type OrtModule = typeof import("onnxruntime-react-native");
type SkiaModule = typeof import("@shopify/react-native-skia");

interface YoloRuntime {
  ort: OrtModule;
  skia: SkiaModule;
}

/** The bundled model (expo-asset turns the require into a bundled asset). */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const MODEL_FILE = require("../../../../assets/models/yolo.onnx");

/** Ultralytics default letterbox target. Must match the exported model. */
const INPUT_SIZE = 640;

const NEEDS_DEV_BUILD =
  "Text detection needs a development build (Skia + onnxruntime are native modules not available in Expo Go).";

export class YoloError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "YoloError";
  }
}

/** Validates the exported model's names against the typed class list. */
export const YOLO_CLASSES: readonly YoloClassName[] = YOLO_CLASS_NAMES;

let cachedRuntime: YoloRuntime | null = null;

/** Requires a module that may be absent (Expo Go) without throwing. */
function safeRequire<T>(loader: () => T): T | null {
  try {
    const mod: unknown = loader();
    if (mod && typeof mod === "object" && "default" in mod) {
      const unwrapped = (mod as { default?: unknown }).default;
      if (unwrapped !== undefined) return unwrapped as T;
    }
    return mod as T | null;
  } catch {
    return null;
  }
}

/**
 * Resolves the native runtime the first time it is actually needed.
 * Validates the full API surface and throws a user-friendly YoloError when the
 * modules are unavailable (e.g. Expo Go) instead of crashing at import time.
 */
function loadRuntime(): YoloRuntime {
  if (cachedRuntime) return cachedRuntime;


  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ort = safeRequire<OrtModule>(() => require("onnxruntime-react-native"));
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const skia = safeRequire<SkiaModule>(() => require("@shopify/react-native-skia"));

  const ortReady =
    !!ort &&
    typeof ort.InferenceSession?.create === "function" &&
    typeof ort.Tensor === "function";
  const skiaReady =
    !!skia &&
    typeof skia.Skia?.Data?.fromURI === "function" &&
    !!skia.ColorType &&
    !!skia.AlphaType;

  if (!ortReady || !skiaReady) {
    console.warn("YOLO native runtime unavailable (ortReady=%s skiaReady=%s)", ortReady, skiaReady);
    throw new YoloError(NEEDS_DEV_BUILD);
  }

  cachedRuntime = { ort: ort as OrtModule, skia: skia as SkiaModule };
  return cachedRuntime;
}

/** Lets the UI decide whether to enable/disable the YOLO button. */
export function isYoloRuntimeAvailable(): boolean {
  try {
    loadRuntime();
    return true;
  } catch {
    return false;
  }
}

/**
 * Largest tile side that still gives the model ~40% of the source pixels
 * (640 / 1600) instead of squishing a whole strip down to a few percent.
 */
const TILE_MAX_SIZE = 1600;

/** Tile overlap so a bubble crossing a seam is fully visible in one tile. */
const TILE_OVERLAP = 384;

interface TileRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Splits oversized images (e.g. 720x9000 stitched webtoon strips) into
 * overlapping tiles. Letterboxing the whole strip into one 640x640 input
 * shrinks text to ~7% of its real size - which is why detection missed it;
 * per-tile inference keeps every region at ~40%+ of its real size.
 */
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

/** Downloads + decodes the source image once for the whole detect call. */
async function decodeSource(
  uri: string,
  rt: YoloRuntime,
  options: YoloOptions = {},
) {
  const { Skia } = rt.skia;
  // AVIF is not supported by Skia's decoder. Transcode it to a cached PNG
  // first so extension pages from CDNs like cdn.atsu.moe work here too.
  const decode = async (sourceUri: string) => {
    const encoded = await Skia.Data.fromURI(sourceUri);
    return Skia.Image.MakeImageFromEncoded(encoded);
  };
  let sourceUri = await ensureDecodablePageUri(uri, {
    headers: options.headers,
    extensionSourceId: options.extensionSourceId,
    pageUrl: uri,
  });
  let source = await decode(sourceUri);
  // Some providers serve AVIF from urls without an extension. If Skia cannot
  // open the remote image, fetch the bytes through the extension client (which
  // also runs Cloudflare/decryption interceptors) and try the local file.
  if (!source && options.extensionSourceId && !sourceUri.startsWith("file://")) {
    sourceUri = await ensureDecodablePageUri(uri, {
      headers: options.headers,
      extensionSourceId: options.extensionSourceId,
      pageUrl: uri,
      force: true,
    });
    source = await decode(sourceUri);
  }
  if (!source) {
    throw new YoloError(`Could not decode the image from ${uri}`);
  }
  return source;
}

/**
 * Letterboxes one tile (a region of the decoded source) into the YOLO
 * 640x640 input and returns the CHW float tensor plus the letterbox used.
 */
async function prepareTileInput(
  source: Awaited<ReturnType<typeof decodeSource>>,
  tile: TileRect,
  rt: YoloRuntime,
): Promise<{
  tensor: Float32Array;
  letterbox: Letterbox;
}> {
  const { Skia, ColorType, AlphaType } = rt.skia;
  const imageWidth = tile.width;
  const imageHeight = tile.height;
  const scale = Math.min(INPUT_SIZE / imageWidth, INPUT_SIZE / imageHeight);
  const dstW = Math.max(1, Math.round(imageWidth * scale));
  const dstH = Math.max(1, Math.round(imageHeight * scale));
  const padX = Math.floor((INPUT_SIZE - dstW) / 2);
  const padY = Math.floor((INPUT_SIZE - dstH) / 2);

  const surface = Skia.Surface.MakeOffscreen(INPUT_SIZE, INPUT_SIZE);
  if (!surface) {
    throw new YoloError("Could not create an offscreen surface for preprocessing");
  }
  const canvas = surface.getCanvas();
  canvas.clear(Skia.Color("#737373"));
  const paint = Skia.Paint();
  canvas.drawImageRect(
    source,
    Skia.XYWHRect(tile.x, tile.y, imageWidth, imageHeight),
    Skia.XYWHRect(padX, padY, dstW, dstH),
    paint,
    true,
  );

  const snapshot = surface.makeImageSnapshot();
  const raw = snapshot.readPixels(0, 0, {
    width: INPUT_SIZE,
    height: INPUT_SIZE,
    colorType: ColorType.RGBA_8888,
    alphaType: AlphaType.Unpremul,
  });
  if (!raw) {
    throw new YoloError("Could not read the preprocessed pixels from Skia");
  }
  const pixels = raw as Uint8Array;

  const area = INPUT_SIZE * INPUT_SIZE;
  const tensor = new Float32Array(3 * area);
  for (let y = 0; y < INPUT_SIZE; y++) {
    for (let x = 0; x < INPUT_SIZE; x++) {
      const p = (y * INPUT_SIZE + x) * 4;
      tensor[y * INPUT_SIZE + x] = pixels[p] / 255;
      tensor[area + y * INPUT_SIZE + x] = pixels[p + 1] / 255;
      tensor[2 * area + y * INPUT_SIZE + x] = pixels[p + 2] / 255;
    }
  }

  return {
    tensor,
    letterbox: { scale, padX, padY, imageWidth, imageHeight },
  };
}
type OrtSession = Awaited<ReturnType<OrtModule["InferenceSession"]["create"]>>;

/** Tiny shared detector. Lazy session load; safe to call from any screen. */
export class YoloDetector {
  private sessionPromise: Promise<OrtSession> | null = null;
  private session: OrtSession | null = null;

  private async loadSession(rt: YoloRuntime): Promise<OrtSession> {
    if (this.session) return this.session;
    if (!this.sessionPromise) {
      this.sessionPromise = (async () => {
        const asset = Asset.fromModule(MODEL_FILE);
        if (!asset.localUri) {
          await asset.downloadAsync();
        }
        const modelUri = asset.localUri ?? asset.uri;
        const session = await rt.ort.InferenceSession.create(modelUri);
        this.session = session;
        return session;
      })();
    }
    return this.sessionPromise;
  }

  /** Loads the native runtime + model ahead of time so the first tap is fast. */
  async warmup(): Promise<void> {
    const rt = loadRuntime();
    await this.loadSession(rt);
  }

  /** Runs detection on one image uri (https://, file://, ...). */
  async detectFromUri(
    uri: string,
    options: YoloOptions = {},
  ): Promise<DetectionResult> {
    const rt = loadRuntime();
    const session = await this.loadSession(rt);
    const source = await decodeSource(uri, rt, options);
    const imageWidth = source.width();
    const imageHeight = source.height();
    const tiles = buildTiles(imageWidth, imageHeight);
    const maxBoxes = options.maxBoxes ?? 200;

    const inputName = session.inputNames[0];
    const outputName = session.outputNames[0];

    const allBoxes: Detection[] = [];
    for (const tile of tiles) {
      const prepared = await prepareTileInput(source, tile, rt);
      const feeds = {
        [inputName]: new rt.ort.Tensor(
          "float32",
          prepared.tensor,
          [1, 3, INPUT_SIZE, INPUT_SIZE],
        ),
      };
      const results = await session.run(feeds);
      const output = results[outputName];

      const rawData = (output as { data: unknown }).data;
      const data: Float32Array = ArrayBuffer.isView(rawData)
        ? (rawData as Float32Array)
        : new Float32Array(rawData as number[]);

      const localBoxes = decodeOutput(
        data,
        output.dims,
        prepared.letterbox,
        options,
      );
      for (const box of localBoxes) {
        if (tiles.length === 1) {
          allBoxes.push(box);
        } else {
          // Shift tile-local coordinates back into full-image coordinates.
          allBoxes.push({
            ...box,
            x1: box.x1 + tile.x,
            y1: box.y1 + tile.y,
            x2: box.x2 + tile.x,
            y2: box.y2 + tile.y,
          });
        }
      }
    }

    const boxes =
      tiles.length > 1
        ? mergeDetections(allBoxes, maxBoxes)
        : allBoxes.slice(0, maxBoxes);
    console.log("yolo detect result", boxes.length);
    return {
      imageWidth,
      imageHeight,
      boxes,
    };
  }
  /** Frees the native session (call when leaving the reader for good). */
  async release(): Promise<void> {
    if (this.session) {
      await this.session.release().catch(() => {});
      this.session = null;
    }
    this.sessionPromise = null;
  }
}

/** App-wide singleton. */
export const yoloDetector = new YoloDetector();

/** One-shot helper mirroring `yoloDetector.detectFromUri`. */
export function detectImage(uri: string, options?: YoloOptions): Promise<DetectionResult> {
  return yoloDetector.detectFromUri(uri, options);
}

export type { Detection, DetectionResult } from "./detectionTypes";
