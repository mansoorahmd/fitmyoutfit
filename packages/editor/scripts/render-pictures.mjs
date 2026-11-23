// Makes the product pictures again: opens the demo's pictures page (`?pictures=1`) in a headless Chrome, waits for
// the renders, and writes the six WebP files. No packages: Node's own fetch and WebSocket, and a Chrome on this computer.
//
//   npm run dev -w packages/editor          (the demo, on http://localhost:5173; or another port with --port on vite)
//   node packages/editor/scripts/render-pictures.mjs [--url http://localhost:5173] [--chrome <path to chrome.exe>]
//        [--out <folder>] [--debug-port 9222] [--software]
//
// --software renders with the software rasteriser instead of the GPU (slower; the lights are the same).
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const base = option("url", "http://localhost:5173").replace(/\/$/, "");
const out = resolve(option("out", join(here, "..", "samples", "pictures", "products")));
const debugPort = Number(option("debug-port", "9222"));
const software = args.includes("--software");
const CHROMES = [
  option("chrome", ""),
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);
const chrome = CHROMES.find((p) => existsSync(p));
if (!chrome) throw new Error("No Chrome found: pass --chrome <path>");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), "fmo-pictures-"));
const proc = spawn(
  chrome,
  [
    "--headless=new",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`,
    ...(software ? ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] : ["--use-angle=d3d11", "--enable-gpu"]),
    "--ignore-gpu-blocklist",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    "--window-size=1800,1800",
    "about:blank",
  ],
  { stdio: "ignore" },
);

async function main() {
  let page;
  for (let k = 0; k < 100 && !page; k++) {
    try {
      page = (await (await fetch(`http://127.0.0.1:${debugPort}/json/list`)).json()).find((t) => t.type === "page");
    } catch {
      await sleep(100);
    }
    if (!page) await sleep(100);
  }
  if (!page) throw new Error("Chrome did not start");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) {
      const { res, rej } = pending.get(d.id);
      pending.delete(d.id);
      if (d.error) rej(new Error(d.error.message));
      else res(d.result);
    }
  };
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const n = ++id;
      pending.set(n, { res, rej });
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result.value;
  };

  await send("Emulation.setDeviceMetricsOverride", { width: 1800, height: 1800, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: `${base}/?pictures=1` });
  const started = Date.now();
  let result = null;
  while (Date.now() - started < 300_000) {
    const state = await evaluate("JSON.stringify({ error: window.__picturesError ?? null, done: Array.isArray(window.__pictures) })").catch(() => null);
    if (state) {
      const s = JSON.parse(state);
      if (s.error) throw new Error(`the pictures page failed: ${s.error}`);
      if (s.done) {
        result = JSON.parse(await evaluate("JSON.stringify(window.__pictures)"));
        break;
      }
    }
    await sleep(500);
  }
  if (!result) throw new Error("timed out waiting for the pictures page");
  mkdirSync(out, { recursive: true });
  for (const p of result) {
    const file = join(out, p.name);
    writeFileSync(file, Buffer.from(p.dataUrl.split(",")[1], "base64"));
    console.log(`${file}  ${(p.bytes / 1024).toFixed(1)} KB  (quality ${p.quality})`);
  }
  ws.close();
}

try {
  await main();
} finally {
  proc.kill();
  await sleep(500);
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    // Chrome may still hold the folder for a moment; it is a temporary one.
  }
}
