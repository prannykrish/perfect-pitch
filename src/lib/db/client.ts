import "server-only";
import { GATE_COOKIE, gateIsOn, isUnlocked } from "../auth/gate";
import { databaseEnv, ensureMigrated, openDatabase, type Db } from "./connect";
import * as schema from "./schema";

declare global {
  var __perfectPitchDb: Promise<Db> | undefined;
}

async function open(): Promise<Db> {
  const { url, authToken } = databaseEnv();
  const { client, db } = openDatabase(url, authToken);
  // Apply any pending migrations on first use so `npm run dev` and a fresh deploy just work.
  await ensureMigrated(db, client);
  return db;
}

/**
 * The proxy keeps strangers off the pages, but a server action is a POST that can be aimed at any
 * path, including ones the proxy leaves alone. Every action goes through getDb, so the gate is
 * checked again here, next to the data.
 */
async function assertUnlocked(): Promise<void> {
  if (!gateIsOn()) return;
  const { cookies } = await import("next/headers");
  const jar = await cookies();
  if (!(await isUnlocked(jar.get(GATE_COOKIE)?.value))) throw new Error("Locked: enter the password at /unlock.");
}

/**
 * The database, opened and migrated once per server process (cached on globalThis so dev hot
 * reloads and warm serverless invocations reuse it). Every server action starts with
 * `const db = await getDb()`.
 */
export async function getDb(): Promise<Db> {
  await assertUnlocked();
  if (!globalThis.__perfectPitchDb) {
    globalThis.__perfectPitchDb = open().catch((err) => {
      globalThis.__perfectPitchDb = undefined; // let the next call try again
      throw err;
    });
  }
  return globalThis.__perfectPitchDb;
}

export { schema };
export type { Db };
