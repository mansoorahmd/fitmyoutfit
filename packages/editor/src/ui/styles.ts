/**
 * The editor's own stylesheet (06-editor.md 12), shipped with the package as
 * a string: `<EditorShell>` puts it in the page (React hoists the style tag),
 * or a host takes `EDITOR_CSS` and serves it itself.
 *
 * Tokens: every colour and font reads the store's CSS variables (`--c-*`,
 * `--font-*`) first, with fallbacks so the standalone demo looks right. A host
 * sets them on any ancestor. Everything is scoped under `.fmo-editor`.
 * Reduced motion turns every transition off. Logical properties throughout,
 * so a right-to-left interface later is a translation, not a rebuild.
 */
export const EDITOR_CSS = /* css */ `
.fmo-editor {
  --fmo-surface: var(--c-surface, #ffffff);
  --fmo-surface-alt: var(--c-surface-alt, #f2f4f7);
  --fmo-ink: var(--c-ink, #0b1530);
  --fmo-ink-muted: var(--c-ink-muted, #4a5468);
  --fmo-inverse: var(--c-inverse, #0b1f45);
  --fmo-on-inverse: var(--c-on-inverse, #ffffff);
  --fmo-on-inverse-muted: var(--c-on-inverse-muted, #8f9cb8);
  --fmo-primary: var(--c-primary, #c8102e);
  --fmo-primary-hover: var(--c-primary-hover, #a30c25);
  --fmo-border: var(--c-border, #dde2ea);
  --fmo-border-strong: var(--c-border-strong, #7d879a);
  --fmo-success: var(--c-success, #17703a);
  --fmo-error: var(--c-error, #b42318);
  --fmo-error-surface: var(--c-error-surface, #fdecea);
  --fmo-success-surface: var(--c-success-surface, #e7f4ec);
  --fmo-focus: var(--c-focus, #2563eb);
  --fmo-stage-top: var(--c-stage-top, #f6f8fb);
  --fmo-stage-bottom: var(--c-stage-bottom, #e3e8ef);
  --fmo-stage-deep-top: var(--c-stage-deep-top, #c9d1de);
  --fmo-stage-deep-bottom: var(--c-stage-deep-bottom, #aeb8c8);
  --fmo-stage-shadow: var(--c-stage-shadow, rgb(11 21 48 / 0.18));
  --fmo-warning: var(--c-warning, #8a5a00);
  --fmo-warning-surface: var(--c-warning-surface, #fff7e6);
  --fmo-overlay-control: var(--c-overlay-control, rgb(255 255 255 / 0.92));
  --fmo-font-heading: var(--font-heading, "Barlow Condensed", "Arial Narrow", "Roboto Condensed", system-ui, sans-serif);
  --fmo-font-body: var(--font-body, Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif);
  --fmo-font-arabic: var(--font-arabic, "Noto Sans Arabic", system-ui, sans-serif);
  --fmo-radius-control: 4px;
  --fmo-radius-card: 8px;
  --fmo-radius-sheet: 16px;
  --fmo-ease: cubic-bezier(0.2, 0.8, 0.2, 1);
  --fmo-panel-shadow: 0 -4px 16px rgb(11 21 48 / 0.08);

  position: relative;
  display: grid;
  width: 100%;
  height: 100%;
  overflow: hidden;
  box-sizing: border-box;
  font: 400 15px/1.4 var(--fmo-font-body);
  color: var(--fmo-ink);
  background: var(--fmo-surface);
  -webkit-tap-highlight-color: transparent;
}
.fmo-editor *, .fmo-editor *::before, .fmo-editor *::after { box-sizing: border-box; }
.fmo-editor[data-layout="compact"] { grid-template: "top" 56px "work" 1fr "dock" auto / 1fr; }
.fmo-editor[data-layout="short"] { grid-template: "top top" 48px "work rail" 1fr / 1fr 64px; }
.fmo-editor[data-layout="wide"] { grid-template: "top top top" 64px "rail panel work" 1fr / 88px 360px 1fr; }
.fmo-editor[data-typing="true"][data-layout="compact"] .fmo-dock { display: none; }

.fmo-editor button { font: inherit; color: inherit; }
.fmo-editor :focus-visible { outline: 2px solid var(--fmo-focus); outline-offset: 2px; }
.fmo-topbar :focus-visible { outline: 2px solid #fff; box-shadow: 0 0 0 4px var(--fmo-focus); }
.fmo-sr-only { position: absolute !important; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.fmo-bdi, .fmo-editor input[dir="auto"], .fmo-editor [dir="rtl"] { unicode-bidi: plaintext; }
.fmo-editor input[dir="auto"]:lang(ar), .fmo-arabic { font-family: var(--fmo-font-arabic); }

/* Top bar (navy) */
.fmo-topbar { grid-area: top; display: flex; align-items: center; gap: 4px; padding-inline: 12px; background: var(--fmo-inverse); color: var(--fmo-on-inverse); min-width: 0; }
.fmo-editor[data-layout="wide"] .fmo-topbar { padding-inline: 16px; gap: 8px; }
.fmo-topbar-brand { display: flex; align-items: baseline; gap: 8px; min-width: 0; margin-inline-end: 8px; font: 700 20px/1 var(--fmo-font-heading); text-transform: uppercase; letter-spacing: 0.02em; white-space: nowrap; }
.fmo-topbar-brand small { font: 500 14px/1 var(--fmo-font-body); text-transform: none; color: var(--fmo-on-inverse-muted); letter-spacing: 0; }
.fmo-tb-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-width: 44px; height: 44px; padding: 0 10px; border: 0; border-radius: var(--fmo-radius-control); background: transparent; color: var(--fmo-on-inverse); cursor: pointer; }
.fmo-tb-btn:hover:not([aria-disabled="true"]) { background: rgb(255 255 255 / 0.1); }
.fmo-tb-btn[aria-disabled="true"] { color: var(--fmo-on-inverse-muted); cursor: default; }
.fmo-editor[data-layout="compact"] .fmo-tb-btn.fmo-icon-only, .fmo-editor[data-layout="short"] .fmo-tb-btn.fmo-icon-only { padding: 0; width: 44px; }
.fmo-save-state { flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: 6px; justify-content: center; font-size: 13px; color: var(--fmo-on-inverse-muted); white-space: nowrap; overflow: hidden; }
.fmo-editor[data-layout="wide"] .fmo-save-state { justify-content: flex-start; flex: 0 1 auto; margin-inline-start: 8px; }
.fmo-save-state > span { overflow: hidden; text-overflow: ellipsis; }
.fmo-save-state button { border: 0; background: none; color: inherit; display: inline-flex; align-items: center; gap: 6px; padding: 0 4px; height: 44px; cursor: pointer; }
.fmo-save-state[data-state="failed"] { color: #ffd38a; }
.fmo-topbar-spacer { flex: 1 1 auto; }
.fmo-topbar-slot { display: flex; align-items: center; gap: 8px; color: var(--fmo-on-inverse); }
.fmo-done { flex: none; min-width: 88px; height: 44px; padding: 0 18px; border: 0; border-radius: var(--fmo-radius-control); background: var(--fmo-primary); color: #fff; font: 700 18px/1 var(--fmo-font-heading); text-transform: uppercase; letter-spacing: 0.04em; cursor: pointer; }
.fmo-done:hover { background: var(--fmo-primary-hover); }
.fmo-editor[data-layout="wide"] .fmo-done { height: 48px; min-width: 120px; }

/* Tool tabs: dock (compact) and rail (short, wide) */
.fmo-tabs { display: flex; background: var(--fmo-surface); }
.fmo-dock { grid-area: dock; border-top: 1px solid var(--fmo-border); padding-bottom: env(safe-area-inset-bottom, 0px); justify-content: center; }
.fmo-rail { grid-area: rail; flex-direction: column; }
.fmo-editor[data-layout="wide"] .fmo-rail { border-inline-end: 1px solid var(--fmo-border); padding-top: 8px; }
.fmo-editor[data-layout="short"] .fmo-rail { border-inline-start: 1px solid var(--fmo-border); justify-content: center; }
.fmo-tab { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; height: 64px; padding: 6px 0 4px; border: 0; background: transparent; color: var(--fmo-ink-muted); font: 500 12px/16px var(--fmo-font-body); cursor: pointer; position: relative; }
.fmo-dock .fmo-tab { max-width: 96px; height: 63px; }
.fmo-tab-label { white-space: nowrap; }
.fmo-tab[aria-selected="true"] { color: var(--fmo-ink); font-weight: 650; }
.fmo-dock .fmo-tab[aria-selected="true"]::after { content: ""; position: absolute; inset-inline: 22%; top: 0; height: 3px; background: var(--fmo-ink); border-radius: 0 0 2px 2px; }
.fmo-rail .fmo-tab { flex: none; height: 72px; font-size: 14px; line-height: 20px; }
.fmo-editor[data-layout="short"] .fmo-rail .fmo-tab { height: 54px; }
.fmo-editor[data-layout="short"] .fmo-tab-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.fmo-rail .fmo-tab[aria-selected="true"] { background: var(--fmo-surface-alt); }
.fmo-rail .fmo-tab[aria-selected="true"]::before { content: ""; position: absolute; inset-block: 0; inset-inline-start: 0; width: 3px; background: var(--fmo-ink); }
.fmo-tab[aria-disabled="true"] { opacity: 0.45; cursor: default; }

/* Work area: the stage, and the panel over it (compact, short) */
.fmo-work { grid-area: work; position: relative; min-height: 0; min-width: 0; overflow: hidden; }

/* Stage */
.fmo-stage { position: absolute; inset: 0; overflow: hidden; background: linear-gradient(180deg, var(--fmo-stage-top), var(--fmo-stage-bottom)); }
.fmo-stage-deep { position: absolute; inset: 0; background: linear-gradient(180deg, var(--fmo-stage-deep-top), var(--fmo-stage-deep-bottom)); opacity: 0; transition: opacity 250ms ease-out; pointer-events: none; }
.fmo-stage[data-tone="deep"] .fmo-stage-deep { opacity: 1; }
.fmo-stage-shadow { position: absolute; left: 50%; width: 46%; max-width: 380px; height: 28px; transform: translateX(-50%); border-radius: 50%; background: radial-gradient(closest-side, var(--fmo-stage-shadow), transparent); pointer-events: none; transition: bottom 200ms var(--fmo-ease); }
.fmo-canvas { position: absolute; inset: 0; outline: none; }
.fmo-canvas:focus-visible { outline: 2px solid var(--fmo-focus); outline-offset: -4px; }
.fmo-canvas > div { background: transparent !important; }
.fmo-overlay { position: absolute; inset: 0; pointer-events: none; z-index: 1; touch-action: none; }
.fmo-overlay > svg { position: absolute; inset: 0; overflow: visible; touch-action: none; }
.fmo-box-halo, .fmo-stem-halo { fill: none; stroke: #fff; stroke-width: 3.5; stroke-linejoin: round; }
.fmo-box-line, .fmo-stem { fill: none; stroke: var(--fmo-ink); stroke-width: 1.5; stroke-linejoin: round; }
.fmo-handle { fill: #fff; stroke: var(--fmo-ink); stroke-width: 2; }
.fmo-hit { fill: transparent; stroke: none; pointer-events: all; touch-action: none; }
.fmo-hit[data-cursor="nwse"] { cursor: nwse-resize; }
.fmo-hit[data-cursor="nesw"] { cursor: nesw-resize; }
.fmo-hit-turn { cursor: grab; }
.fmo-guide-halo { fill: none; stroke: #fff; stroke-width: 3; stroke-linecap: round; }
.fmo-guide-line { fill: none; stroke: var(--fmo-focus); stroke-width: 1.5; stroke-dasharray: 5 4; stroke-linecap: round; }
.fmo-area .fmo-guide-line { stroke: var(--fmo-ink-muted); stroke-dasharray: 3 4; }
.fmo-area .fmo-guide-halo { stroke-width: 2.5; opacity: 0.8; }
.fmo-context-place { position: absolute; inset-inline: 8px; z-index: 3; display: flex; justify-content: center; pointer-events: none; }
.fmo-context { display: flex; align-items: center; gap: 2px; min-height: 48px; pointer-events: auto; }
.fmo-context-stage { max-width: 100%; padding: 2px 4px 2px 12px; border: 1px solid var(--fmo-border); border-radius: 24px; background: var(--fmo-surface); box-shadow: 0 2px 10px rgb(11 21 48 / 0.12); }
.fmo-context-panel { padding: 0 0 10px; margin-bottom: 4px; border-bottom: 1px solid var(--fmo-border); flex-wrap: wrap; }
.fmo-context-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 650; font-size: 14px; margin-inline-end: 4px; }
.fmo-context-panel .fmo-context-name { flex-basis: 100%; font-size: 15px; margin-bottom: 4px; }
.fmo-context-btn { display: inline-flex; flex-direction: column; align-items: center; justify-content: center; gap: 0; min-width: 44px; min-height: 44px; padding: 2px 6px; border: 0; border-radius: var(--fmo-radius-control); background: transparent; color: var(--fmo-ink); cursor: pointer; font-size: 11px; line-height: 13px; }
.fmo-context-panel .fmo-context-btn { flex-direction: row; gap: 6px; font-size: 14px; padding: 0 10px; border: 1px solid var(--fmo-border-strong); margin-inline-end: 6px; }
.fmo-context-btn:hover { background: var(--fmo-surface-alt); }
.fmo-context-more { position: relative; }
.fmo-menu { position: absolute; top: calc(100% + 4px); inset-inline-end: 0; z-index: 5; min-width: 200px; display: flex; flex-direction: column; padding: 4px; border: 1px solid var(--fmo-border); border-radius: var(--fmo-radius-card); background: var(--fmo-surface); box-shadow: 0 6px 20px rgb(11 21 48 / 0.18); }
.fmo-context-place[data-place="bottom"] .fmo-menu { top: auto; bottom: calc(100% + 4px); }
.fmo-menu button { display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 0 12px; border: 0; border-radius: var(--fmo-radius-control); background: transparent; color: var(--fmo-ink); cursor: pointer; font-size: 15px; text-align: start; }
.fmo-menu button:hover { background: var(--fmo-surface-alt); }
.fmo-menu button[aria-disabled="true"] { color: var(--fmo-ink-muted); cursor: default; }
.fmo-finetune { border: 1px solid var(--fmo-border); border-radius: var(--fmo-radius-card); padding: 0 12px; }
.fmo-disclosure { display: flex; align-items: center; gap: 8px; width: 100%; min-height: 44px; padding: 0; border: 0; background: none; color: var(--fmo-ink); cursor: pointer; font-weight: 650; font-size: 15px; }
.fmo-finetune > .fmo-stack { padding-bottom: 12px; }
.fmo-ft-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.fmo-ft-row > .fmo-label { min-width: 48px; margin: 0; }
.fmo-item-head:has(> .fmo-item-pick) { flex-wrap: wrap; row-gap: 0; }
.fmo-item-pick { flex: 1 1 100%; min-width: 0; display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 0; border: 0; background: none; color: inherit; cursor: pointer; text-align: start; font: inherit; }
.fmo-item[data-selected="true"] .fmo-item-name { text-decoration: underline; text-underline-offset: 3px; }
.fmo-badge { flex: none; display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: 12px; background: var(--fmo-warning-surface, #FFF7E6); color: var(--fmo-warning, #8A5A00); border: 1px solid currentColor; }
.fmo-stepper-row { display: flex; align-items: center; gap: 12px; }
.fmo-stepper-row > .fmo-label { margin: 0; min-width: 48px; }
.fmo-stepper { display: inline-flex; align-items: center; gap: 8px; }
.fmo-stepper-value { min-width: 72px; text-align: center; font-weight: 650; }
.fmo-overlay-badge { position: absolute; transform: translate(-50%, -50%); pointer-events: none; }
.fmo-segmented button:has(> .fmo-icon) { display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
.fmo-font-chip { font-size: 18px; max-width: 220px; overflow: hidden; }
.fmo-font-chip > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fmo-kit-place { position: absolute; top: 4px; z-index: 4; display: flex; flex-direction: column; align-items: flex-end; }
.fmo-kit-button { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 14px; border: 1px solid var(--fmo-border-strong); border-radius: 22px; background: var(--fmo-surface); color: var(--fmo-ink); cursor: pointer; font-size: 14px; font-weight: 600; position: relative; }
.fmo-kit-icon { width: 44px; padding: 0; justify-content: center; }
.fmo-kit-count { position: absolute; top: -4px; inset-inline-end: -4px; min-width: 20px; height: 20px; padding: 0 5px; border-radius: 10px; background: var(--fmo-ink); color: #fff; font-size: 12px; line-height: 20px; text-align: center; }
.fmo-kit-popover { margin-top: 8px; width: 320px; max-height: min(520px, calc(100vh - 160px)); overflow: auto; padding: 12px 16px; border: 1px solid var(--fmo-border); border-radius: var(--fmo-radius-card); background: var(--fmo-surface); box-shadow: 0 8px 28px rgb(11 21 48 / 0.18); }
.fmo-kit-rows { list-style: none; margin: 0; padding: 0; }
.fmo-kit-row { display: flex; align-items: center; gap: 4px; min-height: 56px; border-bottom: 1px solid var(--fmo-border); }
.fmo-kit-row[data-selected="true"] { background: var(--fmo-surface-alt); }
.fmo-kit-pick { flex: 1 1 auto; min-width: 0; display: flex; align-items: center; gap: 12px; min-height: 56px; padding: 0 4px; border: 0; background: none; color: var(--fmo-ink); cursor: pointer; text-align: start; font: inherit; }
.fmo-kit-words { display: flex; flex-direction: column; min-width: 0; flex: 1 1 auto; }
.fmo-kit-name { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fmo-kit-words .fmo-muted { font-size: 13px; display: inline-flex; align-items: center; gap: 4px; }
.fmo-kit-locked { cursor: default; }
.fmo-kit-group { margin: 16px 0 4px; font-size: 13px; font-weight: 650; color: var(--fmo-ink-muted); text-transform: none; }
.fmo-kit-menu { border: 0 !important; background: none !important; }
.fmo-done[data-open] { display: inline-flex; align-items: center; gap: 6px; background: transparent; border: 1px solid rgb(255 255 255 / 0.7); cursor: default; }
.fmo-done-panel { border: 0; padding: 0; margin: 0; color: var(--fmo-ink); background: var(--fmo-surface); font: 400 15px/1.4 var(--fmo-font-body); box-shadow: 0 -4px 24px rgb(11 21 48 / 0.18); max-width: 100vw; max-height: 100dvh; }
.fmo-done-panel::backdrop { background: rgb(11 21 48 / 0.25); }
.fmo-done-panel[data-layout="compact"] { position: fixed; inset: auto 0 0 0; width: 100%; height: min(60dvh, calc(100dvh - 56px - 160px)); min-height: 320px; border-radius: var(--fmo-radius-sheet) var(--fmo-radius-sheet) 0 0; }
.fmo-done-panel[data-layout="wide"], .fmo-done-panel[data-layout="short"] { position: fixed; inset: 64px 0 0 auto; width: 400px; height: auto; border-inline-start: 1px solid var(--fmo-border); }
.fmo-done-panel[data-layout="short"] { inset: 48px 0 0 auto; width: 340px; }
.fmo-done-inner { height: 100%; overflow: hidden; padding: 8px 20px 24px; box-sizing: border-box; display: flex; flex-direction: column; }
.fmo-done-inner > * { flex: none; }
/* E3c (S6): the main action is always in view; the list of things to check scrolls when the panel is short (landscape). */
.fmo-done-inner > .fmo-done-checks { flex: 0 1 auto; min-height: 64px; overflow: auto; overscroll-behavior: contain; }
.fmo-done-kit { margin: 0; font-weight: 600; }
.fmo-done-checks { padding: 12px; border-radius: var(--fmo-radius-card); background: var(--fmo-surface-alt); }
.fmo-done-checks-title { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 15px; font-weight: 650; }
.fmo-done-checks-title .fmo-icon { color: var(--fmo-warning); }
.fmo-done-list { list-style: none; margin: 8px 0 0; padding: 0; }
.fmo-done-list li { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 4px 0; border-top: 1px solid var(--fmo-border); }
.fmo-done-price { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.fmo-editor .fmo-primary { display: inline-flex; align-items: center; justify-content: center; width: 100%; min-height: 48px; padding: 0 20px; border: 0; border-radius: var(--fmo-radius-control); background: var(--fmo-primary); color: #fff; font: 700 18px/1 var(--fmo-font-heading); text-transform: uppercase; letter-spacing: 0.04em; cursor: pointer; }
.fmo-editor .fmo-primary:hover { background: var(--fmo-primary-hover); }
.fmo-turn-to { position: absolute; transform: translateX(-50%); pointer-events: auto; box-shadow: 0 2px 8px rgb(11 21 48 / 0.16); font-weight: 600; }
.fmo-stage-top { position: absolute; inset-inline: 0; top: var(--fmo-credit-room, 0px); display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 8px 12px 0; pointer-events: none; z-index: 2; }
.fmo-stage-top > * { pointer-events: auto; }
.fmo-status { max-width: min(92%, 520px); display: flex; align-items: center; gap: 8px; min-height: 36px; padding: 6px 6px 6px 14px; border-radius: 18px; background: var(--fmo-inverse); color: var(--fmo-on-inverse); font-size: 14px; box-shadow: 0 2px 10px rgb(11 21 48 / 0.18); }
.fmo-status:empty { display: none; }
.fmo-status button { height: 32px; padding: 0 12px; border: 1px solid rgb(255 255 255 / 0.7); border-radius: 16px; background: transparent; color: #fff; cursor: pointer; font-weight: 600; }
.fmo-status-quiet { padding-inline-end: 14px; }
.fmo-hint { padding: 4px 12px; border-radius: 16px; background: var(--fmo-overlay-control); border: 1px solid var(--fmo-border); font-size: 13px; line-height: 17px; max-width: calc(100% - 8px); box-sizing: border-box; text-align: center; overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.fmo-banner { align-self: stretch; display: flex; gap: 8px; align-items: flex-start; padding: 10px 12px; border-radius: var(--fmo-radius-card); background: var(--fmo-surface); border: 1px solid var(--fmo-border); font-size: 14px; }
.fmo-credit { position: absolute; top: 0; inset-inline-start: 8px; z-index: 3; height: 24px; display: flex; align-items: center; gap: 2px; margin: 0; font-size: 11px; line-height: 16px; color: var(--fmo-ink-muted); text-align: start; }
.fmo-credit-line { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* E3c: 44 px touch targets in a 24 px line (the band round the line is the stage's, never the garment's). */
.fmo-credit a { color: inherit; display: inline-flex; align-items: center; justify-content: center; min-width: 44px; min-height: 44px; margin-block: -10px; }
.fmo-credit-more { position: relative; flex: none; width: 44px; height: 44px; margin-block: -10px; margin-inline: -10px -10px; display: inline-flex; align-items: center; justify-content: center; padding: 0; border: 0; border-radius: 12px; background: transparent; color: var(--fmo-ink-muted); cursor: pointer; }
.fmo-credit-more[aria-expanded="true"] { color: var(--fmo-ink); background: var(--fmo-overlay-control); }
.fmo-credit-full { position: absolute; top: 26px; inset-inline-start: 0; width: max-content; max-width: min(340px, calc(100vw - 32px)); padding: 8px 10px; border: 1px solid var(--fmo-border); border-radius: var(--fmo-radius-card); background: var(--fmo-surface); color: var(--fmo-ink); font-size: 12px; line-height: 1.4; white-space: normal; box-shadow: 0 4px 14px rgb(11 21 48 / 0.14); }
.fmo-view { position: absolute; inset-inline: 0; display: flex; align-items: flex-end; justify-content: space-between; gap: 8px; padding: 0 12px; pointer-events: none; z-index: 2; transition: bottom 200ms var(--fmo-ease); }
.fmo-view > * { pointer-events: auto; }
.fmo-editor[data-layout="wide"] .fmo-view { justify-content: center; }
.fmo-editor[data-layout="wide"] .fmo-zoom { position: absolute; inset-inline-end: 16px; bottom: 0; }
.fmo-sides { display: inline-flex; border: 1px solid var(--fmo-border); border-radius: var(--fmo-radius-control); background: var(--fmo-overlay-control); overflow: hidden; }
.fmo-sides button { min-width: 60px; height: 44px; padding: 0 8px; border: 0; background: transparent; cursor: pointer; font-size: 14px; }
.fmo-sides button + button { border-inline-start: 1px solid var(--fmo-border); }
.fmo-sides button[aria-pressed="true"] { background: var(--fmo-ink); color: #fff; }
.fmo-zoom { display: flex; flex-direction: column; gap: 4px; }
.fmo-editor[data-layout="short"] .fmo-zoom { flex-direction: row; }
.fmo-round { width: 44px; height: 44px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--fmo-border); border-radius: var(--fmo-radius-control); background: var(--fmo-overlay-control); color: var(--fmo-ink); cursor: pointer; padding: 0; }
.fmo-round[aria-disabled="true"] { color: var(--fmo-border-strong); cursor: default; }
.fmo-loading { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 24px; text-align: center; z-index: 1; }
.fmo-silhouette { width: min(56%, 300px); max-height: 52%; color: var(--fmo-surface-alt); filter: drop-shadow(0 1px 0 var(--fmo-border)); }
.fmo-progress { width: min(60%, 260px); height: 4px; border-radius: 2px; background: var(--fmo-border); overflow: hidden; }
.fmo-progress > span { display: block; height: 100%; background: var(--fmo-ink); transition: width 150ms linear; }
.fmo-progress[data-unknown="true"] > span { width: 30% !important; animation: fmo-slide 1.2s ease-in-out infinite; }
@keyframes fmo-slide { from { transform: translateX(-100%); } to { transform: translateX(340%); } }
.fmo-loading p { margin: 0; font-size: 13px; color: var(--fmo-ink-muted); }
.fmo-flat-host { display: flex; flex-direction: column; gap: 8px; padding: 8px 12px 0; }
.fmo-flat-box { position: relative; flex: 1 1 auto; min-height: 0; }
.fmo-flat-box canvas { position: absolute; inset: 0; display: block; }

/* Panels */
.fmo-panel { display: flex; flex-direction: column; background: var(--fmo-surface); min-height: 0; }
.fmo-editor[data-layout="compact"] .fmo-panel { position: absolute; inset-inline: 0; bottom: 0; z-index: 3; border-radius: var(--fmo-radius-sheet) var(--fmo-radius-sheet) 0 0; border-top: 1px solid var(--fmo-border); box-shadow: var(--fmo-panel-shadow); transition: height 200ms var(--fmo-ease), transform 200ms var(--fmo-ease); }
.fmo-editor[data-layout="short"] .fmo-panel { position: absolute; inset-block: 0; inset-inline-end: 0; width: 320px; z-index: 3; border-inline-start: 1px solid var(--fmo-border); box-shadow: -4px 0 16px rgb(11 21 48 / 0.08); }
.fmo-editor[data-layout="wide"] .fmo-panel { grid-area: panel; border-inline-end: 1px solid var(--fmo-border); }
.fmo-grab { flex: none; height: 24px; display: flex; align-items: center; justify-content: center; cursor: grab; touch-action: none; }
.fmo-grab::before { content: ""; width: 36px; height: 4px; border-radius: 2px; background: var(--fmo-border-strong); }
.fmo-panel-head { flex: none; display: flex; align-items: center; gap: 4px; min-height: 48px; padding: 0 8px 0 16px; }
.fmo-editor[data-layout="compact"] .fmo-panel-head { min-height: 40px; }
.fmo-panel-title { flex: 1 1 auto; min-width: 0; margin: 0; font: 700 20px/26px var(--fmo-font-heading); text-transform: uppercase; letter-spacing: 0.02em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.fmo-editor[data-layout="wide"] .fmo-panel-title { font-size: 22px; line-height: 28px; }
.fmo-panel-body { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 0 16px 16px; }
.fmo-panel-body > * + * { margin-top: 12px; }
.fmo-editor[data-layout="compact"] .fmo-panel[data-typing="true"] .fmo-panel-inner > :not([data-keep-typing]) { display: none; }
.fmo-editor[data-layout="compact"] .fmo-panel[data-typing="true"] .fmo-fields > :not(:focus-within) { display: none; }
.fmo-editor[data-layout="compact"] .fmo-panel[data-typing="true"] .fmo-fields { grid-template-columns: 1fr; }
.fmo-editor[data-layout="compact"] .fmo-panel[data-typing="true"] .fmo-panel-head, .fmo-editor[data-layout="compact"] .fmo-panel[data-typing="true"] .fmo-grab { display: none; }
.fmo-editor[data-layout="compact"] .fmo-panel[data-typing="true"] .fmo-panel-body { padding-top: 12px; }
.fmo-panel-inner { max-width: 560px; margin-inline: auto; }
.fmo-help { margin: 0 16px 8px; padding: 10px 12px; border-radius: var(--fmo-radius-card); background: var(--fmo-surface-alt); font-size: 14px; }
.fmo-back-row { display: flex; align-items: center; min-height: 44px; margin: 0 -8px; }
.fmo-back-row button { height: 44px; padding: 0 8px; border: 0; background: none; cursor: pointer; font-weight: 600; }
.fmo-start { position: absolute; inset-inline: 0; bottom: 0; z-index: 4; display: flex; flex-direction: column; background: var(--fmo-surface); border-radius: var(--fmo-radius-sheet) var(--fmo-radius-sheet) 0 0; border-top: 1px solid var(--fmo-border); box-shadow: var(--fmo-panel-shadow); }
.fmo-editor[data-layout="short"] .fmo-start { inset-block: 0; inset-inline: auto 0; width: 320px; border-radius: 0; }
.fmo-editor[data-layout="wide"] .fmo-start { position: static; grid-area: panel; border-radius: 0; box-shadow: none; border-top: 0; border-inline-end: 1px solid var(--fmo-border); }
.fmo-start .fmo-panel-body { padding-top: 12px; }
.fmo-start-step { display: grid; grid-template-columns: 24px 1fr; gap: 4px 8px; align-items: start; }
.fmo-step-n { width: 24px; height: 24px; border-radius: 12px; background: var(--fmo-ink); color: #fff; font: 600 13px/24px var(--fmo-font-body); text-align: center; }
.fmo-start-step > div { min-width: 0; }

/* Controls */
.fmo-label { display: block; margin: 0 0 6px; font-size: 14px; font-weight: 600; }
.fmo-muted { color: var(--fmo-ink-muted); font-size: 13px; margin: 0; }
.fmo-line { margin: 0; font-size: 14px; }
.fmo-line strong { font-weight: 650; }
.fmo-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.fmo-scroll-row { display: flex; align-items: center; gap: 8px; overflow-x: auto; padding: 4px 2px 6px; margin-inline: -2px; scrollbar-width: thin; }
.fmo-scroll-row > * { flex: none; }
.fmo-divider { width: 1px; align-self: stretch; background: var(--fmo-border); margin: 4px 2px; }
.fmo-group-label { font-size: 12px; color: var(--fmo-ink-muted); white-space: nowrap; }
.fmo-field { display: block; width: 100%; height: 48px; padding: 0 12px; border: 1px solid var(--fmo-border-strong); border-radius: var(--fmo-radius-control); background: var(--fmo-surface); color: var(--fmo-ink); font: 400 16px/1.2 var(--fmo-font-body); }
.fmo-field[aria-invalid="true"] { border-color: var(--fmo-error); border-width: 2px; }
.fmo-field-error { margin: 6px 0 0; color: var(--fmo-error); font-size: 14px; display: flex; gap: 6px; align-items: flex-start; }
.fmo-fields { display: grid; grid-template-columns: 1fr 88px; gap: 8px; }
.fmo-code-field { position: relative; }
.fmo-code-field .fmo-field { padding-inline-start: 12px; text-transform: uppercase; font-variant-numeric: tabular-nums; letter-spacing: 0.04em; }
.fmo-btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; padding: 0 16px; border: 1px solid var(--fmo-ink); border-radius: var(--fmo-radius-control); background: var(--fmo-surface); color: var(--fmo-ink); cursor: pointer; font-weight: 600; text-align: center; white-space: nowrap; }
.fmo-btn:hover:not(:disabled) { background: var(--fmo-surface-alt); }
.fmo-btn-block { display: flex; width: 100%; min-height: 48px; }
.fmo-font-button { justify-content: space-between; text-align: start; flex-wrap: wrap; row-gap: 2px; padding-block: 8px; }
.fmo-font-button > span:first-child { white-space: nowrap; font-weight: 500; }
/* E3c: the font's name is never cut: it wraps under the label when the row is narrow. */
.fmo-font-button > span:last-child { min-width: 0; margin-inline-start: auto; text-align: end; white-space: normal; overflow-wrap: anywhere; }
.fmo-btn-text { border-color: transparent; background: transparent; text-decoration: underline; text-underline-offset: 3px; font-weight: 500; }
.fmo-btn-text:hover:not(:disabled) { background: transparent; color: var(--fmo-ink-muted); }
.fmo-btn:disabled { opacity: 0.5; cursor: default; }
.fmo-chip { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 14px; border: 1px solid var(--fmo-border-strong); border-radius: 22px; background: var(--fmo-surface); color: var(--fmo-ink); cursor: pointer; font-size: 14px; white-space: nowrap; }
.fmo-chip[aria-pressed="true"], .fmo-chip[aria-checked="true"] { border: 2px solid var(--fmo-ink); padding: 0 13px; font-weight: 650; background: var(--fmo-surface-alt); }
.fmo-chip-dot { width: 20px; height: 20px; border-radius: 10px; box-shadow: inset 0 0 0 1px rgb(11 21 48 / 0.35); flex: none; position: relative; }
.fmo-chip-mark { position: absolute; inset-inline-end: -4px; bottom: -4px; width: 12px; height: 12px; border-radius: 6px; background: var(--fmo-ink); color: #fff; display: flex; align-items: center; justify-content: center; }
.fmo-mini { width: 20px; height: 24px; flex: none; }
.fmo-segmented { display: inline-flex; border: 1px solid var(--fmo-border-strong); border-radius: var(--fmo-radius-control); overflow: hidden; }
.fmo-segmented button { min-width: 64px; min-height: 44px; padding: 0 12px; border: 0; background: var(--fmo-surface); cursor: pointer; font-size: 14px; }
.fmo-segmented button + button { border-inline-start: 1px solid var(--fmo-border-strong); }
.fmo-segmented button[aria-pressed="true"], .fmo-segmented button[aria-checked="true"] { background: var(--fmo-ink); color: #fff; font-weight: 600; }
.fmo-switch { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 44px; cursor: pointer; font-size: 15px; }
.fmo-switch input { appearance: none; -webkit-appearance: none; flex: none; width: 44px; height: 26px; margin: 0; border-radius: 13px; background: var(--fmo-border-strong); position: relative; cursor: pointer; transition: background 150ms ease-out; }
.fmo-switch input::after { content: ""; position: absolute; top: 3px; inset-inline-start: 3px; width: 20px; height: 20px; border-radius: 10px; background: #fff; transition: transform 150ms ease-out; }
.fmo-switch input:checked { background: var(--fmo-ink); }
.fmo-switch input:checked::after { transform: translateX(18px); }
.fmo-section { border-top: 1px solid var(--fmo-border); padding-top: 12px; }
.fmo-section > * + * { margin-top: 10px; }
.fmo-stack > * + * { margin-top: 10px; }
.fmo-alert { display: flex; gap: 8px; align-items: flex-start; padding: 10px 12px; border-radius: var(--fmo-radius-card); font-size: 14px; }
.fmo-alert[data-kind="warning"] { background: var(--fmo-warning-surface); color: var(--fmo-warning); border: 1px solid #f0d49b; }
.fmo-alert[data-kind="error"] { background: var(--fmo-error-surface); color: var(--fmo-error); border: 1px solid #f3b4ad; }
.fmo-alert[data-kind="info"] { background: var(--fmo-surface-alt); color: var(--fmo-ink); border: 1px solid var(--fmo-border); }
.fmo-alert > div { flex: 1 1 auto; min-width: 0; }
.fmo-alert p { margin: 0; color: var(--fmo-ink); }
.fmo-alert .fmo-btn { margin-top: 8px; min-height: 44px; }
.fmo-icon { flex: none; }
.fmo-flip { transform: scaleX(-1); }
[dir="rtl"] .fmo-flip { transform: none; }

/* Swatches */
.fmo-swatches { display: flex; flex-wrap: wrap; gap: 8px; }
.fmo-swatch { position: relative; width: 44px; height: 44px; flex: none; padding: 0; border: 0; border-radius: 8px; cursor: pointer; box-shadow: inset 0 0 0 1px var(--fmo-border-strong); transition: transform 100ms ease-out; }
.fmo-swatch:active { transform: scale(0.92); }
.fmo-swatch[aria-pressed="true"] { box-shadow: inset 0 0 0 1px rgb(11 21 48 / 0.3), 0 0 0 2px #fff, 0 0 0 4px var(--fmo-ink); }
.fmo-swatch .fmo-check { position: absolute; inset: 0; margin: auto; }
.fmo-swatch-empty { background: repeating-linear-gradient(45deg, var(--fmo-surface-alt) 0 6px, var(--fmo-surface) 6px 12px); box-shadow: inset 0 0 0 1px var(--fmo-border-strong); }
.fmo-family + .fmo-family { margin-top: 10px; }
.fmo-team-slots { display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap; }
.fmo-start .fmo-team-slot .fmo-swatch { width: 36px; height: 36px; }
.fmo-start .fmo-team-slot { flex-direction: row; gap: 6px; }
.fmo-start .fmo-stack > * + * { margin-top: 8px; }
.fmo-team-slot { display: flex; flex-direction: column; align-items: center; gap: 4px; font-size: 12px; color: var(--fmo-ink-muted); }
.fmo-team-slot[data-active="true"] { color: var(--fmo-ink); font-weight: 650; }
.fmo-match { display: grid; grid-template-columns: auto auto 1fr; gap: 6px 14px; align-items: center; padding: 12px; border: 1px solid var(--fmo-border); border-radius: var(--fmo-radius-card); }
.fmo-match-chip { width: 64px; height: 64px; border-radius: 8px; box-shadow: inset 0 0 0 1px rgb(11 21 48 / 0.25); }
.fmo-match-col { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
.fmo-match-col code { font: 500 13px/1 ui-monospace, Menlo, Consolas, monospace; }
.fmo-match-line { grid-column: 1 / -1; display: flex; gap: 6px; align-items: center; font-size: 14px; margin: 0; }
.fmo-match-line[data-level="different"] { color: var(--fmo-warning); font-weight: 600; }
.fmo-match .fmo-btn { grid-column: 1 / -1; }

/* Design cards */
.fmo-cards { display: flex; gap: 10px; overflow-x: auto; padding: 4px 2px 8px; margin-inline: -2px; }
.fmo-cards[data-grid="true"] { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); overflow: visible; }
@media (min-width: 700px) { .fmo-editor[data-layout="compact"] .fmo-cards[data-grid="true"] { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
.fmo-card { flex: none; width: 120px; display: flex; flex-direction: column; gap: 6px; padding: 0; border: 0; background: none; cursor: pointer; text-align: center; color: var(--fmo-ink); }
.fmo-cards[data-grid="true"] .fmo-card { width: auto; }
.fmo-editor[data-layout="compact"] .fmo-cards:not([data-grid="true"]) .fmo-card { width: 88px; }
.fmo-editor[data-layout="compact"] .fmo-cards:not([data-grid="true"]) { padding-bottom: 2px; gap: 8px; }
/* A panel open on a phone: the side buttons and Reset stay, zoom goes (06-editor.md 3.3's drawing); expanded: only Reset. */
.fmo-editor[data-layout="compact"][data-detent="normal"] .fmo-zoom > :not(:last-child) { display: none; }
/* An expanded panel leaves a short stage: only Reset stays over the garment (06-editor.md 3.3). */
.fmo-view[data-controls="reset-only"] { justify-content: flex-end; }
.fmo-view[data-controls="reset-only"] .fmo-sides, .fmo-view[data-controls="reset-only"] .fmo-zoom > :not(:last-child), .fmo-editor[data-layout="compact"][data-detent="expanded"] .fmo-hint { display: none; }
.fmo-card-pic { position: relative; display: block; width: 100%; aspect-ratio: 4 / 5; border-radius: var(--fmo-radius-card); background: var(--fmo-surface-alt); overflow: hidden; }
.fmo-card-pic canvas { width: 100%; height: 100%; display: block; }
.fmo-card[aria-pressed="true"] .fmo-card-pic { box-shadow: 0 0 0 2px var(--fmo-ink); }
.fmo-card-check { position: absolute; top: 6px; inset-inline-end: 6px; width: 24px; height: 24px; border-radius: 12px; background: var(--fmo-ink); color: #fff; display: flex; align-items: center; justify-content: center; }
.fmo-card-name { font-size: 13px; font-weight: 600; }

/* Logos */
.fmo-drop { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 96px; padding: 12px 16px; border: 2px dashed var(--fmo-border-strong); border-radius: var(--fmo-radius-card); background: var(--fmo-surface); cursor: pointer; text-align: start; }
.fmo-drop[data-over="true"] { border-style: solid; border-color: var(--fmo-ink); background: var(--fmo-surface-alt); }
.fmo-drop strong { display: block; font-size: 15px; }
.fmo-drop span { display: block; font-size: 13px; color: var(--fmo-ink-muted); }
.fmo-items { list-style: none; margin: 0; padding: 0; }
.fmo-item { padding: 10px 0; border-bottom: 1px solid var(--fmo-border); }
.fmo-item > * + * { margin-top: 8px; }
.fmo-item-head { display: flex; align-items: center; gap: 10px; }
.fmo-item-head img { width: 40px; height: 40px; object-fit: contain; border-radius: 4px; background: var(--fmo-surface-alt); }
.fmo-item-name { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.fmo-spinner { width: 24px; height: 24px; border-radius: 50%; border: 3px solid var(--fmo-border); border-top-color: var(--fmo-ink); animation: fmo-spin 0.8s linear infinite; }
@keyframes fmo-spin { to { transform: rotate(360deg); } }
.fmo-font-row { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; width: 100%; min-height: 56px; padding: 6px 8px; border: 0; border-bottom: 1px solid var(--fmo-border); background: none; cursor: pointer; text-align: start; }
.fmo-font-row[aria-checked="true"] { background: var(--fmo-surface-alt); }
.fmo-font-sample { font-size: 24px; line-height: 1.1; }

/* Dialog */
.fmo-dialog { border: 0; border-radius: 12px; padding: 0; max-width: min(420px, calc(100vw - 32px)); box-shadow: 0 12px 40px rgb(11 21 48 / 0.3); color: var(--fmo-ink); font: 400 15px/1.4 var(--fmo-font-body); }
.fmo-dialog::backdrop { background: rgb(11 21 48 / 0.45); }
.fmo-dialog-body { padding: 20px; }
.fmo-dialog-body h2 { margin: 0 0 8px; font: 700 22px/28px var(--fmo-font-heading); text-transform: uppercase; }
.fmo-dialog-body p { margin: 0 0 16px; }
.fmo-dialog-actions { display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap; }

@media (prefers-reduced-motion: reduce) {
  .fmo-editor *, .fmo-editor *::before, .fmo-editor *::after { transition: none !important; animation-duration: 0s !important; animation-iteration-count: 1 !important; }
}
.fmo-editor[data-reduced-motion="true"] *, .fmo-editor[data-reduced-motion="true"] *::before, .fmo-editor[data-reduced-motion="true"] *::after { transition: none !important; animation: none !important; }
`;
