import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// drizzle-kit does not read .env.local by itself. `db:generate` needs no database at all;
// `db:studio` and `db:migrate` act on the one the app uses.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export default defineConfig({
  dialect: "turso",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL || "file:data/perfect-pitch.db",
    authToken: process.env.DATABASE_AUTH_TOKEN,
  },
});
