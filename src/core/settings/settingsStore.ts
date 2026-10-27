import { Directory, File, Paths } from "expo-file-system";

import {
  getStoredSettingsJson,
  upsertStoredSettingsJson,
} from "@core/db/repositories/settingsRepository";
import {
  AppSettings,
  DEFAULT_SETTINGS,
  sanitizeSettings,
} from "./settingsSchema";


let cached: AppSettings | null = null;
let writeQueue: Promise<void> = Promise.resolve();
const listeners = new Set<(settings: AppSettings) => void>();

function settingsFile(): File {
  const dir = new Directory(Paths.document, "trapp-settings");
  if (!dir.exists) {
    dir.create({ idempotent: true, intermediates: true });
  }
  return new File(dir, "settings.json");
}

/** Current in-memory snapshot for React external-store bindings. */
export function getSettingsSnapshot(): AppSettings {
  return cached ?? DEFAULT_SETTINGS;
}

/** Loads settings once and caches them in memory. */
export async function getSettings(): Promise<AppSettings> {
  if (cached) return cached;
  try {
    const file = settingsFile();
    if (file.exists) {
      const loaded = sanitizeSettings(JSON.parse(await file.text()));
      cached = loaded;
      listeners.forEach((listener) => listener(loaded));
      return loaded;
    }
  } catch (error) {
    console.warn("Failed to read settings, using defaults:", error);
  }
  const defaults = { ...DEFAULT_SETTINGS };
  cached = defaults;
  listeners.forEach((listener) => listener(defaults));
  return defaults;
}

/**
 * Merges `patch` into the current settings, persists them (queued so parallel
 * writes cannot race), mirrors the row into the SQLite app_settings table and
 * notifies subscribers.
 */
export async function updateSettings(
  patch: Partial<AppSettings>,
): Promise<AppSettings> {
  const current = cached ?? (await getSettings());
  const next: AppSettings = { ...current, ...patch };
  cached = next;

  writeQueue = writeQueue.then(async () => {
    try {
      const file = settingsFile();
      file.write(JSON.stringify(next, null, 2));
    } catch (error) {
      console.warn("Failed to persist settings:", error);
    }
  });
  await writeQueue;

  listeners.forEach((listener) => listener(next));

  try {
    await upsertStoredSettingsJson(JSON.stringify(next));
  } catch (error) {
    // The DB mirror is best-effort; never block settings changes on it.
    console.warn("Failed to mirror settings into the app database:", error);
  }
  return next;
}

/** Subscribes to settings changes. Returns an unsubscribe function. */
export function subscribeSettings(
  listener: (settings: AppSettings) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Re-reads the settings mirror that lives inside the SQLite database and makes
 * it the live settings again (file + memory). Used after a backup restore,
 * where the database was replaced under the running app.
 */
export async function reloadSettingsFromMirror(): Promise<AppSettings> {
  const json = await getStoredSettingsJson();
  if (!json) return cached ?? { ...DEFAULT_SETTINGS };
  let next: AppSettings;
  try {
    next = sanitizeSettings(JSON.parse(json));
  } catch {
    return cached ?? { ...DEFAULT_SETTINGS };
  }
  cached = next;
  try {
    settingsFile().write(JSON.stringify(next, null, 2));
  } catch (error) {
    console.warn("Failed to rewrite settings after restore:", error);
  }
  listeners.forEach((listener) => listener(next));
  return next;
}
