/**
 * Native extension host facade.
 *
 * Only this adapter talks to `MangoraExtensions`. Every call parses JSON at
 * the edge so 64-bit source ids stay strings. Feature code imports typed
 * operations from here; it must not reach into the Android module directly.
 */

import { NativeModules, Platform } from "react-native";

import type {
  ExtensionFilterPatch,
  ExtensionSourceRecord,
  InstalledExtensionRecord,
  NativeChapter,
  NativeFilter,
  NativeMangaDetails,
  NativeMangaPage,
  NativePageList,
} from "@platform/extensions/types";

interface MangoraExtensionsModule {
  listInstalled(): Promise<string>;
  listSources(): Promise<string>;
  requestUninstall(packageName: string): Promise<void>;
  inspectApk(path: string): Promise<string>;
  getPopular(sourceId: string, page: number): Promise<string>;
  getLatest(sourceId: string, page: number): Promise<string>;
  search(sourceId: string, page: number, query: string, filtersJson: string): Promise<string>;
  getManga(sourceId: string, url: string): Promise<string>;
  getChapters(sourceId: string, url: string): Promise<string>;
  getPages(sourceId: string, chapterUrl: string, memoJson: string, mangaId: string): Promise<string>;
  fetchPageImage(sourceId: string, imageUrl: string, pageUrl: string): Promise<string>;
  getMangaUrl(sourceId: string, url: string): Promise<string>;
  getChapterUrl(sourceId: string, url: string): Promise<string>;
  getHeaders(sourceId: string): Promise<string>;
  getFilters(sourceId: string): Promise<string>;
}

const native = NativeModules.MangoraExtensions as MangoraExtensionsModule | undefined;

export interface InspectedExtensionApk {
  packageName: string;
  name: string;
  versionName: string;
  versionCode: number | string;
  extensionLib: string;
  nsfw: boolean;
  sourceClass: string | null;
  signatureSha256: string | null;
}

export interface NativePageImage {
  path: string;
  mime: string;
}

export function hasNativeExtensions(): boolean {
  return Platform.OS === "android" && native != null && typeof native.listInstalled === "function";
}

function requireNative(): MangoraExtensionsModule {
  if (!native) {
    throw new Error("The extension host is not in this build. Rebuild the Android app.");
  }
  return native;
}

function parse<T>(json: string): T {
  return JSON.parse(json) as T;
}

export async function listInstalledExtensions(): Promise<InstalledExtensionRecord[]> {
  if (!native) return [];
  return parse<InstalledExtensionRecord[]>(await native.listInstalled());
}

export async function requestExtensionUninstall(packageName: string): Promise<void> {
  await requireNative().requestUninstall(packageName);
}

export async function listNativeSources(): Promise<ExtensionSourceRecord[]> {
  if (!native) return [];
  return parse<ExtensionSourceRecord[]>(await native.listSources());
}

export async function inspectExtensionApk(path: string): Promise<InspectedExtensionApk> {
  return parse<InspectedExtensionApk>(await requireNative().inspectApk(path));
}

export async function getExtensionPopular(sourceId: string, page: number): Promise<NativeMangaPage> {
  return parse<NativeMangaPage>(await requireNative().getPopular(sourceId, page));
}

export async function getExtensionLatest(sourceId: string, page: number): Promise<NativeMangaPage> {
  return parse<NativeMangaPage>(await requireNative().getLatest(sourceId, page));
}

export async function searchExtension(
  sourceId: string,
  page: number,
  query: string,
  filters: ExtensionFilterPatch[] = [],
): Promise<NativeMangaPage> {
  return parse<NativeMangaPage>(
    await requireNative().search(sourceId, page, query, JSON.stringify(filters)),
  );
}

export async function getExtensionManga(sourceId: string, url: string): Promise<NativeMangaDetails> {
  return parse<NativeMangaDetails>(await requireNative().getManga(sourceId, url));
}

export async function getExtensionChapters(sourceId: string, url: string): Promise<{ chapters: NativeChapter[] }> {
  return parse<{ chapters: NativeChapter[] }>(await requireNative().getChapters(sourceId, url));
}

export async function getExtensionPages(
  sourceId: string,
  chapterUrl: string,
  memoJson = "{}",
  mangaId = "",
): Promise<NativePageList> {
  return parse<NativePageList>(
    await requireNative().getPages(sourceId, chapterUrl, memoJson, mangaId),
  );
}

/**
 * Fetches a page image through the extension's own client, so its
 * ImageInterceptor (headers, Cloudflare cookies, decryption/descrambling) runs
 * before the bytes reach the reader or downloader.
 */
export async function fetchExtensionPageImage(
  sourceId: string,
  imageUrl: string,
  pageUrl = "",
): Promise<NativePageImage> {
  return parse<NativePageImage>(await requireNative().fetchPageImage(sourceId, imageUrl, pageUrl));
}

export async function getExtensionMangaUrl(sourceId: string, url: string): Promise<string> {
  return parse<{ url: string }>(await requireNative().getMangaUrl(sourceId, url)).url;
}

export async function getExtensionChapterUrl(sourceId: string, url: string): Promise<string> {
  return parse<{ url: string }>(await requireNative().getChapterUrl(sourceId, url)).url;
}

export async function getExtensionHeaders(sourceId: string): Promise<Record<string, string>> {
  return parse<{ headers: Record<string, string> }>(await requireNative().getHeaders(sourceId)).headers;
}

export async function getExtensionFilters(sourceId: string): Promise<NativeFilter[]> {
  return parse<{ filters: NativeFilter[] }>(await requireNative().getFilters(sourceId)).filters;
}