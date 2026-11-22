/* global document, getComputedStyle, innerWidth, innerHeight */
// The rules of docs/design/07-editor-review.md section 4, measured in the page (E3d). `pageAudit` runs inside
// the browser (it is sent as text, so it uses nothing from this module's scope) and returns what it measured and
// every rule it found broken. CSS px throughout; a tolerance of 1 px for sub-pixel layout.

export function pageAudit() {
  const TOL = 1;
  const round = (v) => Math.round(v * 10) / 10;
  const R = (el) => el.getBoundingClientRect();
  const vis = (el) => {
    const r = R(el);
    const cs = getComputedStyle(el);
    return r.width > 0.5 && r.height > 0.5 && cs.visibility !== "hidden" && cs.display !== "none" && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  };
  const name = (el) => (el.dataset?.testid || (typeof el.className === "string" && el.className.split(" ")[0]) || el.tagName.toLowerCase()) + (el.textContent ? ":" + el.textContent.trim().replace(/\s+/g, " ").slice(0, 24) : "");
  const editor = document.querySelector(".fmo-editor[data-layout]");
  const out = { vw: innerWidth, vh: innerHeight, layout: editor?.dataset.layout ?? null, failures: [] };
  const fail = (rule, what) => out.failures.push(`${rule}: ${what}`);
  if (!editor) {
    fail("page", "no editor");
    return out;
  }

  // ---- 4.1 Panel grid: full-width blocks start and end on the content's edges (16 px in, or the centred 560
  // column on a tablet); rows start there and may end short; the title starts there; the last header icon's
  // glyph ends there; centred text is the one exception.
  const ROWS = ".fmo-scroll-row, .fmo-swatches, .fmo-row, .fmo-segmented, .fmo-cards, .fmo-team-slots, .fmo-ft-row, .fmo-stepper-row, .fmo-fields";
  const CENTRED = ".fmo-start-skip, .fmo-btn-pad, [data-testid=\"done-keep-designing\"]";
  const BLOCKISH = ["block", "flex", "grid", "list-item", "table", "flow-root"];
  const panel = document.querySelector("dialog[open].fmo-done-panel") || document.querySelector(".fmo-start") || document.querySelector(".fmo-panel");
  if (panel && vis(panel)) {
    const done = panel.matches("dialog");
    const content = done ? panel.querySelector(".fmo-done-inner") : panel.querySelector(".fmo-panel-inner");
    const cr = R(content);
    const ccs = getComputedStyle(content);
    const left = done ? cr.left + parseFloat(ccs.paddingLeft) : cr.left;
    const right = done ? cr.right - parseFloat(ccs.paddingRight) : cr.right;
    const pr = R(panel);
    const grid = { panel: done ? "done" : panel.classList.contains("fmo-start") ? "start" : "panel", contentFromPanel: [round(left - pr.left), round(pr.right - right)], lefts: {}, rights: {} };
    const add = (map, value, el) => ((map[round(value)] ??= []).push(name(el)));
    const blocks = [];
    const walk = (parent, depth) => {
      for (const el of parent.children) {
        if (!vis(el)) continue;
        const cs = getComputedStyle(el);
        if (cs.position === "absolute" || cs.position === "fixed" || cs.position === "sticky") continue;
        if (el.matches(".fmo-panel-head")) continue;
        blocks.push(el);
        if (depth < 3 && !el.matches(ROWS) && el.matches(".fmo-stack, .fmo-section, [data-testid=\"selected-item-section\"], [data-testid=\"selected-warnings\"], div:not([class]), section:not([class])")) walk(el, depth + 1);
      }
    };
    walk(content, 0);
    for (const el of blocks) {
      if (el.matches(CENTRED) || el.closest(CENTRED)) continue;
      const row = el.matches(ROWS);
      const first = row ? [...el.children].find(vis) : null;
      add(grid.lefts, R(first ?? el).left - left, el);
      if (!row && BLOCKISH.includes(getComputedStyle(el).display)) add(grid.rights, right - R(el).right, el);
    }
    const title = panel.querySelector(".fmo-panel-title");
    if (title && vis(title)) add(grid.lefts, R(title).left - left, title);
    const icons = panel.querySelectorAll(".fmo-panel-head .fmo-icon-btn");
    const lastIcon = icons[icons.length - 1];
    const glyph = lastIcon?.querySelector("svg");
    if (glyph && vis(glyph)) grid.iconGlyphFromEdge = round(right - R(glyph).right);
    for (const k of Object.keys(grid.lefts)) if (Math.abs(Number(k)) > TOL) fail("4.1 grid", `a block starts ${k} px from the content edge (${grid.lefts[k].slice(0, 3).join(", ")})`);
    for (const k of Object.keys(grid.rights)) if (Math.abs(Number(k)) > TOL) fail("4.1 grid", `a full-width block ends ${k} px from the content edge (${grid.rights[k].slice(0, 3).join(", ")})`);
    if (grid.iconGlyphFromEdge !== undefined && Math.abs(grid.iconGlyphFromEdge) > TOL) fail("4.1 grid", `the header icon's glyph ends ${grid.iconGlyphFromEdge} px from the content edge`);
    if (!done && grid.contentFromPanel[0] < 16 - TOL) fail("4.1 grid", `content ${grid.contentFromPanel[0]} px from the panel's edge (16 at least)`);
    if (done && (Math.abs(grid.contentFromPanel[0] - 16) > TOL || Math.abs(grid.contentFromPanel[1] - 16) > TOL)) fail("4.1 grid", `Done panel content at ${grid.contentFromPanel.join(" / ")} (16 / 16)`);
    out.grid = grid;

    // ---- 4.2 Spacing scale: vertical gaps between stacked blocks are 4, 8, 12, 16 or 24.
    const SCALE = [4, 8, 12, 16, 24];
    const gaps = {};
    const containers = [content, ...content.querySelectorAll(".fmo-stack, .fmo-section, .fmo-item:not(.fmo-item-row), [data-testid=\"selected-warnings\"]")].filter(vis);
    for (const c of containers) {
      const kids = [...c.children].filter((el) => vis(el) && !["absolute", "fixed"].includes(getComputedStyle(el).position) && !el.matches("input[type=file], .fmo-panel-head"));
      for (let i = 1; i < kids.length; i++) {
        const a = R(kids[i - 1]);
        const b = R(kids[i]);
        if (b.top < a.bottom - 0.5) continue; // side by side
        const gap = Math.round(b.top - a.bottom);
        (gaps[gap] ??= []).push(`${name(kids[i - 1]).slice(0, 20)} > ${name(kids[i]).slice(0, 20)}`);
      }
    }
    out.gaps = Object.fromEntries(Object.entries(gaps).map(([k, v]) => [k, v.length]));
    for (const [k, v] of Object.entries(gaps)) if (!SCALE.includes(Number(k))) fail("4.2 spacing", `a gap of ${k} px (${v.slice(0, 2).join("; ")})`);
  }

  // ---- 4.3 Type tokens: every piece of text uses one of the editor's tokens (or a named exception).
  const TOKENS = new Set([
    "heading 700 20/26 UC", "heading 700 22/28 UC", "heading 700 18/18 UC",
    "body 700 15/20", "body 600 14/20", "body 400 15/21", "body 600 15/20", "body 500 14/20", "body 700 14/20", "body 400 14/20", "body 400 13/18", "body 400 11/16",
  ]);
  // Samples of the coach's own lettering, the field's 16 px (no zoom on iOS), small marks, the brand, and a
  // word made bold inside a line of body text ("Body front: Red").
  const EXCEPT = ".fmo-line strong, .fmo-font-sample, .fmo-font-chip, .fmo-font-chip *, .fmo-font-button > span:last-child, input.fmo-field, .fmo-step-n, .fmo-kit-count, .fmo-swatch-order, code, .fmo-topbar-brand, .fmo-topbar-brand *";
  const kind = (family) => (/Barlow Condensed|Arial Narrow|Roboto Condensed/i.test(family.split(",")[0]) ? "heading" : "body");
  const type = {};
  for (const el of document.querySelectorAll(".fmo-editor *, dialog *")) {
    if (!vis(el) || el.matches(EXCEPT)) continue;
    const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!own) continue;
    const cs = getComputedStyle(el);
    const lh = cs.lineHeight === "normal" ? "normal" : String(Math.round(parseFloat(cs.lineHeight)));
    const key = `${kind(cs.fontFamily)} ${cs.fontWeight} ${Math.round(parseFloat(cs.fontSize))}/${lh}${cs.textTransform === "uppercase" ? " UC" : ""}`;
    (type[key] ??= []).push(name(el).slice(0, 30));
  }
  out.type = Object.fromEntries(Object.entries(type).map(([k, v]) => [k, v.length]));
  for (const [k, v] of Object.entries(type)) if (!TOKENS.has(k)) fail("4.3 type", `"${k}" is not a token (${[...new Set(v)].slice(0, 3).join(", ")})`);

  // ---- 4.7 What sits on the stage: no two floating controls overlap; one message in the top row at a time.
  const stage = {
    credit: ".fmo-credit-line",
    hint: "[data-testid=\"stage-hint\"]",
    kit: "[data-testid=\"kit-button\"]",
    status: "[data-testid=\"status-line\"]:not(:empty)",
    bar: "[data-testid=\"context-bar-stage\"]",
    views: "[data-testid=\"view-controls\"] .fmo-sides",
    zoom: "[data-testid=\"view-controls\"] .fmo-zoom",
    turnTo: "[data-testid=\"turn-to-edit\"]",
    banner: "[data-testid=\"stage-banner\"]",
  };
  const rects = {};
  for (const [k, s] of Object.entries(stage)) {
    const el = document.querySelector(s);
    if (el && vis(el)) rects[k] = R(el);
  }
  for (const b of document.querySelectorAll("[data-testid^=\"item-badge-\"]")) if (vis(b)) rects[b.dataset.testid] = R(b);
  const keys = Object.keys(rects);
  out.overlaps = [];
  for (let i = 0; i < keys.length; i++)
    for (let j = i + 1; j < keys.length; j++) {
      const a = rects[keys[i]];
      const b = rects[keys[j]];
      const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (w > TOL && h > TOL) out.overlaps.push(`${keys[i]}/${keys[j]} ${Math.round(w)}x${Math.round(h)}`);
    }
  for (const o of out.overlaps) fail("4.7 stage", `overlap ${o}`);
  const topRow = ["hint", "status", "bar", "turnTo"].filter((k) => rects[k]);
  if (topRow.length > 1) fail("4.7 stage", `the top row shows ${topRow.join(" and ")} at once`);

  // ---- 4.5 The selection box: four straight lines; handles on its corners, off the item and off the stage's
  // controls (where the overlay is not clipped away).
  const overlay = document.querySelector("[data-testid=\"selection-overlay\"]");
  if (overlay && overlay.dataset.box && overlay.dataset.facing === "true") {
    const box = JSON.parse(overlay.dataset.box);
    const line = overlay.querySelector(".fmo-box-line");
    const points = line ? line.getAttribute("points").trim().split(/\s+/).length : 0;
    out.selection = { points, turnPlace: overlay.dataset.turnPlace };
    if (points !== 4) fail("4.5 selection", `the outline has ${points} points`);
    const inside = (p, q) => {
      let sign = 0;
      for (let i = 0; i < q.length; i++) {
        const a = q[i];
        const b = q[(i + 1) % q.length];
        const c = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
        if (Math.abs(c) < 1e-9) continue;
        if (sign === 0) sign = Math.sign(c);
        else if (Math.sign(c) !== sign) return false;
      }
      return true;
    };
    const squares = [...overlay.querySelectorAll("rect.fmo-handle")].map((r) => ({ x: Number(r.getAttribute("x")), y: Number(r.getAttribute("y")), w: Number(r.getAttribute("width")), h: Number(r.getAttribute("height")) }));
    squares.forEach((sq, k) => {
      const c = { x: sq.x + sq.w / 2, y: sq.y + sq.h / 2 };
      const corner = box.corners[k];
      if (!corner || Math.hypot(corner.x - c.x, corner.y - c.y) > 1) fail("4.5 selection", `handle ${k} is not on the box's corner`);
      const pts = [c, { x: sq.x, y: sq.y }, { x: sq.x + sq.w, y: sq.y }, { x: sq.x, y: sq.y + sq.h }, { x: sq.x + sq.w, y: sq.y + sq.h }];
      if (pts.some((p) => inside(p, box.item))) fail("4.5 selection", `handle ${k} lies on the item`);
    });
    const canvas = R(document.querySelector("[data-testid=\"stage-canvas\"]"));
    const clip = getComputedStyle(overlay).clipPath.match(/inset\(([-\d.]+)px ([-\d.]+)px ([-\d.]+)px ([-\d.]+)px/);
    const [ct, cr2, cb, cl] = clip ? clip.slice(1).map(Number) : [0, 0, 0, 0];
    const free = { left: canvas.left + cl, top: canvas.top + ct, right: canvas.right - cr2, bottom: canvas.bottom - cb };
    const marks = [...squares.map((sq) => ({ left: canvas.left + sq.x, top: canvas.top + sq.y, right: canvas.left + sq.x + sq.w, bottom: canvas.top + sq.y + sq.h })), { left: canvas.left + box.turn.x - 7, top: canvas.top + box.turn.y - 7, right: canvas.left + box.turn.x + 7, bottom: canvas.top + box.turn.y + 7 }];
    for (const m of marks) {
      const shown = { left: Math.max(m.left, free.left), top: Math.max(m.top, free.top), right: Math.min(m.right, free.right), bottom: Math.min(m.bottom, free.bottom) };
      if (shown.right <= shown.left || shown.bottom <= shown.top) continue;
      for (const [k, r] of Object.entries(rects)) {
        const w = Math.min(shown.right, r.right) - Math.max(shown.left, r.left);
        const h = Math.min(shown.bottom, r.bottom) - Math.max(shown.top, r.top);
        if (w > TOL && h > TOL) fail("4.5 selection", `a handle lies on ${k}`);
      }
    }
  }

  // ---- 4.8 Native controls: no sideways scrolling on wide and landscape layouts; a thin panel bar.
  out.scrollers = [];
  for (const el of document.querySelectorAll(".fmo-editor *, dialog *")) {
    if (!vis(el)) continue;
    const cs = getComputedStyle(el);
    if (/(auto|scroll)/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1) out.scrollers.push(name(el));
  }
  if (out.layout !== "compact") for (const s of out.scrollers) fail("4.8 native", `scrolls sideways: ${s}`);
  const body = document.querySelector(".fmo-panel-body");
  if (body && vis(body)) {
    const bar = body.offsetWidth - body.clientWidth;
    out.panelBar = bar;
    if (bar > 8 + TOL) fail("4.8 native", `the panel's scrollbar is ${bar} px wide`);
  }
  return out;
}

// ---- The team list (E4a, docs/design/08-team-list.md 14): what applies to its lines and controls. Runs in the page.
export function teamListAudit() {
  const TOL = 1;
  const R = (el) => el.getBoundingClientRect();
  const out = { failures: [], measured: {} };
  const fail = (rule, what) => out.failures.push(`${rule}: ${what}`);
  const root = document.querySelector('[data-testid="team-list"]');
  if (!root) return out;
  const shown = (el) => {
    const r = R(el);
    const cs = getComputedStyle(el);
    return r.width > 0.5 && r.height > 0.5 && cs.visibility !== "hidden" && cs.display !== "none";
  };
  const label = (el) => (el.dataset?.testid || el.getAttribute("aria-label") || el.className || el.tagName).toString().slice(0, 40);
  const rows = root.querySelector('[data-testid="tl-rows"]');
  const rowsBox = rows ? R(rows) : null;
  const inRows = (el) => !rowsBox || (R(el).bottom > rowsBox.top - TOL && R(el).top < rowsBox.bottom + TOL);

  // Touch targets: every control a finger meets is 44 px high at least, and 44 wide (the fields and size buttons too).
  const controls = [...root.querySelectorAll("input, button, [role='menuitem'], [role='menuitemcheckbox'], [role='option']")].filter((el) => shown(el) && inRows(el));
  const small = [];
  for (const el of controls) {
    const r = R(el);
    const isText = el.classList.contains("fmo-btn-text") || el.classList.contains("fmo-tl-count");
    if (r.height < 44 - TOL || (r.width < 44 - TOL && !isText)) small.push(`${label(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
  }
  out.measured.controls = controls.length;
  for (const s of [...new Set(small)].slice(0, 6)) fail("touch target", `${s} (44 x 44 at least)`);

  // Contrast: the words a line shows (messages, placeholders, the count line, tags) against what is behind them: 4.5.
  const channel = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const lum = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
  const parse = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).map(Number); return { rgb: p.slice(0, 3), a: p.length > 3 ? p[3] : 1 }; };
  const backdrop = (el) => { for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0.5) return c.rgb; } return [255, 255, 255]; };
  const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  const texts = [...root.querySelectorAll(".fmo-tl-msg, .fmo-tl-count, .fmo-tl-tag, .fmo-tl-detail, .fmo-tl-minimum, .fmo-tl-index, .fmo-tl-heading span")].filter((el) => shown(el) && el.textContent.trim() && inRows(el));
  let worst = 99;
  for (const el of texts) {
    const fg = parse(getComputedStyle(el).color);
    if (!fg) continue;
    const r = ratio(fg.rgb, backdrop(el));
    worst = Math.min(worst, r);
    if (r < 4.5) fail("contrast", `${label(el)} is ${r.toFixed(2)}:1 (4.5 at least)`);
  }
  for (const el of [...root.querySelectorAll("input")].filter((e) => shown(e) && e.placeholder && !e.value && inRows(e))) {
    const ph = parse(getComputedStyle(el, "::placeholder").color);
    if (!ph) continue;
    const r = ratio(ph.rgb, backdrop(el));
    worst = Math.min(worst, r);
    if (r < 4.5) fail("contrast", `the placeholder of ${label(el)} is ${r.toFixed(2)}:1 (4.5 at least)`);
  }
  out.measured.worstContrast = Math.round(worst * 100) / 100;

  // Nothing cut off: no sideways scrolling in the list, no message clipped, no field's words clipped, no two fields overlapping.
  if (rows && rows.scrollWidth > rows.clientWidth + TOL) fail("cut off", `the list scrolls sideways (${rows.scrollWidth} > ${rows.clientWidth})`);
  const canvas = document.createElement("canvas").getContext("2d");
  for (const el of root.querySelectorAll(".fmo-tl-msg span, .fmo-tl-minimum span")) {
    if (!el.classList.contains("fmo-sr-only") && shown(el) && el.scrollWidth > el.clientWidth + TOL) fail("cut off", `a message is clipped: ${el.textContent.trim().slice(0, 40)}`);
  }
  for (const el of [...root.querySelectorAll("input")].filter((e) => shown(e) && inRows(e))) {
    const cs = getComputedStyle(el);
    // The room for the words: the box without its borders and padding (an input's own clientWidth is not reliable for this).
    const inner = R(el).width - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    if (el.value) {
      if (el.scrollWidth > el.clientWidth + TOL && el.value.length < 10) fail("cut off", `the value of ${label(el)} is clipped`);
    } else if (el.placeholder) {
      const ph = getComputedStyle(el, "::placeholder");
      canvas.font = `${ph.fontWeight} ${ph.fontSize} ${ph.fontFamily}`;
      const w = canvas.measureText(el.placeholder).width;
      if (w > inner + TOL) fail("cut off", `the words in ${label(el)} are clipped ("${el.placeholder}" is ${Math.round(w)} px in ${Math.round(inner)})`);
    }
  }
  for (const li of root.querySelectorAll(".fmo-tl-fields")) {
    const boxes = [...li.children].filter(shown).map((c) => ({ c, r: R(c) }));
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i].r, b = boxes[j].r;
      if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > TOL && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > TOL) fail("cut off", `two parts of a line overlap (${label(boxes[i].c)}, ${label(boxes[j].c)})`);
    }
    if (rowsBox && inRows(li)) for (const { c, r } of boxes) if (r.right > rowsBox.right + TOL || r.left < rowsBox.left - TOL) fail("cut off", `${label(c)} is outside the list`);
  }
  out.failures = [...new Set(out.failures)];
  return out;
}
