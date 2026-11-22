// The roster proof's own stylesheet: the screen look (phone first) and the print look (one A4 page for up to 25
// lines; more lines continue on further pages with the table's head repeated). It lives with the proof's markup
// (modules/team-order/components/roster-proof.tsx) and not in Tailwind, so the server module that makes the PDF
// later (decision 005, one HTML template) can put the same text in a <style> and get the same page.
//
// Colours read the store's tokens (`--fmo-*`) and fall back to the same values, so the sheet works where the
// tokens are not defined. Names use the bundled faces only: the real Inter and Noto Sans Arabic that next/font
// self-hosts, as the store's own `--font-body-face` and `--font-arabic-face` (set on <html>), with the system
// sans last so nothing is blank. The PDF supplies the same two variables from the same font files.

export const PROOF_NAME_FONTS = 'var(--font-body-face, "Inter"), var(--font-arabic-face, "Noto Sans Arabic"), sans-serif'

export const PROOF_CSS = `
.fmo-proof { --p-ink: var(--fmo-ink, #0B1530); --p-muted: var(--fmo-ink-muted, #4A5568); --p-line: var(--fmo-border, #C9D1DE); --p-line-strong: var(--fmo-border-strong, #6B7689); --p-alt: var(--fmo-surface-alt, #F3F5F9);
  color: var(--p-ink); background: #fff; font-family: ${PROOF_NAME_FONTS}; font-size: 16px; line-height: 1.45; }
.fmo-proof * { box-sizing: border-box; }
.fmo-proof-head { display: flex; flex-direction: column; gap: 2px; padding-bottom: 12px; border-bottom: 2px solid var(--p-ink); }
.fmo-proof-kicker { margin: 0; font-size: 13px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: var(--p-muted); }
.fmo-proof-team { margin: 0; font-size: 28px; line-height: 1.15; font-weight: 800; overflow-wrap: anywhere; }
.fmo-proof-meta { margin: 0; font-size: 15px; color: var(--p-muted); }
.fmo-proof-meta b { color: var(--p-ink); font-weight: 600; }
.fmo-proof-pictures { margin: 16px 0 0; }
.fmo-proof-pictures-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 0; padding: 0; list-style: none; }
.fmo-proof-pictures-row figure { margin: 0; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 8px; background: var(--p-alt); border-radius: 8px; }
.fmo-proof-pictures-row img, .fmo-proof-pictures-row canvas { display: block; width: 100%; max-width: 240px; height: auto; aspect-ratio: 4 / 5; object-fit: contain; }
.fmo-proof-pictures figcaption { font-size: 13px; font-weight: 600; color: var(--p-muted); }
.fmo-proof-picture-note { margin: 8px 0 0; font-size: 13px; color: var(--p-muted); }
.fmo-proof-section { margin: 20px 0 0; }
.fmo-proof-h { margin: 0 0 8px; font-size: 16px; font-weight: 700; }
.fmo-proof-table { width: 100%; border-collapse: collapse; font-size: 15px; font-variant-numeric: tabular-nums; table-layout: fixed; }
.fmo-proof-table caption { text-align: start; padding: 0 0 6px; font-size: 13px; color: var(--p-muted); }
.fmo-proof-table th { text-align: start; font-size: 12px; font-weight: 700; color: var(--p-muted); padding: 6px 4px; border-bottom: 2px solid var(--p-line-strong); vertical-align: bottom; }
.fmo-proof-table td { padding: 8px 4px; border-bottom: 1px solid var(--p-line); vertical-align: top; }
.fmo-proof-table .c-pos { width: 30px; color: var(--p-muted); }
.fmo-proof-table .c-num { width: 52px; }
.fmo-proof-table .c-size { width: 104px; }
.fmo-proof-table .c-count { width: 44px; text-align: end; }
.fmo-proof-table td.c-count { font-weight: 600; }
.fmo-proof-table .name { font-weight: 700; overflow-wrap: anywhere; }
.fmo-proof-table .words { font-weight: 400; font-style: italic; color: var(--p-muted); }
.fmo-proof-table .size { font-weight: 700; }
.fmo-proof-table .meas { display: block; font-size: 12px; color: var(--p-muted); font-weight: 400; }
.fmo-proof-table tr.spare td { background: var(--p-alt); }
.fmo-proof-note { margin: 8px 0 0; font-size: 13px; color: var(--p-muted); }
.fmo-proof-totals { display: flex; flex-direction: column; gap: 8px; }
.fmo-proof-total-line { margin: 0; font-size: 16px; font-weight: 700; }
.fmo-proof-sizes { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; }
.fmo-proof-sizes li { display: inline-flex; gap: 6px; align-items: baseline; padding: 2px 8px; border: 1px solid var(--p-line-strong); border-radius: 4px; font-size: 14px; font-variant-numeric: tabular-nums; }
.fmo-proof-sizes li b { font-weight: 700; }
.fmo-proof-foot { margin: 20px 0 0; padding-top: 10px; border-top: 1px solid var(--p-line-strong); font-size: 14px; display: flex; flex-direction: column; gap: 2px; }
.fmo-proof-foot p { margin: 0; }
.fmo-proof-code { color: var(--p-muted); font-size: 12px; }
.fmo-proof .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
.fmo-proof .fmo-print-only-row { display: none; }

@media (min-width: 640px) {
  .fmo-proof-team { font-size: 34px; }
  .fmo-proof-table .c-size { width: 150px; }
  .fmo-proof-table .meas { display: inline; margin-inline-start: 8px; }
}

@media print {
  @page { size: A4; margin: 10mm 12mm; }
  html, body { background: #fff !important; }
  .fmo-no-print { display: none !important; }
  .fmo-proof { font-size: 9.5pt; line-height: 1.25; color: #000; }
  .fmo-proof-head { padding-bottom: 3mm; }
  .fmo-proof-kicker { font-size: 8pt; }
  .fmo-proof-team { font-size: 18pt; }
  .fmo-proof-meta { font-size: 9pt; }
  .fmo-proof-pictures { margin-top: 3mm; break-inside: avoid; }
  .fmo-proof-pictures-row { display: flex; justify-content: center; gap: 8mm; }
  .fmo-proof-pictures-row figure { padding: 1mm; background: none; border: 0.3mm solid #999; flex: 0 0 auto; }
  .fmo-proof-pictures-row img, .fmo-proof-pictures-row canvas { width: auto; height: 42mm; max-width: none; aspect-ratio: 4 / 5; }
  .fmo-proof-pictures figcaption { font-size: 7.5pt; }
  .fmo-proof-picture-note { font-size: 7.5pt; margin-top: 1mm; }
  .fmo-proof-section { margin-top: 3mm; }
  .fmo-proof-h { font-size: 9pt; margin-bottom: 1mm; }
  .fmo-proof-table { font-size: 9pt; }
  .fmo-proof-table caption { font-size: 7.5pt; padding-bottom: 1mm; }
  .fmo-proof-table th { font-size: 7.5pt; padding: 0.8mm 1mm; }
  .fmo-proof-table td { padding: 0.55mm 1mm; border-bottom: 0.2mm solid #bbb; }
  .fmo-proof-table thead { display: table-header-group; }
  .fmo-proof .fmo-print-only-row { display: table-row; }
  .fmo-proof-repeat { font-size: 7.5pt; font-weight: 700; color: #000; }
  .fmo-proof-table .fmo-print-only-row th { border-bottom: 0; padding-top: 0; }
  .fmo-proof-table tr { break-inside: avoid; }
  .fmo-proof-table .c-pos { width: 8mm; }
  .fmo-proof-table .c-num { width: 14mm; }
  .fmo-proof-table .c-size { width: 46mm; }
  .fmo-proof-table .c-count { width: 14mm; }
  .fmo-proof-table .meas { display: inline; margin-inline-start: 2mm; font-size: 7.5pt; }
  .fmo-proof-table tr.spare td { background: none; }
  .fmo-proof-note, .fmo-proof-code { font-size: 7.5pt; }
  .fmo-proof-totals { gap: 1mm; break-inside: avoid; }
  .fmo-proof-total-line { font-size: 9pt; }
  .fmo-proof-sizes li { font-size: 8pt; padding: 0 1.5mm; border-width: 0.2mm; }
  .fmo-proof-foot { margin-top: 3mm; padding-top: 2mm; font-size: 9pt; break-inside: avoid; }
}
`
