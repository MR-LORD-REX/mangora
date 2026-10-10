import { migrate } from "drizzle-orm/expo-sqlite/migrator";

import { db } from "./client";
import migrations from "./migrations";
import { libraries } from "./schema";
import { getSettings } from "@/services/settings/settingsStore";
import {
  getStoredSettingsJson,
  upsertStoredSettingsJson,
} from "./repositories/settingsRepository";

export const DEFAULT_LIBRARY_ID = "default";
export const DEFAULT_LIBRARY_NAME = "Default";
/** Virtual library backed by the downloads table (never user-editable). */
export const DOWNLOADS_LIBRARY_ID = "downloads";
export const DOWNLOADS_LIBRARY_NAME = "Downloads";

let bootstrapPromise: Promise<void> | null = null;

/** Seeds the app_settings mirror row from the file-backed settings store. */
async function seedSettingsMirror(): Promise<void> {
  try {
    const existing = await getStoredSettingsJson();
    if (existing != null) return;
    const settings = await getSettings();
    await upsertStoredSettingsJson(JSON.stringify(settings));
  } catch (error) {
    console.warn("Failed to seed app_settings mirror:", error);
  }
}

async function bootstrapDatabase(): Promise<void> {
  await migrate(db, migrations);

  const now = Date.now();
  await db
    .insert(libraries)
    .values([
      {
        id: DEFAULT_LIBRARY_ID,
        name: DEFAULT_LIBRARY_NAME,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: DOWNLOADS_LIBRARY_ID,
        name: DOWNLOADS_LIBRARY_NAME,
        createdAt: now + 1,
        updatedAt: now + 1,
      },
    ])
    .onConflictDoNothing({ target: libraries.name });

  await seedSettingsMirror();
}

/** Runs migrations, seeds defaults and mirrors settings exactly once. */
export function initializeDatabase(): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = bootstrapDatabase().catch((error) => {
      bootstrapPromise = null;
      throw error;
    });
  }
  return bootstrapPromise;
}