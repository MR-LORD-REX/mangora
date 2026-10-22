/**
 * decode.ts
 * ---------------------------------------------------------------------------
 * Small, dependency-light image validation helpers shared by the downloader
 * and reader processing paths. A file counts as an image only when the
 * platform decoder can actually open it (AVIF is transcoded first).
 */

import { File } from "expo-file-system";
import { Image } from "react-native";

import { isAvifUri, transcodeAvifToPng } from "./avif";

const DEFAULT_TIMEOUT_MS = 12_000;

function getImageSize(uri: string, timeoutMs: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    try {
      Image.getSize(
        uri,
        (width, height) => {
          clearTimeout(timer);
          finish(width > 0 && height > 0);
        },
        () => {
          clearTimeout(timer);
          finish(false);
        },
      );
    } catch {
      clearTimeout(timer);
      finish(false);
    }
  });
}

/** True when the local file exists, is non-empty and decodes as an image. */
export async function isDecodableImageUri(
  uri: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<boolean> {
  if (!uri) return false;
  try {
    if (uri.startsWith("file://")) {
      const file = new File(uri);
      if (!file.exists || file.size <= 0) return false;
    }
    const source = isAvifUri(uri) ? await transcodeAvifToPng(uri) : uri;
    return await getImageSize(source, timeoutMs);
  } catch {
    return false;
  }
}

/** Throws a descriptive error when a page image cannot be decoded. */
export async function assertDecodableImageUri(
  uri: string,
  label: string,
): Promise<void> {
  if (!(await isDecodableImageUri(uri))) {
    throw new Error(`${label} is not a decodable image.`);
  }
}
