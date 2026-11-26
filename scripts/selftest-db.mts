/**
 * Database checks that need no network: which day a rep belongs to (timezone and daylight
 * saving), migrations on a fresh file, copying between two databases, and the password gate.
 *   npx tsx scripts/selftest-db.mts
 * Everything happens in throwaway files under the system temp folder.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { GATE_COOKIE, gateIsOn, gateToken, isUnlocked, passwordMatches, safeNextPath } from "../src/lib/auth/gate";
import { DATA_TABLES, appliedMigration, describeDatabase, ensureMigrated, isRemoteUrl, newestMigration, openDatabase } from "../src/lib/db/connect";
import { copyDatabase, countRows, tableCounts, verifyCopy } from "../src/lib/db/copy";
import { appTimeZone, dayKeyIn, daySql, offsetSegments, offsetSql, shiftDayKey, startOfDayIn, utcOffsetSeconds, zoneSegments } from "../src/lib/db/time";

let failures = 0;
const check = (c: boolean, msg: string) => {
  if (!c) {
    failures++;
    console.error("  ✗", msg);
  }
};
const throws = async (fn: () => Promise<unknown>, pattern: RegExp, msg: string) => {
  try {
    await fn();
    check(false, `${msg} (did not throw)`);
  } catch (err) {
    check(pattern.test(String(err instanceof Error ? err.message : err)), `${msg} (threw: ${err instanceof Error ? err.message : err})`);
  }
};

// ----- the day a rep belongs to -----
const CHI = "America/Chicago";
const fallBack = Date.UTC(2026, 10, 1, 7); // 2026-11-01 02:00 CDT → 01:00 CST
const springForward = Date.UTC(2027, 2, 14, 8); // 2027-03-14 02:00 CST → 03:00 CDT
check(utcOffsetSeconds(CHI, fallBack - 1000) === -5 * 3600, "Chicago is UTC−5 just before the November change");
check(utcOffsetSeconds(CHI, fallBack) === -6 * 3600, "Chicago is UTC−6 from the November change");
check(utcOffsetSeconds("Asia/Kolkata", fallBack) === 5.5 * 3600, "a half-hour zone");
check(utcOffsetSeconds("UTC", fallBack) === 0, "UTC has no offset");

const segs = offsetSegments(CHI, Date.UTC(2026, 0, 1), Date.UTC(2028, 0, 1));
check(segs.length === 5, `Chicago 2026–2027 has four clock changes (${segs.length - 1} found)`);
check(segs[1].untilMs === fallBack && segs[1].offsetSec === -5 * 3600, "the November 2026 change is found to the second");
check(segs[2].untilMs === springForward && segs[2].offsetSec === -6 * 3600, "the March 2027 change is found to the second");
check(segs[segs.length - 1].untilMs === null, "the last segment is open-ended");
check(offsetSegments("Asia/Kolkata", Date.UTC(2026, 0, 1), Date.UTC(2028, 0, 1)).length === 1, "a zone without daylight saving is one segment");
check(offsetSql("x", [{ untilMs: null, offsetSec: 19800 }]) === "19800", "one segment is a plain number");
check(/^case when x < \d+ then -?\d+ .* else -?\d+ end$/.test(offsetSql("x", segs)), "several segments become a CASE");
check(zoneSegments(CHI) === zoneSegments(CHI), "segments are cached");

check(dayKeyIn(CHI, Date.UTC(2026, 10, 25, 5, 59, 59)) === "2026-11-24", "23:59:59 in Chicago is still the 24th");
check(dayKeyIn(CHI, Date.UTC(2026, 10, 25, 6, 0, 0)) === "2026-11-25", "midnight in Chicago starts the 25th");
check(dayKeyIn("UTC", Date.UTC(2026, 10, 25, 5, 59, 59)) === "2026-11-25", "the same instant is already the 25th in UTC");
check(startOfDayIn(CHI, Date.UTC(2026, 10, 25, 20)) === Date.UTC(2026, 10, 25, 6), "start of a winter day in Chicago");
check(startOfDayIn(CHI, Date.UTC(2026, 6, 4, 20)) === Date.UTC(2026, 6, 4, 5), "start of a summer day in Chicago");
check(startOfDayIn(CHI, Date.UTC(2026, 10, 1, 20)) === Date.UTC(2026, 10, 1, 5), "start of the 25-hour day: midnight was still summer time");
check(shiftDayKey("2026-03-01", -1) === "2026-02-28" && shiftDayKey("2026-12-31", 1) === "2027-01-01" && shiftDayKey("2028-02-28", 1) === "2028-02-29", "calendar arithmetic on day keys");

{
  const saved = process.env.APP_TIMEZONE;
  process.env.APP_TIMEZONE = "Europe/Paris";
  check(appTimeZone() === "Europe/Paris", "APP_TIMEZONE names the zone");
  process.env.APP_TIMEZONE = "Not/AZone";
  check(appTimeZone() === Intl.DateTimeFormat().resolvedOptions().timeZone, "an unknown zone falls back to the machine's");
  delete process.env.APP_TIMEZONE;
  check(appTimeZone() === Intl.DateTimeFormat().resolvedOptions().timeZone, "no APP_TIMEZONE means the machine's zone");
  if (saved !== undefined) process.env.APP_TIMEZONE = saved;
}

// ----- the gate -----
{
  const saved = process.env.APP_PASSWORD;
  delete process.env.APP_PASSWORD;
  check(!gateIsOn() && (await isUnlocked(undefined)) && (await passwordMatches("anything")), "no APP_PASSWORD, no gate");
  process.env.APP_PASSWORD = "correct horse";
  const token = await gateToken("correct horse");
  check(gateIsOn(), "APP_PASSWORD switches the gate on");
  check(/^[0-9a-f]{64}$/.test(token) && token === (await gateToken("correct horse")), "the cookie value is a stable 256-bit digest");
  check(!token.includes("correct"), "the cookie does not contain the password");
  check(await isUnlocked(token), "the right cookie opens the gate");
  check(!(await isUnlocked(undefined)) && !(await isUnlocked("")) && !(await isUnlocked(token.slice(1))) && !(await isUnlocked(await gateToken("Correct horse"))), "anything else does not");
  check((await passwordMatches("correct horse")) && !(await passwordMatches("correct horse ")) && !(await passwordMatches("")), "only the exact password matches");
  process.env.APP_PASSWORD = "changed";
  check(!(await isUnlocked(token)), "changing the password signs every device out");
  if (saved === undefined) delete process.env.APP_PASSWORD;
  else process.env.APP_PASSWORD = saved;
  check(GATE_COOKIE.length > 0, "the cookie has a name");
  check(safeNextPath("/stats?range=30") === "/stats?range=30" && safeNextPath("/calendar") === "/calendar", "after unlocking, back to the page that was asked for");
  check(safeNextPath("//evil.example") === "/trainer" && safeNextPath("https://evil.example") === "/trainer" && safeNextPath("/\\evil") === "/trainer" && safeNextPath("/unlock") === "/trainer" && safeNextPath(undefined) === "/trainer", "never to another site, and never back to the lock");
}

// ----- addresses -----
check(!isRemoteUrl("file:data/perfect-pitch.db") && isRemoteUrl("libsql://name-org.turso.io") && isRemoteUrl("https://name-org.turso.io"), "file and cloud addresses are told apart");
check(describeDatabase("file:data/perfect-pitch.db") === "the file data/perfect-pitch.db", "a file is described by its path");
check(describeDatabase("libsql://name-org.turso.io") === "the cloud database name-org.turso.io", "a cloud database by its host, nothing more");

// ----- migrations, the day expression inside SQLite, and copying -----
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pp-selftest-db-"));
const fileUrl = (name: string) => `file:${path.join(dir, name).replace(/\\/g, "/")}`;
const opened: { client: { close(): void } }[] = [];
const open = (name: string) => {
  const o = openDatabase(fileUrl(name));
  opened.push(o);
  return o;
};

try {
  const a = open("a.db");
  check((await appliedMigration(a.client)) === 0, "a fresh file has no migrations");
  await ensureMigrated(a.db, a.client);
  check(newestMigration() > 0 && (await appliedMigration(a.client)) === newestMigration(), "migrations bring it up to date");
  await ensureMigrated(a.db, a.client); // nothing pending: must not throw or re-run
  const counts = await tableCounts(a.client);
  check(DATA_TABLES.every((t) => counts[t] === 0), "every data table exists and is empty");

  // The day expression must agree with SQLite's own 'localtime' on this machine, across clock changes.
  {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const zs = offsetSegments(zone, Date.UTC(2026, 0, 1), Date.UTC(2028, 0, 1));
    const stamps: number[] = [];
    for (const s of zs) {
      if (s.untilMs === null) continue;
      for (const d of [-86400e3, -3600e3 - 1000, -1000, 0, 1000, 3600e3 + 1000, 86400e3]) stamps.push(s.untilMs + d);
    }
    for (let i = 0; i < 400; i++) stamps.push(Date.UTC(2026, 8, 1) + Math.floor(Math.random() * 450 * 86400e3));
    // around local midnights, where a wrong offset would move the day
    for (let d = 0; d < 60; d++) {
      const midnight = startOfDayIn(zone, Date.UTC(2026, 9, 1) + d * 86400e3);
      stamps.push(midnight - 1, midnight, midnight + 1);
    }
    await a.client.execute("create table stamps (t integer not null)");
    await a.client.batch(stamps.map((t) => ({ sql: "insert into stamps (t) values (?)", args: [t] })), "write");
    const r = await a.client.execute(`select t, date(t / 1000, 'unixepoch', 'localtime') as sqlite_day, ${daySql("t", zs)} as our_day from stamps`);
    const bad = r.rows.filter((row) => row[1] !== row[2]);
    check(bad.length === 0, `the day expression matches SQLite's localtime for ${r.rows.length} instants in ${zone} (${bad.length} differ${bad.length ? `, e.g. ${new Date(Number(bad[0][0])).toISOString()} → ${bad[0][1]} vs ${bad[0][2]}` : ""})`);
    const js = r.rows.filter((row) => dayKeyIn(zone, Number(row[0])) !== row[2]);
    check(js.length === 0, `and matches the JavaScript day key (${js.length} differ)`);
    await a.client.execute("drop table stamps");
  }

  // Sample data with everything awkward in it.
  const json = (v: unknown) => JSON.stringify(v);
  await a.client.batch(
    [
      { sql: "insert into sessions (id, mode, started_at, ended_at, settings) values (?, ?, ?, ?, ?)", args: [3, "single-note", 1790000000000, 1790000600000, json({ answerMode: "pitch-octave", range: [31, 108] })] },
      { sql: "insert into sessions (id, mode, started_at, ended_at, settings) values (?, ?, ?, ?, ?)", args: [7, "chords", 1790001000000, null, json({ note: "Dó ré mi ♭ 🎹 \"quoted\"" })] },
      ...Array.from({ length: 1203 }, (_, i) => ({
        sql: "insert into attempts (id, session_id, mode, created_at, instrument_id, target, answer, correct, score, response_ms, replays, target_pitch_class, target_octave, answer_pitch_class, answer_octave, level_id, drill_id) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        args: [i * 2 + 5, i % 3 ? 3 : i % 2 ? 7 : null, "single-note", 1790000000000 + i * 1500, "gm:acoustic_grand_piano", json({ midi: 21 + (i % 88) }), json({ midi: 21 + ((i * 7) % 88), overridden: i % 50 === 0 }), i % 4 ? 1 : 0, i % 4 ? 1 : i % 3 ? 0.5 : 1 / 3, 400 + i, i % 3, i % 12, i % 9, i % 5 ? i % 12 : null, i % 5 ? i % 9 : null, i % 2 ? "L0" : null, i % 2 ? "octaves" : null],
      })),
      { sql: "insert into recordings (created_at, name, instrument_id, bpm, duration_ms, events, source_ref) values (?, ?, ?, ?, ?, ?, ?)", args: [1790000000001, "Take 1", "gm:violin", null, 1234, json([{ midi: 60, start: 0, end: 480.5 }]), null] },
      { sql: "insert into pieces (created_at, name, source, bpm, beats_per_bar, total_beats, data) values (?, ?, ?, ?, ?, ?, ?)", args: [1790000000002, "Upload", "upload", 96, 3, 24.0, json({ tracks: [] })] },
      { sql: "insert into piece_progress (piece_key, phrase_index, best_score, attempts, updated_at) values (?, ?, ?, ?, ?)", args: ["bach:012", 0, 1.0, 2, 1790000000003] },
      { sql: "insert into piece_progress (piece_key, phrase_index, best_score, attempts, updated_at) values (?, ?, ?, ?, ?)", args: ["bach:012", 1, 0.875, 1, 1790000000004] },
      { sql: "insert into practice_plans (date, items, notes, updated_at) values (?, ?, ?, ?)", args: ["2026-11-25", json([{ mode: "cents", target: 40 }]), "line one\nline two", 1790000000005] },
      { sql: "insert into settings (key, value, updated_at) values (?, ?, ?)", args: ["levels", json({ currentLevelId: "L0", completed: {}, lessonsRead: ["registers"] }), 1790000000006] },
      // the highest rows were deleted: the counter is ahead of the highest id
      { sql: "update sqlite_sequence set seq = 5000 where name = 'attempts'", args: [] },
    ],
    "write"
  );

  const b = open("b.db");
  await ensureMigrated(b.db, b.client);
  let progress = 0;
  const report = await copyDatabase(a.client, b.client, { onProgress: () => progress++ });
  check(report.tables.find((t) => t.table === "attempts")?.rows === 1203 && report.tables.find((t) => t.table === "sessions")?.rows === 2, "every row is copied");
  check(progress > 3, "progress is reported page by page");
  const v = await verifyCopy(a.client, b.client);
  check(v.ok && v.tables.every((t) => t.same), `the copy is identical (${v.tables.filter((t) => !t.same).map((t) => `${t.table}: ${t.firstDifference}`).join("; ")})`);
  const ids = await b.client.execute("select min(id), max(id), count(*) from attempts");
  check(Number(ids.rows[0][0]) === 5 && Number(ids.rows[0][1]) === 1202 * 2 + 5, "ids are kept, gaps and all");
  const types = await b.client.execute("select typeof(score), typeof(correct), typeof(target), typeof(session_id) from attempts where id = 5");
  check(types.rows[0][0] === "real" && types.rows[0][1] === "integer" && types.rows[0][2] === "text" && types.rows[0][3] === "null", "values keep their SQLite types");
  const next = await b.client.execute({ sql: "insert into attempts (mode, created_at, instrument_id, target, answer, correct, response_ms) values ('x', 1, 'x', '{}', '{}', 0, 1) returning id", args: [] });
  check(Number(next.rows[0][0]) === 5001, `the id counter is carried over (next id ${next.rows[0][0]})`);
  const v2 = await verifyCopy(a.client, b.client);
  check(!v2.ok && v2.tables.find((t) => t.table === "attempts")?.same === false, "a difference is noticed");

  await throws(() => copyDatabase(a.client, b.client), /already holds data/, "a target with data is refused");
  check((await countRows(b.client, "attempts")) === 1204, "and left untouched");
  await copyDatabase(a.client, b.client, { force: true });
  check((await verifyCopy(a.client, b.client)).ok, "--force replaces it with an exact copy");

  // and back the other way into a fresh file, as db:backup does
  const c = open("c.db");
  await ensureMigrated(c.db, c.client);
  await copyDatabase(b.client, c.client);
  check((await verifyCopy(a.client, c.client)).ok, "a copy of the copy still equals the original");

  const empty = open("empty.db");
  await throws(() => copyDatabase(a.client, empty.client), /migrations did not run/, "a target without tables is refused");
  await throws(() => copyDatabase(empty.client, c.client), /not a Perfect Pitch Lab database/, "a source without tables is refused");
} finally {
  for (const o of opened) o.client.close();
  try {
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  } catch {
    /* Windows can hold a just-closed database file for a moment; the temp folder is cleared by the system */
  }
}

if (failures) {
  console.error(`database self-test: ${failures} failure(s)`);
  process.exit(1);
}
console.log("database self-test: ok (days and daylight saving, migrations, copy and verify, password gate)");
