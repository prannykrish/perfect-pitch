/**
 * Copying his data between two databases (the file on the laptop and Turso, in either direction),
 * row for row with ids kept. Used by scripts/db-copy.mts; checked by scripts/selftest-db.mts.
 *
 * Works on the raw SQLite values, not through Drizzle, so JSON text, booleans and timestamps arrive
 * exactly as they were stored.
 */
import type { Client, InValue } from "@libsql/client";
import { DATA_TABLES } from "./connect";

type Table = (typeof DATA_TABLES)[number];

/** A stable order for comparing two copies of a table. */
const ORDER_BY: Record<Table, string> = {
  sessions: "id",
  attempts: "id",
  recordings: "id",
  pieces: "id",
  piece_progress: "piece_key, phrase_index, updated_at",
  practice_plans: "id",
  settings: "key",
};

const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;

export async function tableColumns(client: Client, table: string): Promise<string[]> {
  const r = await client.execute({ sql: "select name from pragma_table_info(?) order by cid", args: [table] });
  return r.rows.map((row) => String(row[0]));
}

export async function countRows(client: Client, table: string): Promise<number> {
  const r = await client.execute(`select count(*) from ${quote(table)}`);
  return Number(r.rows[0][0]);
}

export async function tableCounts(client: Client): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of DATA_TABLES) out[t] = await countRows(client, t);
  return out;
}

export interface CopyOptions {
  /** Empty the target's tables first. Without it a target that holds any row is refused. */
  force?: boolean;
  onProgress?: (table: string, done: number, total: number) => void;
}

export interface CopyReport {
  tables: { table: string; rows: number }[];
  /** Tables whose id counter could not be carried over exactly (harmless: it restarts above the highest id). */
  sequenceWarnings: string[];
}

/** Rows fetched from the source per request, and written to the target per request. */
const PAGE = 500;
/** SQLite binds at most 32,766 values per statement; stay far below it. */
const MAX_PARAMS = 900;

/**
 * Copy every data table from `src` to `dst`. Both must already have the schema (see ensureMigrated).
 * Throws before writing anything when the target is not empty and `force` is off, or when the two
 * schemas differ.
 */
export async function copyDatabase(src: Client, dst: Client, opts: CopyOptions = {}): Promise<CopyReport> {
  // 1. Same columns on both sides, or nothing is touched.
  const columns = new Map<Table, string[]>();
  for (const t of DATA_TABLES) {
    const a = await tableColumns(src, t);
    const b = await tableColumns(dst, t);
    if (!a.length) throw new Error(`The source has no "${t}" table: it is not a Perfect Pitch Lab database, or it was never opened by the app.`);
    if (!b.length) throw new Error(`The target has no "${t}" table: its migrations did not run.`);
    if ([...a].sort().join() !== [...b].sort().join()) {
      throw new Error(`"${t}" has different columns on the two sides (source: ${a.join(", ")}; target: ${b.join(", ")}). Open the app once against the older one so it migrates, then copy again.`);
    }
    columns.set(t, a);
  }

  // 2. The target must be empty, unless told to replace what is there.
  const existing = await tableCounts(dst);
  const occupied = Object.entries(existing).filter(([, n]) => n > 0);
  if (occupied.length && !opts.force) {
    throw new Error(`The target already holds data (${occupied.map(([t, n]) => `${t}: ${n}`).join(", ")}). Nothing was copied. Pass --force to replace it.`);
  }
  if (occupied.length) {
    // Children before parents: attempts point at sessions.
    await dst.batch([...DATA_TABLES].reverse().map((t) => `delete from ${quote(t)}`), "write");
  }

  // 3. Copy, a page at a time, in rowid order.
  const report: CopyReport = { tables: [], sequenceWarnings: [] };
  for (const t of DATA_TABLES) {
    const cols = columns.get(t)!;
    const total = await countRows(src, t);
    const colList = cols.map(quote).join(", ");
    const rowsPerInsert = Math.max(1, Math.floor(MAX_PARAMS / cols.length));
    const placeholders = `(${cols.map(() => "?").join(", ")})`;
    let after = -1;
    let done = 0;
    for (;;) {
      const page = await src.execute({ sql: `select rowid, ${colList} from ${quote(t)} where rowid > ? order by rowid limit ?`, args: [after, PAGE] });
      if (!page.rows.length) break;
      const stmts: { sql: string; args: InValue[] }[] = [];
      for (let i = 0; i < page.rows.length; i += rowsPerInsert) {
        const chunk = page.rows.slice(i, i + rowsPerInsert);
        const args: InValue[] = [];
        for (const row of chunk) for (let c = 0; c < cols.length; c++) args.push(row[c + 1] as InValue);
        stmts.push({ sql: `insert into ${quote(t)} (${colList}) values ${chunk.map(() => placeholders).join(", ")}`, args });
      }
      await dst.batch(stmts, "write");
      after = Number(page.rows[page.rows.length - 1][0]);
      done += page.rows.length;
      opts.onProgress?.(t, done, total);
    }
    report.tables.push({ table: t, rows: done });
  }

  // 4. Carry the id counters over, so the next id is the same on both sides even when the highest rows were deleted.
  const seqs = await src.execute("select name, seq from sqlite_sequence").catch(() => null);
  for (const row of seqs?.rows ?? []) {
    const name = String(row[0]);
    if (!(DATA_TABLES as readonly string[]).includes(name)) continue;
    try {
      await dst.batch(
        [
          { sql: "delete from sqlite_sequence where name = ?", args: [name] },
          { sql: "insert into sqlite_sequence (name, seq) values (?, ?)", args: [name, Number(row[1])] },
        ],
        "write"
      );
    } catch {
      report.sequenceWarnings.push(name);
    }
  }
  return report;
}

export interface VerifyReport {
  ok: boolean;
  tables: { table: string; rows: number; same: boolean; firstDifference?: string }[];
}

/** Read both sides back and compare every value of every row. */
export async function verifyCopy(src: Client, dst: Client): Promise<VerifyReport> {
  const out: VerifyReport = { ok: true, tables: [] };
  for (const t of DATA_TABLES) {
    const cols = await tableColumns(src, t);
    const sql = `select ${cols.map(quote).join(", ")} from ${quote(t)} order by ${ORDER_BY[t]} limit ? offset ?`;
    let offset = 0;
    let same = true;
    let firstDifference: string | undefined;
    for (;;) {
      const [a, b] = await Promise.all([src.execute({ sql, args: [PAGE * 4, offset] }), dst.execute({ sql, args: [PAGE * 4, offset] })]);
      if (a.rows.length !== b.rows.length) {
        same = false;
        firstDifference = `row counts differ near row ${offset + Math.min(a.rows.length, b.rows.length) + 1}`;
        break;
      }
      for (let i = 0; i < a.rows.length && same; i++) {
        for (let c = 0; c < cols.length; c++) {
          if (a.rows[i][c] !== b.rows[i][c]) {
            same = false;
            firstDifference = `row ${offset + i + 1}, column ${cols[c]}`;
            break;
          }
        }
      }
      offset += a.rows.length;
      if (!same || a.rows.length < PAGE * 4) break;
    }
    if (!same) out.ok = false;
    out.tables.push({ table: t, rows: offset, same, firstDifference });
  }
  return out;
}
