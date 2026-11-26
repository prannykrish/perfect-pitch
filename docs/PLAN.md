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
- **Local first, then one home for the data**: runs with one command on this PC. Until 2026-11-25 the data lived in a local SQLite file; since Phase 8b it lives in one cloud database (Turso, the same SQLite dialect) that the laptop and the phone share, and the app is also hosted so the phone needs no laptop. The file stays as a backup, and the app still runs against a file when `DATABASE_URL` is unset.

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
| Database | SQLite through libSQL (`@libsql/client`) + Drizzle ORM | One driver, two homes: Turso in the cloud (`DATABASE_URL=libsql://…`, shared by laptop and phone) or the file `data/perfect-pitch.db` (the default when `DATABASE_URL` is unset; gitignored) |
| Data access | Next.js server actions | Client never touches DB directly. Every action opens with `await getDb()`; several queries go as one `db.batch` |
| Hosting | Vercel (Hobby), from the private GitHub repo | A push to `main` deploys. Password gate in `src/proxy.ts` + `/unlock` |

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
src/lib/db/               schema.ts, connect.ts (open + migrate), client.ts (getDb), actions.ts (server actions), time.ts (which day a rep belongs to), copy.ts
src/lib/auth/gate.ts      The hosted app's password gate (cookie HMAC); src/proxy.ts and src/app/unlock/ use it
drizzle/                  Migrations, applied on first database use
vercel.json               Hosting region (next to the database)
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
   5b. **Scales & modes** (added 2026-09-24 at Pranav's request). Hear a scale run (up, down or both) or a short generated melody that contains the scale's give-away notes and ends on the tonic; answer the scale type (15: major, the three minors, the five modes, the two pentatonics, blues, whole tone, diminished, chromatic) and optionally the tonic (by button, USB piano or keyboard). Same notes with the wrong home earns a little credit and says so. Enabled set narrows the buttons and the questions.
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

### Tab 6: Practice & Learn (`/calendar`)

Three tabs under one nav entry (widened by Pranav on 2026-09-24: "a calendar, but also a place to track my progress with certain aspects of music, and a place to synthesise music theory and teach me").

- **Calendar**: the **level card** first (see "The ladder" below), then the month grid with reps per day and planned-versus-done, a day panel for extra items on top of the level (mode, rep target, minutes, hint, hand tick, notes), streaks and a 26-week heatmap.
- **The ladder** (agreed 2026-09-26, replaces the weekly starter programme): nine levels, 0 to 8 plus Mastery, each a bundle of drills with exact settings and a mastery gate, plus reviews of earlier drills and lessons to read. Level 0 is octaves only. A gate is a rolling window of the drill's most recent tagged reps at an accuracy floor (95 % for hearing judgements, 90 % for played or diagnosed work, lower only for the hardest drills), spanning at least three practice days, with a spread rule where it matters (every octave / interval / quality / scale at its own floor). Pressing Start on the card writes the drill's settings into the tab and marks a level run; reps logged while those settings are untouched are tagged with the level and drill, and only tagged reps feed the gates. **Always count** (Settings page, nav gear, on by default since 2026-10-23): reps are also tagged without Start whenever the live settings run the test of a drill on the current level or one of its reviews; comfort settings (question count, auto-proceed, note length, replays, adaptive, input toggles) are ignored, and so are other trainer modes' settings, the random pool under a fixed instrument and the fixed id under a random one (`src/lib/practice/auto-count.ts`). The bar at the top of each tab says which drill the reps count toward, or that they do not. Under the level card, **The whole ladder** lists every level (passed / current / upcoming) with its drills, gates, reviews and reading. When every drill, review and lesson holds, the card says the app thinks he is ready; he advances by pressing Advance and may stay as long as he likes. Definitions in `src/lib/practice/levels.ts`, evaluation in `gates.ts`, the run in `level-run.ts`.
- **Progress**: fourteen skills in three areas (hearing, harmony and theory, head to hands), each with a headline number, a stage, the next milestone in words, a 30-day trend, a drill link and a lesson link.
- **Learn**: twelve lessons written for an ear that already hears everything (foundations, harmony, hearing and sound, practice), playable examples on every concept, "drill it" links, and a searchable glossary of every term.
- Later: Google Calendar sync; "plan next week from the weakest skill".

### Difficulty dials (all tabs) — agreed 2026-09-29, built 2026-10-24

**Why.** The ladder decides what to do next. The dials let Pranav poke at anything at any difficulty ("a playground") without hand-setting a dozen switches or leaving the settings panel in a half-sensible state. Free practice from a dial never counts toward a ladder gate (his decision).

**Rules.**
- One dial per thing he can do, at the top of that thing's settings section: Single note, Sequence, Intervals, Chords & clusters, Scales & modes, Cents (trainer, one dial per mode, shown for the active mode), Hear It Play It (transcribe settings), Find the Mistake (mistakes settings), Theory drills, Prompt drill, Hum then play (compose settings, one dial per section).
- Levels are numbered 1–8 (Hum has 4; Theory 1–6 are the existing theory levels, 7–8 add mixing and speed). Every step adds exactly one new demand and keeps all earlier ones; the spec below lists each step as the change on top of the previous level. Implement as cumulative diffs folded into full patches, so "apply level n" writes the complete bundle.
- Picking a number writes the full bundle into the store (`update(patch)`), like the ladder's Start does. If Pranav then edits any patched key by hand, the dial shows **custom** (detect = the highest level whose full patch equals the live settings on every key; none → custom). A dial change during a ladder run is a hand edit like any other: the level-run bar goes amber and reps stop counting until re-applied.
- Each level has a one-line summary shown under the dial ("Level 3: sus and add chords; inversions played, not asked").
- Presets live in one pure file so tuning a step is one line. Later the ladder's drills may reference dial levels instead of carrying raw patches (not part of this phase).

**Files.**
- `src/lib/practice/difficulty.ts` (pure): `DialId = "single" | "sequence" | "intervals" | "chords" | "scales" | "cents" | "transcribe" | "mistakes" | "theory" | "prompt" | "hum"`; `Dial { id; label; store: "trainer"|"transcribe"|"mistakes"|"compose"; levels: { n; title; summary; patch }[] }` with `patch` the full bundle; `detectDialLevel(dial, settings): number | null`; `dialLevelPatch(dial, n)`.
- `src/components/practice/difficulty-dial.tsx`: `ToggleGroup` 1…N (single value) + title + summary + a "custom" badge; `onValueChange` → the right store's `update`. Mounted in `trainer-settings.tsx` (per mode, above that mode's section), `transcribe-settings.tsx`, `mistakes-settings.tsx`, `compose-settings.tsx` (theory, prompt, hum sections).
- New trainer setting `chordQualities: string[]` (empty = every quality in the chosen categories); `randomChordSpec` in `src/lib/music/chords.ts` takes `qualities?: string[]` and filters the pool by id; `generateChord` passes it; default `[]`. Settings UI may expose it later; the dial is what writes it.
- `scripts/selftest-difficulty.mts` in `npm run selftest`: every patch key exists in that store's defaults; consecutive levels differ; applying level n to the defaults then detecting returns n for every dial and level; defaults themselves detect as custom or a level, never throw; Hum has 4 levels, Theory 8, all others 8.
- Lesson "How the ladder works": add a short section "Difficulty dials are the playground" (free practice, never counts, custom state). PROGRESS/PLAN updated at the end as usual.

**The presets** (PIANO = `gm:acoustic_grand_piano`; trainer dials also set `answerMode: "pitch-octave"`, `useRealisticRange: true`, `pitchClasses` all true, `rangeHigh: 108` unless stated).

*Single note* — 1: `instrumentMode fixed, instrumentId PIANO, poolMode all, tiers [clean,hard], rangeLow 31, noteDurationMs 1500, replayLimit unlimited` · 2: `instrumentMode random-question, poolMode all, families [], tiers [clean]` · 3: `tiers [clean,hard]` · 4: `rangeLow 21` · 5: `poolMode everything, tiers [clean,hard,chaos]` · 6: `noteDurationMs 800` · 7: `replayLimit one` · 8: `replayLimit none, noteDurationMs 500`.

*Sequence* — 1: `seqLength 2, seqGapMs 800, seqMaxLeap 7, instrumentMode fixed, instrumentId PIANO, rangeLow 31, replayLimit unlimited` · 2: `seqLength 3` · 3: `seqLength 4, seqMaxLeap 12` · 4: `seqLength 5, instrumentMode random-question, poolMode all, tiers [clean,hard], rangeLow 21` · 5: `seqLength 6, instrumentMode random-note` · 6: `seqLength 8, seqGapMs 400` · 7: `seqLength 10, seqMaxLeap 24` · 8: `seqLength 12, replayLimit none`.

*Intervals* — 1: `intervalVariant pair, intervalPlayback melodic, intervalDirection asc, intervalCompound false, intervalSet [], intervalGapMs 600, instrumentMode fixed, instrumentId PIANO` · 2: `intervalDirection both` · 3: `intervalPlayback harmonic` · 4: `intervalPlayback melodic, intervalCompound true` · 5: `intervalVariant chain, intervalChainLength 3, intervalCompound false` · 6: `intervalChainLength 5, instrumentMode random-note, poolMode all, tiers [clean,hard]` · 7: `intervalVariant stack, intervalStackSize 3, instrumentMode fixed, instrumentId PIANO` · 8: `intervalStackSize 4, intervalCompound true`.

*Chords & clusters* — 1: `chordKind chords, chordAnswer root-quality, chordCategories [triads], chordQualities [maj,min], chordInversions false, chordAskInversion false, chordVoicings [closed], chordPlayback blocked, instrumentMode fixed, instrumentId PIANO` · 2: `chordQualities []` · 3: `chordCategories [triads,sus-add], chordInversions true` · 4: `chordCategories [triads,sus-add,sevenths]` · 5: `chordAskInversion true` · 6: `chordCategories [triads,sus-add,sevenths,extended]` · 7: `chordCategories [triads,sus-add,sevenths,extended,altered], chordVoicings [closed,open,drop2]` · 8: `chordKind mixed, chordAnswer notes, chordNotesOrder bottom-up, clusterMin 3, clusterMax 5, clusterSpan 24, instrumentMode random-question, poolMode all, tiers [clean,hard]`.

*Scales & modes* — 1: `scaleVariant run, scaleDirection random, scaleSet [major,natural-minor], scaleAskTonic true, scaleRunNoteMs 280, scaleMelodyNotes 8, scaleMelodyBpm 100, instrumentMode fixed, instrumentId PIANO` · 2: `scaleSet + harmonic-minor, melodic-minor` · 3: `scaleSet + dorian, phrygian, lydian, mixolydian, locrian` · 4: `scaleVariant melody, scaleSet [major,natural-minor,harmonic-minor,melodic-minor]` · 5: `scaleSet = the nine seven-note scales` · 6: `scaleVariant both, scaleSet = nine + major-pentatonic, minor-pentatonic, blues` · 7: `scaleSet [] (everything), scaleMelodyNotes 10` · 8: `scaleVariant melody, scaleMelodyNotes 12, scaleMelodyBpm 120, instrumentMode random-question, poolMode all, tiers [clean,hard]`.

*Cents* — 1: `centsVariant single, centsMin 30, centsMax 50, centsInTuneChance 0.15, instrumentMode fixed, instrumentId PIANO` · 2: `centsMin 20` · 3: `centsMin 15, centsMax 40` · 4: `centsMin 10, centsMax 30` · 5: `centsVariant pair, centsMin 15, centsMax 40` · 6: `centsMin 10, centsMax 30` · 7: `centsVariant chord` · 8: `centsMin 5, centsMax 20, instrumentMode random-question, poolMode all, tiers [clean,hard]`.

*Hear It, Play It* (transcribe store) — 1: `source generated, drill echo, genBars 1, genVoices 1, genStyle stepwise, genRhythm quarters, genKey -1, rhythm false, oneListen false, octaveInsensitive false, passThreshold 0.9` · 2: `genBars 2, genStyle mixed, genRhythm mixed` · 3: `drill ladder` · 4: `source bach, drill chunk, voices [0], phraseBars 1, tempoScale 1` · 5: `voices [0,3]` · 6: `voices []` · 7: `phraseBars 2, rhythm true, rhythmTolerance 0.25` · 8: `oneListen true`.

*Find the Mistake* (mistakes store; `types` is the full record each time) — 1: `types {detune only}, source melody, centsMin 30, centsMax 50, referenceFirst true, askFix true, askAmount true, instrumentMode fixed, instrumentId PIANO, oneListen false` · 2: `types {detune, wrong-note}, centsMin 20, referenceFirst false` · 3: `types {detune, wrong-note, chord-quality, rhythm}, source auto, autoSources [melody,progression]` · 4: `types + inversion, centsMin 15, centsMax 40` · 5: `types {drift, voice-leading}, source bach, bachRandom true, bachBars 2, centsMin 10, centsMax 30` · 6: `types all except ab, source auto, autoSources [melody,progression,voices,bach], centsMin 10, centsMax 30` · 7: `centsMin 5, centsMax 20, instrumentMode per-voice` · 8: `types all incl. ab, oneListen true, centsMin 5, centsMax 15`.

*Theory drills* (compose store) — 1–6: `theoryLevel n, theoryMixLower false, theoryKinds [], theoryStrictness strict, theoryAutoSubmitMs 1200` · 7: `theoryLevel 6, theoryMixLower true` · 8: `theoryAutoSubmitMs 700`.

*Prompt drill* — 1: `promptBars 2, promptCountdownSec 12, promptClick true, promptBacking true, promptSevenths false, promptMood false, promptSeed false` · 2: `promptBars 4, promptCountdownSec 10` · 3: `promptCountdownSec 8, promptSevenths true, promptMood true` · 4: `promptCountdownSec 6, promptSeed true` · 5: `promptBars 8, promptCountdownSec 8` · 6: `promptBacking false, promptCountdownSec 6` · 7: `promptCountdownSec 4` · 8: `promptCountdownSec 3, promptClick false`.

*Hum then play* (4 levels) — 1: `humOctaveInsensitive true, humMinClarity 0.85, humMinLevel 0.008, humMinNoteMs 90, humSilenceMs 2500, humPlaySilenceMs 2000` · 2: `humMinClarity 0.9, humMinLevel 0.01, humSilenceMs 1800, humPlaySilenceMs 1500` · 3: `humOctaveInsensitive false` · 4: `humSilenceMs 1200, humPlaySilenceMs 1000, humMinNoteMs 70`.

**Acceptance.** Every dial applies its bundle and the summary reads correctly; a hand edit flips the dial to custom and re-picking the number restores it; the level-run bar goes amber when a dial is used mid-run; the chords dial at level 1 asks only major and minor triads; `npm run selftest` (incl. the new script), `tsc`, `eslint`, `build` green; PROGRESS/PLAN updated.

### Phase 8: the phone — agreed 2026-11-24. Trigger words: **"phase: phone"** (8a), **"phase: cloud"** (8b)

**Why.** Pranav wants the app on his iPhone with no dependency on the laptop being on. Decision: an installable web app (PWA) hosted on free tiers, not a native app. iOS has no Web MIDI, so the phone is the *hearing* half (Trainer, Find the Mistake, Practice & Learn, Stats); the *hands* tabs (Hear It Play It, Head to Keys) stay on the laptop. He is fine tapping a piano on screen. Everything must be free.

**8a — Fits the phone** (no accounts needed; tested over Wi‑Fi with `npm run dev:lan` = `next dev -H 0.0.0.0`, the phone opens the printed Network URL).

- *Shell.* Below `md`, the top nav becomes a bottom tab bar (Trainer, Mistakes, Practice, Stats, More → sheet with Hear It Play It, Head to Keys, Settings; the two piano tabs carry a "needs the USB piano" note on touch devices). Safe-area insets respected. The settings column becomes a drawer (shadcn `sheet`) opened from a sliders button in the quiz header; desktop unchanged.
- *The piano* (`piano-keyboard.tsx`, phone mode when the full range cannot fit at ≥ 24 px per white key): a **window** of the keyboard, default two octaves, C at the left edge; **octave arrows** at both ends shift one octave (the existing 0–8 octave chips move it too); an **overview strip** above it draws all 88 keys in miniature with the window as a draggable highlighted box, tap anywhere on the strip to jump. After an answer the strip marks the target (blue) and the answer (red) wherever they are; during a question the window never moves by itself (it must not hint at the answer) and it stays where he left it between questions. Keys are tap-only (`touch-action: none`), sliding across keys does not scroll. Window width setting: 1.5 / 2 / 2.5 octaves. Optional switch **Confirm taps** (off): first tap selects and lights the key, second tap on it (or Answer) submits, for small keys.
- *Answer widgets.* Pitch-class grid 2 × 6 with ≥ 48 px targets; octave chips wrap; note-entry slots wrap; quiz header buttons wrap into two rows; keyboard `Kbd` hints hidden on touch (`@media (hover: none)`); feedback banner compact; summary tables scroll sideways. Find the Mistake: answer timeline and pickers wrap, piano-roll canvas sizes to the width. Stats: filter row wraps, heatmap and confusion grid scroll sideways. Calendar: day panel below the grid, smaller cells.
- *Installable.* `app/manifest.ts` (name "Perfect Pitch Lab", standalone, start_url `/trainer`, theme colours for both schemes, 192/512 icons), `apple-touch-icon` 180, `appleWebApp` metadata, viewport with `viewportFit: "cover"` and no user zoom; `touch-action: manipulation` globally (no double-tap zoom delay).
- *iOS audio.* AudioContext created/resumed on the first tap; resumed again on `visibilitychange` (iOS suspends it in the background); a one-time hint on iOS when a note was dispatched but the context reports no output: "check the silent switch". Mic (hum) needs HTTPS, so it only works after 8b.
- *Acceptance.* On the iPhone over Wi‑Fi in portrait: Single note with the on-screen piano and the buttons, Chords with note entry, Find the Mistake, Stats and Calendar all usable one-handed; piano window moves by drag, arrows and strip-tap; feedback shows the target on the strip; Add to Home Screen opens full-screen with the icon; sound plays after Start; no key hints on touch; desktop layout unchanged; `tsc`, `eslint`, `build` green.
- *As built (2026-11-24), where it differs from the lines above.* The piano's window appears only on a touch screen (`(hover: none)`): the laptop's full keyboard is already under 24 px a key, and "desktop unchanged" won over the 24 px rule. Window sizes are 10 / 14 / 17 white keys (C–E, C–B, C–E) so no black key is cut at an edge; keys past the ends of the range are drawn faint. The octave arrows sit at the two ends of the strip's row, so the keys get the full width (25 px a key at two octaves on a 390 px phone). A drag follows the finger and settles on the nearest C. Display-only keyboards (no answering) stay whole. The tab bar and the drawer switch on width alone (below `md`), so a narrow laptop window gets them too. Messages (toasts) drop in from the top on a phone. The silent switch is handled with the audio session where iOS has it (16.4+): the app plays through it by default, with a switch on the Settings page; the "check the silent switch" hint is only for older iOS or when that switch is off. The phone keeps 4 instruments decoded (97 MB each, measured) and rotates a pool of 3. Next's dev badge is switched off because it sat on the first tab.

- *The fixed quiz screen (added the same day, after Pranav's first try on the phone).* His words: it "feels a little flimsy, especially the piano part, my hand can slip and easily move things around"; on the phone the subject should be "locked in place without scrolling" and everything else "a side tab I can click and scroll and see". So below `md` the Trainer and Find the Mistake are one fixed screen, the **stage** (`src/components/phone-stage.tsx`), instead of a scrolling page:
  - Rows, top to bottom: a bar with the panel button (☰ and a flag coloured by whether the reps count), the mode's name, the score and End; the two Hear buttons; a row for the after-answer buttons that keeps its height when empty; the piano's overview strip and arrows; one row of text (the question, then the feedback); the answer at the bottom. Every row above the answer has a set height and the text row takes the slack, so nothing moves between idle, question and answer.
  - The page behind does not scroll or bounce (`html.stage-locked`), the stage ignores drags (`touch-action: none`), and only an answer form taller than the screen scrolls, inside itself. The text row sits between the strip and the keys, so nothing tappable touches the keys; the Undo / Clear / Answer buttons of note entry sit above the slots for the same reason.
  - While a quiz runs the tab bar is hidden but its space stays empty under the keys, so the layout is identical before and after Start and a stray thumb cannot leave the quiz. End brings it back.
  - **The side panel** (the ☰ button, a sheet from the left): the level bar in full, the six modes, that tab's settings, and links to every page. The mode tabs, the level bar and the settings no longer sit around the quiz on a phone.
  - **One way of answering at a time**: a note with its octave is answered on the piano or with the octave and note buttons, chosen in the settings ("Answer on a phone with", default piano). Both at once left room for neither, and a stray touch on the unused one counted as an answer. The laptop still shows both.
  - The piano is 340 px tall where there is room and gives up height where there is not; installed from the home screen every mode fits without scrolling on an iPhone 13-sized screen; in a Safari tab (about 180 px shorter) chords-by-name and scales scroll a little inside the answer area.

- *The phone held sideways (added 2026-11-25, after Pranav's first evening on the hosted app).* His words: the green and red result "creates a problem where the content gets too much for the screen so I have to scroll every time… it'll cut out of the screen and push the content down for a sec and then comes back"; he wants "everything one screen, very simple, and it doesn't get pushed down". Upright, recordings of every row's position showed nothing moving in the modes he had used. The cause found: an iPhone on its side is 667–956 px wide, wider than the 768 px that switched the fixed screen on, so it fell through to the laptop's scrolling page (2,000 px of page in a 390 px tall screen, and a result banner that pushes it down). So a phone is now a phone held either way (`useIsPhone()`: narrow, or touch + landscape + at most 540 px tall; a tablet on its side is 744 px or more and keeps the laptop page), and the fixed screen has a second arrangement for it:
  - One row along the top with a fixed height: the panel button, then the question or the result, then the after-answer buttons, the score and End. The result is one line there (Single note); the modes with longer results hang down over the answer, which is switched off by then, instead of pushing it.
  - Below it, the two Hear buttons as a tall column on the left, under the left thumb, and the overview strip and the keys (or the answer buttons) filling everything to the right. On an iPhone 13 the keys are about 610 × 232 px against 374 × 316 upright: 44 px a key instead of 27.
  - No tab bar and no top bar at all while a quiz screen is up sideways (the height is worth more; the pages are in the ☰ panel). The two Hear buttons are the only things beside the keys; End, "I was right" and the panel button are in the top row, away from the thumbs.
  - `scripts/check-phone-layout.mjs` is the test for all of this: it plays the trainer in a headless Chrome at ten iPhone sizes, upright and sideways, and fails if any row moves between the question and the result or anything has to be scrolled.

**8b — Lives in the cloud** (free tiers: GitHub private repo, Vercel Hobby, Turso, Cloudflare R2. R2 needs a payment method on file but costs nothing at this size.)

- *Database → Turso (libSQL).* `src/lib/db/client.ts` switches to `@libsql/client` + `drizzle-orm/libsql`; `DATABASE_URL` (`file:data/perfect-pitch.db` locally, `libsql://…turso.io` hosted) + `DATABASE_AUTH_TOKEN`. Migrations run through the async libsql migrator, so `client.ts` exports `getDb(): Promise<Db>` and every action starts with `const db = await getDb()`. `drizzle.config.ts` → dialect turso. `better-sqlite3` leaves the app (scripts read `DATABASE_URL` too). `scripts/db-copy.mts` copies every table between a file and Turso in either direction (ids preserved, refuses a non-empty target without `--force`): used once to carry his history up, and as `npm run db:backup` to pull a copy down. Decision: the laptop's `npm run dev` also points at Turso after the move, so there is one set of stats; the local file stays as a backup.
- *Samples: the public CDN, no bucket* (decided 2026-11-24: Pranav would rather not put a card on file for R2). Hosted, the 128 GM instruments load from the gleitz CDN the engine already falls back to (same FluidR3 files, ≈ 2.4 MB each, cached on the device by the Cache API after the first load); the 12 synth presets need no files. The streamed sets stay laptop-only: their CDN is Opus, Safari cannot decode it, and `isInstrumentAvailable` already hides them, so pools and pickers on the phone draw from the 140 that work. Engine change: when the local manifests 404 (hosted), skip the local probe quietly and go straight to the CDN; `NEXT_PUBLIC_SAMPLE_BASE` (default "" = same origin) is still added so a bucket can be pointed at later without a code change. Pieces (5 MB) and probes stay in the repo. Every ladder drill and dial uses GM instruments or pools, so nothing on the ladder changes.
- *Password gate.* `src/proxy.ts` (Next 16's middleware convention) checks an `httpOnly` cookie holding an HMAC of `APP_PASSWORD`; otherwise redirects to `/unlock`, a one-field page that sets the cookie for a year. Static assets excluded. Gate off when `APP_PASSWORD` is unset (local dev).
- *Deploy.* Push to a private GitHub repo; Vercel imports it; env vars `DATABASE_URL`, `DATABASE_AUTH_TOKEN`, `APP_PASSWORD`; function region matching the Turso location. Secrets live in `.env.local` (gitignored) on the laptop, never in chat or git.
- *Acceptance.* Laptop off: the phone opens the Vercel URL, asks for the password once, then every tab works; a rep logged on the phone appears in Stats on the laptop; all pre-existing history (sessions, attempts, takes, pieces, plans, level state) is there; the 128 GM instruments and the synths load on the phone, the streamed sets are hidden there and still work on the laptop; `npm run dev` works against either URL; the Vercel build is green.
- *As built (2026-11-25), where it differs from or adds to the lines above.*
  - **The address** is `https://perfect-pitch-beta-lime.vercel.app` (Vercel's own choice of name). The other addresses Vercel generates (`…-pranav-krishnans-projects.vercel.app`, per-deployment ones) sit behind Vercel's login and are not for the phone.
  - **Days are counted in a named timezone.** On the laptop SQLite's `'localtime'` decided which day a rep belonged to; a hosted database and server run in UTC, where an evening session would land on tomorrow (measured on his data: longest streak 6 instead of 10, 1,579 stat values different). `APP_TIMEZONE` (an IANA name, `America/Chicago`, set on Vercel and in `.env.local`; default = the machine's own zone) names the zone, and `src/lib/db/time.ts` writes the UTC offset into the SQL, split at each daylight-saving change, so old reps keep their day. Travelling does not move days: they stay in the home zone.
  - **One round trip per page.** The database is now across the network, so every action that needs several queries sends them as one `db.batch` (all of Stats is one request; measured from the laptop: 60–110 ms per action). The connection is plain HTTPS (the `libsql://` address is rewritten to `https://`), not a WebSocket, because a serverless function cannot keep a socket alive.
  - **The gate is checked twice**: in `src/proxy.ts` for every page and server action, and again in `getDb()` next to the data, because a server action is a POST that can be aimed at a path the proxy leaves alone (the icons and the manifest are left open so the phone can install the app). The cookie is an HMAC keyed by the password, so changing `APP_PASSWORD` on Vercel signs every device out. A wrong password costs 0.6 s.
  - **Streamed sets on a phone are switched off on purpose**, not by the codec check: Safari does decode the CDN's AAC files, so the check alone would have let them through, and each set is hundreds of megabytes once decoded. On a touch device the engine skips the check and reports "laptop only" (`phoneCapability` in `engine.ts`) unless an mp3 copy is served (the laptop over Wi‑Fi, or a bucket through `NEXT_PUBLIC_SAMPLE_BASE` later). In a laptop browser the hosted app streams them from smplr's CDN; `npm run dev` on the laptop still uses the local mp3 copies.
  - **GM instruments hosted** are asked for by name as mp3 from the gleitz CDN (the same files `npm run samples` downloads), rather than letting smplr choose Ogg, which Safari advertises but may not decode. `next.config.ts` tells the engine at build time whether the sample folders exist, so the hosted app never asks its own site for them.
  - **Scripts.** `npm run db:copy -- --from local --to cloud` (or any `file:` path) copies every table with ids kept, then reads both sides back and compares every row; a target that holds data is refused without `--force`. `npm run db:backup` pulls a dated copy into `data/backups/`. `npm run db:reset-stats` acts on the database the app uses and, when that is the cloud one, does nothing without `--yes`.
  - **Deploying** is `git push` to `main` (Vercel is connected to the GitHub repo). `vercel deploy` from the laptop does not work on the free plan: it counts the local sample folders and hits the upload limit.

**8c — later, optional.** Cloudflare R2 (or any bucket) for the streamed sets on the phone, via `NEXT_PUBLIC_SAMPLE_BASE` and an upload script; service worker so the shell and the last-used instruments open with no signal; one-tap "start today's first drill" on the home screen; hum then play on the phone (HTTPS gives the mic).

## 7. Data model (Drizzle, SQLite)

- `sessions`: id, mode, startedAt, endedAt, settings (json)
- `attempts`: id, sessionId, mode, createdAt, instrumentId, target (json: midi numbers / chord descriptor / cents), answer (json), correct (0/1), score (0–1 partial), responseMs, replays, targetPitchClass, targetOctave, answerPitchClass, answerOctave (denormalised for fast single-note stats)
- `recordings`: id, createdAt, name, instrumentId, bpm, events (json of MIDI events), durationMs, sourceRef (optional: what phrase it was answering)
- `pieces`: id, name, source, midi (blob/json), meta
- `piece_progress`: pieceId, phraseIndex, bestScore, attempts
- `practice_plans`: id, date, items (json), notes
- `settings`: key/value (last used settings per mode)

Since Phase 8b the tables live in Turso (libSQL), with the same schema and the same migrations in `drizzle/`; `attempts` also carries `level_id` / `drill_id`. Migrations are applied by the app on its first database use (laptop or hosted), so after `npm run db:generate` the next start of either brings the shared database up to date. Postgres / Supabase would still be the same Drizzle schema with a different driver, if multi-user is ever wanted.

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
- **Phase 5 — Find the Mistake** ✅ built 2026-09-24, awaiting Pranav's hands-on check: all eight problem types, timeline answer UI with voice picker, fix / amount bonuses, A/B, stats breakdowns (plus the pending Phase 4 ones), planted-problem self-test.
- **Phase 6 — Head to Keys depth** ✅ built 2026-09-24, awaiting Pranav's hands-on check: theory drills with six levels (chords by name, scales and modes, progressions, harmonisation) graded from MIDI with three strictness levels; prompt drill with countdown, count-in, click, backing, self-rating and first-note latency; hum-then-play with pitchy; recorder tempo / quantize / loop / .mid export.
- **Phase 7 — Practice & Learn** ✅ built 2026-09-24, awaiting Pranav's check: planner with completion from attempts, starter programme, heatmap and streaks, Progress skills, Learn lessons and glossary.
- **"phase: levels" — Difficulty dials** ✅ built 2026-10-24, awaiting Pranav's check (spec under Tab 6 → "Difficulty dials"): a 1–8 dial per activity that writes a coherent settings bundle, with a custom state; a playground beside the ladder (counts only through Always count, when the settings land exactly on a drill's test).
- **Phase 8 — The phone** (agreed 2026-11-24; spec under Tab 6 → "Phase 8: the phone"): **8a ✅ built 2026-11-24, awaiting Pranav's check on the iPhone** (mobile layout, GarageBand-style piano window, installable, iOS audio); **8b ✅ built and deployed 2026-11-25, awaiting Pranav's check on the iPhone** (Turso with his whole history copied up, public CDN samples, password gate, Vercel at `https://perfect-pitch-beta-lime.vercel.app`); 8c later polish (offline, one-tap drill, hum on the phone, a bucket for the streamed sets). MusyngKite set stays on the later list.

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
| 2026-09-24 | Find the Mistake: a drifting voice has its own diagnoses ("voice drifts flat / sharp") so it is a different answer from a single detuned note; location for a drift is the voice alone |
| 2026-09-24 | Find the Mistake: wrong inversion / voicing always plays the clean reference first (it is not audible as wrong on its own); a global "clean version first" switch exists for every other type |
| 2026-09-24 | Find the Mistake: the fix (right note / quality / inversion) and the cents amount are bonuses logged separately; they never lower the score. Right beat but wrong voice = half the location credit |
| 2026-09-24 | Find the Mistake: voice-leading faults are parallel fifths / octaves only; the doubled-leading-tone variant waits for a key estimate of chorale phrases |
| 2026-09-24 | Every quiz (trainer modes, transcription, mistakes): a right answer auto-proceeds; a wrong answer holds the feedback until Space, Enter or the Hear next button. Enter advances everywhere Space does |
| 2026-09-24 | Head to Keys: theory drills have levels 1–6 (triads → inversions/sevenths/modes → seventh inversions/open → extensions/drop-2 → progressions → harmonisation) so the calendar can ramp; default level 1 with "mix in lower levels" on |
| 2026-09-24 | Head to Keys: theory grading is strict by default (exact voicing), with "right bass" and "right notes" as easier settings; the fix reason is always spelled out |
| 2026-09-24 | Head to Keys: prompt drill self-rating is 1–5 (4+ counts as "kept it"); the measured number is first-note latency from the downbeat; click and soft backing chords on by default |
| 2026-09-24 | Head to Keys: hum-then-play is built despite the poor mic, with confidence and level gates in Settings; any octave accepted by default (voice register ≠ hands) |
| 2026-09-24 | Tab 6 widened to Practice & Learn: Calendar + Progress + Learn. Completion is derived from logged attempts, never stored; plan items link straight into their mode via query strings |
| 2026-09-24 | Starter programme is eight weeks with a light seventh day; applying a week overwrites those seven days. Lessons are static content in the repo (`src/lib/learn/content.ts`), edited like code |
| 2026-09-24 | New trainer mode Scales & modes (hear it, name it): runs and melodies, tonic asked by default, melodies must contain the characteristic notes and end on the tonic; it is a Progress skill, a starter-programme item from week 2, and a lesson section |
| 2026-09-26 | Levels replace weeks. One ladder (0–8 + Mastery), mastery gates with rolling windows, three-day minimum, per-key spread rules, reviews of earlier drills, lessons as gate items. Level 0 is octaves only because the note is never the problem for Pranav and the octave is |
| 2026-09-26 | Only reps started from the level card, with the drill's settings untouched, count toward a gate; free practice never counts. The app announces readiness; Pranav presses Advance himself and may linger |
| 2026-09-26 | The GM piano's bottom ten keys get their fundamental reinforced by a sine in the engine (measured: 36–41 dB missing), switchable in Settings; tuning of the samples was verified within 9 cents, so no sample set change |
| 2026-10-23 | Reverses "free practice never counts": Pranav kept forgetting Start and losing reps. A Settings page (gear in the nav) has "Always count reps toward my level", default on: a rep counts whenever the settings run a level drill's test, comfort settings ignored. Pitch-class-only answers still never count toward octave drills (the octave was not asked). Difficulty-dial practice counts too when it lands on a drill's test |
| 2026-11-24 | Phone version = an installable web app (PWA), not a native app. iOS has no Web MIDI, so the phone is the hearing half and the laptop keeps the hands tabs; Pranav is fine tapping a piano on screen. The on-screen piano gets a GarageBand-style window: octave arrows plus a draggable overview strip. Hosting on free tiers only: Vercel + Turso (libSQL, same dialect and migrations); samples from the public gleitz CDN (no bucket, no card on file: the 128 GM instruments + synths on the phone, streamed sets laptop-only until a bucket is added later); one shared password as the gate; one database for both devices (the laptop's dev also points at Turso, local file kept as backup) |
| 2026-11-24 | Phone build (8a), decided while building: the windowed piano is for touch screens only, the laptop keeps its whole keyboard (its keys were always under 24 px, and "desktop unchanged" matters more). The window always starts on a C and comes in 10 / 14 / 17 white keys so no black key is cut; a drag settles on the nearest C |
| 2026-11-24 | iPhone silent switch: the app asks iOS for the "playback" audio session (16.4+), so it sounds with the switch on silent, like a music app. On by default, switch on the Settings page ("Play even when the phone is on silent"). The agreed one-time "check the silent switch" hint remains for older iOS and for when that switch is off. Reason: the page cannot read the switch, and flipping it before every session is the kind of friction that costs reps |
| 2026-11-24 | A phone keeps 4 instruments decoded and rotates a random pool of 3 (laptop: 14 and 6). Measured: one GM instrument is about 97 MB once decoded, so the laptop's numbers would get the tab killed on a phone. The engine also stops judging an instrument "silent" while the audio is paused (background, a call), which on a phone would have dropped the piano from the pools |
| 2026-11-24 | On a phone, messages (toasts) come in at the top: the bottom is where answers are tapped. Controls get a 36 px minimum height wherever the main pointer is a finger. Next's dev badge is off (it covered the first tab and swallowed its taps) |
| 2026-11-24 | After Pranav's first try on the phone ("flimsy… my hand can slip and easily move things around"): on a phone the Trainer and Find the Mistake are a fixed, non-scrolling screen (the stage) with one side panel for the level bar, modes, settings and pages. Nothing on it changes position between idle, question and answer. The tab bar hides while a quiz runs (its space stays empty). A note with its octave is answered on the piano or with the buttons, never both on screen. Laptop unchanged |
| 2026-11-25 | Cloud build (8b), decided while building: practice days are counted in one named timezone (`APP_TIMEZONE`, America/Chicago) with the offset written into the SQL per daylight-saving period, because a hosted database has no "local time" and his streaks and the three-day gate rule depend on the day. Days stay in the home zone when travelling |
| 2026-11-25 | On a phone the streamed sets are hidden by an explicit rule, not by the codec check the plan relied on (Safari can decode them; the reason to keep them off is memory). The hosted app loads GM instruments as mp3 by name from the public CDN, the same files as the laptop's local copies |
| 2026-11-25 | The password gate is enforced in two places (the proxy, and `getDb()` beside the data). The install manifest and icons are the only things readable without the password. `db:reset-stats` refuses to wipe the cloud database without `--yes` |
| 2026-11-25 | Deploys happen by pushing to `main` (Vercel builds from the private GitHub repo). Because the phase says "push", this session committed and pushed everything built since September in one commit; earlier sessions had left committing to Pranav |
| 2026-11-25 | A phone held sideways gets the fixed quiz screen too, in its own arrangement (Hear buttons in a column on the left, result in one fixed row along the top, keys filling the rest, no bars). Before, a sideways iPhone was wide enough to count as a laptop and got the scrolling page, where the result banner pushed everything down. The switch for "this is a phone" is now width OR (touch, landscape, at most 540 px tall) |
| 2026-10-24 | Difficulty dials built as specified. The dial sits at the top of each settings card (trainer: the active mode's dial; compose: one inside each of the Theory / Prompt / Hum sections). Pressing the active number again keeps the level (no deselect). Hovering a number shows that level's title |
| 2026-09-26 | Pranav practises on laptop speakers, which cannot reproduce fundamentals below about 80 Hz, so A0–G♭1 were impossible in the app while automatic on his piano. Level 0 (and the single-note drills of levels 1–2) now start at G1; the ten lowest keys are their own drill at level 2 with a headphones note |
