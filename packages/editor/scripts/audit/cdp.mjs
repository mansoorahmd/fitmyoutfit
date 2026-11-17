// A minimal Chrome DevTools Protocol driver for the editor's page audits (E3d): launch a headless Chrome with
// its own profile, open a page with real device emulation (touch, scale), click, tap, read the page, take a
// screenshot, and read a PNG back. Node's built-in WebSocket, fetch and zlib only: no packages.
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { inflateSync } from "node:zlib";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const DEFAULT_CHROME = process.platform === "win32" ? "C:/Program Files/Google/Chrome/Application/chrome.exe" : process.platform === "darwin" ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" : "google-chrome";

/** Starts Chrome (CHROME overrides the path). `gpu`: the machine's GPU (as the reviews ran), else SwiftShader. */
export async function launch({ port, profileDir, gpu = true, args = [] }) {
  try {
    await fetch(`http://127.0.0.1:${port}/json/version`);
    throw new Error(`port ${port} is already in use`);
  } catch (e) {
    if (String(e.message).includes("already in use")) throw e;
  }
  rmSync(profileDir, { recursive: true, force: true });
  mkdirSync(profileDir, { recursive: true });
  const proc = spawn(
    process.env.CHROME ?? DEFAULT_CHROME,
    [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profileDir}`,
      ...(gpu ? ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--enable-gpu-rasterization"] : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]),
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-extensions",
      ...args,
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  let version;
  for (let k = 0; k < 100 && !version; k++) {
    try {
      version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
    } catch {
      await sleep(100);
    }
  }
  if (!version) throw new Error("Chrome did not start");
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (msg) => {
    const data = JSON.parse(msg.data);
    if (data.id && pending.has(data.id)) {
      const { resolve, reject } = pending.get(data.id);
      pending.delete(data.id);
      if (data.error) reject(new Error(`${data.error.message} ${data.error.data ?? ""}`));
      else resolve(data.result);
    }
  };
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const msgId = ++id;
      pending.set(msgId, { resolve, reject });
      ws.send(JSON.stringify({ id: msgId, method, params, sessionId }));
    });
  return {
    pid: proc.pid,
    send,
    async close() {
      try {
        await send("Browser.close");
      } catch {
        // gone already
      }
      ws.close();
      await sleep(300);
      try {
        proc.kill();
      } catch {
        // gone already
      }
    },
  };
}

/** A page of `width` x `height` CSS px; `mobile`: phone emulation with touch (scale 2 unless given). */
export async function openPage(browser, { width, height, mobile = false, scale }) {
  const { targetId } = await browser.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });
  const send = (method, params) => browser.send(method, params, sessionId);
  await send("Page.enable");
  await send("Runtime.enable");
  const dsf = scale ?? (mobile ? 2 : 1);
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: dsf, mobile, screenWidth: width, screenHeight: height });
  if (mobile) await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  const page = {
    width,
    height,
    mobile,
    scale: dsf,
    send,
    async goto(url) {
      await send("Page.navigate", { url });
    },
    async eval(expression) {
      const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(`in the page: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`);
      return result.result.value;
    },
    async waitFor(expression, timeout = 60000) {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        try {
          if (await page.eval(expression)) return;
        } catch {
          // not yet
        }
        await sleep(100);
      }
      throw new Error(`timed out waiting for ${expression}`);
    },
    async click(selector) {
      const ok = await page.eval(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.click(); return true; })()`);
      if (!ok) throw new Error(`no element ${selector}`);
      await sleep(200);
    },
    async exists(selector) {
      return page.eval(`!!document.querySelector(${JSON.stringify(selector)})`);
    },
    async key(key, code = key, keyCode) {
      await send("Input.dispatchKeyEvent", { type: "keyDown", key, code, windowsVirtualKeyCode: keyCode });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: keyCode });
      await sleep(150);
    },
    async type(selector, text) {
      await page.eval(`document.querySelector(${JSON.stringify(selector)}).focus()`);
      await send("Input.insertText", { text });
      await sleep(200);
      await page.eval(`document.activeElement && document.activeElement.blur()`);
      await sleep(200);
    },
    async screenshot(path) {
      const { data } = await send("Page.captureScreenshot", { format: "png" });
      writeFileSync(path, Buffer.from(data, "base64"));
      return path;
    },
  };
  return page;
}

/** A PNG (8-bit RGB or RGBA, not interlaced, as Chrome's screenshots are) as RGBA bytes. */
export function readPng(path) {
  const buf = readFileSync(path);
  let pos = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("latin1", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
    } else if (type === "IDAT") idat.push(data);
    pos += 12 + len;
  }
  const bpp = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const out = new Uint8Array(width * height * 4);
  const stride = width * bpp;
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = new Uint8Array(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[x] = v & 255;
    }
    for (let x = 0; x < width; x++) {
      out[(y * width + x) * 4] = cur[x * bpp];
      out[(y * width + x) * 4 + 1] = cur[x * bpp + 1];
      out[(y * width + x) * 4 + 2] = cur[x * bpp + 2];
      out[(y * width + x) * 4 + 3] = bpp === 4 ? cur[x * bpp + 3] : 255;
    }
    prev = cur;
  }
  return { width, height, data: out };
}
