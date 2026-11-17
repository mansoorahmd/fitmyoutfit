/**
 * Speed guard (E3e). While an item is dragged, resized or turned the camera must not move: the first E3d zoom
 * made the camera's aim follow the dragged item every frame, and the desktop drag went from 8.4 ms to 25 ms a frame
 * (QA 17). The selected item's centre is given to the camera rig only when no gesture runs and no pointer is down.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("the camera does not chase a dragged item", () => {
  const source = readFileSync(new URL("./DesignCanvas.tsx", import.meta.url), "utf8");
  it("every rig.setItem(centre) in the canvas sits behind the gesture and pointer guard", () => {
    const calls = source.split("\n").filter((line) => /rig\.setItem\((?!null)/.test(line));
    expect(calls.length).toBeGreaterThan(0);
    for (const line of calls) {
      expect(line).toMatch(/gestureNow\.current/);
      expect(line).toMatch(/pointersDown\.current\.size === 0/);
    }
  });
});
