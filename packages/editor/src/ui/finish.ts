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

export function markRow(row: HTMLElement): void {
  const more = String(rowHasMore(row));
  if (row.dataset.more !== more) row.dataset.more = more;
}

/** Applies both measurements to the editor's element. Cheap: a query and a few reads; writes only what changed. */
export function refreshFinish(root: HTMLElement): void {
  for (const row of root.querySelectorAll<HTMLElement>(".fmo-scroll-row")) markRow(row);
  const body = root.querySelector<HTMLElement>(".fmo-panel-body");
  if (!body) return;
  const g = `${gutterWidth(body)}px`;
  if (root.style.getPropertyValue("--fmo-gutter") !== g) root.style.setProperty("--fmo-gutter", g);
}
