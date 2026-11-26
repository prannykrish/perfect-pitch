/**
 * Wipe the logged practice data for a clean slate.
 *   npm run db:reset-stats            # attempts, sessions, chunk-mode progress
 *   npm run db:reset-stats -- --all   # also saved takes, uploaded pieces and practice plans
 *   npm run db:reset-stats -- --plans # only the manual calendar plan items
 *
 * It acts on the database the app uses (DATABASE_URL in .env.local). When that is the cloud
 * database, the phone and the laptop both lose the data, so it asks for --yes and suggests a
 * backup first. `--db local` points it at the file on this laptop instead.
 */
import { describeDatabase, isRemoteUrl, openClient } from "../src/lib/db/connect";
import { loadEnv, resolveTarget } from "./db-env";

loadEnv();

const argv = process.argv.slice(2);
const has = (name: string) => argv.includes(`--${name}`);
const dbArg = argv.indexOf("--db") >= 0 ? argv[argv.indexOf("--db") + 1] : "current";
const all = has("all");
const plansOnly = has("plans");
const tables = plansOnly ? ["practice_plans"] : ["attempts", "sessions", "piece_progress", ...(all ? ["recordings", "pieces", "practice_plans"] : [])];

const target = resolveTarget(dbArg);
const remote = isRemoteUrl(target.url);
console.log(`Database: ${describeDatabase(target.url)}`);

const client = openClient(target.url, target.authToken);
try {
  const existing = new Set((await client.execute("select name from sqlite_master where type = 'table'")).rows.map((r) => String(r[0])));
  const count = async (t: string) => (existing.has(t) ? Number((await client.execute(`select count(*) from "${t}"`)).rows[0][0]) : null);

  console.log("Before:");
  for (const t of tables) console.log(`  ${t}: ${(await count(t)) ?? "(no such table)"}`);

  if (remote && !has("yes")) {
    console.log("\nThis is the cloud database: the phone and the laptop share it, and a wipe cannot be undone.");
    console.log("Nothing was deleted. Take a copy first (npm run db:backup), then run this again with --yes.");
    process.exit(1);
  }

  const present = tables.filter((t) => existing.has(t));
  const stmts = present.map((t) => `delete from "${t}"`);
  if (existing.has("sqlite_sequence")) for (const t of present) stmts.push(`delete from sqlite_sequence where name = '${t}'`);
  if (stmts.length) await client.batch(stmts, "write");
  if (!remote) await client.execute("vacuum").catch(() => {}); // another connection holds the file; the rows are gone regardless

  console.log("After:");
  for (const t of tables) console.log(`  ${t}: ${(await count(t)) ?? "(no such table)"}`);
  console.log(plansOnly ? "Manual calendar plan items wiped; stats untouched." : all ? "Everything wiped." : "Stats wiped. Saved takes, uploaded pieces and practice plans were kept (use --all to wipe those too).");
} finally {
  client.close();
}
