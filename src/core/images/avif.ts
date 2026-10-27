/**
 * avif.ts
 * ---------------------------------------------------------------------------
 * AVIF page support.
 *
 * Some extension CDNs (Atsumaru, for example) serve `.avif` pages. Neither
 * Skia's image decoder nor Android's platform/Fresco pipeline can open them in
 * this app, so every AVIF page is transcoded once to PNG by the native
 * `MangoraAvif` module (libavif/AOM) and cached.
 *
 * The helpers here are deliberately dependency-light: `pageOcr.ts` owns the
 * download cache and calls into this file after the bytes are on disk.
 * ---------------------------------------------------------------------------
 */

import { NativeModules, Platform } from "react-native";
import { Directory, File, Paths } from "expo-file-system";

interface AvifNativeModule {
  transcodeToPng(sourcePath: string, destPath: string): Promise<string>;
}

const CACHE_DIR_NAME = "trapp-avif";
const transcodeCache = new Map<string, Promise<string>>();
let cacheDirectoryPromise: Promise<Directory> | null = null;

function nativeAvif(): AvifNativeModule | null {
  if (Platform.OS !== "android") return null;
  const module = NativeModules.MangoraAvif as AvifNativeModule | undefined;
  return module && typeof module.transcodeToPng === "function" ? module : null;
}

/** True when the linked build can decode AVIF pages. */
export function isAvifTranscoderAvailable(): boolean {
  return nativeAvif() !== null;
}

/** Recognises AVIF urls (query string / fragment ignored). */
export function isAvifUri(uri: string): boolean {
  const path = uri.split(/[?#]/)[0].toLowerCase();
  return path.endsWith(".avif");
}

function hashString(input: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

async function getCacheDirectory(): Promise<Directory> {
  if (!cacheDirectoryPromise) {
    cacheDirectoryPromise = (async () => {
      const dir = new Directory(Paths.cache, CACHE_DIR_NAME);
      dir.create({ idempotent: true, intermediates: true });
      return dir;
    })();
  }
  return cacheDirectoryPromise;
}

/**
 * Transcodes one local AVIF file to a cached PNG and returns its `file://` uri.
 * Repeated calls for the same source share one transcode.
 */
export async function transcodeAvifToPng(sourceUri: string): Promise<string> {
  const cached = transcodeCache.get(sourceUri);
  if (cached) return cached;

  const module = nativeAvif();
  if (!module) {
    throw new Error(
      "AVIF decoding needs a development build with the MangoraAvif native module.",
    );
  }

  const transcode = (async () => {
    const dir = await getCacheDirectory();
    const dest = new File(
      dir,
      `avif-${hashString(sourceUri)}.png`,
    );
    if (dest.exists && dest.size > 0) return dest.uri;
    return module.transcodeToPng(sourceUri, dest.uri);
  })();

  transcodeCache.set(sourceUri, transcode);
  try {
    return await transcode;
  } catch (error) {
    transcodeCache.delete(sourceUri);
    throw error;
  }
}
