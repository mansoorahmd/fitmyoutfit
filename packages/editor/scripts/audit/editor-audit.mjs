#!/usr/bin/env node
// The editor's page audits (E3d; the rules of docs/design/07-editor-review.md section 4), run against a running
// demo. Read-only: it opens the page in its own headless Chrome profile and changes nothing on disk but its
// results.
//
//   node scripts/audit/editor-audit.mjs [--url http://localhost:5184] [--out audit-results]
//        [--sizes 360x640m,390x844m,820x1180m,844x390m,1366x768,1920x1000] [--product stand-in-tshirt]
//        [--port 9399] [--no-gpu] [--shots]
//
// Per size it walks: the start card, the rest framing, every tool, the Players tab as a typed team list (E4a: a
// clash, a missing size, a spare shirt, two of one shirt; touch targets, contrast and nothing cut off), an item
// selected (number, team name) and the Done panel, and checks in each state the panel grid (4.1), the spacing scale (4.2), the type tokens (4.3), the
// selection box (4.5), the stage's framing (4.6: magenta method), what sits on the stage (4.7) and native
// controls (4.8). Writes <out>/audit-<product>-<size>.json and prints one line per broken rule. Exit code 1 when
// any rule is broken, 2 when the page could not be audited.
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { launch, openPage, readPng, sleep } from "./cdp.mjs";
import { pageAudit, teamListAudit } from "./rules.mjs";

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);
const URL_BASE = String(args.url ?? "http://localhost:5184");
const OUT = resolve(String(args.out ?? "audit-results"));
const PRODUCT = args.product ? String(args.product) : null;
const PORT = Number(args.port ?? 9399);
const SIZES = String(args.sizes ?? "360x640m,390x844m,820x1180m,844x390m,1366x768,1920x1000").split(",");
const SHOTS = Boolean(args.shots);
mkdirSync(OUT, { recursive: true });

/** 4.6: the garment's share of the free stage, painted magenta for one frame and read back. */
async function framing(page, tag) {
  await page.eval(`(() => { const st = document.createElement('style'); st.id = 'audit-frame'; st.textContent = '.fmo-stage{background:#ff00ff !important}.fmo-stage-deep,.fmo-stage-shadow,.fmo-stage-top,.fmo-view,.fmo-credit,.fmo-kit-place,.fmo-overlay,.fmo-context-place,.fmo-start,.fmo-panel{visibility:hidden !important}'; document.head.appendChild(st); })()`);
  await sleep(300);
  const file = await page.screenshot(join(OUT, `frame-${tag}.png`));
  await page.eval(`document.getElementById('audit-frame')?.remove()`);
  const free = await page.eval(`(() => { const c = document.querySelector('[data-testid="stage-canvas"]'); if (!c) return null; const r = c.getBoundingClientRect(); const [t, rt, b, l] = (c.dataset.free || '0 0 0 0').split(' ').map(Number); return { left: r.left + l, top: r.top + t, right: r.right - rt, bottom: r.bottom - b }; })()`);
  if (!free) return null;
  const img = readPng(file);
  const sc = img.width / page.width;
  const rim = Math.round(2 * sc);
  let minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
  // The whole stage (the garment may reach under a row; that is a fault to see, not to cut off).
  const stage = await page.eval(`(() => { const r = document.querySelector('[data-testid="stage-canvas"]').getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom }; })()`);
  for (let y = Math.round(stage.top * sc) + rim; y < Math.round(stage.bottom * sc) - rim; y++)
    for (let x = Math.round(stage.left * sc) + rim; x < Math.round(Math.min(stage.right, free.right + 1) * sc) - rim; x++) {
      const k = (y * img.width + x) * 4;
      if (img.data[k] > 235 && img.data[k + 1] < 25 && img.data[k + 2] > 235) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  if (maxX < 0) return { garment: null };
  const g = { left: minX / sc, top: minY / sc, right: (maxX + 1) / sc, bottom: (maxY + 1) / sc };
  const h = free.bottom - free.top;
  const w = free.right - free.left;
  return {
    garment: { w: Math.round(g.right - g.left), h: Math.round(g.bottom - g.top) },
    free: { w: Math.round(w), h: Math.round(h) },
    fillH: +((g.bottom - g.top) / h).toFixed(2),
    fillW: +((g.right - g.left) / w).toFixed(2),
    underRow: g.top < free.top - 1 || g.bottom > free.bottom + 1,
  };
}

async function audit(page, state, size, record) {
  await sleep(400);
  const result = await page.eval(`(${pageAudit.toString()})()`);
  record.states[state] = result;
  for (const f of result.failures) record.failures.push(`${size} ${state}: ${f}`);
  if (SHOTS) await page.screenshot(join(OUT, `shot-${PRODUCT ?? "jersey"}-${size}-${state}.png`));
  return result;
}

async function selectItem(page, role) {
  const id = await page.eval(`(window.__editorDesign?.layers ?? []).find((l) => l.role === ${JSON.stringify(role)})?.id ?? null`);
  if (!id) return null;
  if (!(await page.exists(`[data-testid="kit-pick-${id}"]`))) {
    if (!(await page.exists('[data-testid="kit-button"]'))) return null;
    await page.click('[data-testid="kit-button"]');
    await sleep(700);
  }
  await page.click(`[data-testid="kit-pick-${id}"]`);
  await sleep(1800);
  return id;
}

async function runSize(size) {
  const m = size.match(/^(\d+)x(\d+)(m?)$/);
  if (!m) throw new Error(`bad size ${size}`);
  const [width, height, mobile] = [Number(m[1]), Number(m[2]), m[3] === "m"];
  const record = { size, product: PRODUCT ?? "stand-in-jersey", states: {}, framing: {}, failures: [] };
  const browser = await launch({ port: PORT, profileDir: join(tmpdir(), `fmo-editor-audit-${PORT}`), gpu: !args["no-gpu"] });
  try {
    const page = await openPage(browser, { width, height, mobile });
    await page.goto(`${URL_BASE}/${PRODUCT ? `?product=${PRODUCT}` : ""}`);
    await page.waitFor(`!!document.querySelector('[data-testid="editor"]') && !document.querySelector('[data-testid="stage-loading"]')`, 90000);
    await sleep(1500);
    // The start card.
    await audit(page, "start", size, record);
    record.framing.start = await framing(page, `${size}-start`);
    if (width <= 360 && record.framing.start?.garment && record.framing.start.garment.h < 120) record.failures.push(`${size} start: R5 the garment is ${record.framing.start.garment.h} px tall (120 at least)`);
    // Past the card: two colours, a name, Skip.
    // E3f: Main and Second are rows of their own; a colour another row has is dimmed, so red goes to Main first.
    const swatches = await page.eval(`[...document.querySelectorAll('[data-testid^="start-colour-"]:not(:disabled)')].map((b) => b.dataset.testid)`);
    await page.click(`[data-testid="${swatches.find((s) => s.startsWith("start-colour-main-") && s.endsWith("-red")) ?? swatches.find((s) => s.startsWith("start-colour-main-"))}"]`);
    const seconds = await page.eval(`[...document.querySelectorAll('[data-testid^="start-colour-second-"]:not(:disabled)')].map((b) => b.dataset.testid)`);
    await page.click(`[data-testid="${seconds.find((s) => s.endsWith("-navy")) ?? seconds[0]}"]`);
    await page.type('[data-testid="start-team-name"]', "LAHORE LIONS");
    await page.click('[data-testid="start-skip"]');
    await sleep(1500);
    // At rest: 4.6 framing.
    const rest = await framing(page, `${size}-rest`);
    record.framing.rest = rest;
    if (rest?.garment) {
      const [lo, hi] = record.states.start?.layout === "wide" ? [0.75, 0.8] : [0.72, 0.8];
      const widthBound = rest.fillW >= 0.85;
      if (rest.fillH > hi + 0.01 || (rest.fillH < lo - 0.01 && !widthBound)) record.failures.push(`${size} rest: 4.6 the garment fills ${rest.fillH} of the free stage (${lo} to ${hi})`);
      if (rest.underRow) record.failures.push(`${size} rest: 4.6 the garment reaches under a row`);
    }
    // Every tool.
    const tools = await page.eval(`[...document.querySelectorAll('[data-testid^="tab-"]')].map((b) => b.dataset.testid.slice(4))`);
    for (const tool of tools) {
      await page.click(`[data-testid="tab-${tool}"]`);
      await sleep(1000);
      await audit(page, `tool-${tool}`, size, record);
      if (mobile && tool === "colours" && (await page.exists('[data-testid="panel-expand"]'))) {
        await page.click('[data-testid="panel-expand"]');
        await sleep(800);
        await audit(page, "tool-colours-expanded", size, record);
        await page.click('[data-testid="panel-expand"]');
        await sleep(600);
      }
    }
    // The team list (E4a): five typed lines (a clash, a missing size, a spare shirt, two of one shirt), the keyboard open
    // and then closed; the page rules and the list's own (touch targets, contrast, nothing cut off) in each state.
    if (tools.includes("players")) {
      await page.click('[data-testid="tab-players"]');
      await sleep(1000);
      if (await page.exists('[data-testid="tl-empty-add"]')) {
        await page.click('[data-testid="tl-empty-add"]');
        await sleep(300);
        const type = async (text) => { await page.send("Input.insertText", { text }); await sleep(60); };
        const enter = () => page.key("Enter", "Enter", 13);
        for (const [name, number, size] of [["Ali Raza", "10", "M"], ["Bilal Ahmed", "7", "L"], ["محمد علی", "٧", "XL"], ["Usman Tariq", "23", ""]]) {
          await type(name); await enter(); await type(number); await enter();
          if (size) await type(size);
          await enter();
        }
        // The fifth, a spare shirt with two of it: the line's menu (4.6), by the buttons.
        await type("Hamza"); await enter(); await type("4"); await enter(); await type("S"); await enter();
        await page.eval(`document.querySelector('[data-testid="tl-more-4"]')?.click()`);
        await sleep(300);
        await page.eval(`document.querySelector('[data-testid="tl-menu-count"]')?.click()`);
        await sleep(250);
        await page.eval(`document.querySelector('[data-testid="tl-count-more"]')?.click()`);
        await sleep(200);
        record.states["players-list-menu"] = await audit(page, "players-list-menu", size, record);
        await page.key("Escape", "Escape", 27);
        await sleep(300);
        await page.eval(`document.activeElement?.blur(); document.querySelector('[data-testid="tl-name-5"]')?.closest('li') && document.querySelector('[data-testid="tl-name-5"]').focus()`);
        await sleep(900);
        const typing = await audit(page, "players-list-typing", size, record);
        const typingList = await page.eval(`(${teamListAudit.toString()})()`);
        typing.teamList = typingList;
        for (const f of typingList.failures) record.failures.push(`${size} players-list-typing: ${f}`);
        await page.eval(`document.activeElement?.blur()`);
        await sleep(600);
        const next = await page.exists('[data-testid="tl-next-to-fix"]');
        if (next) await page.click('[data-testid="tl-next-to-fix"]');
        await sleep(700);
        const idle = await audit(page, "players-list", size, record);
        const list = await page.eval(`(${teamListAudit.toString()})()`);
        idle.teamList = list;
        for (const f of list.failures) record.failures.push(`${size} players-list: ${f}`);
        // E4b: the player chip stepped twice (the shirt follows), the phone's whole-shirt toggle on and off, and the paste view
        // (the empty box, then a pasted list with its read result and the lines that are not players).
        if (await page.exists('[data-testid="chip-next"]')) {
          await page.click('[data-testid="chip-next"]');
          await sleep(300);
          await page.click('[data-testid="chip-next"]');
          await sleep(600);
          await audit(page, "players-chip", size, record);
        }
        if (mobile && (await page.exists('[data-testid="whole-shirt"]'))) {
          await page.click('[data-testid="whole-shirt"]');
          await sleep(1200);
          await audit(page, "players-whole-shirt", size, record);
          await page.click('[data-testid="whole-shirt"]');
          await sleep(900);
        }
        if (await page.exists('[data-testid="tl-paste"]')) {
          await page.click('[data-testid="tl-paste"]');
          await sleep(700);
          await audit(page, "players-paste-empty", size, record);
          await page.eval(`document.querySelector('[data-testid="paste-box"]')?.focus()`);
          await sleep(200);
          await page.send("Input.insertText", { text: "Squad for Saturday:\n1. Imran Khan 5 M\n#9 Hamza small\n7 Ali 10 M\nZain Malik, 11, 4XL\nمحمد علی ٧ XL\n\ud83d\udc4d" });
          await sleep(900);
          await audit(page, "players-paste-result", size, record);
          await page.eval(`document.querySelector('[data-testid="paste-box"]')?.blur()`);
          await sleep(200);
          await page.click('[data-testid="paste-cancel"]');
          await sleep(600);
        }
      }
      if (await page.exists('[data-testid="tl-style"]')) {
        await page.click('[data-testid="tl-style"]');
        await sleep(700);
        await audit(page, "players-style", size, record);
        await page.click('[data-testid="back-to-list"]');
        await sleep(500);
      }
    }
    // Items selected: 4.5 and R22 (the box at least 120 px on a phone, 160 on a desktop, unless the zoom limit).
    for (const role of ["player-number", "team-name"]) {
      const id = await selectItem(page, role);
      if (!id) continue;
      const result = await audit(page, `selected-${role}`, size, record);
      const long = await page.eval(`(() => { const o = document.querySelector('[data-testid="selection-overlay"]'); if (!o || !o.dataset.box) return null; const q = JSON.parse(o.dataset.box).item; return Math.max(...q.map((p, k) => Math.hypot(q[(k + 1) % 4].x - p.x, q[(k + 1) % 4].y - p.y))); })()`);
      const zoomMax = await page.eval(`document.querySelector('[data-testid="zoom-in"]')?.getAttribute('aria-disabled') === 'true'`);
      result.itemLongSide = long === null ? null : Math.round(long);
      const min = result.layout === "wide" ? 160 : 120;
      if (long !== null && long < min - 1 && !zoomMax) record.failures.push(`${size} selected-${role}: R22 the item is ${Math.round(long)} px on its longer side (${min})`);
      await page.key("Escape", "Escape", 27);
      await sleep(900);
    }
    // The Done panel.
    await page.click('[data-testid="done"]');
    await sleep(1200);
    await audit(page, "done", size, record);
  } catch (error) {
    record.error = String(error?.stack ?? error).slice(0, 800);
  } finally {
    await browser.close();
  }
  writeFileSync(join(OUT, `audit-${PRODUCT ?? "stand-in-jersey"}-${size}.json`), JSON.stringify(record, null, 2));
  return record;
}

let broken = 0;
let errors = 0;
for (const size of SIZES) {
  const record = await runSize(size);
  if (record.error) {
    errors++;
    console.log(`${size}: could not audit: ${record.error.split("\n")[0]}`);
  }
  for (const f of record.failures) console.log(f);
  broken += record.failures.length;
  console.log(`${size}: ${record.failures.length === 0 && !record.error ? "all rules hold" : `${record.failures.length} broken`} (${Object.keys(record.states).length} states)`);
}
process.exit(errors > 0 ? 2 : broken > 0 ? 1 : 0);
