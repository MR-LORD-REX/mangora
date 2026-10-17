import type { LucideIcon } from "lucide-react-native";

import type { TrackedChapterProgress } from "@/services/library/librarySync";

/** Supported chapter list sort fields in the shared viewer. */
export type ChapterSortField = "number" | "date" | "alpha";
export type SortDirection = "asc" | "desc";

export interface SharedTag {
  /** Stable id used for filter/search deep links (slug, uuid, numeric id…). */
  key: string;
  /** Human readable label shown on the chip. */
  label: string;
  /** Optional raw provider payload (tag object) kept for main-screen lookups. */
  raw?: unknown;
}

/** Normalized "about this manga" info every chapter source can provide. */
export interface ChapterMeta {
  title: string;
  coverUrl?: string | null;
  /** Secondary title (alt / japanese title). */
  subtitle?: string | null;
  author?: string | null;
  artist?: string | null;
  description?: string | null;
  /** Small status / type / rating chips. */
  chips?: string[];
  /** Key-value metadata rows rendered under the cover. */
  extraMeta?: { icon: LucideIcon; text: string }[];
  /** Single flat genre/tag list. */
  tags?: SharedTag[];
  /** Grouped tag sections returned by some extension sources. */
  tagSections?: { title: string; tags: SharedTag[] }[];
  /** Canonical web URL on the provider, when one exists. */
  sourceUrl?: string | null;
}

/**
 * One row in the chapter list. A row can either be a real chapter or a
 * section header used by some extension sources to group uploads.
 */
export interface ViewerChapterRow {
  key: string;
  kind: "chapter" | "section";
  /** Group id used when sorting sections. */
  sectionKey?: string;
  /** Header text like "Chapter 45" shown when kind === "section". */
  sectionLabel?: string;
  /** Display title, e.g. "Chapter 1191: Loki is Here". */
  title: string;
  /** Secondary line (scanlation group, uploader…). */
  subtitle?: string | null;
  /** Scanlation group name for the Groups filter (null = no group). */
  scanGroup?: string | null;
  /** Canonical key of the main chapter this upload belongs to ("45", "Oneshot"...). */
  groupKey?: string | null;
  /** Parsed chapter number used for numeric sorting. */
  number?: number | null;
  /** Epoch milliseconds for date sorting / display. */
  date?: number | null;
  /** Pre-formatted date used when no epoch is available. */
  dateLabel?: string | null;
  pageCount?: number | null;
  languageCode?: string | null;
  /** Key into the progress map returned by getTrackedChapterProgress. */
  progressKey?: string;
  /** True when this row is rendered nested under a main chapter header. */
  nested?: boolean;
  /** Original provider payload passed back to the source module. */
  raw?: unknown;
}

export interface LanguageOption {
  code: string;
  label: string;
}

export interface ChapterViewerData {
  meta: ChapterMeta;
  rows: ViewerChapterRow[];
  /** When present the viewer renders a language selector chip row. */
  languages?: LanguageOption[];
  /** Identity used to persist to the library. */
  library?: { id: string; aliases?: string[] };
  /** True when the data came from the database because the network failed. */
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

export type ProgressMap = Record<string, TrackedChapterProgress>;