import type {
  ChapterMeta,
  ChapterViewerData,
  SharedTag,
  ViewerChapterRow,
} from "@/components/manga/types";

export interface SourceProgressQuery {
  provider: string;
  providerMangaIds: string[];
  /** Optional transform applied to stored chapter ids (encoded urls etc.). */
  toChapterKey?: (providerChapterId: string) => string;
}

export interface OpenChapterContext {
  /** Decoded provider manga identity. */
  identity: string;
  meta: ChapterMeta;
  coverUrl?: string | null;
}

/** Provider chapter identity used by the shared viewer to persist read state. */
export interface ChapterWriteIdentity {
  providerChapterId: string;
  chapterNumber?: number | null;
  scanlationGroup?: string | null;
  chapterGroupKey?: string | null;
  languageCode?: string | null;
}

/**
 * A chapter-based manga viewer source. Every provider implements this and the
 * shared `ChapterMangaViewer` renders it identically.
 */
export interface ChapterSourceModule {
  provider: string;
  accent: string;
  label: string;
  /** Turn the route param into the raw provider identity (url/id/slug). */
  decodeIdentity(param: string): string;
  /** Loads details + chapter rows for the identity. */
  load(
    identity: string,
    options?: { language?: string; thumbnailUrl?: string | null },
  ): Promise<ChapterViewerData>;
  /** Progress lookup used to mark read/reading chapters. */
  progressQuery(identity: string): SourceProgressQuery;
  /** Persisted library identity + aliases for this manga. */
  library(identity: string, meta: ChapterMeta): {
    id: string;
    aliases?: string[];
  };
  /** Called when the user taps a chapter row / read-from-start / latest. */
  openChapter(row: ViewerChapterRow, context: OpenChapterContext): Promise<void>;
  /** Maps a viewer row to the identity the library persists for it. */
  chapterWriteIdentity?(row: ViewerChapterRow): ChapterWriteIdentity | null;
  /** Optional fallback when a chapter cannot be read natively. */
  openChapterFallback?(row: ViewerChapterRow, context: OpenChapterContext): void;
  /** Optional deep-link to this manga on the provider's site. */
  openSite?(identity: string, meta: ChapterMeta): void;
  /** Called when a genre/tag chip is tapped. */
  openTag?(tag: SharedTag): void;
}
