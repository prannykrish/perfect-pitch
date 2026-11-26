/**
 * Does the phone's quiz screen hold still?
 *
 * Opens the trainer in a headless Chrome made to look like an iPhone (upright and on its side, at
 * the sizes real iPhones give a web page), plays each mode with random taps, and records on every
 * frame where each row of the fixed screen sits (the rows carry `data-stage-part`, see
 * src/components/phone-stage.tsx). It reports whatever moves between the question and the result,
 * whatever does not fit and would need scrolling, and any size where the fixed screen is missing.
 *
 *   npm run dev                                  (in another terminal)
 *   node scripts/check-phone-layout.mjs          (http://localhost:3000, Single note, every size)
 *   node scripts/check-phone-layout.mjs http://localhost:3057 --modes all --sizes 390x664,750x340
 *
 * Options:
 *   --modes single-note,sequence,intervals,chords,scales,cents | all     (default single-note)
 *   --sizes WxH,WxH                                                      (default: the list below)
 *   --answers N        questions answered per mode and size (default 6)
 *   --settings JSON    e.g. '{"trainer":{"answerMode":"pitch-class"},"piano":{"phoneInput":"buttons"}}'
 *   --shots DIR        save a screenshot of the question and of the result for each combination
 *   --allow-writes     let the quiz log its reps. ONLY against a server running on a copy of the
 *                      database. Without it every server action is blocked in the browser, so the
 *                      practice history cannot be touched (a "could not start a session log" message
 *                      then shows on screen; it is not part of the layout).
 *   --verbose          print every row's position even when nothing is wrong
 *
 * Exit code 1 when anything moved, needed scrolling or was missing. Needs Chrome or Edge installed.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// What a web page gets on real iPhones, safe areas (notch, home indicator) already taken off.
const DEFAULT_SIZES = [
  "375x548", // SE, upright in a Safari tab
  "390x664", // 13 / 14, upright in a Safari tab
  "393x659", // 15 / 16 Pro, upright in a Safari tab
  "430x739", // Pro Max, upright in a Safari tab
  "390x763", // 13 / 14, upright, opened from the home screen
  "667x331", // SE on its side in a Safari tab
  "750x340", // 13 / 14 on its side in a Safari tab
  "750x369", // 13 / 14 on its side, opened from the home screen
  "844x390", // 13 / 14 on its side, nothing taken off
  "838x380", // Pro Max on its side in a Safari tab
];
const ALL_MODES = ["single-note", "sequence", "intervals", "chords", "scales", "cents"];

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
};
const flag = (name) => argv.includes(`--${name}`);
const BASE = (argv[0] && !argv[0].startsWith("--") ? argv[0] : "http://localhost:3000").replace(/\/$/, "");
const SIZES = opt("sizes", DEFAULT_SIZES.join(","))
  .split(",")
  .map((s) => s.split("x").map(Number));
const MODES = opt("modes", "single-note") === "all" ? ALL_MODES : opt("modes", "single-note").split(",");
const ANSWERS = Number(opt("answers", 6));
const EXTRA = JSON.parse(opt("settings", "{}"));
const SHOTS = opt("shots", null);
const ALLOW_WRITES = flag("allow-writes");
const VERBOSE = flag("verbose");

const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].find((p) => fs.existsSync(p));
if (!CHROME) {
  console.error("Chrome or Edge was not found on this machine.");
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// A small Chrome DevTools Protocol driver (no dependencies)
// ---------------------------------------------------------------------------

async function launch(port) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "pp-phone-layout-"));
  // Headless Chrome reports `(hover: none)`, which is what a phone reports too.
  const proc = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--autoplay-policy=no-user-gesture-required", "--mute-audio"], { stdio: "ignore" });
  for (let i = 0; i < 60; i++) {
    try {
      await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
      return {
        port,
        close: () => {
          proc.kill();
          // Windows keeps the profile's files locked for a moment after Chrome exits; the temp folder is cleared by the system anyway.
          setTimeout(() => {
            try {
              fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
            } catch {
              /* leave it */
            }
          }, 800);
        },
      };
    } catch {
      await sleep(200);
    }
  }
  proc.kill();
  throw new Error("Chrome did not start");
}

async function openPage(browser, width, height) {
  const target = await (await fetch(`http://127.0.0.1:${browser.port}/json/new?about:blank`, { method: "PUT" })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  let id = 0;
  const pending = new Map();
  const guard = { blocked: 0 };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const n = ++id;
      pending.set(n, { resolve, reject });
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    } else if (msg.method === "Fetch.requestPaused") {
      // A server action is a POST with a Next-Action header: the only way the page can write to the database.
      const h = msg.params.request.headers;
      const isAction = msg.params.request.method === "POST" && Object.keys(h).some((k) => k.toLowerCase() === "next-action");
      if (isAction && !ALLOW_WRITES) {
        guard.blocked++;
        send("Fetch.failRequest", { requestId: msg.params.requestId, errorReason: "BlockedByClient" }).catch(() => {});
      } else {
        send("Fetch.continueRequest", { requestId: msg.params.requestId }).catch(() => {});
      }
    }
  };
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Fetch.enable", { patterns: [{ urlPattern: `${BASE}/*`, requestStage: "Request" }] });
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 3, mobile: true });
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await send("Emulation.setUserAgentOverride", { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1" });

  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  const goto = async (url) => {
    await send("Page.navigate", { url });
    await sleep(300);
    for (let i = 0; i < 200; i++) {
      if (await evaluate("document.readyState === 'complete'").catch(() => false)) break;
      await sleep(150);
    }
    await sleep(400);
  };
  const tap = async (x, y) => {
    await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };
  const tapButton = async (text) => {
    const at = await evaluate(`(() => { const b = [...document.querySelectorAll("[data-stage] button")].find((b) => !b.disabled && b.textContent.trim().replace(/\\s+/g, " ").includes(${JSON.stringify(text)})); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    if (at) await tap(at.x, at.y);
    return !!at;
  };
  const screenshot = async (file) => {
    const r = await send("Page.captureScreenshot", { format: "png" });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(r.data, "base64"));
  };
  return { evaluate, goto, tap, tapButton, screenshot, guard, close: () => ws.close() };
}

// ---------------------------------------------------------------------------
// In the page: a recorder that runs on every frame, and a picker of somewhere to tap
// ---------------------------------------------------------------------------

const PART = (name) => `document.querySelector('[data-stage] [data-stage-part="${name}"]')`;

const RECORDER = `(() => {
  const round = (n) => Math.round(n * 10) / 10;
  const rec = (window.__rec = { frames: [], on: true });
  const snap = () => {
    if (!rec.on) return;
    const stage = document.querySelector("[data-stage]");
    if (stage) {
      const part = (n) => stage.querySelector('[data-stage-part="' + n + '"]');
      const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return [round(b.top), round(b.height), round(b.left), round(b.width)]; };
      const text = part("text");
      const answer = part("answer");
      const transport = part("transport");
      const banner = text && text.querySelector(".rounded-lg.border");
      const keys = answer && [...answer.querySelectorAll("svg")].filter((s) => s.getBoundingClientRect().height > 60).sort((a, b) => b.getBoundingClientRect().height - a.getBoundingClientRect().height)[0];
      const tb = transport ? [...transport.querySelectorAll("button")] : [];
      const inQuiz = tb.length === 2;
      const answered = inQuiz && !tb[0].disabled;
      rec.frames.push({
        sideways: stage.dataset.stage === "sideways",
        state: !inQuiz ? "idle" : answered ? (banner ? (banner.className.includes("green") ? "right" : banner.className.includes("amber") ? "partial" : "wrong") : "answered") : /Loading/.test(text.innerText) ? "loading" : "question",
        stage: r(stage), bar: r(part("bar")), transport: r(transport), extras: r(part("extras")), strip: r(part("strip")), text: r(text), answer: r(answer),
        banner: r(banner), keys: r(keys), firstButton: r(answer && answer.querySelector("button")),
        textScroll: text ? [text.scrollHeight, text.clientHeight] : null,
        answerScroll: answer ? [answer.scrollHeight, answer.clientHeight, Math.round(answer.scrollTop)] : null,
        page: [Math.round(window.scrollY), document.documentElement.scrollHeight, window.innerHeight],
      });
    }
    requestAnimationFrame(snap);
  };
  requestAnimationFrame(snap);
})()`;

const STATE = `(() => {
  const t = ${PART("transport")};
  if (!t) return "none";
  const tb = [...t.querySelectorAll("button")];
  if (tb.length !== 2) return "idle";
  if (!tb[0].disabled) return "answered";
  return /Loading/.test(${PART("text")}.innerText) ? "loading" : "question";
})()`;

// Somewhere inside the answer to tap: a key of the piano, or one of the buttons that can be seen.
const PICK = `(() => {
  const a = ${PART("answer")};
  const ar = a.getBoundingClientRect();
  const seen = (el) => { const b = el.getBoundingClientRect(); return b.width > 4 && b.height > 4 && b.top >= ar.top - 1 && b.bottom <= Math.min(ar.bottom, window.innerHeight) + 1; };
  const buttons = [...a.querySelectorAll("button:not([disabled])")].filter(seen);
  const svg = [...a.querySelectorAll("svg")].filter((s) => s.getBoundingClientRect().height > 60 && seen(s))[0];
  if (svg && (buttons.length === 0 || Math.random() < 0.7)) { const b = svg.getBoundingClientRect(); return { x: b.left + (0.03 + Math.random() * 0.94) * b.width, y: b.top + b.height * 0.9 }; }
  if (!buttons.length) return null;
  const submit = buttons.find((b) => /^Answer/.test(b.textContent.trim()));
  const el = submit && Math.random() < 0.5 ? submit : buttons[Math.floor(Math.random() * buttons.length)];
  const b = el.getBoundingClientRect();
  return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
})()`;

// ---------------------------------------------------------------------------
// What the recording says
// ---------------------------------------------------------------------------

function analyse(frames) {
  const quiz = frames.filter((f) => f.state !== "idle" && f.state !== "loading");
  const question = quiz.filter((f) => f.state === "question");
  const result = quiz.filter((f) => f.state !== "question");
  const sideways = quiz.some((f) => f.sideways);
  const problems = [];
  const rows = [];
  // Sideways, the after-answer buttons take their place in the top row only once there is an answer; nothing else may change.
  const parts = ["stage", "bar", "transport", ...(sideways ? [] : ["extras"]), "strip", "text", "answer", "keys", "firstButton"];
  for (const p of parts) {
    const vals = quiz.filter((f) => f[p]);
    if (!vals.length) continue;
    // Sideways, the result's slot shares the top row with the after-answer buttons, so only its height and top are fixed.
    const dims = sideways && p === "text" ? [0, 1] : [0, 1, 2, 3];
    const names = ["top", "height", "left", "width"];
    const show = (g) => [...new Set(g.filter((f) => f[p]).map((f) => `${f[p][0]}/${f[p][1]}`))].slice(0, 3).join(" , ");
    rows.push(`      ${p.padEnd(11)} question ${show(question).padEnd(26)} result ${show(result)}`);
    for (const d of dims) {
      const xs = vals.map((f) => f[p][d]);
      const delta = Math.max(...xs) - Math.min(...xs);
      // A button sinks one pixel while it is pressed (the UI kit's press effect); that is not the layout moving.
      if (delta > 1.5) problems.push(`${p}: ${names[d]} changes by ${Math.round(delta)} px (${Math.min(...xs)} … ${Math.max(...xs)})`);
    }
  }
  for (const [name, g] of [
    ["during the question", question],
    ["with the result showing", result],
  ]) {
    const scroll = g.filter((f) => f.answerScroll && f.answerScroll[0] > f.answerScroll[1] + 1);
    if (scroll.length) problems.push(`${name}, the answer has to be scrolled: ${Math.max(...scroll.map((f) => f.answerScroll[0]))} px of it in ${scroll[0].answerScroll[1]} px`);
  }
  if (!sideways) {
    const over = result.filter((f) => f.textScroll && f.textScroll[0] > f.textScroll[1] + 1);
    if (over.length) problems.push(`the result does not fit its row: ${Math.max(...over.map((f) => f.textScroll[0]))} px in a ${over[0].textScroll[1]} px row`);
  } else {
    const hang = result.filter((f) => f.banner && f.text && f.banner[0] + f.banner[1] > f.text[0] + f.text[1] + 1);
    if (hang.length) problems.push(`the result is taller than its row and hangs ${Math.round(Math.max(...hang.map((f) => f.banner[0] + f.banner[1] - f.text[0] - f.text[1])))} px over the answer`);
  }
  const cut = quiz.filter((f) => (f.keys && f.keys[0] + f.keys[1] > f.page[2] + 1) || (f.stage && f.stage[0] + f.stage[1] > f.page[2] + 1));
  if (cut.length) problems.push("part of the screen is cut off at the bottom");
  const page = quiz.filter((f) => f.page[0] !== 0 || f.page[1] > f.page[2] + 1);
  if (page.length) problems.push(`the page behind can scroll (${page[0].page[1]} px in a ${page[0].page[2]} px screen)`);
  const scrolled = quiz.filter((f) => f.answerScroll && f.answerScroll[2] !== 0);
  if (scrolled.length) problems.push("the answer was scrolled by a tap");
  const keys = quiz.find((f) => f.keys);
  const banners = [...new Set(result.filter((f) => f.banner).map((f) => f.state))];
  return { problems, rows, sideways, questionFrames: question.length, resultFrames: result.length, banners, keys: keys ? `${Math.round(keys.keys[3])}×${Math.round(keys.keys[1])}` : null };
}

// ---------------------------------------------------------------------------

async function runSize(port, width, height) {
  const out = [];
  const browser = await launch(port);
  try {
    for (const mode of MODES) {
      const p = await openPage(browser, width, height);
      const label = `${width}×${height} ${mode}`;
      try {
        await p.goto(`${BASE}/settings`);
        const stored = {
          "pp-trainer-settings-v1": { state: { settings: { adaptive: false, ...(EXTRA.trainer ?? {}) } }, version: 0 },
          "pp-piano-prefs-v1": { state: { windowOctaves: 2, phoneInput: "piano", confirmTaps: false, windowStart: 48, ...(EXTRA.piano ?? {}) }, version: 0 },
        };
        await p.evaluate(`(() => { const s = ${JSON.stringify(stored)}; for (const k in s) localStorage.setItem(k, JSON.stringify(s[k])); })()`);
        await p.goto(`${BASE}/trainer?mode=${mode}`);
        await sleep(1200);
        if (!(await p.evaluate(`!!document.querySelector("[data-stage]")`))) {
          const where = await p.evaluate("location.pathname");
          out.push({ label, problems: [where === "/unlock" ? "the app asked for the password (run it without APP_PASSWORD)" : "the fixed quiz screen is missing: this size gets the laptop's scrolling page"], rows: [] });
          if (SHOTS) await p.screenshot(path.join(SHOTS, `${mode}-${width}x${height}-missing.png`));
          continue;
        }
        await p.evaluate(RECORDER);
        await p.tapButton("Start");
        const waitQuestion = async () => {
          for (let i = 0; i < 200; i++) {
            if ((await p.evaluate(STATE)) === "question") return true;
            await sleep(120);
          }
          return false;
        };
        if (!(await waitQuestion())) {
          out.push({ label, problems: ["the first question never came (is the server running, and does it have sound files?)"], rows: [] });
          continue;
        }
        await sleep(500);
        if (SHOTS) await p.screenshot(path.join(SHOTS, `${mode}-${width}x${height}-question.png`));
        let shot = false;
        for (let n = 0; n < ANSWERS; n++) {
          for (let taps = 0; taps < 60 && (await p.evaluate(STATE)) === "question"; taps++) {
            const at = await p.evaluate(PICK);
            if (!at) break;
            await p.tap(at.x, at.y);
            await sleep(110);
          }
          await sleep(650);
          if ((await p.evaluate(STATE)) === "answered") {
            if (SHOTS && !shot) {
              await p.screenshot(path.join(SHOTS, `${mode}-${width}x${height}-result.png`));
              shot = true;
            }
            await sleep(250);
            await p.tapButton("Hear next");
          }
          await waitQuestion();
          await sleep(300);
        }
        await p.evaluate("window.__rec.on = false");
        out.push({ label, ...analyse(await p.evaluate("window.__rec.frames")) });
      } finally {
        p.close();
      }
    }
  } finally {
    browser.close();
  }
  return out;
}

console.log(`${BASE} · modes: ${MODES.join(", ")} · ${SIZES.length} sizes · ${ANSWERS} answers each · writes ${ALLOW_WRITES ? "ALLOWED" : "blocked"}`);
const results = [];
// A few browsers at a time: each size has its own.
const queue = SIZES.map(([w, h], i) => ({ w, h, port: 9400 + i }));
const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
  for (let job = queue.shift(); job; job = queue.shift()) {
    try {
      results.push(...(await runSize(job.port, job.w, job.h)));
    } catch (err) {
      results.push({ label: `${job.w}×${job.h}`, problems: [`could not be checked: ${err instanceof Error ? err.message : err}`], rows: [] });
    }
  }
});
await Promise.all(workers);

const order = (r) => SIZES.findIndex(([w, h]) => r.label.startsWith(`${w}×${h}`)) * 10 + MODES.findIndex((m) => r.label.endsWith(m));
results.sort((a, b) => order(a) - order(b));
let bad = 0;
for (const r of results) {
  const ok = r.problems.length === 0;
  if (!ok) bad++;
  const facts = r.questionFrames !== undefined ? ` (${r.sideways ? "sideways" : "upright"}${r.keys ? `, keys ${r.keys}` : ""}, ${r.questionFrames + r.resultFrames} frames, results seen: ${r.banners.join(", ") || "none"})` : "";
  console.log(`${ok ? "✓" : "✗"} ${r.label.padEnd(24)}${ok ? " holds still, nothing to scroll" : ""}${facts}`);
  if (!ok || VERBOSE) for (const row of r.rows) console.log(row);
  for (const p of r.problems) console.log(`      ✗ ${p}`);
}
console.log(bad ? `\n${bad} of ${results.length} combinations have a problem` : `\nAll ${results.length} combinations hold still.`);
process.exit(bad ? 1 : 0);
