import { drizzle } from "drizzle-orm/expo-sqlite";
import { openDatabaseSync } from "expo-sqlite";

import { schema } from "./schema";

export const sqlite = openDatabaseSync("trapp.db");

sqlite.execSync("PRAGMA foreign_keys = ON;");

export const db = drizzle(sqlite, { schema });
export type AppDatabase = typeof db;
