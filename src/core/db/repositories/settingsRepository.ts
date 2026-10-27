/**
 * settingsRepository.ts
 * ---------------------------------------------------------------------------
 * SQLite mirror of the app settings (see settingsStore.ts). The JSON file in
 * the documents directory remains the source of truth; this repository keeps
 * the `app_settings` table (spec §15) in sync so settings also survive in the
 * app database and can be seeded/restored from there if the file is lost.
 * ---------------------------------------------------------------------------
 */

import { eq } from "drizzle-orm";

import { db } from "../client";
import { appSettings } from "../schema";

export const DEFAULT_SETTINGS_ROW_ID = "default";

/** Reads the mirrored settings JSON, or null when no row has been stored yet. */
export async function getStoredSettingsJson(): Promise<string | null> {
  const rows = await db
    .select({ settingsJson: appSettings.settingsJson })
    .from(appSettings)
    .where(eq(appSettings.id, DEFAULT_SETTINGS_ROW_ID))
    .limit(1);
  return rows[0]?.settingsJson ?? null;
}

/** Upserts the mirrored settings JSON for the single global row. */
export async function upsertStoredSettingsJson(json: string): Promise<void> {
  const now = Date.now();
  await db
    .insert(appSettings)
    .values({
      id: DEFAULT_SETTINGS_ROW_ID,
      settingsJson: json,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: appSettings.id,
      set: { settingsJson: json, updatedAt: now },
    });
}