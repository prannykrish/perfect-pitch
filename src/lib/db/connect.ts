/**
 * Opening the database, for the app (client.ts) and for the scripts under scripts/.
 *
 * One driver for both homes of the data: libSQL reads a SQLite file on this laptop
 * (`file:data/perfect-pitch.db`, the default) and talks to Turso (`libsql://…turso.io` plus
 * DATABASE_AUTH_TOKEN) with the same SQL and the same migrations.
 *
 * No "server-only" import here, so tsx scripts can use it. Never import this from a client component.
 */
import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

export type Db = LibSQLDatabase<typeof schema>;

export const DEFAULT_DATABASE_URL = "file:data/perfect-pitch.db";

export function migrationsFolder(): string {
  return path.join(process.cwd(), "drizzle");
}

/** DATABASE_URL and its token from the environment (Next reads .env.local; scripts load it themselves). */
export function databaseEnv(): { url: string; authToken: string | undefined } {
  return { url: process.env.DATABASE_URL?.trim() || DEFAULT_DATABASE_URL, authToken: process.env.DATABASE_AUTH_TOKEN?.trim() || undefined };
}

export function isRemoteUrl(url: string): boolean {
  return !url.startsWith("file:") && url !== ":memory:";
}

/** For messages: where a URL points, without anything that grants access. */
export function describeDatabase(url: string): string {
  if (!isRemoteUrl(url)) return url === ":memory:" ? "a database in memory" : `the file ${url.slice("file:".length)}`;
  try {
    return `the cloud database ${new URL(url).hostname}`;
  } catch {
    return "the cloud database";
  }
}

export function openClient(url: string, authToken?: string): Client {
  if (isRemoteUrl(url)) {
    // Plain HTTPS requests rather than a WebSocket: a serverless function has nothing to keep a
    // socket alive between invocations, and one request per query (or per batch) is all we need.
    return createClient({ url: url.replace(/^(libsql|wss?):/, "https:"), authToken });
  }
  if (process.env.VERCEL) {
    throw new Error("DATABASE_URL is not set: the hosted app has no disk to keep a database file on. Add DATABASE_URL and DATABASE_AUTH_TOKEN to the Vercel project.");
  }
  if (url.startsWith("file:")) fs.mkdirSync(path.dirname(path.resolve(url.slice("file:".length))), { recursive: true });
  return createClient({ url });
}

export function openDatabase(url: string, authToken?: string): { client: Client; db: Db } {
  const client = openClient(url, authToken);
  return { client, db: drizzle(client, { schema }) };
}

/** The newest migration this code knows about (its timestamp in the journal), or 0 when there is no journal. */
export function newestMigration(folder: string = migrationsFolder()): number {
  const journalPath = path.join(folder, "meta", "_journal.json");
  if (!fs.existsSync(journalPath)) return 0;
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8")) as { entries: { when: number }[] };
  return Math.max(0, ...journal.entries.map((e) => e.when));
}

/** The newest migration the database has had applied, or 0 for a fresh one. */
export async function appliedMigration(client: Client): Promise<number> {
  try {
    const r = await client.execute("select created_at from __drizzle_migrations order by created_at desc limit 1");
    return Number(r.rows[0]?.created_at ?? 0);
  } catch {
    return 0; // no migrations table yet
  }
}

/**
 * Bring the database up to this code's schema. One cheap query when nothing is pending, so it can
 * run on every cold start; the real work only happens after `npm run db:generate` added a migration.
 */
export async function ensureMigrated(db: Db, client: Client, folder: string = migrationsFolder()): Promise<void> {
  const newest = newestMigration(folder);
  if (!newest) return;
  if ((await appliedMigration(client)) >= newest) return;
  await migrate(db, { migrationsFolder: folder });
}

/** Every table that holds his data, parents before children (attempts point at sessions). */
export const DATA_TABLES = ["sessions", "attempts", "recordings", "pieces", "piece_progress", "practice_plans", "settings"] as const;
