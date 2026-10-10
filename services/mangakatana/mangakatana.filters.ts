import type { FilterSearchOptions, GenreMode, SortOrder, StatusFilter } from "./mangakatana.types";

export interface MangaKatanaFilterState {
  includeGenres: string[];
  excludeGenres: string[];
  genreMode: GenreMode;
  order: SortOrder;
  status: StatusFilter;
  minChapters: string;
}

export const DEFAULT_KATANA_FILTERS: MangaKatanaFilterState = {
  includeGenres: [],
  excludeGenres: [],
  genreMode: "and",
  order: "latest",
  status: "",
  minChapters: "",
};

export const SORT_OPTIONS: Array<{ value: SortOrder; label: string }> = [
  { value: "latest", label: "Latest update" },
  { value: "new", label: "Newly added" },
  { value: "az", label: "Title (A–Z)" },
  { value: "numc", label: "Chapter count" },
];

export const STATUS_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: "", label: "All" },
  { value: "0", label: "Ongoing" },
  { value: "1", label: "Completed" },
  { value: "2", label: "Cancelled" },
];

export function filtersToSearchOptions(
  filters: MangaKatanaFilterState,
): FilterSearchOptions {
  return {
    includeGenres: filters.includeGenres.length ? filters.includeGenres : undefined,
    excludeGenres: filters.excludeGenres.length ? filters.excludeGenres : undefined,
    genreMode: filters.genreMode,
    order: filters.order,
    status: filters.status || undefined,
    minChapters: filters.minChapters || undefined,
  };
}

export function hasActiveFilters(filters: MangaKatanaFilterState): boolean {
  return (
    filters.includeGenres.length > 0 ||
    filters.excludeGenres.length > 0 ||
    filters.status !== "" ||
    filters.minChapters !== "" ||
    filters.order !== DEFAULT_KATANA_FILTERS.order
  );
}
