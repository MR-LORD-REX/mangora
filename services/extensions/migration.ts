/**
 * migration.ts
 * ---------------------------------------------------------------------------
 * Finds catalog/history/library rows that belong to an extension whose
 * source is no longer installed. The Browse > Migrate tab maps each missing
 * source id back to the repository that can reinstall it.
 * ---------------------------------------------------------------------------
 */

import { like } from "drizzle-orm";

import { db } from "@/services/db/client";
import { manga } from "@/services/db/schema";
import { cachedExtensionSources } from "./registry";
import type { ExtensionMangaRecord } from "./types";

export interface MissingExtensionGroup {
  sourceId: string;
  provider: string;
  records: ExtensionMangaRecord[];
}

export async function listExtensionMangaRecords(): Promise<
  ExtensionMangaRecord[]
> {
  const rows = await db
    .select({
      provider: manga.provider,
      providerMangaId: manga.providerMangaId,
      title: manga.title,
      thumbnailUrl: manga.thumbnailUrl,
    })
    .from(manga)
    .where(like(manga.provider, "ext:%"));

  return rows.map((row) => ({
    provider: row.provider,
    sourceId: row.provider.slice(4),
    providerMangaId: row.providerMangaId,
    title: row.title,
    thumbnailUrl: row.thumbnailUrl ?? null,
  }));
}

export async function listMissingExtensionGroups(): Promise<
  MissingExtensionGroup[]
> {
  const records = await listExtensionMangaRecords();
  const installed = new Set(cachedExtensionSources().map((source) => source.id));
  const groups = new Map<string, MissingExtensionGroup>();

  for (const record of records) {
    if (installed.has(record.sourceId)) continue;
    const existing = groups.get(record.sourceId);
    if (existing) {
      if (
        !existing.records.some(
          (entry) =>
            entry.providerMangaId === record.providerMangaId &&
            entry.provider === record.provider,
        )
      ) {
        existing.records.push(record);
      }
      continue;
    }
    groups.set(record.sourceId, {
      sourceId: record.sourceId,
      provider: record.provider,
      records: [record],
    });
  }

  return Array.from(groups.values()).sort(
    (a, b) => b.records.length - a.records.length,
  );
}