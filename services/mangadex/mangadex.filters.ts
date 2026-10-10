import {
  CONTENT_RATINGS,
  DEFAULT_CONTENT_RATINGS,
  DEMOGRAPHICS,
  PUBLICATION_STATUSES,
  TAG_GROUPS,
} from "./mangadex.constants";
import type {
  ContentRating,
  Demographic,
  MangaOrder,
  MangaOrderKey,
  PublicationStatus,
  SearchParams,
  SortDirection,
} from "./mangadex.types";

export type TagMode = "AND" | "OR";

export interface MangaFilterState {
  hasAvailableChapters: boolean;
  originalLanguage: string[];
  contentRating: ContentRating[];
  publicationDemographic: Demographic[];
  status: PublicationStatus[];
  sortKey: MangaOrderKey;
  sortDirection: SortDirection;
  includedTags: string[];
  excludedTags: string[];
  includedTagsMode: TagMode;
  excludedTagsMode: TagMode;
}

export const DEFAULT_MANGA_FILTERS: MangaFilterState = {
  hasAvailableChapters: false,
  originalLanguage: [],
  contentRating: [...DEFAULT_CONTENT_RATINGS],
  publicationDemographic: [],
  status: [],
  sortKey: "followedCount",
  sortDirection: "desc",
  includedTags: [],
  excludedTags: [],
  includedTagsMode: "AND",
  excludedTagsMode: "OR",
};

export const SORT_OPTIONS: Array<{
  key: MangaOrderKey;
  direction: SortDirection;
  label: string;
}> = [
  { key: "relevance", direction: "desc", label: "Relevance" },
  { key: "latestUploadedChapter", direction: "desc", label: "Latest upload" },
  { key: "followedCount", direction: "desc", label: "Follow count" },
  { key: "rating", direction: "desc", label: "Rating" },
  { key: "createdAt", direction: "desc", label: "Created date" },
  { key: "updatedAt", direction: "desc", label: "Updated date" },
  { key: "title", direction: "asc", label: "Title (A–Z)" },
  { key: "title", direction: "desc", label: "Title (Z–A)" },
  { key: "year", direction: "desc", label: "Year" },
];

export const FILTER_SECTIONS = {
  originalLanguage: "Original language",
  contentRating: "Content rating",
  publicationDemographic: "Publication demographic",
  status: "Status",
  sort: "Sort",
  tagsMode: "Tags mode",
  content: "Content",
  format: "Format",
  genre: "Genre",
  theme: "Theme",
} as const;

export function sortOptionId(key: MangaOrderKey, direction: SortDirection): string {
  return `${key}:${direction}`;
}

export function filtersToSearchParams(
  filters: MangaFilterState,
  opts: { title?: string; offset?: number } = {},
): SearchParams {
  const order: MangaOrder = { [filters.sortKey]: filters.sortDirection };

  return {
    title: opts.title?.trim() || undefined,
    offset: opts.offset,
    hasAvailableChapters: filters.hasAvailableChapters || undefined,
    originalLanguage: filters.originalLanguage.length ? filters.originalLanguage : undefined,
    contentRating: filters.contentRating.length ? filters.contentRating : undefined,
    publicationDemographic: filters.publicationDemographic.length
      ? filters.publicationDemographic
      : undefined,
    status: filters.status.length ? filters.status : undefined,
    includedTags: filters.includedTags.length ? filters.includedTags : undefined,
    excludedTags: filters.excludedTags.length ? filters.excludedTags : undefined,
    includedTagsMode: filters.includedTags.length ? filters.includedTagsMode : undefined,
    excludedTagsMode: filters.excludedTags.length ? filters.excludedTagsMode : undefined,
    order,
  };
}

export function tabToSort(tab: "latest" | "popular"): Pick<MangaFilterState, "sortKey" | "sortDirection"> {
  return tab === "latest"
    ? { sortKey: "latestUploadedChapter", sortDirection: "desc" }
    : { sortKey: "followedCount", sortDirection: "desc" };
}

export {
  CONTENT_RATINGS,
  DEFAULT_CONTENT_RATINGS,
  DEMOGRAPHICS,
  PUBLICATION_STATUSES,
  TAG_GROUPS,
};
