# Perfect Pitch Lab — Master Plan

This is the source of truth for what we are building and why. Read it fully at the start of every session, then read `docs/PROGRESS.md` for where we are.

## 1. Who this is for and what it is for

Pranav has absolute (perfect) pitch. He can hear any note and play it with no reference, and with practice can play back music he has just heard. His friend is a professional producer and Pranav already hears every tuning and theory problem in his tracks by ear.

The goal is not beginner ear training. The goal is thousands of high-difficulty reps that push the gift as far as it can go:

1. Hear any song or symphony and play or transcribe it immediately.
2. Compose in his head and play it immediately.
3. Hear every tuning, voicing and theory problem in a track and name the fix.
4. Learn as much music theory as possible through the ear, not through reading.

Pitch-class recognition is already easy for him. The things that actually limit "hear it, play it" are:

- **Polyphony parsing**: splitting chords and multi-voice music into individual notes and voices.
- **Memory span**: holding longer phrases before playing them.
- **Timbre independence**: recognising pitch regardless of instrument, synth, noise or register.
- **Cents-level tuning**: hearing how far sharp or flat something is, not just which note.
- **Ear-to-hands speed**: the latency between hearing/imagining and playing.
- **Harmonic vocabulary**: knowing chord qualities, inversions, extensions, voice leading, so a texture can be reduced quickly.

Every feature must train at least one of those measurably, and every attempt is logged.

## 2. Product principles

- **tonedear-fast**: the quiz loop is hear → answer → instant feedback → next, with keyboard shortcuts and auto-proceed. Never more than one click between reps. Infinite quiz by default.
- **shadcn/ui for every UI element**. No hand-rolled buttons, selects, tabs or dialogs. Custom canvases (piano, piano roll, heatmaps) live inside shadcn cards.
- **Default to hard**: chromatic, all octaves, mixed instruments, pitch + octave answers. Settings let you go easier, not the other way round.
- **Every rep is data**: every attempt stores target, answer, instrument, mode, response time, replays and a settings snapshot. Stats and adaptive selection are built on this.
- **Verify by MIDI when possible**: the USB piano is the primary way to answer in transcription and composition modes. Buttons and an on-screen piano are always available as a toggle.
- **Ground truth first**: transcription drills are only graded against sources where the app knows the exact notes (generated phrases, MIDI files). Audio-only sources cannot be auto-graded reliably.
- **Local first**: runs with one command on this PC. Data lives in a local SQLite file. Can move to Supabase/Postgres later without changing the app code (Drizzle ORM on both).

## 3. Stack

| Concern | Choice | Notes |
|---|---|---|
| Framework | Next.js (App Router, TypeScript) | One route per tab |
| UI | Tailwind + shadcn/ui | Everything |
| Charts | shadcn charts (Recharts) | Stats tab |
| Sampled instruments | `smplr` | Loads General MIDI soundfonts (FluidR3_GM, MusyngKite) plus its own Splendid Grand Piano, electric pianos, mallets, Versilian orchestral, Mellotron, double bass |
| Sample hosting | Local `public/soundfonts/` via `scripts/download-samples.mjs`; CDN fallback | Gitignored. Manifest lists what is local |
| Synth sounds | Web Audio API (oscillators, FM, filtered noise, additive) | "Random noises with pitch" generator |
| Music theory | `tonal` | Note names, chords, scales, intervals |
| MIDI in/out | Web MIDI API (raw) | Reads the USB electric piano. Chrome/Edge on Windows. Hook: `useMidiInput` |
| MIDI files | `@tonejs/midi` | Import pieces for transcription drills |
| Mic pitch | `pitchy` (McLeod method) | Monophonic only: humming, single-line acoustic piano |
| State | React state + `zustand` for engine/settings | |
| Database | SQLite (`better-sqlite3`) + Drizzle ORM | File at `data/perfect-pitch.db`, gitignored. Swap to Supabase later by changing the Drizzle driver |
| Data access | Next.js server actions | Client never touches DB directly |

Node 24, npm. Windows 11.

## 4. Repository layout

```
CLAUDE.md                 Session instructions (read every session)
docs/PLAN.md              This file
docs/PROGRESS.md          Where we are, what is next, how to run
scripts/download-samples.mjs   Downloads soundfonts to public/soundfonts
public/soundfonts/        Local sample files (gitignored) + manifest.json
data/                     SQLite db (gitignored)
src/app/                  Routes: / (redirect), /trainer, /transcribe, /mistakes, /compose, /stats, /calendar
src/components/ui/        shadcn components
src/components/           App components (piano, piano-roll, quiz shell, nav)
src/lib/audio/            engine.ts (playback), instruments.ts (registry + ranges), synth.ts (noise generator)
src/lib/music/            notes.ts, chords.ts, generators.ts (question/phrase generation)
src/lib/midi/             useMidiInput.ts, recorder.ts, player.ts
src/lib/db/               schema.ts, client.ts, actions.ts (server actions)
src/lib/stats/            aggregation helpers
```

## 5. Instruments

"As many instruments as possible." The registry (`src/lib/audio/instruments.ts`) contains:

- **All 128 General MIDI instruments** from FluidR3_GM (default) and optionally MusyngKite (higher quality, larger). Every one has all chromatic notes because the soundfont is rendered per note.
- **smplr premium sets**: Splendid Grand Piano (Steinway), Electric Pianos (CP80, Pianet T, Wurlitzer, TX81Z), Mallets (VCSL), Versilian orchestral set, Mellotron banks, Smolken double bass.
- **Synth generator** presets: sine, triangle, square, saw, random additive, FM bell, inharmonic bell, pitched noise, formant, glide-to-target, reversed sample, and "chaos" (fully randomised).

Each instrument has:

- `id`, `name`, `family` (piano, organ, guitar, bass, strings, brass, reed, pipe, synth, ethnic, percussive, sfx, premium, synth-gen)
- `range`: realistic sounding range in MIDI numbers, used by default so a flute never plays A0. A "full sampled range" toggle overrides it (A0–C8).
- `tier`: `clean` (clear fundamental), `hard` (odd timbres, extreme registers), `chaos` (GM sound effects and percussive banks that only have pitch because the sampler shifts them). Timbre roulette picks from tiers.

Selection modes everywhere: fixed instrument, random per question, random per note (each note in a sequence/chord from a different instrument), family-restricted, tier-restricted.

## 6. The tabs

### Tab 1: Pitch Trainer (`/trainer`)

The tonedear clone, extended. Shared quiz shell: settings card, big Hear Next (Space) and Hear Again (A) buttons, answer area, feedback, running score, End Quiz, summary table.

Shared settings:

- Note pool: chromatic (all 12) by default, with custom pitch-class checkboxes to narrow it. No beginner presets (no C-D-E, no C major).
- Octave range: low and high (default A0–C8 clamped to instrument range).
- Answer mode: **pitch class only** (12 buttons) or **pitch + octave** (default; on-screen piano or pitch buttons + octave row). Both always supported.
- Input: buttons/on-screen piano, keyboard shortcuts, USB electric piano. All can be on at once; the piano input is a toggle.
- Instrument selection mode (see section 5).
- Question count (0 = infinite), auto-proceed, replay limit (unlimited / 1 / none = one-shot).
- Note duration and gap.
- Adaptive weighting on/off: weights notes, octaves and instruments by recent miss rate.

Sub-modes:

1. **Single note**. One note, answer it. Per-note and per-instrument summary table.
2. **Sequence**. 2–12 notes back to back. Answer in order; each position scored; partial credit. Options: same or random instrument per note, gap length, one-shot replay.
3. **Chords and clusters**.
   - Real chords: triads, 6ths, 7ths, 9ths, 11ths, 13ths, sus, add, altered; inversions; closed/open/drop-2 voicings; 3–6 notes.
   - Two answer settings, chosen per session and tracked separately in stats: **(a) root + quality** (e.g. "C diminished", "B♭ dominant 7th"), with inversion as an optional extra; **(b) every note bottom to top**, no theory shortcut.
   - Random clusters: 2–6 random simultaneous notes with no theory to lean on. Answer every note (order-free or bottom-to-top).
   - Ladder option: play arpeggiated first, then blocked, then blocked only.
4. **Intervals**. The distance between notes, independent of which notes they are.
   - Two notes, melodic (one after the other, ascending or descending) or harmonic (together). Answer the interval name: minor 2nd through major 7th, octave, and compound intervals up to two octaves. Tritone included.
   - Chain: a sequence of 3–10 notes; answer every interval between consecutive notes in order. Partial credit per position.
   - Stack: a chord or cluster; answer every interval from the bottom note up.
   - Answer by buttons, keyboard shortcuts, or by playing two notes on the USB piano, where the app grades the distance, not the notes. This separates interval sense from note sense, which matters for someone with absolute pitch.
5. **Timbre roulette**. Every question or every note a different instrument, including the synth generator and chaos tier. Answer pitch (+ octave).
6. **Cents**. Cents measure how far out of tune a note is: 100 cents = one semitone, 50 cents = exactly halfway to the next note. A note is played detuned by ±N cents (default range 5–50, narrows as accuracy improves). Answer direction and amount (bucketed: 5, 10, 15, 20, 30, 50) or a slider. Tracks the smallest deviation reliably detected (JND) over time. Variant: two notes, which one is out of tune. Variant: a chord with one detuned member.

Feedback shows the target, your answer, and replays the target (and your wrong answer for comparison) on request.

### Tab 2: Hear It, Play It (`/transcribe`)

The transcription trainer. The app plays music it knows exactly; you play it back; the app grades.

Sources:

- **Generated phrases**: random melodies in a key/scale with rhythm, configurable length, range, leap size, chromaticism, style (stepwise, arpeggiated, jazz, bass line). Multi-voice generation (two to four voices, chorale-style).
- **MIDI files**: bundled public-domain pieces (Bach chorales/inventions first) and any MIDI you drop in. Sliced into phrases by bars.
- Later: your friend's MIDI stems.

Input: USB electric piano (primary), on-screen piano, or step entry with buttons.

Drills:

- **Phrase echo**: hear a phrase (1–8 bars, one or many voices), play it back. Grading: pitch match per note (order-aware, alignment via edit distance so one wrong note does not cascade), optional rhythm grading with tolerance. Result on a piano roll: matched green, wrong red, missing grey, extra orange.
- **Ladder**: length grows automatically as you succeed; shrinks on failure.
- **Voice isolation**: play back only the soprano / alto / tenor / bass of a multi-voice phrase; then two voices; then all.
- **Chunk mode**: walk a whole piece phrase by phrase; progress persisted.
- **One-listen**: replay disabled.
- **Shadow mode**: the piece plays continuously and you play along live; the roll scrolls like Ableton with the reference as ghost notes and your notes drawn on top in real time; live accuracy percentage; optional lag setting (play one beat behind).

### Tab 3: Find the Mistake (`/mistakes`)

The producer-feedback drill. The app plays a melody, progression or short multi-instrument texture with one planted problem. You identify where and what.

Problem types (each toggleable):

- One note detuned by N cents (which note, which direction).
- Wrong note (chromatic neighbour or wrong scale degree).
- Wrong chord quality (major/minor/dim/aug, dom7 vs maj7 etc.).
- Wrong inversion or voicing.
- Rhythm displaced.
- Parallel fifths/octaves or bad voice leading in a chorale (pick the beat).
- One instrument in a mix drifted flat/sharp.
- A/B: two renditions, which one is correct.

Answer UI: timeline of beats/notes to click, plus a "what is the fix" selector. Scored on location and diagnosis separately.

**Detailed spec (agreed with Pranav 2026-09-24, ready to build):**

- **Material.** Generated melodies and chord progressions (reuse `src/lib/trainer/phrase-gen.ts` and `src/lib/music/chords.ts`), the bundled Bach chorales, and uploaded MIDI (reuse `src/lib/transcribe/sources.ts` and `slicePhrases`). Any instrument from the registry; per-voice instruments for textures. Lengths from 2 bars to a phrase.
- **Planting.** Exactly one problem per question, chosen from the enabled types. Each type is a switch in the settings card:
  1. *Detuned note*: one note played N cents flat/sharp (buckets 5–50, same as the Cents mode; engine `detune` per note). Answer: which note (timeline), direction, optional amount.
  2. *Wrong note*: chromatic neighbour or wrong scale degree in a melody. Answer: which note, and the fix (what it should have been) as an optional extra.
  3. *Wrong chord quality*: in a progression, one chord swapped (maj↔min, dom7↔maj7, dim↔min, sus…). Answer: which chord, and what it should be.
  4. *Wrong inversion / voicing*: one chord in a different inversion or voicing than the reference. Answer: which chord.
  5. *Rhythm slip*: one note early or late by a fraction of a beat (only meaningful with a steady reference; melody plays at a fixed tempo). Answer: which note, early or late.
  6. *Drifted voice*: in a 2–4 voice texture, one voice is X cents off for a stretch of beats. Answer: which voice, direction.
  7. *Voice-leading fault*: in a chorale phrase, a voice altered to create parallel fifths/octaves or a doubled leading tone. Answer: which beat, which voice.
  8. *A/B*: two renditions, one clean, one with any of the above. Answer: which is correct (and optionally what was wrong with the other).
- **Answer widget.** One shared timeline component under the piano roll: beats (or the notes/chords themselves) as clickable slots in time order; for multi-voice material a voice selector. Then a diagnosis picker (flat / sharp / wrong note / wrong chord / wrong inversion / early / late) filtered to the enabled types, and where relevant a fix picker (note name / chord quality). Keyboard: number keys select slots, Enter submits, R replays, Space next, Esc ends.
- **Scoring.** Location 0.5 + diagnosis 0.5 (+ fix as a bonus that does not reduce the score when wrong). `correct` = location and diagnosis both right. Logged as mode `mistakes` with `target { type, source, index, cents?, voice?, original, altered }` and `answer { index, diagnosis, fix }`, so stats can break down by type and by cents amount in context.
- **Feedback.** The roll shows the altered note/chord in red and the correct one as a ghost; "Hear the clean version" and "Hear the mistake again" buttons; text says exactly what was planted ("bar 2 beat 3: E♭ should be E").
- **Stats additions (same phase).** Accuracy by problem type, by cents amount in context (the production-relevant JND), and by source. Plus the pending Phase 4 breakdowns: longest phrase passed, accuracy by voice count, shadow accuracy over time.
- **Build order.** (1) Detuned note + wrong note on generated melodies with the timeline widget; (2) chord quality + inversion on generated progressions; (3) rhythm slip; (4) drifted voice + voice-leading faults on chorales; (5) A/B; (6) stats.
- **Acceptance.** Each type can be drilled alone and mixed; every question has a "hear clean" comparison; scoring shows partial credit; `npm run selftest` includes a planted-problem generator check (the altered material must differ from the original in exactly one place).

### Tab 4: Head to Keys (`/compose`)

Training "hear it in your head, play it immediately". The app cannot read your head, so it uses constraints and comparison:

- **Live MIDI monitor**: Ableton-style scrolling piano roll of everything you play, in real time, with velocity shading. Always available.
- **Record and replay**: record a take, play it back through any instrument, change tempo, quantize on/off, loop, export as MIDI. Recordings saved to DB.
- **Prompt drills**: given key, tempo, progression and mood, a countdown timer to imagine 4 bars, then one take. Listen back, self-rate, log. Latency between "go" and first note is tracked.
- **Hum then play**: record your voice (pitchy monophonic pitch track), then play what you hummed; the app overlays the hummed contour on your played notes and scores the match. This is the closest measurable proxy for head-to-hands.
- **Theory drills**: "play Dbmaj9 in second inversion", "harmonise this melody with diatonic triads", "play ii-V-I in F# with drop-2 voicings", verified from MIDI. Grows the vocabulary needed for fast reduction.

### Tab 5: Stats (`/stats`)

Lifetime and per-period:

- Total reps, accuracy, current and longest streak, reps per day heatmap.
- 12×12 confusion matrix: target pitch class vs answered pitch class.
- Accuracy by octave, by instrument (and family, and tier), by mode, by chord quality, by sequence length.
- Response time trend; accuracy trend over time.
- Cents JND over time.
- Transcription: max phrase length passed, accuracy by voice count.
- Weakest items list (feeds adaptive weighting).

### Tab 6: Practice Calendar (`/calendar`)

- Plan sessions per day: which modes, rep targets, minutes.
- Daily view shows planned vs completed (auto-filled from attempts).
- Streaks and a contribution-style heatmap.
- Later: Google Calendar sync.

## 7. Data model (Drizzle, SQLite)

- `sessions`: id, mode, startedAt, endedAt, settings (json)
- `attempts`: id, sessionId, mode, createdAt, instrumentId, target (json: midi numbers / chord descriptor / cents), answer (json), correct (0/1), score (0–1 partial), responseMs, replays, targetPitchClass, targetOctave, answerPitchClass, answerOctave (denormalised for fast single-note stats)
- `recordings`: id, createdAt, name, instrumentId, bpm, events (json of MIDI events), durationMs, sourceRef (optional: what phrase it was answering)
- `pieces`: id, name, source, midi (blob/json), meta
- `piece_progress`: pieceId, phraseIndex, bestScore, attempts
- `practice_plans`: id, date, items (json), notes
- `settings`: key/value (last used settings per mode)

Migration to Supabase: same Drizzle schema on Postgres, swap the client, add auth if multi-user is ever wanted.

## 8. How the app trains "hear it in your head and play it" and "hear a song and play it"

Honest version: perfect pitch already solves the *what note* question. What remains is trainable and measurable:

1. **Chunk size** (Tab 2 ladder): the number of notes you can hold and reproduce grows with reps, like a memory span. Start at 3, aim for full 4–8 bar phrases.
2. **Voice separation** (Tab 1 clusters/chords, Tab 2 voice isolation): reps at pulling one line out of a texture, then two, then all.
3. **Timbre independence** (Tab 1 roulette, synth generator): pitch recognition that does not care what the sound is.
4. **Vocabulary** (Tab 1 chords, Tab 4 theory drills): naming a voicing instantly means you can play it instantly.
5. **Ear-to-hands latency** (Tab 2 shadow mode, Tab 4 prompt drills): measured in ms from stimulus to first correct note; should trend down.
6. **Audiation-to-motor** (Tab 4 hum-then-play): the hummed line is the externalised version of what was in your head; matching it with your hands is the actual skill.

The piano is where execution happens; the app is the judge and the rep counter. The USB electric piano makes every drill verifiable.

**What "MIDI" means here.** Pranav's electric piano has a USB port. Plugged into the PC it sends MIDI messages: which key went down or up, how hard, and when. The browser reads these through the Web MIDI API with no drivers or extra hardware. Whenever this plan says MIDI input, USB piano, or MIDI keyboard, it means that electric piano over USB.

## 9. Phases

Each phase ends in something usable. Acceptance criteria are what a new session should check before moving on.

- **Phase 1 — Foundation + single note** ✅ built and verified by Pranav (2026-09-23/24)
  - Next.js + shadcn scaffold, nav with all six tabs (placeholders where not built).
  - Instrument registry (all GM + smplr premium + synth presets), download script, local/CDN loading, ranges/tiers.
  - Audio engine: load instrument, play note/sequence/chord with scheduling.
  - Trainer: single-note mode complete, both answer modes, all shared settings, keyboard shortcuts, MIDI answer toggle, on-screen piano, summary table.
  - SQLite + Drizzle; every attempt logged via server action.
  - Head to Keys: live MIDI monitor piano roll with record and replay (early win; validates Web MIDI).
- **Phase 2 — Trainer depth** ✅ built 2026-09-24, awaiting Pranav's hands-on check: sequence mode, chords and clusters (both answer settings), intervals (pair, chain, stack), timbre roulette, cents mode, adaptive weighting from lifetime DB stats.
- **Phase 3 — Stats tab** ✅ built 2026-09-24: all charts in section 6/Tab 5 with table twins and a range filter; weakest-items list (the adaptive picker uses the same lifetime data via `getMissWeights`).
- **Phase 4 — Hear It, Play It** ✅ built 2026-09-24, awaiting Pranav's hands-on check: phrase generator, bundled Bach chorales, MIDI import, alignment grader, piano-roll diff, ladder, voice isolation, chunk mode, one-listen, shadow mode.
- **Phase 5 — Find the Mistake**: all problem types, timeline answer UI, A/B.
- **Phase 6 — Head to Keys depth**: prompt drills, hum-then-play with pitchy, theory drills, MIDI export.
- **Phase 7 — Calendar**: planner, completion tracking, streak heatmap.
- **Phase 8 — Polish and scale**: MusyngKite set, Supabase option, mobile layout, PWA/offline.

## 10. Decisions log

| Date | Decision |
|---|---|
| 2026-09-23 | Model UI/flow on tonedear absolute pitch test; shadcn for all UI |
| 2026-09-23 | Input: buttons AND the USB electric piano, toggleable; piano is primary for transcription/composition |
| 2026-09-23 | Note pool: chromatic only, narrowed by pitch-class checkboxes. No beginner presets |
| 2026-09-23 | Answer mode: pitch + octave default, pitch-class-only supported |
| 2026-09-23 | Instruments: as many as possible (all 128 GM + smplr premium + synth generator) |
| 2026-09-23 | DB: local SQLite via Drizzle now; Supabase is acceptable later |
| 2026-09-23 | Real-time Ableton-style piano roll of MIDI input, with record/replay, is a must-have |
| 2026-09-23 | Docs (this file + PROGRESS.md + CLAUDE.md) are written before code and kept current every session |
| 2026-09-24 | Streamed instruments are vendored locally as mp3 (`npm run samples:streamed`); never depend on browser codecs |
| 2026-09-24 | Random instrument modes: pool dropdown All / Random families / Choose families, with a Random re-roll button |
| 2026-09-24 | Chords: both answer settings (root + quality, and every note bottom to top), switchable per session |
| 2026-09-24 | Intervals added to Phase 2: pair, chain (all consecutive intervals in a sequence), stack; answerable by playing two notes on the piano |
| 2026-09-24 | Cents default range 5–50, narrowing as accuracy improves |
| 2026-09-24 | Timbre roulette is a pool option ("Everything, new sound every question"), not a separate mode |
| 2026-09-24 | Charts follow the dataviz skill: single-series blue, sequential blue heatmap, one axis per chart, table twin for every chart, range filter above all charts |
| 2026-09-24 | Transcription grades pitch and order only by default; rhythm grading is a toggle. Early stages are about memory span |
| 2026-09-24 | Bundled practice material: the 382 JSB chorales (16th-note grid); Pranav has no MIDI files yet, uploads supported |
