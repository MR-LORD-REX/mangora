import { useEffect, useMemo } from "react";

import type {
  ChapterSortField,
  ProgressMap,
  SortDirection,
  ViewerChapterRow,
} from "@shared/contracts";
import {
  flattenGroups,
  groupRows,
  sortGroups,
} from "../domain/chapterGroups";
import { normalizeForMatch } from "../domain/chapterFormat";

export interface UseChapterFiltersOptions {
  rows: ViewerChapterRow[];
  progress: ProgressMap;
  selectedGroups: string[] | null;
  setSelectedGroups: (groups: string[] | null) => void;
  showRead: boolean;
  showUnread: boolean;
  sortField: ChapterSortField;
  sortDir: SortDirection;
  searchQuery: string;
}

export function useChapterFilters({
  rows,
  progress,
  selectedGroups,
  setSelectedGroups,
  showRead,
  showUnread,
  sortField,
  sortDir,
  searchQuery,
}: UseChapterFiltersOptions) {
  const rawGroups = useMemo(() => groupRows(rows), [rows]);

  const availableGroups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      if (row.kind === "chapter" && row.scanGroup) {
        counts.set(row.scanGroup, (counts.get(row.scanGroup) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [rows]);

  useEffect(() => {
    setSelectedGroups(null);
  }, [rows, setSelectedGroups]);

  const groupFilteredGroups = useMemo(() => {
    if (!selectedGroups) return rawGroups;
    const allowed = new Set(selectedGroups);
    return rawGroups
      .map((group) => ({
        ...group,
        rows: group.rows.filter(
          (row) => row.scanGroup != null && allowed.has(row.scanGroup),
        ),
      }))
      .filter((group) => group.rows.length > 0);
  }, [rawGroups, selectedGroups]);

  const totalRowCount = rawGroups.length;

  const readCount = useMemo(() => {
    let count = 0;
    for (const group of rawGroups) {
      const done = group.rows.some(
        (row) => progress[row.progressKey ?? ""]?.status === "completed",
      );
      if (done) count += 1;
    }
    return count;
  }, [progress, rawGroups]);

  const isNumericQuery = /^\d+([.,]\d+)?$/.test(searchQuery.trim());

  const displayedGroups = useMemo(() => {
    let groups = groupFilteredGroups;
    const showAll = showRead && showUnread;
    if (!showAll) {
      groups = groups
        .map((group) => ({
          ...group,
          rows: group.rows.filter((row) =>
            showRead
              ? progress[row.progressKey ?? ""]?.status === "completed"
              : progress[row.progressKey ?? ""]?.status !== "completed",
          ),
        }))
        .filter((group) => group.rows.length > 0);
    }
    return sortGroups(groups, sortField, sortDir);
  }, [groupFilteredGroups, progress, showRead, showUnread, sortDir, sortField]);

  const searchFilteredGroups = useMemo(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed || isNumericQuery) return displayedGroups;
    const needle = normalizeForMatch(trimmed);
    return displayedGroups
      .map((group) => ({
        ...group,
        rows: group.rows.filter((row) => {
          const haystack = normalizeForMatch(
            `${row.title} ${row.subtitle ?? ""} ${row.scanGroup ?? ""} ${row.sectionLabel ?? ""}`,
          );
          return haystack.includes(needle);
        }),
      }))
      .filter((group) => group.rows.length > 0);
  }, [displayedGroups, isNumericQuery, searchQuery]);

  const listData = useMemo<ViewerChapterRow[]>(
    () => flattenGroups(searchFilteredGroups),
    [searchFilteredGroups],
  );

  return {
    rawGroups,
    availableGroups,
    groupFilteredGroups,
    totalRowCount,
    readCount,
    isNumericQuery,
    displayedGroups,
    searchFilteredGroups,
    listData,
  };
}
