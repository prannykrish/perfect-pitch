# Progress

Update this file at the end of every session. Keep it short and factual. Newest session at the top.

## Current phase

Phase 4 — Hear It, Play It — is built (2026-09-24) but not yet tried with the piano; Pranav will do that on 2026-09-25. **Phase 5 (Find the Mistake) is next and has been explained to him and agreed; when he says "phase 5", build it straight away from the detailed spec in PLAN.md → Tab 3, following the build order there. No further explanation needed.**

## Handoff for the next session

1. Read `docs/PLAN.md` fully (especially Tab 3 "Detailed spec") and this file.
2. Start Phase 5 with step (1) of the build order: detuned note + wrong note on generated melodies with the shared timeline answer widget. Reuse: `useQuiz` adapter pattern (`src/components/trainer/use-quiz.ts`), `phrase-gen.ts`, `chords.ts`, `sources.ts`, `PianoRoll`, `FeedbackBanner`, `SessionSummary`, the `detune` option of `engine.playNotes`.
3. Add a planted-problem check to `scripts/selftest-generators.mts` (or a new selftest) and wire it into `npm run selftest`.
4. Keep `npm run build`, `tsc --noEmit`, `npx eslint src scripts` clean (React Compiler lint rules: never write refs or set state during render; key per-question state on the question object; assign refs in effects — see `useLatest`).
5. Update this file and the PLAN decisions log at the end.
6. If Pranav reports anything from his Phase 4 test, fix that first.

## How to run

```
npm install
npm run samples          # once: downloads FluidR3_GM soundfonts to public/soundfonts (~300 MB, gitignored)
npm run samples:streamed # once: converts the streamed sets (Steinway, e-pianos, mallets, Versilian, Mellotron, bass) to local mp3 (~15 min)
npm run dev              # http://localhost:3000
```

Use a regular Chrome or Edge window (Web MIDI + codecs). The IDE's embedded browser preview cannot decode Opus/AAC and denies MIDI. Plug in the USB piano before opening the page, or press the rescan icon in the MIDI panel. The SQLite database is created automatically at `data/perfect-pitch.db` on first use; migrations in `drizzle/` run on startup.

## Done

- [x] Docs: `docs/PLAN.md`, `docs/PROGRESS.md`, `CLAUDE.md`.
- [x] Next.js 16 + TypeScript + Tailwind v4 + shadcn (Base UI generation) scaffold. Dark theme default, theme toggle.
- [x] `scripts/download-samples.mjs` + `npm run samples`; all 128 FluidR3_GM instruments downloaded locally; manifest.json; CDN fallback in the engine.
- [x] Instrument registry (`src/lib/audio/instruments.ts`): 128 GM + Splendid Grand Piano + 4 electric pianos + 11 mallets + 2 double bass + 34 Mellotron tapes + ~75 curated Versilian instruments + 12 synth presets. Each with family, realistic range, tier (clean/hard/chaos), pitched flag.
- [x] Audio engine (`src/lib/audio/engine.ts`): AudioContext singleton, LRU cache of 14 loaded instruments, Cache API storage for CDN samples, playNote / playNotes with per-note detune (cents) support.
- [x] Web Audio synth (`src/lib/audio/synth.ts`): waveforms, additive, FM, pitched noise, inharmonic, glide, and `random` (new timbre every note).
- [x] Web MIDI manager (`src/lib/midi/midi.ts`) + recorder; MIDI panel component with device picker and enable toggle.
- [x] SQLite + Drizzle schema (sessions, attempts, recordings, settings); server actions: start/end session, logAttempt, lifetime stats, save/list/get/delete recordings.
- [x] Trainer tab, Single note mode: chromatic pool with pitch-class checkboxes, range slider, realistic-range clamp, pitch+octave or pitch-class answers, on-screen piano, 12 pitch buttons with key hints, octave selector (Z/X/0-8), USB piano answering, keyboard shortcuts (Space / R / Esc), replay limits, auto-proceed, question count, adaptive weighting, instrument modes (fixed / random per question with a rotating preloaded pool), feedback with "hear my answer", end-of-quiz summary tables (by note, octave, instrument, recent misses). Every attempt logged.
- [x] Head to Keys tab: live Ableton-style piano roll of MIDI input (canvas, 30 s window), on-screen keyboard showing held keys, record / stop / play take through any instrument, optional local sound while playing, save takes to DB, list / open / delete takes.
- [x] Stats tab: lifetime numbers, by pitch class, by octave, by instrument, last 90 days (tables; charts come in Phase 3).
- [x] Placeholder tabs for Transcribe, Mistakes, Calendar describing what is coming and in which phase.
- [x] `npm run build`, `tsc --noEmit` and `npm run lint` pass.

### Phase 2 (2026-09-24)
- [x] Shared quiz engine `src/components/trainer/use-quiz.ts` (phases, instrument pool, session + attempt logging, replays, auto-proceed, Space/R/Esc, octave keys, USB piano input) with a per-mode adapter (generate / play / score / log / record). `quiz-shell.tsx` renders the common card; `note-entry.tsx` is the multi-note answer widget (slots, undo ⌫, clear, Enter to submit); `session-summary.tsx` is the generic end-of-quiz summary with per-mode breakdowns.
- [x] Theory: `src/lib/music/intervals.ts` (1–24 semitones with names), `src/lib/music/chords.ts` (33 qualities in 5 categories, inversions, closed/open/drop-2 voicings, clusters, `identifyChord`, symmetric-chord handling). `src/lib/trainer/generators.ts` builds sequence / interval / chord / cents questions; `scripts/selftest-generators.mts` checks them (`npx tsx scripts/selftest-generators.mts`).
- [x] Sequence: 2–12 notes, gap, max jump, per-note instrument, per-position scoring, target-vs-you rows, "hear my answer".
- [x] Intervals: pair (melodic asc/desc/both or harmonic), chain (every consecutive interval), stack (from the bottom note); simple or compound; allowed-interval filter; answer by buttons or by playing the notes on the piano (distances graded, not notes).
- [x] Chords & clusters: real chords (root + quality, optional inversion; or every note) and random clusters (any order / bottom-up); categories, voicings, inversions, playback blocked / arpeggio-then-blocked / arpeggio; play the chord on the piano and it is identified.
- [x] Timbre roulette: single-note answering with a different instrument every question drawn from everything (tiers apply).
- [x] Cents: single note (flat / sharp / in tune + amount, buckets 5–50), pair (which of two is off), triad (which member is off); "hear it in tune"; summary reports the smallest deviation reliably heard.
- [x] Adaptive weighting seeded from lifetime DB stats (`getMissWeights`) at the start of every quiz; per-mode keys (interval, chord quality, cents bucket) weighted within a session.
- [x] Trainer tab remembers the last mode; settings card shows the section for the active mode.

### Phase 3 (2026-09-24)
- [x] Timbre roulette folded into the trainer as the pool option "Everything, new sound every question" (Pranav asked what the difference was; there was not enough of one for a separate tab). Old `roulette` attempts still count as single-note in stats.
- [x] `getStats(rangeDays)` in `src/lib/db/actions.ts`: totals, today, streaks, per-day series, by mode / pitch class / octave / instrument, 12×12 confusion (single-note modes), per-interval, per-chord-quality, per-cents-bucket with direction accuracy, daily JND (smallest bucket ≥80% direction accuracy on 4+ reps), per-sequence-length. Per-mode numbers come from SQLite `json_extract` / `json_each` over the stored target/answer JSON.
- [x] Stats page: range filter row (7 / 30 / 90 / all, `?range=`), five stat tiles, reps / accuracy / response-time per day, accuracy by note and by octave, confusion heatmap, intervals, cents, JND trend, chords+sequences table, weakest items (5+ reps), by mode, by instrument. Every chart has a table-view toggle. Charts use shadcn charts (Recharts) with the validated single-series blue (`.viz-root` tokens in `globals.css`, light and dark), thin marks, hairline grids, no dual axes; the dataviz skill's palette validator passed for both modes.

### Phase 4 (2026-09-24)
- [x] Score model `src/lib/music/score.ts` (beats-based Piece / Track / Phrase, `slicePhrases`, `pieceFromMidiJson`).
- [x] Bundled Bach chorales: `npm run pieces` (`scripts/build-chorales.mjs`) converts the JSB Chorales dataset (382 four-part chorales, 16th-note grid) into `public/pieces/bach/NNN.json` + `index.json` (5 MB, committed). Repeated same-pitch notes are merged (dataset limitation).
- [x] Grader `src/lib/trainer/grade.ts`: edit-distance alignment of played vs reference (near-simultaneous notes ordered by pitch so chords are order-insensitive), matched / wrong / missing / extra, fitted tempo line, optional rhythm score with tolerance, octave-insensitive option. `scripts/selftest-grader.mts` covers it (`npm run selftest` runs both self-tests).
- [x] Phrase generator `src/lib/trainer/phrase-gen.ts`: key/scale, bars, style (stepwise / mixed / arpeggio / jazz / bass), rhythm (quarters / eighths / mixed / syncopated), 1–4 voices over a diatonic progression, rests, chromaticism.
- [x] DB: `pieces` (uploaded MIDI as JSON) and `piece_progress` (chunk-mode best score per phrase); migration `0001_pieces` applied. Actions: savePiece / listPieces / getPiece / deletePiece / getPieceProgress / recordPhraseResult.
- [x] `/transcribe`: settings card (drill, source, generator options, chorale picker with prev/next/random, MIDI upload + picker, voice selection, bars per phrase, tempo scale, rhythm toggle OFF by default, tolerance, octave-insensitive, pass mark, one-listen, auto-proceed, silence auto-grade, playback instrument, shadow lag/window). Phrases tab: phrase echo / ladder (1→8 bars) / chunk mode (resumes at the first unpassed phrase). Flow: listen → your turn → auto-grade after silence or Enter → piano-roll diff with legend → next. "Show me" reveals the phrase. Session summary by phrase length and per-attempt misses. Shadow tab: one-bar count-in, piece scrolls Ableton-style with ghost reference notes, live matching within a window with configurable lag, live accuracy. Every attempt logged (`transcribe`, `shadow`).

## Next

1. Pranav tries: ladder on generated phrases (pitch only), a chorale in chunk mode with soprano only then all voices, one-listen, shadow mode on a chorale, and uploading a .mid file.
2. Stats tab: add transcription breakdowns (longest phrase passed, accuracy by voice count, shadow accuracy over time) — the data is already logged in `target`/`answer` JSON.
3. Phase 5: Find the Mistake.

## Known issues / not yet verified

- **Phase 4 is unverified in the browser.** Self-tests, type check, lint and build pass; the page renders. Pranav could not test with the piano yet. He hit one runtime error ("Element type is invalid… RollLegend") which was a stale client module after an edit to `piano-roll.tsx` while the tab was open; a hard reload (Ctrl+Shift+R) or restarting `npm run dev` clears it. If it reappears after a clean restart, treat it as real.
- Stats tab does not yet show transcription/shadow breakdowns (planned with Phase 5).
- **Streamed (CDN) instruments did not decode in Pranav's browser.** smplr's CDN samples are Ogg **Opus** (.ogg) and AAC (.m4a); his browser decoded neither (both local probe files failed), while local mp3 plays fine. His browser also reported "MIDI access denied", which together points at an embedded browser preview rather than a normal Chrome/Edge window. Two layers of fix:
  1. `src/lib/audio/sample-format.ts` runs a capability check (local copies in `public/probe/` + one CDN fetch); Settings → "Streamed instruments" shows the result with Details/Copy; instruments that cannot play are hidden from pickers and random pools (`isInstrumentAvailable` in `engine.ts`).
  2. `npm run samples:streamed` (`scripts/vendor-streamed.mts`) runs smplr in Node against a fake AudioContext to capture the exact sample URLs, downloads the Opus files, decodes them (`ogg-opus-decoder`) and encodes mp3 (`@breezystack/lamejs`) into `public/streamed/` (gitignored, ~4,555 files). The engine serves vendored instruments from there (`withLocalMirror`), so they work in any browser and offline. Resumable; `--dry-run`, `--only <id substring>`, `--kbps`.
  Vendoring completed in session 1: 128/128 instruments complete, 4,543 mp3 files, 511 MB in `public/streamed/`. 12 sample files do not exist on the CDN at all (recorded under `missing` in the manifest; smplr skips them in the browser too). On a fresh clone run `npm run samples:streamed` again.
- MIDI was not exercised in a real browser during session 1. Type check, lint and production build pass.
- Versilian instrument paths were taken from smplr's live index; a handful may fail to load and will show a toast. Remove or fix them in the registry if so.
- "Random instrument every note" behaves like "every question" in Single note mode (there is only one note); it matters from Sequence mode onward.
- The on-screen piano in pitch+octave mode spans the full user range (up to 88 keys); on narrow screens it scrolls horizontally.
- MusyngKite (higher quality) kit is supported by the script (`npm run samples -- --kit MusyngKite`) but not yet exposed in the registry.

## Session log

### 2026-09-23 — Session 1
- Planned the whole product with Pranav (see PLAN.md), decisions: chromatic-only pool, pitch + octave default, buttons + USB electric piano input, all instruments, SQLite now / Supabase later, live piano roll is a must.
- Scaffolded, downloaded samples, built Phase 1 end to end.
- Pranav tested: local instruments work, he is happy with the trainer. Feedback applied: no confirmation replay after answering; correct = quick flash (250 ms) and on; wrong = readable pause (slider, default 1.8 s); collapsible settings column (button left of the mode tabs, remembered).
- Streamed CDN instruments failed to decode in his browser (see Known issues): added the capability check + availability filtering, and the `samples:streamed` vendoring script; full vendoring completed (128/128).
- Random instrument modes got an "Instrument pool" dropdown: All instruments / Random handful of families (with a Random re-roll button, shows the rolled families as badges) / Choose families (toggle list + Random button). Setting `poolMode` in `settings.ts`.
- Phase 2 described to Pranav; he asked for both chord answer settings, asked what cents are (explained: 100 per semitone), and added Intervals (pair / chain / stack). Built all of Phase 2 the same session.

### 2026-09-24 — Session 1, continued
- Pranav confirmed Phase 2 works in real Chrome 153 (streamed instruments decode; 128 vendored). Fixed the diagnostics display that drew a skipped probe as a red X.
- Asked the difference between single-note-with-random-instrument and timbre roulette; folded roulette into the pool dropdown ("Everything, new sound every question").
- Built Phase 3 (Stats) with the dataviz skill; palette validated in both modes.
- Explained Phase 4; his answers: no MIDI files of his own, rhythm grading must be a toggle (off at first), early stages are about memory. Built Phase 4 (chorales bundled from the JSB dataset, grader, generator, transcribe page, shadow mode, upload). He could not test with the piano yet.
- Explained Phase 5 (Find the Mistake) in detail; he wants it next. Wrote the detailed spec into PLAN.md → Tab 3.
- Nothing is committed to git yet (he has not asked); the working tree holds everything.
