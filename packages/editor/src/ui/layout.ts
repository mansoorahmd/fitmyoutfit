/**
 * The editor's three layouts (06-editor.md 3.1) and their sizes, as plain
 * functions: chosen from the visible area (`visualViewport`), not the device.
 *
 * | Layout  | When                                   | Tools                        | Options                   |
 * | compact | width < 1024 and height >= 500         | dock: six tabs at the bottom | bottom panel above the dock |
 * | short   | height < 500 and width > height        | rail on the right edge       | 320 px side panel           |
 * | wide    | width >= 1024 and height >= 500        | rail on the left edge        | 360 px panel, always open   |
 */
import type { ViewInsets } from "../react/camera.js";

export type EditorLayout = "compact" | "short" | "wide";

export const WIDE_MIN_WIDTH = 1024;
export const SHORT_MAX_HEIGHT = 500;

export function chooseLayout(width: number, height: number): EditorLayout {
  if (height < SHORT_MAX_HEIGHT && width > height) return "short";
  if (width >= WIDE_MIN_WIDTH && height >= SHORT_MAX_HEIGHT) return "wide";
  return "compact";
}

/** Sizes in CSS pixels (06-editor.md 3.3 to 3.5). */
export const LAYOUT_SIZES = Object.freeze({
  compact: { topBar: 56, dock: 64, panelHeader: 48 },
  short: { topBar: 48, rail: 64, panel: 320 },
  wide: { topBar: 64, rail: 88, panel: 360 },
});

/** The most a tool panel takes at its normal height on compact, header included. */
export const PANEL_NORMAL_MAX = 232;
/** The least the stage keeps when a panel is expanded. */
export const STAGE_MIN_EXPANDED = 160;
/** An expanded panel takes at most this share of the visible height. */
export const PANEL_EXPANDED_SHARE = 0.6;
/** The start card is the one panel taller than normal (06-editor.md 7.2): it keeps the stage at least this tall. */
export const START_CARD_STAGE_MIN = 160;

export type PanelDetent = "closed" | "normal" | "expanded";

/** The heights a compact panel may take at this visible height (header included). */
export function panelHeights(viewportHeight: number): { normal: number; expanded: number } {
  const { topBar, dock } = LAYOUT_SIZES.compact;
  const stageAndPanel = viewportHeight - topBar - dock;
  const expanded = Math.max(PANEL_NORMAL_MAX, Math.min(Math.round(viewportHeight * PANEL_EXPANDED_SHARE), stageAndPanel - STAGE_MIN_EXPANDED));
  return { normal: Math.min(PANEL_NORMAL_MAX, Math.max(0, stageAndPanel - STAGE_MIN_EXPANDED)), expanded };
}

/**
 * How much of the stage (the canvas) a panel covers, for the camera's
 * framing. On compact the panel lies over the bottom of the stage; on short
 * over its right side; on wide it sits beside the stage, so it covers nothing.
 */
export function stageInsets(layout: EditorLayout, panel: { open: boolean; height: number; width?: number }): ViewInsets {
  if (!panel.open) return { top: 0, right: 0, bottom: 0, left: 0 };
  if (layout === "compact") return { top: 0, right: 0, bottom: Math.max(0, panel.height), left: 0 };
  if (layout === "short") return { top: 0, right: Math.max(0, panel.width ?? LAYOUT_SIZES.short.panel), bottom: 0, left: 0 };
  return { top: 0, right: 0, bottom: 0, left: 0 };
}

/**
 * How the top bar says the save state (06-editor.md 3.6; E3b: nothing in the
 * top bar may be cut at 360 px). "full": the sentence ("Saved on this
 * device"); "short": one word ("Saved"); "none": the icon only. The sentence
 * stays the accessible name in every form. On a phone in portrait the bar has
 * about 100 px between Redo and Done at 360 px: the short form fits (its
 * longest, "Not saved" with the icon, is about 90 px), the sentence does not.
 */
export type SaveStateWords = "full" | "short" | "none";

export function saveStateWords(layout: EditorLayout, width: number): SaveStateWords {
  if (layout !== "compact") return "full";
  if (width >= 520) return "full";
  return width >= 340 ? "short" : "none";
}

/** The stage's height left above a compact panel of `panelHeight`. */
export function stageHeight(viewportHeight: number, panelHeight: number, layout: EditorLayout): number {
  if (layout === "compact") return viewportHeight - LAYOUT_SIZES.compact.topBar - LAYOUT_SIZES.compact.dock - panelHeight;
  if (layout === "short") return viewportHeight - LAYOUT_SIZES.short.topBar;
  return viewportHeight - LAYOUT_SIZES.wide.topBar;
}
