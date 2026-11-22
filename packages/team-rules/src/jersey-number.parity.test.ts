/**
 * Parity with the editor copy of the jersey number rule (packages/editor/src/design).
 * Decision 012 makes this package the one home of the rule; until the editor imports it, the two
 * must agree. When the editor drops its copy, delete this test.
 */
import { describe, expect, it } from "vitest";
import { checkJerseyNumber } from "./jersey-number.js";
import { checkJerseyNumber as editorCheck } from "../../editor/src/design/jersey-number.js";

const INPUTS = ["0", "00", "7", "07", "99", "100", "007", "", " 7", "7a", "-1", "٧", "۷", "1٢", "٩٩", "۱۰", "７", "1.5"];

describe("the editor jersey number rule and this one", () => {
  it.each(INPUTS)("agree on %j", (input) => {
    const ours = checkJerseyNumber(input);
    const theirs = editorCheck(input);
    expect(ours.ok).toBe(theirs.ok);
    if (ours.ok && theirs.ok) expect(ours).toEqual(theirs);
    if (!ours.ok && !theirs.ok) expect(ours.error).toBe(theirs.error);
  });
});
