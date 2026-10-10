import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./services/db/schema.ts",
  out: "./services/db/migrations",
  casing: "snake_case",
});
