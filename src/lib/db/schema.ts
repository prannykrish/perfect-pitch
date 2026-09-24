import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

/**
 * A practice session: one run of a mode with a fixed settings snapshot.
 */
export const sessions = sqliteTable("sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  mode: text("mode").notNull(), // "single-note" | "sequence" | "chords" | "roulette" | "cents" | "transcribe" | ...
  startedAt: integer("started_at").notNull(), // epoch ms
  endedAt: integer("ended_at"),
  settings: text("settings", { mode: "json" }).notNull(),
});

/**
 * Every single rep. Target/answer are JSON because their shape depends on the mode.
 * Denormalised pitch-class/octave columns make single-note stats cheap.
 */
export const attempts = sqliteTable(
  "attempts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: integer("session_id").references(() => sessions.id),
    mode: text("mode").notNull(),
    createdAt: integer("created_at").notNull(),
    instrumentId: text("instrument_id").notNull(),
    target: text("target", { mode: "json" }).notNull(),
    answer: text("answer", { mode: "json" }).notNull(),
    correct: integer("correct", { mode: "boolean" }).notNull(),
    score: real("score").notNull().default(0), // 0..1 partial credit
    responseMs: integer("response_ms").notNull(),
    replays: integer("replays").notNull().default(0),
    targetPitchClass: integer("target_pitch_class"),
    targetOctave: integer("target_octave"),
    answerPitchClass: integer("answer_pitch_class"),
    answerOctave: integer("answer_octave"),
  },
  (t) => [
    index("attempts_created_at_idx").on(t.createdAt),
    index("attempts_mode_idx").on(t.mode),
    index("attempts_instrument_idx").on(t.instrumentId),
    index("attempts_session_idx").on(t.sessionId),
  ]
);

/**
 * MIDI takes recorded from the USB piano (Head to Keys tab).
 */
export const recordings = sqliteTable("recordings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  createdAt: integer("created_at").notNull(),
  name: text("name").notNull(),
  instrumentId: text("instrument_id").notNull(),
  bpm: integer("bpm"),
  durationMs: integer("duration_ms").notNull(),
  events: text("events", { mode: "json" }).notNull(), // RecordedNote[]
  sourceRef: text("source_ref"),
});

/**
 * Uploaded (or otherwise saved) pieces for the transcription trainer. `data` is a Piece
 * (src/lib/music/score.ts) as JSON. Bundled Bach chorales are static files, not rows.
 */
export const pieces = sqliteTable("pieces", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  createdAt: integer("created_at").notNull(),
  name: text("name").notNull(),
  source: text("source").notNull(), // "upload" | "generated"
  bpm: integer("bpm").notNull(),
  beatsPerBar: integer("beats_per_bar").notNull(),
  totalBeats: real("total_beats").notNull(),
  data: text("data", { mode: "json" }).notNull(),
});

/**
 * Chunk-mode progress through a piece, one row per phrase. pieceKey is "bach:012" or "upload:5".
 */
export const pieceProgress = sqliteTable(
  "piece_progress",
  {
    pieceKey: text("piece_key").notNull(),
    phraseIndex: integer("phrase_index").notNull(),
    bestScore: real("best_score").notNull().default(0),
    attempts: integer("attempts").notNull().default(0),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [index("piece_progress_key_idx").on(t.pieceKey, t.phraseIndex)]
);

/**
 * Key/value store for misc persisted state (last settings, etc.).
 */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export type Session = typeof sessions.$inferSelect;
export type Attempt = typeof attempts.$inferSelect;
export type NewAttempt = typeof attempts.$inferInsert;
export type Recording = typeof recordings.$inferSelect;
