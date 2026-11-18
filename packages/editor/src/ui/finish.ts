/**
 * Small page measurements the stylesheet cannot make by itself (E3d, 07-editor-review R3, R4):
 *
 * - the panel body's scrollbar gutter, measured, so the body's end padding gives it back and the content
 *   ends 16 px from the panel's edge whether or not the panel scrolls (`--fmo-gutter` on the editor);
 * - which sideways rows (phone) have more to show at their end, so their end fades (`data-more`).
 *
 * The decisions are plain functions; `refreshFinish` applies them to the page.
 */

/** Whether a sideways row has more beyond its end (a fade then says so). Works for right-to-left rows (negative scrollLeft). */
export function rowHasMore(row: { scrollLeft: number; scrollWidth: number; clientWidth: number }): boolean {
  const overflow = row.scrollWidth - row.clientWidth;
  if (overflow <= 1) return false;
  return Math.abs(row.scrollLeft) < overflow - 1;
}

/** The width a vertical scrollbar (or its reserved gutter) takes from an element, in CSS px: never below 0 or above the panel padding. */
export function gutterWidth(el: { offsetWidth: number; clientWidth: number }, borders = 0, max = 16): number {
  return Math.max(0, Math.min(max, el.offsetWidth - el.clientWidth - borders));
}

/** Whether a panel body has more below what shows (R39: its bottom edge fades then). */
export function bodyHasMoreBelow(body: { scrollTop: number; scrollHeight: number; clientHeight: number }): boolean {
  return body.scrollHeight - body.clientHeight - Math.abs(body.scrollTop) > 1;
}

export function markBody(body: HTMLElement): void {
  const more = String(bodyHasMoreBelow(body));
  if (body.dataset.moreBelow !== more) body.dataset.moreBelow = more;
}

export function markRow(row: HTMLElement): void {
  const more = String(rowHasMore(row));
  if (row.dataset.more !== more) row.dataset.more = more;
}

/** Applies both measurements to the editor's element. Cheap: a query and a few reads; writes only what changed. */
export function refreshFinish(root: HTMLElement): void {
  for (const row of root.querySelectorAll<HTMLElement>(".fmo-scroll-row")) markRow(row);
  const body = root.querySelector<HTMLElement>(".fmo-panel-body");
  if (!body) return;
  markBody(body);
  const g = `${gutterWidth(body)}px`;
  if (root.style.getPropertyValue("--fmo-gutter") !== g) root.style.setProperty("--fmo-gutter", g);
}

/** A box in the panel body's content coordinates (scrolled to the top). */
export interface RowBox {
  top: number;
  bottom: number;
}

/** The most a panel grows to show a whole row, and the most it gives up (a share of its height) to end above one. */
export const SNAP_GROW_MAX = 72;
export const SNAP_SHRINK_SHARE = 0.4;
/** Rows are boxes this tall (px): taller ones are lists, shorter ones are not worth a stop. */
const ROW_MIN = 20;
const ROW_MAX = 140;
/** Air kept under the last whole row. */
const ROW_AIR = 12;

/**
 * E3e (R39, finished): how many px a phone panel's resting height changes so that it ends on a whole row. `cut` is
 * where its body ends now (the content's y at the panel's foot); `rows` are the boxes of the content's parts. The row
 * across the cut (the largest that is at most 140 px tall) is shown whole when that costs at most `SNAP_GROW_MAX`;
 * otherwise the panel ends above it when that gives up no more than 40% of the body; otherwise 0 (the fade says
 * "more below"). Nothing across the cut: 0.
 */
export function snapDelta(cut: number, rows: readonly RowBox[], options: { growMax?: number; shrinkShare?: number } = {}): number {
  const growMax = options.growMax ?? SNAP_GROW_MAX;
  const share = options.shrinkShare ?? SNAP_SHRINK_SHARE;
  let across: RowBox | null = null;
  for (const r of rows) {
    const h = r.bottom - r.top;
    if (h < ROW_MIN || h > ROW_MAX) continue;
    if (!(r.top < cut - 1 && r.bottom > cut + 1)) continue;
    if (!across || h > across.bottom - across.top) across = r;
  }
  if (!across) return 0;
  const grow = Math.ceil(across.bottom - cut) + ROW_AIR;
  if (grow <= growMax) return grow;
  const shrink = Math.floor(cut - across.top) + ROW_AIR;
  return shrink <= cut * share ? -shrink : 0;
}

/** The boxes of every part of a panel body, in its content's coordinates. */
export function rowBoxes(body: HTMLElement): RowBox[] {
  const origin = body.getBoundingClientRect().top - body.scrollTop;
  const out: RowBox[] = [];
  for (const el of body.querySelectorAll<HTMLElement>("*")) {
    const r = el.getBoundingClientRect();
    if (r.height >= ROW_MIN && r.height <= ROW_MAX) out.push({ top: r.top - origin, bottom: r.bottom - origin });
  }
  return out;
}
