import "server-only";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "perfect-pitch.db");
const MIGRATIONS = path.join(process.cwd(), "drizzle");

type Db = ReturnType<typeof drizzle<typeof schema>>;

declare global {
  var __perfectPitchDb: Db | undefined;
}

function createDb(): Db {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("synchronous = NORMAL");
  const db = drizzle(sqlite, { schema });
  // Apply any pending migrations on first use so `npm run dev` just works.
  if (fs.existsSync(MIGRATIONS)) {
    migrate(db, { migrationsFolder: MIGRATIONS });
  }
  return db;
}

// Cache on globalThis so Next.js dev hot reloads do not open a new handle each time.
export const db: Db = globalThis.__perfectPitchDb ?? createDb();
if (process.env.NODE_ENV !== "production") globalThis.__perfectPitchDb = db;

export { schema };
