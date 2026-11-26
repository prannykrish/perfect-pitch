@AGENTS.md

# Perfect Pitch Lab — session instructions

Personal ear-training platform for Pranav, who has absolute pitch. Goal: thousands of high-difficulty reps toward "hear anything, play it immediately", plus tuning/theory feedback skills. Not a beginner app.

## Read first, every session

1. `docs/PLAN.md` — the full product plan, stack, data model, phases, decisions log. Source of truth.
2. `docs/PROGRESS.md` — what is done, what is next, known issues, how to run.

At the end of every session, update `docs/PROGRESS.md` (done / next / known issues / session log). Add to the decisions log in PLAN.md when a product decision is made. Do not start a new phase without checking the previous phase's acceptance criteria.

How Pranav works: he wants each phase explained in plain language before it is built, then says "go" (or names the phase, e.g. **"phase: levels"**) and expects the whole phase built in one go, verified (self-tests, tsc, lint, build), with a plain summary of what to try. If PROGRESS.md says a phase has already been explained and agreed, build it without re-explaining or asking anything: the spec is in PLAN.md. Audio and MIDI can only be verified by him in a real Chrome/Edge window; say plainly what was and was not verified.

## Stack (do not change without updating PLAN.md)

- Next.js 16 App Router, TypeScript, Tailwind v4. Read `node_modules/next/dist/docs/` before using an API you are unsure of; this Next version differs from older training data.
- **shadcn/ui for every UI element.** This shadcn generation is built on **Base UI** (`@base-ui/react`), not Radix: props are `onValueChange(value)`, `onCheckedChange(checked)`, `render={<Link/>}` instead of `asChild`, `Select` takes `items` for labels, `ToggleGroup` values are arrays. Read `src/components/ui/*.tsx` before using a component. Add components with `npx shadcn@latest add <name> -y`.
- Audio: `smplr` (sampled instruments) + our own synth in `src/lib/audio/synth.ts`. Engine in `src/lib/audio/engine.ts`. Registry of ~250 instruments in `src/lib/audio/instruments.ts`.
- Soundfont samples live in `public/soundfonts/` (gitignored, 300 MB). Run `npm run samples` once on a fresh clone. The engine falls back to the gleitz CDN if a file is missing.
- Streamed sets (Steinway, e-pianos, mallets, Versilian, Mellotron, double bass) are Opus/AAC on smplr's CDN, which not every browser decodes. `npm run samples:streamed` vendors them as local mp3 into `public/streamed/` (gitignored); `engine.ts` prefers those (`withLocalMirror`) and otherwise probes codec support (`sample-format.ts`) and hides instruments that cannot play (`isInstrumentAvailable`). Always test audio in a real Chrome/Edge window, not the IDE preview.
- MIDI: Web MIDI API via `src/lib/midi/midi.ts` (USB electric piano). Recorder in `src/lib/midi/recorder.ts`.
- DB: SQLite through libSQL (`@libsql/client`) + Drizzle. `DATABASE_URL` in `.env.local` names the home of the data: the Turso database the laptop and the phone share (`libsql://…`, with `DATABASE_AUTH_TOKEN`), or, when unset, the file `data/perfect-pitch.db`. Schema `src/lib/db/schema.ts`; opening and migrating in `src/lib/db/connect.ts`; `getDb()` in `src/lib/db/client.ts`; server actions `src/lib/db/actions.ts`; migrations in `drizzle/` applied automatically on first DB use. After changing the schema: `npm run db:generate`.
- State: zustand; trainer settings persisted to localStorage (`src/lib/trainer/settings.ts`).

## Trainer architecture (Phase 2+)

Every trainer mode is a small adapter (`generate / play / score / log / record`) passed to `useQuiz` in `src/components/trainer/use-quiz.ts`, which owns phases, the instrument pool, logging, replays, auto-proceed, keyboard shortcuts and USB piano input. Modes render inside `QuizShell` and use `NoteEntry` / `SessionSummary`. Question generators live in `src/lib/trainer/generators.ts`; theory helpers in `src/lib/music/`. Check generators with `npx tsx scripts/selftest-generators.mts` after touching them. Only the active mode is mounted so exactly one quiz owns the keyboard and piano.

## Transcription (Phase 4)

`src/lib/music/score.ts` is the beats-based score model; `src/lib/trainer/grade.ts` aligns a performance to a reference with edit distance (run `npm run selftest` after touching it); `src/lib/trainer/phrase-gen.ts` writes practice phrases; `src/lib/transcribe/` holds settings and loaders. Bundled chorales come from `npm run pieces` into `public/pieces/bach/` (committed). Uploaded MIDI lives in the `pieces` table as JSON.

## Find the Mistake (Phase 5), Head to Keys (Phase 6), Practice & Learn (Phase 7)

`src/lib/mistakes/` (types, pure planting in `plant.ts`, material builders) with `src/components/mistakes/`. `src/lib/compose/` (theory tasks and grading in `theory.ts`, prompts, hum segmentation, mic pitch tracking) with `src/components/compose/`. `src/lib/practice/` (the ladder: `levels.ts` definitions with settings patches and gates, `gates.ts` evaluation, `level-run.ts` the active run that tags reps; `plan.ts` manual day items; `skills.ts` the Progress skills; `difficulty.ts` the per-activity difficulty dials, rendered by `src/components/practice/difficulty-dial.tsx` at the top of each settings card), `src/lib/learn/content.ts` (lessons + glossary, static data) with `src/components/practice/` (`level-card.tsx`, `level-run-bar.tsx`). Each has a self-test script under `scripts/`; `npm run selftest` runs them all. Plan items open a tab with `?mode=` / `?tab=` query strings handled in the tab layouts. Every `logAttempt` call spreads `levelTags(store)` so reps done from a level count toward its gate; keep that when adding a mode. With "Always count" on (`/settings`, `src/lib/practice/count-prefs.ts`), `levelTags` also tags reps whose settings match a level drill's test (`src/lib/practice/auto-count.ts`), no Start needed.

## The phone (Phase 8a)

The same app, laid out for an iPhone below `md` and installable from Safari. iOS has no Web MIDI, so the phone is the hearing half (Trainer, Mistakes, Practice, Stats); the two piano tabs stay on the laptop. Keep the laptop layout unchanged when touching any of this.

- **The stage** (`src/components/phone-stage.tsx`): on a phone the Trainer and Find the Mistake are one fixed screen that never scrolls and never rearranges itself, because Pranav found the scrolling version flimsy ("my hand can slip and easily move things around"). `QuizShell` and `MistakesTrainer` render `PhoneStage` when `useIsPhone()`; everything that is not the question (level bar, modes, settings, page links) is in `StagePanel`, the sheet behind the ☰ button. Rules to keep: every row above the answer has a set height and the text row takes the slack, so the keys, the strip and the Hear buttons sit in the same place at idle, in a question and after an answer; nothing tappable sits next to the keys; the tab bar hides while a quiz runs but its space stays empty (`src/lib/stage-store.ts`); only one way of answering a note is on screen (`phoneInput` in `piano-prefs.ts`). An answer UI that holds a piano needs a root of `flex min-h-0 shrink flex-col` and `<PianoKeyboard fill>`. When adding a mode or a button, check those positions do not move.
- **Held sideways** the phone gets the same fixed screen in a second arrangement (also in `phone-stage.tsx`): one fixed row along the top (panel button, question or result, after-answer buttons, score, End), the two Hear buttons as a column on the left, and the strip and the answer filling the rest; no tab bar or top bar at all. A sideways iPhone is wider than `md`, so "is this a phone" is `useIsPhone()` = narrow OR (touch, landscape, at most 540 px tall); `useIsPhoneSideways()` and the `sideways:` Tailwind variant are the landscape half. Do not go back to a width-only test: that is what sent sideways phones to the laptop's scrolling page.
- **The test for both arrangements is `node scripts/check-phone-layout.mjs`** (a dev server must be running; it blocks database writes unless told otherwise). It records every row's position while questions are answered at ten iPhone sizes and fails if anything moves or needs scrolling. Run it after touching the stage, the piano, a quiz's answer widgets or its result banner; `--modes all` lists the known gaps in the other modes. A result that should stay one line sideways passes `oneLine` to `FeedbackBanner`.
- Sizing trap, hit twice: a box sized from its content, whose content is drawn from the box's measured size, never shrinks. The piano uses CSS containment for that (`contain-inline-size`, and `contain-size` with `fill`); do the same for anything else that measures itself.
- Two switches, do not mix them up: **phone-sized** (`useIsPhone()`; in CSS, Tailwind `max-md:` / `md:` for the upright phone and `sideways:` for the phone on its side) decides the shell: bottom tab bar in `app-nav.tsx`, the stage and its panel, and for the two piano tabs settings as a bottom sheet through `SettingsToggle` in `settings-drawer.tsx`. **Touch** (`useIsTouch()`, the `touch:` variant = `@media (hover: none)`) decides what a finger needs: the windowed piano, hidden `Kbd` hints (`touch:hidden` is in the `Kbd` component itself), the 36 px tap floor in `globals.css`, fewer instruments in memory.
- The piano: `src/components/piano-keyboard.tsx` draws either the whole keyboard or, on touch when it cannot fit at 24 px a key, a window with octave arrows and an overview strip. Pure geometry (window bounds, clamping to a C, finger hit-testing) is in `src/lib/music/keyboard.ts`; run `npx tsx scripts/selftest-keyboard.mts` after touching it. Window size, position and "Confirm taps" are per-device prefs in `src/lib/piano-prefs.ts`, never trainer settings (the level gates must not see them). The window must never move by itself during a question.
- Audio on iOS: `engine.unlock()` inside every tap and `engine.wake()` on return to the screen (both wired in `audio-watch.tsx`); `src/lib/audio/device.ts` for the silent switch (audio session) and device checks; a touch device keeps 4 instruments decoded (97 MB each), pools of 3.
- Install: `src/app/manifest.ts`, icons in `public/icons/` (`npm run icons`), metadata and viewport in `layout.tsx`.
- He tests over Wi‑Fi: `npm run dev:lan`, the Network address in Safari. `next.config.ts` lists the machine's network addresses in `allowedDevOrigins`. Sound, Add to Home Screen and thumb-sized targets can only be verified by him on the phone; layout can be checked in a headless Chrome with an iPhone profile (see PROGRESS.md → Handoff), with the quiz's server-action POSTs blocked so his practice database is not written to.

## The cloud (Phase 8b)

The app is hosted on Vercel at `https://perfect-pitch-beta-lime.vercel.app` (a push to `main` deploys; `vercel deploy` from the laptop does not work on the free plan) and its data is in Turso. `npm run dev` on the laptop uses that same database, so **a test that writes lands in Pranav's real practice history**: point the process at a copy (`npm run db:backup`, then `DATABASE_URL=file:data/backups/<file>` and `APP_PASSWORD=` in the environment) or block the server-action POSTs in the browser. Never print or commit the values in `.env.local`.

- **Every server action starts with `const db = await getDb()`** and sends several queries as one `db.batch([...])`: the database is a network round trip away. `getDb()` also re-checks the password gate, so do not reach the database any other way from the app. Scripts use `src/lib/db/connect.ts` and `scripts/db-env.ts`.
- **Never use SQLite's `'localtime'` or the server's own clock for "which day"**: the hosted database and server run in UTC. Use `dayOf(column)` in `actions.ts` and the helpers in `src/lib/db/time.ts` (`APP_TIMEZONE`, default the machine's zone). Do not alias a column `length` (or any array property) in raw SQL: libSQL rows are array-like and the alias loses.
- **The gate**: `src/lib/auth/gate.ts` (HMAC cookie), `src/proxy.ts` (Next 16's name for middleware), `src/app/unlock/`. On when `APP_PASSWORD` is set. A new route that must be reachable without the password has to be added to the proxy's matcher; everything else is gated by default.
- **Samples when hosted**: no `public/soundfonts` or `public/streamed` there. GM instruments come from the gleitz CDN as mp3; a touch device hides the streamed sets (`phoneCapability` in `engine.ts`); `NEXT_PUBLIC_SAMPLE_BASE` can name a bucket later. `SAMPLES_FROM_CDN=1 npm run build` builds the hosted way on the laptop.
- Run `npx tsx scripts/selftest-db.mts` after touching `src/lib/db/` or `src/lib/auth/`.

## Conventions

- MIDI numbers are the canonical note representation (60 = C4). Helpers in `src/lib/music/notes.ts`.
- Every rep is logged through `logAttempt` with denormalised pitch class / octave for stats.
- Client-only modules (engine, midi) must only be imported from `"use client"` components.
- Keep the quiz loop tonedear-fast: hear → answer → feedback → next, keyboard shortcuts, auto-proceed.
- Default settings are hard (chromatic, full range, pitch + octave). No beginner presets.

## Commands

```
npm run dev          # http://localhost:3000 (Chrome/Edge for Web MIDI)
npm run dev:lan      # same, for the phone on the same Wi‑Fi: open the "Network" address it prints
npm run icons        # redraw the home-screen icons into public/icons (committed)
npm run build        # production build (also the main type check)
npm run lint
npm run samples      # download soundfonts (once)
npm run samples:streamed  # vendor streamed sets as local mp3 (once, ~15 min; --dry-run, --only <id>, --fill-missing = only write substitutes for samples the CDN lacks)
npm run pieces       # rebuild the bundled Bach chorales from the JSB dataset
npm run selftest     # generator + grader checks (no browser needed)
npm run db:generate  # after schema changes
npm run db:studio    # browse the database the app uses
npm run db:backup    # pull a dated copy of the cloud database into data/backups/
npm run db:copy      # copy all data between two databases: -- --from local|cloud|file:… --to … [--force] [--dry-run]
npm run db:reset-stats  # wipe attempts / sessions / chunk progress (--all also wipes takes, uploads, plans); on the cloud database it needs --yes
git push             # deploys: Vercel builds main from the private GitHub repo
```
