/**
 * Wipe the logged practice data for a clean slate.
 *   npm run db:reset-stats          # attempts, sessions, chunk-mode progress
 *   npm run db:reset-stats -- --all # also saved takes, uploaded pieces and practice plans
 * Safe while `npm run dev` is running (the database is in WAL mode).
 */
import Database from "better-sqlite3";
import path from "node:path";
import { existsSync } from "node:fs";

const DB_PATH = path.join(process.cwd(), "data", "perfect-pitch.db");
if (!existsSync(DB_PATH)) {
  console.log("No database yet at data/perfect-pitch.db; nothing to reset.");
  process.exit(0);
}
const all = process.argv.includes("--all");
const tables = ["attempts", "sessions", "piece_progress", ...(all ? ["recordings", "pieces", "practice_plans"] : [])];

const db = new Database(DB_PATH);
const existing = new Set(db.prepare("select name from sqlite_master where type = 'table'").all().map((r) => r.name));
const counts = (t) => (existing.has(t) ? db.prepare(`select count(*) as n from ${t}`).get().n : null);

console.log("Before:");
for (const t of tables) console.log(`  ${t}: ${counts(t) ?? "(no such table)"}`);

db.transaction(() => {
  for (const t of tables) if (existing.has(t)) db.prepare(`delete from ${t}`).run();
  if (existing.has("sqlite_sequence")) for (const t of tables) db.prepare("delete from sqlite_sequence where name = ?").run(t);
})();

try {
  db.exec("vacuum");
} catch {
  /* another connection holds the file; the rows are gone regardless */
}

console.log("After:");
for (const t of tables) console.log(`  ${t}: ${counts(t) ?? "(no such table)"}`);
db.close();
console.log(all ? "Everything wiped." : "Stats wiped. Saved takes, uploaded pieces and practice plans were kept (use --all to wipe those too).");
