/**
 * E3e (QA 17, B3): every way to step an item (the arrow keys, the fine-tune arrows) goes through the shell's
 * `nudge`, which shows the print area's lines when the area stops the step, as a drag does.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

describe("a step at the print area's limit gives feedback", () => {
  it("the arrow keys and the fine-tune arrows call nudge, not a bare commit of nudgeLayer", () => {
    const shell = read("EditorShell.tsx");
    const item = read("SelectedItem.tsx");
    expect(shell).toMatch(/step\.kind === "nudge"\) nudge\(selectedId, step\.dx, step\.dy\)/);
    expect(item).not.toMatch(/commit\(\(d\) => nudgeLayer\(d, id,/);
    for (const call of ["api.nudge(id, -NUDGE_MM, 0)", "api.nudge(id, NUDGE_MM, 0)", "api.nudge(id, 0, -NUDGE_MM)", "api.nudge(id, 0, NUDGE_MM)"]) expect(item).toContain(call);
  });
  it("a stopped step shows the print area's lines for a moment", () => {
    const shell = read("EditorShell.tsx");
    expect(shell).toMatch(/stoppedByArea\(layer, moved!, dx, dy\)/);
    expect(shell).toMatch(/printAreaLines\(product, layer\.pieceId\)\.map\(\(l\) => \(\{ \.\.\.l, kind: "area" as const \}\)\)/);
    expect(shell).toMatch(/setTimeout\(\(\) => setGuides\(\[\]\), 1200\)/);
  });
});
