/** E3e (QA 17, B4): a bare select that closes the start card is not a change to save. */
import { describe, expect, it } from "vitest";
import { shouldReportChange } from "./report";

describe("when the shell reports a change to its host", () => {
  it("a start card closed on a design nobody changed is not reported", () => {
    expect(shouldReportChange({ first: false, sameDesign: true, isInitial: true, startedDiffers: true })).toBe(false);
  });
  it("a real change is reported, whether or not the card was open", () => {
    expect(shouldReportChange({ first: false, sameDesign: false, isInitial: false, startedDiffers: false })).toBe(true);
    expect(shouldReportChange({ first: false, sameDesign: false, isInitial: false, startedDiffers: true })).toBe(true);
  });
  it("undoing back to the first design is a change (the design is not the one last reported)", () => {
    expect(shouldReportChange({ first: false, sameDesign: false, isInitial: true, startedDiffers: false })).toBe(true);
  });
  it("after a change, the card closing (same design, not the first one) is reported: the host stores that the design was started", () => {
    expect(shouldReportChange({ first: false, sameDesign: true, isInitial: false, startedDiffers: true })).toBe(true);
  });
  it("the first look reports only when the start card's state differs from what the host showed", () => {
    expect(shouldReportChange({ first: true, sameDesign: false, isInitial: true, startedDiffers: false })).toBe(false);
    expect(shouldReportChange({ first: true, sameDesign: false, isInitial: true, startedDiffers: true })).toBe(true);
  });
});
