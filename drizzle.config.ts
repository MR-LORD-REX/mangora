import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/core/db/schema.ts",
  out: "./src/core/db/migrations",
  casing: "snake_case",
});
