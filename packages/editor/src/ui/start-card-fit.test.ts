/**
 * E3g: the start card fits a 1420 x 612 window (measured in a browser, see the README): the smaller swatches
 * apply to the desktop ("wide") layout only, so the phone's layout stays as it was.
 */
import { describe, expect, it } from "vitest";
import { EDITOR_CSS } from "./styles";

const rules = [...EDITOR_CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1]!.trim(), m[2]!.trim()] as const);

describe("the start card on a desktop", () => {
  it("has smaller swatches, on the wide layout only", () => {
    const small = rules.filter(([selector, body]) => /\.fmo-start \.fmo-swatch$/.test(selector) && /width: 30px/.test(body));
    expect(small).toHaveLength(1);
    expect(small[0]![0]).toContain('[data-layout="wide"]');
    // No rule shrinks the start card's swatches for any other layout.
    const others = rules.filter(([selector, body]) => /fmo-start[^,]*fmo-swatch\b/.test(selector) && /width/.test(body) && !selector.includes('data-layout="wide"'));
    expect(others).toEqual([]);
  });
});
