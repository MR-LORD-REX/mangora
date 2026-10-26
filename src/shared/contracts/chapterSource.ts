import type { LucideIcon } from "lucide-react-native";

/** Supported chapter list sort fields in the shared viewer. */
export type ChapterSortField = "number" | "date" | "alpha";
export type SortDirection = "asc" | "desc";

export interface SharedTag {
  /** Stable id used for filter/search deep links (slug, uuid, numeric id?). */
  key: string;
  /** Human readable label shown on the chip. */
  label: string;
  /** Optional raw provider payload kept for main-screen lookups. */
  raw?: unknown;
}

/** Normalized "about this manga" info every chapter source can provide. */
export interface ChapterMeta {
  title: string;
  coverUrl?: string | null;
  subtitle?: string | null;
  author?: string | null;
  artist?: string | null;
  description?: string | null;
  chips?: string[];
  extraMeta?: { icon: LucideIcon; text: string }[];
  tags?: SharedTag[];
  tagSections?: { title: string; tags: SharedTag[] }[];
  sourceUrl?: string | null;
}

/**
 * One row in the chapter list. A row can be a real chapter or a section header
 * used by some extension sources to group uploads.
 */
export interface ViewerChapterRow {
  key: string;
  kind: "chapter" | "section";
  sectionKey?: string;
  sectionLabel?: string;
  title: string;
  subtitle?: string | null;
  scanGroup?: string | null;
  groupKey?: string | null;
  number?: number | null;
  date?: number | null;
  dateLabel?: string | null;
  pageCount?: number | null;
  languageCode?: string | null;
  progressKey?: string;
  nested?: boolean;
  raw?: unknown;
}

export interface LanguageOption {
  code: string;
  label: string;
}

export interface ChapterViewerData {
  meta: ChapterMeta;
  rows: ViewerChapterRow[];
  languages?: LanguageOption[];
  library?: { id: string; aliases?: string[] };
  offline?: boolean;
}

export interface LibraryMangaInput {
  provider: string;
  providerMangaId: string;
  providerMangaAliases?: string[];
  title: string;
  thumbnailUrl?: string | null;
  description?: string | null;
}

export interface TrackedChapterProgress {
  status: "unread" | "reading" | "completed";
  lastPageIndex: number;
  lastPageCount: number | null;
}

export type ProgressMap = Record<string, TrackedChapterProgress>;

export interface SourceProgressQuery {
  provider: string;
  providerMangaIds: string[];
  toChapterKey?: (providerChapterId: string) => string;
}

export interface OpenChapterContext {
  identity: string;
  meta: ChapterMeta;
  coverUrl?: string | null;
}

export interface ChapterWriteIdentity {
  providerChapterId: string;
  chapterNumber?: number | null;
  scanlationGroup?: string | null;
  chapterGroupKey?: string | null;
  languageCode?: string | null;
}

/** Provider-backed chapter loading contract consumed by the manga screen. */
export interface ChapterSourceModule {
  provider: string;
  accent: string;
  label: string;
  decodeIdentity(param: string): string;
  load(
    identity: string,
    options?: { language?: string; thumbnailUrl?: string | null },
  ): Promise<ChapterViewerData>;
  progressQuery(identity: string): SourceProgressQuery;
  library(identity: string, meta: ChapterMeta): {
    id: string;
    aliases?: string[];
  };
  openChapter(row: ViewerChapterRow, context: OpenChapterContext): Promise<void>;
  chapterWriteIdentity?(row: ViewerChapterRow): ChapterWriteIdentity | null;
  openChapterFallback?(row: ViewerChapterRow, context: OpenChapterContext): void;
  openSite?(identity: string, meta: ChapterMeta): void;
  openTag?(tag: SharedTag): void;
}
