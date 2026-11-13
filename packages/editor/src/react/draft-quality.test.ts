import { describe, expect, it } from "vitest";
import { DRAFT_FRAME_MS, DraftPolicy } from "./draft-quality";

describe("draft quality while dragging (06-editor.md 5.3, N11)", () => {
  it("stays at full quality while frames keep up", () => {
    const p = new DraftPolicy();
    p.start(0);
    for (let t = 16; t <= 400; t += 16) {
      p.frame(t);
      p.drawn(8);
    }
    expect(p.useDraft(true)).toBe(false);
    const timing = p.end(410)!;
    expect(timing.draft).toBe(false);
    expect(timing.frames).toBe(25);
    expect(timing.frameP50).toBe(16);
  });

  it("switches to half size after two slow frames in three, until the gesture ends", () => {
    const p = new DraftPolicy();
    p.start(0);
    p.frame(16);
    p.frame(60); // slow
    expect(p.useDraft(true)).toBe(false); // one slow frame is a hiccup
    p.frame(110); // slow again
    expect(p.useDraft(true)).toBe(true);
    p.frame(126); // fast now: it stays a draft until the end
    expect(p.useDraft(true)).toBe(true);
    const timing = p.end(130)!;
    expect(timing.draft).toBe(true);
    expect(timing.slow).toBe(true);
    expect(timing.frameMax).toBe(50);
    expect(p.useDraft(true)).toBe(false); // no gesture running
  });

  it("switches at once when one drawing alone is slower than a frame budget", () => {
    const p = new DraftPolicy();
    p.start(0);
    p.drawn(DRAFT_FRAME_MS + 5);
    expect(p.useDraft(true)).toBe(true);
  });

  it("can be forced either way, and ignores idle gaps", () => {
    const p = new DraftPolicy();
    expect(p.useDraft(true, "always")).toBe(true);
    expect(p.useDraft(false, "always")).toBe(false);
    p.start(0);
    p.frame(5000); // the page was idle: not a frame time
    p.drawn(100);
    expect(p.useDraft(true, "never")).toBe(false);
    const never = p.end(5001)!;
    expect(never.frames).toBe(0);
    expect(never.slow).toBe(true); // slow, but not drawn as a draft
    expect(never.draft).toBe(false);
    expect(p.end(5002)).toBeNull();
  });
});
