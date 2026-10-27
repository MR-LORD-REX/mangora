/**
 * backup.ts
 * ---------------------------------------------------------------------------
 * Whole-database snapshot and restore for Settings -> Data and storage.
 *
 * A backup is a single SQLite file (`serializeAsync`, i.e. the portable
 * sqlite3 `serialize` output). It already contains every app table, including
 * the `app_settings` mirror of the file-backed settings store, so restoring
 * one file brings back the full app state.
 * ---------------------------------------------------------------------------
 */

import { deserializeDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";

import { sqlite } from "./client";

/** Tables that belong to the tooling, not to the user's data. */
const INTERNAL_TABLES = new Set(["__drizzle_migrations", "android_metadata"]);

export interface RestoreResult {
  tables: number;
  rows: number;
}

/** Serialized bytes of the live database. */
export async function serializeDatabase(): Promise<Uint8Array> {
  return sqlite.serializeAsync();
}

async function listAppTables(database: SQLiteDatabase): Promise<string[]> {
  const rows = await database.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
  );
  return rows
    .map((row) => row.name)
    .filter((name) => !INTERNAL_TABLES.has(name));
}

/**
 * Replaces every app table with the contents of `bytes`. Runs with foreign
 * keys disabled so table order cannot matter, and keeps the migration ledger
 * untouched (the running app owns its schema version).
 */
export async function restoreDatabaseFromBytes(
  bytes: Uint8Array,
): Promise<RestoreResult> {
  const source = await deserializeDatabaseAsync(bytes);
  let tables = 0;
  let rows = 0;
  try {
    const names = await listAppTables(source);
    sqlite.execSync("PRAGMA foreign_keys = OFF;");
    try {
      for (const name of names) {
        const records = await source.getAllAsync<Record<string, unknown>>(
          `SELECT * FROM "${name}"`,
        );
        sqlite.execSync(`DELETE FROM "${name}";`);
        tables += 1;
        if (records.length === 0) continue;
        const columns = Object.keys(records[0]);
        const statement = await sqlite.prepareAsync(
          `INSERT INTO "${name}" (${columns.map((column) => `"${column}"`).join(", ")}) ` +
            `VALUES (${columns.map(() => "?").join(", ")})`,
        );
        try {
          for (const record of records) {
            await statement.executeAsync(
              columns.map((column) => record[column] as never),
            );
            rows += 1;
          }
        } finally {
          await statement.finalizeAsync();
        }
      }
    } finally {
      sqlite.execSync("PRAGMA foreign_keys = ON;");
    }
  } finally {
    await source.closeAsync();
  }
  return { tables, rows };
}