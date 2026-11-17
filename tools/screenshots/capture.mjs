#!/usr/bin/env node
/**
 * Takes the screenshots in docs/screenshots by driving a headless Edge or
 * Chrome over the DevTools protocol. Nothing to install: it needs Node 22 or
 * later (for its built-in WebSocket) and a Chromium browser.
 *
 *   npm run screenshots                       every shot, from the live site
 *   npm run screenshots -- practice-needle    only the shots named
 *   BASE=http://localhost:3000 npm run screenshots
 *
 * Point BASE at a production build (`npm run build && npm run start`): the
 * development server draws its own badge in the corner of every page.
 * BROWSER may name the browser executable if it is not found.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = (process.env.BASE ?? "https://venalab.vercel.app").replace(/\/$/, "");
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), "../../docs/screenshots");
const PORT = 9333 + Math.floor(Math.random() * 500);
const only = process.argv.slice(2);

const BROWSERS = [
  process.env.BROWSER,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/microsoft-edge",
].filter(Boolean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

// ───────────────────────── The browser ─────────────────────────

const exe = BROWSERS.find((p) => existsSync(p));
if (!exe) throw new Error("No Chromium browser found: set BROWSER to its executable.");
const profile = mkdtempSync(join(tmpdir(), "venalab-shots-"));
const browser = spawn(exe, ["--headless=new", `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--hide-scrollbars",
  // A fresh profile otherwise opens extension and sync pages in front of ours, and a hidden page draws nothing.
  "--disable-extensions", "--disable-component-extensions-with-background-pages", "--disable-sync", "--mute-audio", "--enable-unsafe-swiftshader",
  // Keep the page drawing frames although no window is ever shown.
  "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--disable-features=CalculateNativeWinOcclusion,IntensiveWakeUpThrottling",
  "about:blank"], { stdio: "ignore" });

let target;
for (let i = 0; i < 80 && !target; i++) {
  await sleep(250);
  try {
    target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" })).json();
  } catch {
    // not listening yet
  }
}
if (!target) throw new Error("The browser did not start.");

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r, j) => ((ws.onopen = r), (ws.onerror = j)));
let seq = 0;
const waiting = new Map();
ws.onmessage = (m) => {
  const msg = JSON.parse(m.data);
  const w = waiting.get(msg.id);
  if (!w) return;
  waiting.delete(msg.id);
  if (msg.error) w.reject(new Error(`${w.method}: ${msg.error.message}`));
  else w.resolve(msg.result);
};
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => {
      waiting.delete(id);
      reject(new Error(`${method} did not answer`));
    }, 30000);
    waiting.set(id, { resolve: (v) => (clearTimeout(timer), resolve(v)), reject: (e) => (clearTimeout(timer), reject(e)), method });
    ws.send(JSON.stringify({ id, method, params }));
  });

/** Run an expression (awaited) in the page and return its value. */
async function js(expression) {
  const r = await send("Runtime.evaluate", { expression: `(async () => { ${expression} })()`, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
}

/** Wait until an expression in the page is truthy. */
async function until(expression, ms = 30000, what = expression) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await js(`return !!(${expression});`).catch(() => false)) return;
    await sleep(150);
  }
  throw new Error(`Timed out waiting for ${what}`);
}

// Small helpers available on every page.
await send("Page.enable");
await send("Runtime.enable");
await send("Page.bringToFront");
await send("Emulation.setFocusEmulationEnabled", { enabled: true });
await send("Page.addScriptToEvaluateOnNewDocument", {
  source: `
    window.__sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__btn = (t) => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === t);
    window.__click = (t) => { const b = window.__btn(t); if (!b) throw new Error("No button: " + t); b.click(); };
    window.__has = (t) => document.body.innerText.includes(t);
    window.__range = (label, v) => {
      const l = [...document.querySelectorAll("label")].find((x) => x.textContent.trim().startsWith(label));
      const el = l && l.querySelector("input");
      if (!el) throw new Error("No slider: " + label);
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, String(v));
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    };
    window.__canvas = () => { const r = document.querySelector("canvas").getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
    window.__palp = () => document.querySelector(".min-h-\\\\[52px\\\\]")?.textContent ?? "";
    window.__pill = () => [...document.querySelectorAll(".label-pill")].filter((e) => e.style.visibility === "visible").map((e) => e.textContent).join(" | ");
  `,
});

async function viewport(width, height, phone = false) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: phone ? 2 : 1, mobile: phone, screenWidth: width, screenHeight: height });
  await send("Emulation.setTouchEmulationEnabled", { enabled: phone, maxTouchPoints: phone ? 5 : 1 });
}

async function open(path) {
  await send("Page.navigate", { url: BASE + path });
  await until(`document.readyState === "complete"`, 30000, "the page to load");
  await sleep(400);
}

/** Wait for the 3D arm to be built and drawn. */
async function arm() {
  await until(`document.querySelector("canvas") && !__has("Building anatomy")`, 60000, "the arm to be built");
  await sleep(2500);
}

const mouse = {
  move: (x, y) => send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y }),
  async click(x, y) {
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  },
  /** Rub to and fro about a point, as with the alcohol wipe. */
  async scrub(cx, cy, done, reach = 40) {
    const end = Date.now() + 60000;
    for (let i = 0; Date.now() < end; i++) {
      const t = i / 10;
      await this.move(cx + reach * Math.sin(t * 2.3), cy + reach * 0.25 * Math.sin(t * 0.9));
      await sleep(16);
      if (i % 20 === 0) {
        if (await js(`return ${done};`)) return;
        if (process.env.DEBUG) log("scrub", await js(`return document.querySelector(".bg-accent.h-full")?.style.width ?? "-";`));
      }
    }
    throw new Error("Scrubbing did not finish");
  },
};

/**
 * Where the tool in the hand is on the screen, from the readout that follows
 * it, once the camera has stopped moving. The readout floats a little above
 * the tool, so the point returned is shifted down to the skin.
 */
async function toolPoint(drop = 30) {
  let last = null;
  for (let i = 0; i < 60; i++) {
    const p = await js(`
      const el = [...document.querySelectorAll(".label-pill")].find((e) => e.style.visibility === "visible" && e.style.transform.includes("translate("));
      if (!el) return null;
      const t = el.style.transform;
      const [x, y] = t.slice(t.indexOf("(") + 1, t.indexOf(")")).split(",").map(parseFloat);
      const c = document.querySelector("canvas").getBoundingClientRect();
      return { x: c.left + x, y: c.top + y };`);
    if (p && last && Math.hypot(p.x - last.x, p.y - last.y) < 1.5) return { x: p.x, y: p.y + drop };
    last = p;
    await sleep(500);
  }
  throw new Error("The tool did not come to rest");
}

/** Search the canvas for a point where `test` holds after the pointer rests there, starting at (fx, fy) of its size and working outward. */
async function find(test, fx = 0.4, fy = 0.5, step = 14, rings = 9) {
  const c = await js(`return __canvas();`);
  if (process.env.DEBUG) log("searching", test, "from", Math.round(c.x + c.w * fx), Math.round(c.y + c.h * fy));
  const cx = c.x + c.w * fx;
  const cy = c.y + c.h * fy;
  for (let ring = 0; ring <= rings; ring++)
    for (let dx = -ring; dx <= ring; dx++)
      for (let dy = -ring; dy <= ring; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const x = cx + dx * step;
        const y = cy + dy * step;
        await mouse.move(x, y);
        await sleep(110);
        if (await js(`return ${test};`)) {
          if (process.env.DEBUG) log("found at", Math.round(x), Math.round(y));
          return { x, y };
        }
      }
  throw new Error(`Nothing found for ${test}`);
}

async function shot(name, clip) {
  const { data } = await send("Page.captureScreenshot", { format: "webp", quality: 88, ...(clip ? { clip: { ...clip, scale: 1 } } : {}) });
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `${name}.webp`), Buffer.from(data, "base64"));
  log("saved", `${name}.webp`);
}

// ───────────────────────── The shots ─────────────────────────

const DESK = [1440, 900];

/** Venipuncture from the tourniquet to the debrief; several shots along the way. */
async function venipuncture() {
  await viewport(...DESK);
  await open("/atlas");
  await arm();
  await shot("practice");

  await js(`__click("Apply tourniquet"); __click("Antecubital fossa");`);
  await sleep(3500);
  // A large vein in the fossa: the median cubital, about 4 mm or more across once the tourniquet is on.
  const vein = await find(`/Soft, bouncy/.test(__palp()) && parseFloat((__palp().match(/Vein ≈ ([\\d.]+)/) || [])[1]) >= 4`, 0.49, 0.5, 14, 12);
  await mouse.move(vein.x + 1, vein.y);
  await sleep(900);
  await shot("practice-palpate");

  // Mark the site, then scrub it: the camera centres the site in the part of the canvas the panel leaves clear.
  await mouse.click(vein.x, vein.y);
  await sleep(3200);
  const c = await js(`return __canvas();`);
  const site = await toolPoint();
  if (process.env.DEBUG) log("site", Math.round(site.x), Math.round(site.y));
  await mouse.scrub(site.x, site.y, `(() => { const b = document.querySelector(".bg-accent.h-full"); return b && parseFloat(b.style.width) >= 55; })()`);
  await sleep(250);
  await shot("practice-cleanse");
  await mouse.scrub(site.x, site.y, `!!__btn("Finish attempt")`);
  await mouse.move(c.x + 30, c.y + c.h - 30);

  // Anchor the vein, let the alcohol dry, then find a heading that enters the vein.
  await js(`__click("Anchor vein");`);
  await sleep(4600);
  const inVein = () => js(`return __has("Blood in the hub");`);
  let hit = 0;
  for (const yaw of [0, -10, 10, -20, 20, -30, 30, -40, 40]) {
    await js(`__range("Needle in the skin", -7); await __sleep(150); __range("Angle to skin", 20); __range("Direction", ${yaw}); await __sleep(150);`);
    for (let d = 1; d <= 12 && !hit; d += 0.5) {
      await js(`__range("Needle in the skin", ${d});`);
      await sleep(60);
      if (await inVein()) hit = d;
    }
    if (hit) break;
  }
  if (!hit) throw new Error("No heading entered the vein");
  // Carry the bevel a little further, off the near wall. Not too far: the simulation remembers the worst
  // thing the needle touched, and the brachial artery lies beneath this vein.
  const depth = hit + 2.5;
  await js(`__range("Needle in the skin", ${depth});`);
  if (process.env.DEBUG) log("needle at", depth, "mm; first blood at", hit);
  await sleep(8000);
  await shot("practice-needle");

  await js(`__click("Finish attempt");`);
  await sleep(3500);
  const title = await js(`return document.querySelector("h3.text-base")?.textContent;`);
  log("debrief:", title);
  if (process.env.DEBUG) log(await js(`return [...document.querySelectorAll("li")].map((l) => l.textContent).join(" | ");`));
  await shot("practice-debrief");
}

/** The narrated demonstration, caught as blood fills the tube. */
async function demo() {
  await viewport(...DESK);
  await open("/atlas?demo");
  await arm();
  await until(`/Blood flows/.test(document.body.innerText)`, 60000, "the demonstration to reach the draw");
  await sleep(2600);
  await shot("demo");
}

async function fingerstick() {
  await viewport(...DESK);
  await open("/atlas");
  await arm();
  await js(`__click("Fingerstick"); await __sleep(300); __click("Warm the hand");`);
  await sleep(3500);
  const pad = await find(`/^Middle finger — pad, just off-centre/.test(__pill())`, 0.6, 0.48, 10, 14);
  // The finger is named only while the pointer moves over it.
  await sleep(500);
  await mouse.move(pad.x, pad.y + 1);
  await sleep(60);
  await shot("fingerstick-site");
  await mouse.click(pad.x, pad.y);
  await sleep(3000);
  const c = await js(`return __canvas();`);
  await mouse.scrub(c.x + (24 + c.w - 366) / 2, c.y + (36 + c.h - 56) / 2, `!!__btn("Fire the lancet")`, 26);
  await mouse.move(c.x + 30, c.y + c.h - 30);
  await sleep(4600);
  await js(`__click("Fire the lancet");`);
  await sleep(2500);
  await js(`__click("Wipe away the first drop");`);
  await sleep(2600);
  await js(`__click("Collect the drop");`);
  await sleep(3600);
  await shot("fingerstick");
}

async function explore() {
  await viewport(...DESK);
  await open("/atlas?mode=explore");
  await arm();
  await sleep(3000);
  await js(`__click("Neurovascular"); __click("Antecubital fossa");`);
  await sleep(3500);
  await shot("explore-neurovascular");
  await js(`[...document.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith("Median cubital vein")).click();`);
  await sleep(3000);
  await shot("explore-structure");
  await js(`__click("✕"); await __sleep(200); __click("Skeleton"); __click("Whole limb");`);
  await sleep(3500);
  await shot("explore-skeleton");
  await js(`__click("Vein illuminator"); __click("Dorsal hand");`);
  await sleep(3500);
  await shot("explore-illuminator");
}

async function veinFinder() {
  await viewport(...DESK);
  await open("/vein-finder");
  await js(`[...document.querySelectorAll("button")].find((b) => /Forearm · light/.test(b.textContent)).click();`);
  await until(`__has("Candidate sites")`, 20000);
  await sleep(800);
  await js(`window.scrollTo(0, 0); __click("Vein map");`);
  await sleep(800);
  await shot("vein-finder");
  await js(`__click("3D relief");`);
  await sleep(4000);
  await shot("vein-finder-relief");
}

async function reference() {
  await viewport(...DESK);
  await open("/reference");
  await shot("reference");
  await js(`document.querySelector("#order").scrollIntoView(); window.scrollBy(0, -16);`);
  await sleep(300);
  for (const t of ["Blood cultures", "Light blue", "Red / gold", "Grey"])
    await js(`[...document.querySelectorAll("button")].find((b) => b.textContent.includes(${JSON.stringify(t)}))?.click(); await __sleep(150);`);
  await sleep(400);
  await shot("reference-order-of-draw");
}

const PHONE = [390, 844, true];

async function phone() {
  await viewport(...PHONE);
  await open("/atlas?demo");
  await arm();
  await until(`/Blood flows/.test(document.body.innerText)`, 60000, "the demonstration to reach the draw");
  await sleep(2600);
  await shot("phone-demo");

  await open("/atlas");
  await arm();
  await js(`__click("Apply tourniquet"); await __sleep(200); __click("Antecubital fossa");`);
  await sleep(4000);
  await shot("phone-practice");

  await open("/atlas?mode=explore");
  await arm();
  await sleep(2500);
  await js(`__click("Layers and display"); await __sleep(200); __click("Neurovascular"); __click("Antecubital fossa");`);
  await sleep(4000);
  await shot("phone-explore");

  await open("/vein-finder");
  await js(`[...document.querySelectorAll("button")].find((b) => /Forearm · light/.test(b.textContent)).click();`);
  await until(`__has("Candidate sites")`, 20000);
  await sleep(1500);
  await shot("phone-vein-finder");
}

const SHOTS = { venipuncture, demo, fingerstick, explore, veinFinder, reference, phone };

try {
  for (const [name, run] of Object.entries(SHOTS)) {
    if (only.length && !only.includes(name)) continue;
    log("▶", name);
    try {
      await run();
    } catch (err) {
      console.error(`✗ ${name}: ${err.message}`);
      process.exitCode = 1;
    }
  }
} finally {
  ws.close();
  browser.kill();
  await sleep(500);
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    // the browser may still hold a file for a moment
  }
}
