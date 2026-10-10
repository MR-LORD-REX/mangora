/**
 * philiaDecrypt.ts
 * ---------------------------------------------------------------------------
 * Native descrambler for Philia Scans (philiascans.org) reader pages.
 *
 * The site serves DRM-wrapped WebP blobs. The container is:
 *
 *   byte 0         0xFF magic (schemes 2/3/4 only)
 *   byte 1         scheme: 2 = aesctr, 3 = chacha20, 4 = aesctr4
 *   bytes 2..3     big-endian u16 width  D
 *   bytes 4..5     big-endian u16 height N
 *   bytes 6..      encrypted payload (header is 6 bytes for 2/3/4)
 *
 * For the legacy no-magic container the 4-byte header encodes D/N directly
 * and the payload is an XOR keystream stream.
 *
 * Decryption (ported from the site bundle, verified byte-exact):
 *   scheme 4  AES-256-CTR  key = HMAC-SHA256(chapterKey, "aesctr4:" + idx)
 *             -> a complete WebP (no tile shuffle)
 *   scheme 3  ChaCha20     key = HMAC-SHA256(chapterKey, "cc:" + idx)
 *             -> a complete WebP (no tile shuffle)
 *   scheme 2  AES-256-CTR  key = HMAC-SHA256(chapterKey, "aesctr:" + idx)
 *             -> tile-scrambled WebP, needs the permutation below
 *   none      XOR keystream HMAC-SHA256(chapterKey, "page:" + idx + ":" + blk)
 *             -> tile-scrambled WebP
 *
 * Scheme 2 / none place the decoded WebP on a padded grid; the Fisher-Yates
 * permutation is derived from HMAC-SHA256(chapterKey, "tiles:" + idx) and the
 * tiles are reassembled with Skia, then cropped to D x N.
 *
 * AES-CTR counter is 16 zero bytes with a 128-bit counter width, matching
 * WebCrypto; crypto-js increments the same way for the first 2^32 blocks.
 * ---------------------------------------------------------------------------
 */

import CryptoJS from "crypto-js";
import { Directory, File, Paths } from "expo-file-system";

import { PhiliaScansClient } from "./philia";
import { DEFAULT_HEADERS } from "./philia.types";

const PHILIA_REFERER = "https://philiascans.org/";
const PAGE_CACHE_DIR = "philia-pages";
const READER_CONCURRENCY = 3;

export interface PhiliaDrmContext {
  chapterKeyB64: string;
  gridSize: number;
  scrambled: boolean;
}

type WordArray = CryptoJS.lib.WordArray;

function base64ToWordArray(value: string): WordArray {
  return CryptoJS.enc.Base64.parse(value);
}

function wordArrayToBytes(wa: WordArray): Uint8Array {
  const { words, sigBytes } = wa;
  const out = new Uint8Array(sigBytes);
  for (let i = 0; i < sigBytes; i += 1) {
    out[i] = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
  }
  return out;
}

function bytesToWordArray(bytes: Uint8Array): WordArray {
  const words: number[] = [];
  for (let i = 0; i < bytes.length; i += 1) {
    words[i >>> 2] = (words[i >>> 2] ?? 0) | (bytes[i] << (24 - (i % 4) * 8));
  }
  return CryptoJS.lib.WordArray.create(words, bytes.length);
}

function deriveKey(chapterKey: WordArray, label: string, pageIndex: number): WordArray {
  return CryptoJS.HmacSHA256(CryptoJS.enc.Utf8.parse(`${label}${pageIndex}`), chapterKey);
}

function base64ToBytes(value: string): Uint8Array {
  const wa = CryptoJS.enc.Base64.parse(value);
  return wordArrayToBytes(wa);
}

/** Native WebCrypto AES-CTR when the runtime exposes it (fast on Hermes). */
async function webcryptoAesCtr(
  chapterKeyB64: string,
  label: string,
  pageIndex: number,
  payload: Uint8Array,
): Promise<Uint8Array | null> {
  const subtle = (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto
    ?.subtle;
  if (!subtle) return null;
  try {
    const hmacKey = await subtle.importKey(
      "raw",
      base64ToBytes(chapterKeyB64) as unknown as BufferSource,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const digest = new Uint8Array(
      await subtle.sign(
        "HMAC",
        hmacKey,
        new TextEncoder().encode(`${label}${pageIndex}`),
      ),
    );
    const aesKey = await subtle.importKey("raw", digest, { name: "AES-CTR" }, false, [
      "decrypt",
    ]);
    const decrypted = await subtle.decrypt(
      { name: "AES-CTR", counter: new Uint8Array(16), length: 128 },
      aesKey,
      payload as unknown as BufferSource,
    );
    return new Uint8Array(decrypted);
  } catch {
    return null;
  }
}

function aesCtrDecrypt(payload: Uint8Array, key: WordArray): Uint8Array {
  const iv = CryptoJS.lib.WordArray.create([0, 0, 0, 0], 16);
  const cipher = CryptoJS.lib.CipherParams.create({ ciphertext: bytesToWordArray(payload) });
  const decrypted = CryptoJS.AES.decrypt(cipher, key, {
    iv,
    mode: CryptoJS.mode.CTR,
    padding: CryptoJS.pad.NoPadding,
  });
  return wordArrayToBytes(decrypted);
}

function deriveXorKeystream(chapterKey: WordArray, pageIndex: number, length: number): Uint8Array {
  if (length === 0) return new Uint8Array(0);
  const blocks = Math.ceil(length / 32);
  const out = new Uint8Array(blocks * 32);
  for (let block = 0; block < blocks; block += 1) {
    const digest = CryptoJS.HmacSHA256(
      CryptoJS.enc.Utf8.parse(`page:${pageIndex}:${block}`),
      chapterKey,
    );
    out.set(wordArrayToBytes(digest), block * 32);
  }
  return out.subarray(0, length);
}

// ── ChaCha20 (RFC 8439) — ported from the site bundle ───────────────────────

function rotl(value: number, shift: number): number {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

function quarterRound(
  x: Uint32Array,
  a: number,
  b: number,
  c: number,
  d: number,
): void {
  x[a] = (x[a] + x[b]) >>> 0;
  x[d] = rotl(x[d] ^ x[a], 16);
  x[c] = (x[c] + x[d]) >>> 0;
  x[b] = rotl(x[b] ^ x[c], 12);
  x[a] = (x[a] + x[b]) >>> 0;
  x[d] = rotl(x[d] ^ x[a], 8);
  x[c] = (x[c] + x[d]) >>> 0;
  x[b] = rotl(x[b] ^ x[c], 7);
}

function readUint32LE(bytes: Uint8Array): Uint32Array {
  const count = bytes.length >>> 2;
  const out = new Uint32Array(count);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 0; i < count; i += 1) out[i] = view.getUint32(4 * i, true);
  return out;
}

function chacha20Xor(
  data: Uint8Array,
  key: Uint8Array,
  nonce: Uint8Array,
  counter = 0,
): Uint8Array {
  if (key.length !== 32) throw new Error("philia: chacha20 key must be 32 bytes");
  if (nonce.length !== 12) throw new Error("philia: chacha20 nonce must be 12 bytes");
  const keyWords = readUint32LE(key);
  const nonceWords = readUint32LE(nonce);
  const state = new Uint32Array(16);
  state[0] = 0x61707865;
  state[1] = 0x3320646e;
  state[2] = 0x79622d32;
  state[3] = 0x6b206574;
  state[4] = keyWords[0];
  state[5] = keyWords[1];
  state[6] = keyWords[2];
  state[7] = keyWords[3];
  state[8] = keyWords[4];
  state[9] = keyWords[5];
  state[10] = keyWords[6];
  state[11] = keyWords[7];
  state[13] = nonceWords[0];
  state[14] = nonceWords[1];
  state[15] = nonceWords[2];
  const working = new Uint32Array(16);
  let blockCounter = counter >>> 0;
  for (let offset = 0; offset < data.length; offset += 64) {
    state[12] = blockCounter;
    blockCounter = (blockCounter + 1) >>> 0;
    working.set(state);
    for (let round = 0; round < 10; round += 1) {
      quarterRound(working, 0, 4, 8, 12);
      quarterRound(working, 1, 5, 9, 13);
      quarterRound(working, 2, 6, 10, 14);
      quarterRound(working, 3, 7, 11, 15);
      quarterRound(working, 0, 5, 10, 15);
      quarterRound(working, 1, 6, 11, 12);
      quarterRound(working, 2, 7, 8, 13);
      quarterRound(working, 3, 4, 9, 14);
    }
    for (let i = 0; i < 16; i += 1) working[i] = (working[i] + state[i]) >>> 0;
    const span = Math.min(64, data.length - offset);
    for (let i = 0; i < span; i += 1) {
      data[offset + i] ^= (working[i >>> 2] >>> ((3 & i) << 3)) & 0xff;
    }
  }
  return data;
}

// ── Tile permutation ────────────────────────────────────────────────────────

function derivePermutation(tilesHmac: Uint8Array, gridSize: number): number[] {
  if (!Number.isInteger(gridSize) || gridSize < 1) {
    throw new Error("philia: gridSize must be a positive integer");
  }
  const size = gridSize * gridSize;
  const perm = Array.from({ length: size }, (_, i) => i);
  if (size < 2) return perm;

  const hmacKey = bytesToWordArray(tilesHmac);
  let counter = 0;
  let view: DataView | null = null;
  let offset = 0;
  const next = (): number => {
    if (view === null || offset >= 8) {
      const digest = CryptoJS.HmacSHA256(
        CryptoJS.enc.Utf8.parse(`perm:${counter}`),
        hmacKey,
      );
      counter += 1;
      const bytes = wordArrayToBytes(digest);
      view = new DataView(bytes.buffer, bytes.byteOffset, 32);
      offset = 0;
    }
    const value = view.getUint32(4 * offset, true);
    offset += 1;
    return value;
  };

  for (let e = size - 1; e >= 1; e -= 1) {
    const t = next() % (e + 1);
    const tmp = perm[e];
    perm[e] = perm[t];
    perm[t] = tmp;
  }
  return perm;
}

function invertPermutation(perm: number[]): number[] {
  const inverse = new Array<number>(perm.length);
  for (let i = 0; i < perm.length; i += 1) inverse[perm[i]] = i;
  return inverse;
}

interface SkiaModule {
  Skia: {
    Data: { fromBytes: (bytes: Uint8Array) => unknown };
    Image: { MakeImageFromEncoded: (data: unknown) => SkiaImage | null };
    Surface: { MakeOffscreen: (w: number, h: number) => SkiaSurface | null };
    Paint: () => unknown;
    XYWHRect: (x: number, y: number, w: number, h: number) => unknown;
  };
  ImageFormat: { WEBP: unknown };
}

interface SkiaImage {
  width: () => number;
  height: () => number;
}

interface SkiaCanvas {
  drawImageRect: (
    image: SkiaImage,
    src: unknown,
    dest: unknown,
    paint: unknown,
  ) => void;
  drawImage: (image: SkiaImage, x: number, y: number) => void;
}

interface SkiaSurface {
  getCanvas: () => SkiaCanvas;
  makeImageSnapshot: () => { encodeToBytes: (fmt?: unknown, quality?: number) => Uint8Array };
}

let cachedSkia: SkiaModule | null = null;
function loadSkia(): SkiaModule {
  if (cachedSkia) return cachedSkia;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("@shopify/react-native-skia") as SkiaModule;
  if (!mod?.Skia) {
    throw new Error(
      "Philia Scans: tile unscrambling needs the Skia native module (dev build).",
    );
  }
  cachedSkia = mod;
  return mod;
}

function unscrambleToWebp(
  webpBytes: Uint8Array,
  width: number,
  height: number,
  gridSize: number,
  tilesHmac: Uint8Array,
): Uint8Array {
  const { Skia, ImageFormat } = loadSkia();
  const image = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(webpBytes));
  if (!image) throw new Error("Philia Scans: could not decode scrambled page");

  const paddedW = image.width();
  const paddedH = image.height();
  const expectedW = Math.ceil(width / gridSize) * gridSize;
  const expectedH = Math.ceil(height / gridSize) * gridSize;
  if (paddedW !== expectedW || paddedH !== expectedH) {
    throw new Error(
      `Philia Scans: scrambled dims mismatch ${paddedW}x${paddedH} (expected ${expectedW}x${expectedH})`,
    );
  }

  const inverse = invertPermutation(derivePermutation(tilesHmac, gridSize));
  const tileW = paddedW / gridSize;
  const tileH = paddedH / gridSize;

  const surface = Skia.Surface.MakeOffscreen(paddedW, paddedH);
  if (!surface) throw new Error("Philia Scans: no Skia surface for unscrambling");
  const canvas = surface.getCanvas();
  const paint = Skia.Paint();
  for (let t = 0; t < gridSize * gridSize; t += 1) {
    const n = inverse[t];
    const srcX = (n % gridSize) * tileW;
    const srcY = Math.floor(n / gridSize) * tileH;
    const dstX = (t % gridSize) * tileW;
    const dstY = Math.floor(t / gridSize) * tileH;
    canvas.drawImageRect(
      image,
      Skia.XYWHRect(srcX, srcY, tileW, tileH),
      Skia.XYWHRect(dstX, dstY, tileW, tileH),
      paint,
    );
  }

  const snapshot = surface.makeImageSnapshot();
  const crop = Skia.Surface.MakeOffscreen(width, height);
  if (!crop) throw new Error("Philia Scans: no Skia surface for crop");
  crop.getCanvas().drawImage(snapshot as unknown as SkiaImage, 0, 0);
  const finalImage = crop.makeImageSnapshot();
  const encoded = finalImage.encodeToBytes(ImageFormat.WEBP, 95);
  return encoded instanceof Uint8Array ? encoded : new Uint8Array(encoded);
}

interface ParsedBlob {
  scheme: number;
  width: number;
  height: number;
  payload: Uint8Array;
}

function parseBlob(bytes: Uint8Array): ParsedBlob {
  if (bytes.length < 4) throw new Error("Philia Scans: encrypted page too short");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = bytes[0] === 0xff && [2, 3, 4].includes(bytes[1]);
  if (magic) {
    const scheme = bytes[1];
    if (bytes.length < 6) throw new Error("Philia Scans: truncated page header");
    return {
      scheme,
      width: view.getUint16(2, false),
      height: view.getUint16(4, false),
      payload: bytes.subarray(6),
    };
  }
  return {
    scheme: 0,
    width: view.getUint16(0, false),
    height: view.getUint16(2, false),
    payload: bytes.subarray(4),
  };
}

/** Decrypts one raw page blob into a complete, renderable WebP. */
export async function decodePhiliaPageBlob(
  raw: Uint8Array,
  context: PhiliaDrmContext,
  pageIndex: number,
): Promise<Uint8Array> {
  const { scheme, width, height, payload } = parseBlob(raw);
  const chapterKey = base64ToWordArray(context.chapterKeyB64);
  const gridSize = context.gridSize > 0 ? context.gridSize : 4;

  if (scheme === 4) {
    const fast = await webcryptoAesCtr(context.chapterKeyB64, "aesctr4:", pageIndex, payload);
    return fast ?? aesCtrDecrypt(payload, deriveKey(chapterKey, "aesctr4:", pageIndex));
  }
  if (scheme === 3) {
    const key = wordArrayToBytes(deriveKey(chapterKey, "cc:", pageIndex));
    return chacha20Xor(new Uint8Array(payload), key, new Uint8Array(12), 0);
  }
  if (scheme === 2) {
    const decrypted =
      (await webcryptoAesCtr(context.chapterKeyB64, "aesctr:", pageIndex, payload)) ??
      aesCtrDecrypt(payload, deriveKey(chapterKey, "aesctr:", pageIndex));
    const tilesHmac = wordArrayToBytes(
      CryptoJS.HmacSHA256(CryptoJS.enc.Utf8.parse(`tiles:${pageIndex}`), chapterKey),
    );
    return unscrambleToWebp(decrypted, width, height, gridSize, tilesHmac);
  }

  // Legacy no-magic container: XOR keystream + tile permutation.
  const keystream = deriveXorKeystream(chapterKey, pageIndex, payload.length);
  const decrypted = new Uint8Array(payload);
  for (let i = 0; i < decrypted.length; i += 1) decrypted[i] ^= keystream[i];
  const tilesHmac = wordArrayToBytes(
    CryptoJS.HmacSHA256(CryptoJS.enc.Utf8.parse(`tiles:${pageIndex}`), chapterKey),
  );
  return unscrambleToWebp(decrypted, width, height, gridSize, tilesHmac);
}

/** Loads the chapter key + grid size the downloader/reader need to decrypt. */
export async function loadPhiliaDrmContext(
  chapterId: number,
): Promise<PhiliaDrmContext> {
  const keys = await new PhiliaScansClient().getPageKeys(chapterId);
  return {
    chapterKeyB64: keys.chapterKeyB64,
    gridSize: keys.gridSize > 0 ? keys.gridSize : 4,
    scrambled: keys.scrambled,
  };
}

function pageCacheDir(): Directory {
  return new Directory(Paths.cache, PAGE_CACHE_DIR);
}

function pageCacheFile(chapterId: number, pageIndex: number): File {
  return new File(
    pageCacheDir(),
    `${chapterId}-${String(pageIndex).padStart(4, "0")}.webp`,
  );
}

async function fetchPageBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": DEFAULT_HEADERS["User-Agent"],
      Referer: PHILIA_REFERER,
      Accept: "image/webp,image/*,*/*;q=0.8",
    },
  });
  if (!response.ok) {
    throw new Error(`Philia Scans HTTP ${response.status}: ${url}`);
  }
  const buffer = await response.arrayBuffer();
  if (!buffer.byteLength) throw new Error(`Philia Scans: empty page from ${url}`);
  return new Uint8Array(buffer);
}

export interface PhiliaPageLike {
  url: string;
}

/**
 * A chapter whose pages are decrypted lazily, one page at a time, as the
 * reader asks for them. The reader renders immediately from `uris` (which
 * already point at the on-disk cache) and calls `ensurePhiliaPageAt` for the
 * indices it is about to show.
 */
export interface PhiliaProgressiveChapter {
  chapterId: number;
  context: PhiliaDrmContext;
  pages: PhiliaPageLike[];
  /** Cache file uris in reading order (present even before a page is ready). */
  uris: string[];
}

const progressiveChapters = new Map<number, PhiliaProgressiveChapter>();
const pageJobs = new Map<string, Promise<string>>();

type PhiliaPageListener = (chapterId: number, index: number) => void;
const pageListeners = new Set<PhiliaPageListener>();

function ensurePageCacheDir(): void {
  const directory = pageCacheDir();
  if (!directory.exists) directory.create({ intermediates: true, idempotent: true });
}

/** True when the descrambled WebP for one page is already on disk. */
export function isPhiliaPageCached(chapterId: number, index: number): boolean {
  const file = pageCacheFile(chapterId, index);
  return file.exists && file.size > 0;
}

/**
 * Registers a chapter for lazy descrambling. Returns the chapter with the
 * cache uris the reader should render (files may not exist yet).
 */
export function registerPhiliaProgressiveChapter(
  chapterId: number,
  context: PhiliaDrmContext,
  pages: PhiliaPageLike[],
): PhiliaProgressiveChapter {
  ensurePageCacheDir();
  const job: PhiliaProgressiveChapter = {
    chapterId,
    context,
    pages,
    uris: pages.map((_, index) => pageCacheFile(chapterId, index).uri),
  };
  progressiveChapters.set(chapterId, job);
  return job;
}

/** Indices of a chapter whose page is already cached (used to seed the reader). */
export function philiaCachedPageIndices(chapterId: number): number[] {
  try {
    const directory = pageCacheDir();
    if (!directory.exists) return [];
    const prefix = `${chapterId}-`;
    const indices: number[] = [];
    for (const entry of directory.list()) {
      if (!(entry instanceof File) || entry.size <= 0) continue;
      if (!entry.name.startsWith(prefix) || !entry.name.endsWith(".webp")) continue;
      const index = Number(entry.name.slice(prefix.length, -".webp".length));
      if (Number.isFinite(index)) indices.push(index);
    }
    return indices;
  } catch {
    return [];
  }
}

/** Fires after each page is decrypted (or found already cached). */
export function subscribePhiliaPageReady(
  listener: PhiliaPageListener,
): () => void {
  pageListeners.add(listener);
  return () => {
    pageListeners.delete(listener);
  };
}

function emitPhiliaPageReady(chapterId: number, index: number): void {
  for (const listener of pageListeners) {
    try {
      listener(chapterId, index);
    } catch {
      // A listener failure must not break the fetch pipeline.
    }
  }
}

/**
 * Downloads + decrypts one page on demand and caches it, deduplicating
 * concurrent requests. Resolves with the local uri, or null when the chapter
 * was not registered for progressive loading (e.g. a downloaded chapter).
 */
export async function ensurePhiliaPageAt(
  chapterId: number,
  index: number,
): Promise<string | null> {
  const job = progressiveChapters.get(chapterId);
  if (!job) return null;
  if (index < 0 || index >= job.pages.length) return null;
  if (isPhiliaPageCached(chapterId, index)) {
    emitPhiliaPageReady(chapterId, index);
    return pageCacheFile(chapterId, index).uri;
  }
  const key = `${chapterId}:${index}`;
  const inFlight = pageJobs.get(key);
  if (inFlight) return inFlight;
  const task = (async (): Promise<string> => {
    ensurePageCacheDir();
    const raw = await fetchPageBytes(job.pages[index].url);
    const webp = await decodePhiliaPageBlob(raw, job.context, index);
    const target = pageCacheFile(chapterId, index);
    if (target.exists) target.delete();
    target.create({ intermediates: true, overwrite: true });
    target.write(webp);
    emitPhiliaPageReady(chapterId, index);
    return target.uri;
  })().finally(() => {
    pageJobs.delete(key);
  });
  pageJobs.set(key, task);
  return task;
}

/**
 * Downloads, decrypts and caches every page of a chapter, returning local
 * `file://` WebP uris in reading order. Already-cached pages are reused.
 */
export async function descramblePhiliaChapterPages(
  chapterId: number,
  context: PhiliaDrmContext,
  pages: PhiliaPageLike[],
): Promise<string[]> {
  const directory = pageCacheDir();
  if (!directory.exists) {
    directory.create({ intermediates: true, idempotent: true });
  }

  const out: string[] = new Array(pages.length);
  let cursor = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= pages.length) return;

      const file = pageCacheFile(chapterId, index);
      if (file.exists && file.size > 0) {
        out[index] = file.uri;
        continue;
      }
      const raw = await fetchPageBytes(pages[index].url);
      const webp = await decodePhiliaPageBlob(raw, context, index);
      const target = pageCacheFile(chapterId, index);
      if (target.exists) target.delete();
      target.create({ intermediates: true, overwrite: true });
      target.write(webp);
      out[index] = target.uri;
    }
  };

  const workers = Math.max(1, Math.min(READER_CONCURRENCY, pages.length || 1));
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return out;
}

/** Clears the cached descrambled pages for one chapter. */
export function clearPhiliaChapterCache(chapterId: number): void {
  try {
    const directory = pageCacheDir();
    if (!directory.exists) return;
    const prefix = `${chapterId}-`;
    for (const entry of directory.list()) {
      if (entry instanceof File && entry.name.startsWith(prefix)) entry.delete();
    }
  } catch {
    // Cache cleanup is best effort.
  }
}
