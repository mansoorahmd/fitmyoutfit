/**
 * Draft quality while dragging (06-editor.md 5.3, N11): while the coach
 * moves, resizes or turns an item, the frames are timed; once they take
 * longer than DRAFT_FRAME_MS (below 30 frames a second), or one texture
 * drawing alone does, the texture is drawn at half size until the gesture
 * ends, then once at full size. The policy also keeps the gesture's timings
 * for the performance log (11.3). Plain logic, tested without a browser.
 */

/** Slower than this per frame (ms), the gesture switches to draft quality. */
export const DRAFT_FRAME_MS = 33;

export interface GestureTiming {
  /** Frames rendered during the gesture. */
  frames: number;
  /** Frame times (ms between rendered frames) during the gesture. */
  frameP50: number;
  frameP95: number;
  frameMax: number;
  /** Texture drawing times (ms, the 2D canvas only) during the gesture. */
  drawP50: number;
  drawMax: number;
  /** Whether the gesture drew at half size (frames were slow, and draft quality was allowed). */
  draft: boolean;
  /** Whether its frames were slow enough for draft quality (whether or not it was allowed). */
  slow: boolean;
  durationMs: number;
  /** From the gesture's end to the second frame after the full-size drawing (the upload and render included). */
  fullQualityMs?: number;
}

function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
}

export class DraftPolicy {
  private active = false;
  private on = false;
  private used = false;
  private last = 0;
  private startedAt = 0;
  private frames: number[] = [];
  private draws: number[] = [];

  start(now: number): void {
    this.active = true;
    this.on = false;
    this.used = false;
    this.frames = [];
    this.draws = [];
    this.last = now;
    this.startedAt = now;
  }

  /** A frame was rendered at `now` (called from the frame loop). */
  frame(now: number): void {
    if (!this.active) return;
    const dt = now - this.last;
    this.last = now;
    if (dt <= 0 || dt > 1000) return; // an idle gap, not a frame time
    this.frames.push(dt);
    // Two slow frames in the last three: switch (one slow frame can be a hiccup).
    const recent = this.frames.slice(-3);
    if (!this.on && recent.filter((t) => t > DRAFT_FRAME_MS).length >= 2) this.on = true;
  }

  /** A texture drawing took `ms` (the 2D canvas part). */
  drawn(ms: number): void {
    if (!this.active) return;
    this.draws.push(ms);
    if (!this.on && ms > DRAFT_FRAME_MS) this.on = true;
  }

  /** Whether the next drawing is a draft. */
  useDraft(gesture: boolean, mode: "auto" | "always" | "never" = "auto"): boolean {
    if (!gesture || mode === "never") return false;
    const draft = mode === "always" || (this.active && this.on);
    if (draft && this.active) this.used = true;
    return draft;
  }

  get drafting(): boolean {
    return this.active && this.on;
  }

  /** Ends the gesture; its timings, or null when none was running. */
  end(now: number): GestureTiming | null {
    if (!this.active) return null;
    this.active = false;
    return {
      frames: this.frames.length,
      frameP50: percentile(this.frames, 50),
      frameP95: percentile(this.frames, 95),
      frameMax: this.frames.length ? Math.max(...this.frames) : 0,
      drawP50: percentile(this.draws, 50),
      drawMax: this.draws.length ? Math.max(...this.draws) : 0,
      draft: this.used,
      slow: this.on,
      durationMs: now - this.startedAt,
    };
  }
}
