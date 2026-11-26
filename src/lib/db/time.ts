/**
 * Which calendar day a rep belongs to.
 *
 * While the database was a file on the laptop, SQLite's 'localtime' answered that with the laptop's
 * clock. A hosted database (and a hosted server) runs in UTC, where an evening session in Chicago
 * would land on tomorrow and break streaks and the three-day rule of the level gates. So days are
 * counted in one named zone, APP_TIMEZONE, and the offset is written into the SQL, split at each
 * daylight-saving change so old reps keep the day they were done on.
 *
 * Pure: no database, no Next. Checked by scripts/selftest-db.mts.
 */

/** The zone practice days are counted in: APP_TIMEZONE (an IANA name), else the zone of this machine. */
export function appTimeZone(): string {
  const named = process.env.APP_TIMEZONE?.trim();
  if (named) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: named });
      return named;
    } catch {
      /* not a zone this runtime knows: fall through to the machine's own */
    }
  }
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function wallClock(zone: string, ms: number): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  let f = formatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" });
    formatters.set(zone, f);
  }
  const out = { year: 0, month: 0, day: 0, hour: 0, minute: 0, second: 0 };
  for (const p of f.formatToParts(ms)) if (p.type in out) out[p.type as keyof typeof out] = Number(p.value);
  return out;
}

/** Seconds to add to UTC to read the clock on the wall in `zone` at the instant `ms`. */
export function utcOffsetSeconds(zone: string, ms: number): number {
  const w = wallClock(zone, ms);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 1000);
}

/** The local calendar day of an instant, YYYY-MM-DD. */
export function dayKeyIn(zone: string, ms: number): string {
  const w = wallClock(zone, ms);
  return `${w.year}-${String(w.month).padStart(2, "0")}-${String(w.day).padStart(2, "0")}`;
}

/** The instant the local day containing `ms` began. */
export function startOfDayIn(zone: string, ms: number): number {
  const w = wallClock(zone, ms);
  const midnight = Date.UTC(w.year, w.month - 1, w.day);
  // The offset at midnight can differ from the offset now (a clock change during the day): settle on it.
  let t = midnight - utcOffsetSeconds(zone, ms) * 1000;
  t = midnight - utcOffsetSeconds(zone, t) * 1000;
  return t;
}

/** The day before / after a YYYY-MM-DD key (plain calendar arithmetic, no zone involved). */
export function shiftDayKey(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export interface OffsetSegment {
  /** The offset holds for instants before this one; null on the last segment. */
  untilMs: number | null;
  offsetSec: number;
}

const DAY_MS = 86400e3;

/** The zone's UTC offsets between two instants, split at every clock change (to the second). */
export function offsetSegments(zone: string, fromMs: number, toMs: number): OffsetSegment[] {
  const out: OffsetSegment[] = [];
  let current = utcOffsetSeconds(zone, fromMs);
  for (let t = fromMs; t < toMs; t += DAY_MS) {
    const next = utcOffsetSeconds(zone, t + DAY_MS);
    if (next === current) continue;
    // The change is somewhere in this day: halve the interval until it is one second wide.
    let lo = t;
    let hi = t + DAY_MS;
    while (hi - lo > 1000) {
      const mid = lo + Math.floor((hi - lo) / 2000) * 1000;
      if (utcOffsetSeconds(zone, mid) === current) lo = mid;
      else hi = mid;
    }
    out.push({ untilMs: hi, offsetSec: current });
    current = next;
  }
  out.push({ untilMs: null, offsetSec: current });
  return out;
}

/** Nothing was logged before the app existed, so the offsets only need to be right from here on. */
const EPOCH_START = Date.UTC(2026, 0, 1);

const segmentCache = new Map<string, OffsetSegment[]>();

/** Offsets for the app's lifetime so far and the year ahead, cached per zone and year. */
export function zoneSegments(zone: string, now: number = Date.now()): OffsetSegment[] {
  const year = new Date(now).getUTCFullYear();
  const key = `${zone}:${year}`;
  let segs = segmentCache.get(key);
  if (!segs) {
    segs = offsetSegments(zone, EPOCH_START, Date.UTC(year + 2, 0, 1));
    segmentCache.set(key, segs);
  }
  return segs;
}

/**
 * SQL for "seconds to add to UTC" at the epoch-milliseconds expression `column`, as text ready to
 * splice into a query. Only numbers this module computed go into it.
 */
export function offsetSql(column: string, segments: OffsetSegment[]): string {
  const last = segments[segments.length - 1];
  if (segments.length === 1) return String(Math.trunc(last.offsetSec));
  const whens = segments
    .slice(0, -1)
    .map((s) => `when ${column} < ${Math.trunc(s.untilMs!)} then ${Math.trunc(s.offsetSec)}`)
    .join(" ");
  return `case ${whens} else ${Math.trunc(last.offsetSec)} end`;
}

/** SQL for the local calendar day (YYYY-MM-DD) of the epoch-milliseconds expression `column`. */
export function daySql(column: string, segments: OffsetSegment[]): string {
  return `date(${column} / 1000 + (${offsetSql(column, segments)}), 'unixepoch')`;
}
