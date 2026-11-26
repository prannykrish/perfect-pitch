/**
 * Copy all practice data between two databases, row for row with ids kept.
 *
 *   npm run db:copy -- --from local --to cloud      # carry the laptop's file up to Turso (done once)
 *   npm run db:backup                               # pull a dated copy of the cloud down into data/backups/
 *   npm run db:copy -- --from cloud --to file:data/somewhere.db
 *
 * "local" is data/perfect-pitch.db, "cloud" is the DATABASE_URL in .env.local. The target must be
 * empty; --force empties its tables first. After copying, every row is read back from both sides
 * and compared. --dry-run only prints the row counts on both sides.
 */
import fs from "node:fs";
import path from "node:path";
import { describeDatabase, ensureMigrated, isRemoteUrl, openDatabase } from "../src/lib/db/connect";
import { copyDatabase, tableCounts, verifyCopy } from "../src/lib/db/copy";
import { loadEnv, resolveTarget } from "./db-env";

loadEnv();

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const value = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

async function main() {
  const backup = flag("backup");
  const fromName = value("from") ?? (backup ? "cloud" : undefined);
  const toName = value("to") ?? (backup ? `file:data/backups/perfect-pitch-${stamp()}.db` : undefined);
  if (!fromName || !toName) {
    console.error("Say where from and where to, for example:\n  npm run db:copy -- --from local --to cloud\n  npm run db:backup");
    process.exit(1);
  }
  const from = resolveTarget(fromName);
  const to = resolveTarget(toName);
  if (from.url === to.url) throw new Error("The source and the target are the same database.");
  if (!isRemoteUrl(from.url) && !fs.existsSync(path.resolve(from.url.slice("file:".length)))) throw new Error(`There is no ${describeDatabase(from.url)}.`);

  console.log(`From ${describeDatabase(from.url)}`);
  console.log(`To   ${describeDatabase(to.url)}`);

  const src = openDatabase(from.url, from.authToken);
  const dst = openDatabase(to.url, to.authToken);
  try {
    const before = await tableCounts(src.client);
    // A dry run only looks: a target that has no tables yet is shown as empty, and stays that way.
    const dry = flag("dry-run");
    // Otherwise the target gets its tables from the migrations in drizzle/, like the app's own first start.
    if (!dry) await ensureMigrated(dst.db, dst.client);
    const there = await tableCounts(dst.client).catch((err) => {
      if (dry) return null;
      throw err;
    });
    console.log("\nRows            source   target (before)");
    for (const t of Object.keys(before)) console.log(`  ${t.padEnd(15)} ${String(before[t]).padStart(6)}   ${String(there ? there[t] : 0).padStart(6)}`);
    if (dry) {
      console.log("\nDry run: nothing copied.");
      return;
    }

    console.log("");
    const t0 = Date.now();
    let last = "";
    const report = await copyDatabase(src.client, dst.client, {
      force: flag("force"),
      onProgress: (table, done, total) => {
        const line = `  copying ${table}: ${done} / ${total}`;
        if (process.stdout.isTTY) process.stdout.write(`\r${line.padEnd(last.length)}`);
        else if (done === total || done % 5000 === 0) console.log(line);
        last = line;
      },
    });
    if (process.stdout.isTTY && last) process.stdout.write("\n");
    const copied = report.tables.reduce((n, t) => n + t.rows, 0);
    console.log(`Copied ${copied} rows in ${((Date.now() - t0) / 1000).toFixed(1)} s. Checking every row…`);
    if (report.sequenceWarnings.length) console.log(`  (the id counter of ${report.sequenceWarnings.join(", ")} could not be set exactly; new ids start above the highest one, which is fine)`);

    const check = await verifyCopy(src.client, dst.client);
    for (const t of check.tables) console.log(`  ${t.same ? "✓" : "✗"} ${t.table.padEnd(15)} ${String(t.rows).padStart(6)} rows${t.same ? "" : `  ${t.firstDifference}`}`);
    if (!check.ok) {
      console.error("\nThe copy does NOT match the source. Run it again with --force, and do not rely on the target until it passes.");
      process.exit(1);
    }
    console.log(`\nDone: ${describeDatabase(to.url)} holds an exact copy.`);
  } finally {
    src.client.close();
    dst.client.close();
  }
}

main().catch((err) => {
  console.error(`\n${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
