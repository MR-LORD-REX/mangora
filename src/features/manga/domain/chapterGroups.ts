import type {
  ChapterSortField,
  SortDirection,
  ViewerChapterRow,
} from "@shared/contracts";

export interface ChapterGroup {
  key: string;
  label?: string;
  rows: ViewerChapterRow[];
}

/** Key used to merge duplicate uploads into one "main chapter". */
export function chapterGroupKeyOf(row: ViewerChapterRow): string | null {
  if (row.sectionKey) return row.sectionKey;
  if (row.number != null) return String(row.number);
  return row.groupKey ?? null;
}

/** Group rows into main chapters (one per chapter number / explicit section). */
export function groupRows(rows: ViewerChapterRow[]): ChapterGroup[] {
  const groups: ChapterGroup[] = [];
  const byKey = new Map<string, ChapterGroup>();
  for (const row of rows) {
    if (row.kind === "section") {
      const key = row.sectionKey ?? row.key;
      let group = byKey.get(key);
      if (!group) {
        group = { key, label: row.sectionLabel ?? row.title, rows: [] };
        byKey.set(key, group);
        groups.push(group);
      } else if (!group.label) {
        group.label = row.sectionLabel ?? row.title;
      }
      continue;
    }
    const key = chapterGroupKeyOf(row) ?? row.key;
    let group = byKey.get(key);
    if (!group) {
      group = { key, rows: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.rows.push(row);
  }
  return groups;
}

/** "Chapter 45" style label for a group that has no explicit section label. */
export function visibleGroupLabel(group: ChapterGroup): string | undefined {
  if (group.label) return group.label;
  const key = group.key ?? "";
  if (/^\d+(\.\d+)?$/.test(key)) return `Chapter ${key}`;
  return undefined;
}

/** Flattens groups into the row list; duplicate uploads nest under a header. */
export function flattenGroups(groups: ChapterGroup[]): ViewerChapterRow[] {
  const out: ViewerChapterRow[] = [];
  for (const group of groups) {
    const label = visibleGroupLabel(group);
    const showHeader = Boolean(
      label && (group.label || group.rows.length > 1),
    );
    if (showHeader && label) {
      out.push({
        key: `section:${group.key}`,
        kind: "section",
        sectionKey: group.key,
        sectionLabel: label,
        title: label,
      });
      for (const row of group.rows) out.push({ ...row, nested: true });
    } else {
      for (const row of group.rows) out.push({ ...row, nested: false });
    }
  }
  return out;
}

export function groupNumber(group: ChapterGroup): number | null {
  const raw = group.label ?? group.key ?? "";
  const labelParsed = parseFloat(raw.replace(/[^0-9.]/g, ""));
  if (!Number.isNaN(labelParsed)) return labelParsed;
  let best: number | null = null;
  for (const row of group.rows) {
    if (row.number != null && (best == null || row.number > best))
      best = row.number;
  }
  return best;
}

export function sortGroups(
  groups: ChapterGroup[],
  field: ChapterSortField,
  dir: SortDirection,
): typeof groups {
  const multiplier = dir === "asc" ? 1 : -1;
  const out = [...groups];
  const indexOf = new Map(out.map((group, index) => [group.key, index]));
  out.sort((a, b) => {
    let cmp = 0;
    if (field === "number") {
      const an = groupNumber(a);
      const bn = groupNumber(b);
      if (an == null && bn == null) cmp = 0;
      else if (an == null) cmp = 1;
      else if (bn == null) cmp = -1;
      else cmp = (an - bn) * multiplier;
    } else if (field === "date") {
      const ad = maxDate(a.rows);
      const bd = maxDate(b.rows);
      if (ad == null && bd == null) cmp = 0;
      else if (ad == null) cmp = 1;
      else if (bd == null) cmp = -1;
      else cmp = (ad - bd) * multiplier;
    } else {
      const aa = (a.label ?? a.rows[0]?.title ?? "").toLocaleLowerCase();
      const bb = (b.label ?? b.rows[0]?.title ?? "").toLocaleLowerCase();
      cmp = aa < bb ? -1 : aa > bb ? 1 : 0;
      if (cmp !== 0) cmp *= multiplier;
    }
    if (cmp === 0) {
      const ia = indexOf.get(a.key) ?? 0;
      const ib = indexOf.get(b.key) ?? 0;
      cmp = ia - ib;
    }
    return cmp;
  });
  return out;
}

export function extremeChapter(
  rows: ViewerChapterRow[],
  newest: boolean,
): ViewerChapterRow | null {
  let best: ViewerChapterRow | null = null;
  let bestNumber = newest ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
  for (const row of rows) {
    if (row.kind !== "chapter" || row.number == null) continue;
    if (newest ? row.number > bestNumber : row.number < bestNumber) {
      bestNumber = row.number;
      best = row;
    }
  }
  if (best) return best;
  let fallback: ViewerChapterRow | null = null;
  for (const row of rows) {
    if (row.kind !== "chapter") continue;
    fallback = row;
    if (!newest) return row;
  }
  return fallback;
}

function maxDate(rows: ViewerChapterRow[]): number | null {
  let best: number | null = null;
  for (const row of rows) {
    if (row.date != null && (best == null || row.date > best)) best = row.date;
  }
  return best;
}

export function sortHint(field: ChapterSortField, dir: SortDirection): string {
  if (field === "alpha") return dir === "asc" ? "A-Z first" : "Z-A first";
  if (field === "date") return dir === "asc" ? "Oldest first" : "Newest first";
  return "Newest first";
}
