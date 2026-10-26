import type { ExtensionFilterPatch, NativeFilter } from "@platform/extensions/types";

export type FilterDraft = Record<string, unknown>;

export interface FilterChip {
  path: string;
  label: string;
}

export interface FilterSummary {
  path: string;
  paths: string[];
  label: string;
}

export interface ExtensionFilterSelection {
  schema: string;
  patches: ExtensionFilterPatch[];
  chips: FilterChip[];
  summaries: FilterSummary[];
}

export interface FilterBlock {
  filter: NativeFilter;
  notes: string[];
}

export function editableFilters(filters: NativeFilter[]): NativeFilter[] {
  return filters.flatMap((filter) =>
    filter.type === "group"
      ? editableFilters(filter.children ?? [])
      : ["select", "sort", "text", "checkbox", "tristate"].includes(filter.type)
        ? [filter]
        : [],
  );
}

export function filterDefault(filter: NativeFilter): unknown {
  switch (filter.type) {
    case "checkbox":
      return Boolean(filter.state);
    case "text":
      return typeof filter.state === "string" ? filter.state : "";
    case "select":
    case "tristate":
      return typeof filter.state === "number" ? filter.state : 0;
    case "sort": {
      const state = filter.state as { index?: number; ascending?: boolean } | null;
      return state && typeof state.index === "number"
        ? { index: state.index, ascending: state.ascending !== false }
        : null;
    }
    default:
      return undefined;
  }
}

function validState(filter: NativeFilter, state: unknown): boolean {
  switch (filter.type) {
    case "checkbox":
      return typeof state === "boolean";
    case "text":
      return typeof state === "string";
    case "tristate":
      return state === 0 || state === 1 || state === 2;
    case "select":
      return typeof state === "number" && Number.isInteger(state) && state >= 0 && state < (filter.values?.length ?? 0);
    case "sort": {
      const selection = state as { index?: unknown; ascending?: unknown } | null;
      return Boolean(selection && typeof selection.index === "number" && Number.isInteger(selection.index) && selection.index >= 0 && selection.index < (filter.values?.length ?? 0) && typeof selection.ascending === "boolean");
    }
    default:
      return false;
  }
}

export function filterSchema(filters: NativeFilter[]): string {
  return JSON.stringify(filters.map((filter) => ({
    path: filter.path,
    type: filter.type,
    name: filter.name,
    values: filter.values,
    state: filterDefault(filter),
    children: filter.children ? filterSchema(filter.children) : undefined,
  })));
}

export function createFilterDraft(
  filters: NativeFilter[],
  patches: ExtensionFilterPatch[] = [],
): FilterDraft {
  const leaves = editableFilters(filters);
  const draft = Object.fromEntries(leaves.map((filter) => [filter.path, filterDefault(filter)]));
  const byPath = new Map(leaves.map((filter) => [filter.path, filter]));
  for (const patch of patches) {
    const filter = byPath.get(patch.path);
    if (filter && validState(filter, patch.state)) draft[patch.path] = patch.state;
  }
  return draft;
}

export function filterChanged(filter: NativeFilter, draft: FilterDraft): boolean {
  if (filter.type === "sort") {
    const current = draft[filter.path] as { index: number; ascending: boolean } | null;
    const baseline = filterDefault(filter) as { index: number; ascending: boolean } | null;
    return current?.index !== baseline?.index || current?.ascending !== baseline?.ascending;
  }
  return JSON.stringify(draft[filter.path]) !== JSON.stringify(filterDefault(filter));
}

export function filterValueLabel(filter: NativeFilter, draft: FilterDraft): string {
  const state = draft[filter.path];
  switch (filter.type) {
    case "checkbox":
      return state ? "On" : "Off";
    case "tristate":
      return state === 1 ? "Include" : state === 2 ? "Exclude" : "Any";
    case "text":
      return String(state ?? "").trim() || "Any";
    case "select":
      return String(filter.values?.[Number(state)] ?? "Source default");
    case "sort": {
      const selection = state as { index: number; ascending: boolean } | null;
      return selection
        ? `${String(filter.values?.[selection.index] ?? "Source default")} · ${selection.ascending ? "Ascending" : "Descending"}`
        : "Source default";
    }
    default:
      return "";
  }
}

function leafLabel(filter: NativeFilter, draft: FilterDraft): string {
  if (filter.type === "tristate") return `${filterValueLabel(filter, draft)} ${filter.name}`;
  return `${filter.name}: ${filterValueLabel(filter, draft)}`;
}

export function filterGroupLabel(filter: NativeFilter, draft: FilterDraft): string {
  const children = editableFilters(filter.children ?? []);
  const selected = children.filter((child) =>
    child.type === "checkbox" ? Boolean(draft[child.path])
      : child.type === "tristate" ? Number(draft[child.path] ?? 0) !== 0
        : filterChanged(child, draft),
  );
  const labels = selected.map((child) => child.type === "checkbox" ? child.name : leafLabel(child, draft));
  if (labels.length) return `${labels.slice(0, 3).join(" · ")}${labels.length > 3 ? ` · +${labels.length - 3} more` : ""}`;
  if (children.length && children.every((child) => child.type === "checkbox")) return "None selected";
  if (children.length && children.every((child) => child.type === "tristate")) return "Any";
  return "Source defaults";
}

export function buildFilterSelection(filters: NativeFilter[], draft: FilterDraft): ExtensionFilterSelection {
  const patches: ExtensionFilterPatch[] = [];
  const chips: FilterChip[] = [];
  const summaries: FilterSummary[] = [];
  for (const root of filters) {
    const changed = editableFilters([root]).filter((filter) => filterChanged(filter, draft) && validState(filter, draft[filter.path]));
    if (!changed.length) continue;
    const rootChips = changed.map((filter) => ({
      path: filter.path,
      label: root.type === "group" ? `${root.name}: ${leafLabel(filter, draft)}` : leafLabel(filter, draft),
    }));
    patches.push(...changed.map((filter) => ({ path: filter.path, state: draft[filter.path] })));
    chips.push(...rootChips);
    summaries.push({ path: root.path, paths: changed.map((filter) => filter.path), label: rootChips.map((chip) => chip.label).join(" · ") });
  }
  return { schema: filterSchema(filters), patches, chips, summaries };
}

export function removeFilterPath(selection: ExtensionFilterSelection, path: string): ExtensionFilterSelection {
  const chips = selection.chips.filter((chip) => chip.path !== path);
  const patches = selection.patches.filter((patch) => patch.path !== path);
  const summaries = selection.summaries.flatMap((summary) => {
    const paths = summary.paths.filter((entry) => entry !== path);
    return paths.length ? [{ ...summary, paths, label: chips.filter((chip) => paths.includes(chip.path)).map((chip) => chip.label).join(" · ") }] : [];
  });
  return { ...selection, patches, chips, summaries };
}

export function filterBlocks(filters: NativeFilter[]): FilterBlock[] {
  let notes: string[] = [];
  const blocks: FilterBlock[] = [];
  for (const filter of filters) {
    if (filter.type === "header") notes.push(filter.name);
    else if (filter.type !== "separator") {
      blocks.push({ filter, notes });
      notes = [];
    }
  }
  if (notes.length) blocks.push({ filter: { path: "trailing-notes", type: "header", name: "" }, notes });
  return blocks;
}
