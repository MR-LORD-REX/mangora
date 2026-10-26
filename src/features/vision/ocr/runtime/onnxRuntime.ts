/**
 * onnxRuntime.ts
 * ---------------------------------------------------------------------------
 * Lazy loader shared by the two OCR engines. Mirrors vision/detection/yolo.ts:
 * neither onnxruntime-react-native nor Skia is touched at module load, so the
 * reader still opens in Expo Go and the Settings screen can scan the catalog.
 * ---------------------------------------------------------------------------
 */

type OrtModule = typeof import("onnxruntime-react-native");
type SkiaModule = typeof import("@shopify/react-native-skia");

export interface OcrRuntime {
  ort: OrtModule;
  skia: SkiaModule;
}

export type OrtSession = Awaited<
  ReturnType<OrtModule["InferenceSession"]["create"]>
>;

export type SkiaImage = NonNullable<
  ReturnType<SkiaModule["Skia"]["Image"]["MakeImageFromEncoded"]>
>;

export class OcrRuntimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OcrRuntimeError";
  }
}

const NEEDS_DEV_BUILD =
  "On-device OCR needs a development build (onnxruntime + Skia are native modules that are not available in Expo Go).";

let cachedRuntime: OcrRuntime | null = null;

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

export function loadOcrRuntime(): OcrRuntime {
  if (cachedRuntime) return cachedRuntime;

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ort = safeRequire<OrtModule>(() => require("onnxruntime-react-native"));
  const skia = safeRequire<SkiaModule>(() =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require("@shopify/react-native-skia"),
  );

  const ortReady =
    !!ort &&
    typeof ort.InferenceSession?.create === "function" &&
    typeof ort.Tensor === "function";
  const skiaReady =
    !!skia &&
    typeof skia.Skia?.Data?.fromURI === "function" &&
    !!skia.ColorType &&
    !!skia.AlphaType;

  if (!ortReady || !skiaReady) throw new OcrRuntimeError(NEEDS_DEV_BUILD);

  cachedRuntime = { ort: ort as OrtModule, skia: skia as SkiaModule };
  return cachedRuntime;
}

export function isOcrRuntimeAvailable(): boolean {
  try {
    loadOcrRuntime();
    return true;
  } catch {
    return false;
  }
}

export async function createSession(
  runtime: OcrRuntime,
  fileUri: string,
): Promise<OrtSession> {
  return runtime.ort.InferenceSession.create(fileUri);
}

/** Decodes a local JPEG/PNG crop with Skia. */
export async function decodeSkiaImage(
  runtime: OcrRuntime,
  uri: string,
): Promise<SkiaImage> {
  const { Skia } = runtime.skia;
  const encoded = await Skia.Data.fromURI(uri);
  const image = Skia.Image.MakeImageFromEncoded(encoded);
  if (!image) throw new OcrRuntimeError(`Could not decode OCR crop: ${uri}`);
  return image;
}

/**
 * Draws `image` into a surface of exactly `width` x `height` (stretched) and
 * returns the RGBA bytes. Used when the recognizer wants the whole crop.
 */
export function readStretchedRgba(
  runtime: OcrRuntime,
  image: SkiaImage,
  width: number,
  height: number,
): Uint8Array {
  const { Skia, ColorType, AlphaType } = runtime.skia;
  const surface = Skia.Surface.MakeOffscreen(width, height);
  if (!surface) throw new OcrRuntimeError("Could not create an OCR surface.");

  const canvas = surface.getCanvas();
  const paint = Skia.Paint();
  canvas.drawImageRect(
    image,
    Skia.XYWHRect(0, 0, image.width(), image.height()),
    Skia.XYWHRect(0, 0, width, height),
    paint,
    true,
  );

  const snapshot = surface.makeImageSnapshot();
  const raw = snapshot.readPixels(0, 0, {
    width,
    height,
    colorType: ColorType.RGBA_8888,
    alphaType: AlphaType.Unpremul,
  });
  if (!raw) throw new OcrRuntimeError("Could not read OCR surface pixels.");
  return raw as Uint8Array;
}

/**
 * Aspect-preserving resize: returns a `surfaceWidth` x `height` RGBA buffer
 * where the scaled image sits on the left and the remaining columns are zero.
 */
export function readPaddedRgba(
  runtime: OcrRuntime,
  image: SkiaImage,
  surfaceWidth: number,
  height: number,
  rotate90 = false,
): { pixels: Uint8Array; contentWidth: number } {
  const { Skia, ColorType, AlphaType } = runtime.skia;
  // PaddleOCR rotates tall (vertical) text lines before recognition.
  const ratio = rotate90
    ? image.height() / Math.max(1, image.width())
    : image.width() / Math.max(1, image.height());
  const contentWidth = Math.max(1, Math.min(surfaceWidth, Math.ceil(height * ratio)));

  const surface = Skia.Surface.MakeOffscreen(contentWidth, height);
  if (!surface) throw new OcrRuntimeError("Could not create an OCR surface.");
  const canvas = surface.getCanvas();
  if (rotate90) {
    canvas.save();
    // PIL's ROTATE_90 (used by PaddleOCR) is counter-clockwise. The local
    // draw rect is transposed so the rotated tall line fills contentWidth x
    // height exactly.
    canvas.translate(0, height);
    canvas.rotate(-90, 0, 0);
    canvas.drawImageRect(
      image,
      Skia.XYWHRect(0, 0, image.width(), image.height()),
      Skia.XYWHRect(0, 0, height, contentWidth),
      Skia.Paint(),
      true,
    );
    canvas.restore();
  } else {
    canvas.drawImageRect(
      image,
      Skia.XYWHRect(0, 0, image.width(), image.height()),
      Skia.XYWHRect(0, 0, contentWidth, height),
      Skia.Paint(),
      true,
    );
  }

  const raw = surface.makeImageSnapshot().readPixels(0, 0, {
    width: contentWidth,
    height,
    colorType: ColorType.RGBA_8888,
    alphaType: AlphaType.Unpremul,
  });
  if (!raw) throw new OcrRuntimeError("Could not read OCR surface pixels.");
  return { pixels: raw as Uint8Array, contentWidth };
}

export interface TensorLike {
  data: Float32Array | Int32Array | BigInt64Array | Uint8Array;
  dims: readonly number[];
}

export function asTensor(value: unknown): TensorLike {
  if (!value || typeof value !== "object") {
    throw new OcrRuntimeError("OCR model returned a non-tensor value.");
  }
  return value as TensorLike;
}
