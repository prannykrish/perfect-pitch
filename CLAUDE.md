@AGENTS.md

# Perfect Pitch Lab — session instructions

Personal ear-training platform for Pranav, who has absolute pitch. Goal: thousands of high-difficulty reps toward "hear anything, play it immediately", plus tuning/theory feedback skills. Not a beginner app.

## Read first, every session

1. `docs/PLAN.md` — the full product plan, stack, data model, phases, decisions log. Source of truth.
2. `docs/PROGRESS.md` — what is done, what is next, known issues, how to run.

At the end of every session, update `docs/PROGRESS.md` (done / next / known issues / session log). Add to the decisions log in PLAN.md when a product decision is made. Do not start a new phase without checking the previous phase's acceptance criteria.

How Pranav works: he wants each phase explained in plain language before it is built, then says "go" (or names the phase) and expects the whole phase built in one go, verified (self-tests, tsc, lint, build), with a plain summary of what to try. If PROGRESS.md says a phase has already been explained and agreed, build it without re-explaining. Audio and MIDI can only be verified by him in a real Chrome/Edge window; say plainly what was and was not verified.

## Stack (do not change without updating PLAN.md)

- Next.js 16 App Router, TypeScript, Tailwind v4. Read `node_modules/next/dist/docs/` before using an API you are unsure of; this Next version differs from older training data.
- **shadcn/ui for every UI element.** This shadcn generation is built on **Base UI** (`@base-ui/react`), not Radix: props are `onValueChange(value)`, `onCheckedChange(checked)`, `render={<Link/>}` instead of `asChild`, `Select` takes `items` for labels, `ToggleGroup` values are arrays. Read `src/components/ui/*.tsx` before using a component. Add components with `npx shadcn@latest add <name> -y`.
- Audio: `smplr` (sampled instruments) + our own synth in `src/lib/audio/synth.ts`. Engine in `src/lib/audio/engine.ts`. Registry of ~250 instruments in `src/lib/audio/instruments.ts`.
- Soundfont samples live in `public/soundfonts/` (gitignored, 300 MB). Run `npm run samples` once on a fresh clone. The engine falls back to the gleitz CDN if a file is missing.
- Streamed sets (Steinway, e-pianos, mallets, Versilian, Mellotron, double bass) are Opus/AAC on smplr's CDN, which not every browser decodes. `npm run samples:streamed` vendors them as local mp3 into `public/streamed/` (gitignored); `engine.ts` prefers those (`withLocalMirror`) and otherwise probes codec support (`sample-format.ts`) and hides instruments that cannot play (`isInstrumentAvailable`). Always test audio in a real Chrome/Edge window, not the IDE preview.
- MIDI: Web MIDI API via `src/lib/midi/midi.ts` (USB electric piano). Recorder in `src/lib/midi/recorder.ts`.
- DB: SQLite at `data/perfect-pitch.db` via Drizzle + better-sqlite3. Schema `src/lib/db/schema.ts`; server actions `src/lib/db/actions.ts`; migrations in `drizzle/` applied automatically on first DB use. After changing the schema: `npm run db:generate`.
- State: zustand; trainer settings persisted to localStorage (`src/lib/trainer/settings.ts`).

## Trainer architecture (Phase 2+)

Every trainer mode is a small adapter (`generate / play / score / log / record`) passed to `useQuiz` in `src/components/trainer/use-quiz.ts`, which owns phases, the instrument pool, logging, replays, auto-proceed, keyboard shortcuts and USB piano input. Modes render inside `QuizShell` and use `NoteEntry` / `SessionSummary`. Question generators live in `src/lib/trainer/generators.ts`; theory helpers in `src/lib/music/`. Check generators with `npx tsx scripts/selftest-generators.mts` after touching them. Only the active mode is mounted so exactly one quiz owns the keyboard and piano.

## Transcription (Phase 4)

`src/lib/music/score.ts` is the beats-based score model; `src/lib/trainer/grade.ts` aligns a performance to a reference with edit distance (run `npm run selftest` after touching it); `src/lib/trainer/phrase-gen.ts` writes practice phrases; `src/lib/transcribe/` holds settings and loaders. Bundled chorales come from `npm run pieces` into `public/pieces/bach/` (committed). Uploaded MIDI lives in the `pieces` table as JSON.

## Conventions

- MIDI numbers are the canonical note representation (60 = C4). Helpers in `src/lib/music/notes.ts`.
- Every rep is logged through `logAttempt` with denormalised pitch class / octave for stats.
- Client-only modules (engine, midi) must only be imported from `"use client"` components.
- Keep the quiz loop tonedear-fast: hear → answer → feedback → next, keyboard shortcuts, auto-proceed.
- Default settings are hard (chromatic, full range, pitch + octave). No beginner presets.

## Commands

```
npm run dev          # http://localhost:3000 (Chrome/Edge for Web MIDI)
npm run build        # production build (also the main type check)
npm run lint
npm run samples      # download soundfonts (once)
npm run samples:streamed  # vendor streamed sets as local mp3 (once, ~15 min; --dry-run, --only <id>, --fill-missing = only write substitutes for samples the CDN lacks)
npm run pieces       # rebuild the bundled Bach chorales from the JSB dataset
npm run selftest     # generator + grader checks (no browser needed)
npm run db:generate  # after schema changes
npm run db:studio    # browse the SQLite db
```
