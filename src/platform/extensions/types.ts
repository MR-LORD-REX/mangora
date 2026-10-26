/**
 * Extension package data contracts.
 *
 * This module is product-agnostic at the transport boundary: it describes what
 * the native extension host and a repository index return. Feature policy,
 * caching and UI live in `@features/extensions`.
 */

export interface ExtensionSourceRecord {
  id: string;
  name: string;
  lang: string;
  packageName: string;
  nsfw: boolean;
}

export interface InstalledExtensionRecord {
  packageName: string;
  name: string;
  versionName: string;
  versionCode: number | string;
  sourceDir: string;
  extensionLib: string;
  nsfw: boolean;
  signatureSha256: string | null;
  sources: ExtensionSourceRecord[];
  error: string | null;
}

export interface RepoSource {
  id: string;
  name: string;
  language: string;
  homeUrl?: string | null;
}

export interface RepoExtension {
  name: string;
  packageName: string;
  resources: {
    apkUrl: string;
    iconUrl?: string | null;
    jarUrl?: string | null;
  };
  extensionLib: string;
  versionCode: string;
  versionName: string;
  contentWarning?: string | null;
  sources: RepoSource[];
}

export interface ExtensionRepo {
  url: string;
  sourceUrl: string;
  name: string;
  badgeLabel?: string | null;
  signingKey: string | null;
  fetchedAt: number;
  extensions: RepoExtension[];
}

export interface ExtensionCatalogEntry extends RepoExtension {
  repoUrl: string;
  signingKey: string | null;
}

export interface NativeManga {
  url: string;
  title: string;
  thumbnailUrl: string | null;
  artist: string | null;
  author: string | null;
  status: number;
  description: string | null;
  genre: string | null;
  genres: string[];
}

export interface NativeChapter {
  url: string;
  name: string;
  chapterNumber: number | null;
  scanlator: string | null;
  dateUpload: number;
  memo?: Record<string, unknown>;
}

export interface NativeMangaPage {
  headers: Record<string, string>;
  mangas: NativeManga[];
  hasNextPage: boolean;
}

export interface NativeMangaDetails {
  manga: NativeManga;
  chapters: NativeChapter[];
  headers: Record<string, string>;
  mangaUrl: string;
}

export interface NativePageList {
  headers: Record<string, string>;
  pages: { index: number; url: string; imageUrl: string }[];
}

export type NativeFilterType =
  | "header"
  | "separator"
  | "select"
  | "tristate"
  | "checkbox"
  | "text"
  | "sort"
  | "group"
  | "unknown";

export interface NativeFilter {
  /** Dot path into the native FilterList, e.g. "4.2". */
  path: string;
  name: string;
  type: NativeFilterType;
  values?: unknown[];
  state?: unknown;
  children?: NativeFilter[];
}

export interface ExtensionFilterPatch {
  path: string;
  state: unknown;
}