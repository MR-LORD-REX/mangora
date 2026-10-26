import type {
  ExtensionCatalogEntry,
  InstalledExtensionRecord,
} from "@platform/extensions/types";
import type { MissingExtensionGroup } from "../library/migration";

export type ContentFilter = "all" | "sfw" | "nsfw";
export type StatusFilter = "all" | "installed" | "available";

export interface SourceRow {
  extension: InstalledExtensionRecord;
  source: InstalledExtensionRecord["sources"][number];
}

export interface SourceSection {
  title: string;
  data: SourceRow[];
}

export interface MigrateRow extends MissingExtensionGroup {
  extension: ExtensionCatalogEntry | null;
}

function matchesQuery(
  query: string,
  ...values: (string | null | undefined)[]
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return values.some((value) => value?.toLowerCase().includes(needle));
}

export function buildInstalledByPackage(
  installed: InstalledExtensionRecord[],
): Map<string, InstalledExtensionRecord> {
  return new Map(installed.map((extension) => [extension.packageName, extension]));
}

export function buildSourceRows(
  installed: InstalledExtensionRecord[],
  content: ContentFilter,
  language: string,
  query: string,
): SourceRow[] {
  return installed
    .flatMap((extension) =>
      extension.sources.map((source) => ({ extension, source })),
    )
    .filter(({ extension, source }) => {
      if (content === "sfw" && extension.nsfw) return false;
      if (content === "nsfw" && !extension.nsfw) return false;
      if (language !== "all" && source.lang !== language) return false;
      return matchesQuery(query, source.name, source.lang, extension.name);
    })
    .sort((a, b) => a.source.name.localeCompare(b.source.name));
}

export function buildSourceSections(
  rows: SourceRow[],
  pinnedIds: ReadonlySet<string>,
  lastUsedAt: Record<string, number>,
): SourceSection[] {
  const byName = (a: SourceRow, b: SourceRow) =>
    a.source.name.localeCompare(b.source.name);
  const pinned = rows.filter((row) => pinnedIds.has(row.source.id)).sort(byName);
  const unpinned = rows.filter((row) => !pinnedIds.has(row.source.id));
  const recentlyUsed = unpinned
    .filter((row) => Boolean(lastUsedAt[row.source.id]))
    .sort(
      (a, b) =>
        (lastUsedAt[b.source.id] ?? 0) - (lastUsedAt[a.source.id] ?? 0) ||
        byName(a, b),
    );
  const english = unpinned
    .filter((row) => row.source.lang === "en")
    .sort(byName);
  const multi = unpinned
    .filter((row) => row.source.lang === "all" || row.source.lang === "multi")
    .sort(byName);
  const other = unpinned
    .filter(
      (row) =>
        row.source.lang !== "en" &&
        row.source.lang !== "all" &&
        row.source.lang !== "multi",
    )
    .sort(byName);

  return [
    { title: "Pinned", data: pinned },
    { title: "Last used", data: recentlyUsed },
    { title: "English", data: english },
    { title: "Multi", data: multi },
    { title: "Other", data: other },
  ].filter((section) => section.data.length > 0);
}

export function buildExtensionRows(
  catalog: ExtensionCatalogEntry[],
  installedByPackage: ReadonlyMap<string, InstalledExtensionRecord>,
  status: StatusFilter,
  content: ContentFilter,
  language: string,
  query: string,
): ExtensionCatalogEntry[] {
  return catalog.filter((extension) => {
    const isInstalled = installedByPackage.has(extension.packageName);
    if (status === "installed" && !isInstalled) return false;
    if (status === "available" && isInstalled) return false;
    const nsfw =
      extension.contentWarning?.toUpperCase().includes("NSFW") ?? false;
    if (content === "sfw" && nsfw) return false;
    if (content === "nsfw" && !nsfw) return false;
    if (
      language !== "all" &&
      !extension.sources.some((source) => source.language === language)
    ) {
      return false;
    }
    return matchesQuery(
      query,
      extension.name,
      extension.packageName,
      ...extension.sources.map((source) => source.name),
    );
  });
}

export function buildMigrateRows(
  missing: MissingExtensionGroup[],
  catalog: ExtensionCatalogEntry[],
  query: string,
): MigrateRow[] {
  return missing
    .map((group) => ({
      ...group,
      extension:
        catalog.find((entry) =>
          entry.sources.some((source) => source.id === group.sourceId),
        ) ?? null,
    }))
    .filter((group) =>
      matchesQuery(
        query,
        group.sourceId,
        group.extension?.name,
        ...group.records.map((record) => record.title),
      ),
    );
}

export function collectLanguages(
  catalog: ExtensionCatalogEntry[],
  installed: InstalledExtensionRecord[],
): string[] {
  const values = new Set<string>();
  catalog.forEach((extension) =>
    extension.sources.forEach((source) => values.add(source.language)),
  );
  installed.forEach((extension) =>
    extension.sources.forEach((source) => values.add(source.lang)),
  );
  return Array.from(values).sort();
}

export function installedVersion(
  extension: ExtensionCatalogEntry,
  installedByPackage: ReadonlyMap<string, InstalledExtensionRecord>,
): number | null {
  const record = installedByPackage.get(extension.packageName);
  if (!record) return null;
  return Number(record.versionCode);
}

export function installLabel(
  extension: ExtensionCatalogEntry,
  installedByPackage: ReadonlyMap<string, InstalledExtensionRecord>,
): string {
  const version = installedVersion(extension, installedByPackage);
  if (version == null) return "Download";
  if (version >= Number(extension.versionCode)) return "Installed";
  return "Update";
}
