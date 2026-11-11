import { describe, expect, it } from "vitest";
import {
  firstStrongDirection,
  hasRtlLetters,
  isNormalizedText,
  normalizeText,
  physicalAlign,
  resolveTextDirection,
} from "./text";
import { createDesign } from "./create";
import { addFont, addLayer, updateLayer } from "./edit";
import { validateDesign } from "./validate";
import { loadPlaceholderProduct, textLayer } from "../test/fixtures";

const URDU = "محمد علی"; // Urdu: ends in U+06CC FARSI YEH
const ARABIC = "عبدالله الهاشمي";

describe("normalizeText (Unicode NFC)", () => {
  it("turns a combining sequence into the precomposed letter, so names compare equal", () => {
    const decomposed = "José";
    const precomposed = "José";
    expect(decomposed).not.toBe(precomposed);
    expect(normalizeText(decomposed)).toBe(precomposed);
    expect(normalizeText(precomposed)).toBe(precomposed);
    expect(isNormalizedText(decomposed)).toBe(false);
    expect(isNormalizedText(precomposed)).toBe(true);
  });

  it("puts Arabic combining marks in canonical order", () => {
    // SHADDA (U+0651) and FATHA (U+064E) in both orders give the same NFC string.
    const a = "مَّ";
    const b = "مَّ";
    expect(a).not.toBe(b);
    expect(normalizeText(a)).toBe(normalizeText(b));
  });

  it("leaves Urdu and Arabic names that are already NFC unchanged", () => {
    expect(normalizeText(URDU)).toBe(URDU);
    expect(normalizeText(ARABIC)).toBe(ARABIC);
  });

  it("composes Urdu letters written as a base letter plus a combining hamza", () => {
    // HEH GOAL + HAMZA ABOVE composes to U+06C2.
    expect(normalizeText("ۂ")).toBe("ۂ");
  });
});

describe("text direction", () => {
  it.each([
    ["TIGERS", "ltr"],
    [URDU, "rtl"],
    [ARABIC, "rtl"],
    ["Ali علي 10", "ltr"],
    ["علي Ali 10", "rtl"],
    ["10 علي", "rtl"],
    ["١٠ Ali", "ltr"],
    ["שלום", "rtl"],
  ] as const)("auto: %s reads %s (the first strong letter decides)", (value, expected) => {
    expect(resolveTextDirection(value, "auto")).toBe(expected);
  });

  it("digits are not strong letters, in any digit system", () => {
    expect(firstStrongDirection("07")).toBeNull();
    expect(firstStrongDirection("٠٧")).toBeNull();
    expect(firstStrongDirection("۰۷")).toBeNull();
    expect(firstStrongDirection("- 10 -")).toBeNull();
    expect(resolveTextDirection("٠٧")).toBe("ltr");
  });

  it("an explicit direction wins over the text", () => {
    expect(resolveTextDirection("TIGERS", "rtl")).toBe("rtl");
    expect(resolveTextDirection(URDU, "ltr")).toBe("ltr");
  });

  it("follows the bidi marks LRM, RLM and ALM", () => {
    expect(firstStrongDirection("‏10 Ali")).toBe("rtl");
    expect(firstStrongDirection("؜10")).toBe("rtl");
    expect(firstStrongDirection("‎10 علي")).toBe("ltr");
  });

  it("skips text inside bidi isolates (rule P2)", () => {
    expect(firstStrongDirection("⁧Ali⁩ علي")).toBe("rtl");
    expect(firstStrongDirection("⁦علي⁩ Ali")).toBe("ltr");
    // An isolate that is never closed hides the rest.
    expect(firstStrongDirection("⁨Ali")).toBeNull();
  });

  it("knows which text holds right-to-left letters", () => {
    expect(hasRtlLetters(URDU)).toBe(true);
    expect(hasRtlLetters("Ali علي")).toBe(true);
    expect(hasRtlLetters("TIGERS ٧")).toBe(false);
  });
});

describe("alignment by reading direction", () => {
  it("start is the left edge for left-to-right text and the right edge for right-to-left text", () => {
    expect(physicalAlign("start", "ltr")).toBe("left");
    expect(physicalAlign("end", "ltr")).toBe("right");
    expect(physicalAlign("start", "rtl")).toBe("right");
    expect(physicalAlign("end", "rtl")).toBe("left");
    expect(physicalAlign("center", "rtl")).toBe("center");
    expect(physicalAlign("center", "ltr")).toBe("center");
  });
});

describe("text layers in the document", () => {
  const product = loadPlaceholderProduct();
  const withFont = addFont(createDesign(product), { id: "font-sans", family: "Inter" });

  it("hold a direction and an alignment by reading direction", () => {
    for (const direction of ["auto", "ltr", "rtl"] as const) {
      for (const align of ["start", "center", "end"] as const) {
        const design = addLayer(withFont, textLayer({ value: URDU, direction, align }), { product });
        expect(design.layers[0]).toMatchObject({ direction, align });
        expect(validateDesign(design, { product }).ok).toBe(true);
      }
    }
  });

  it("refuse the old left and right alignment, and a missing direction", () => {
    expect(() => addLayer(withFont, textLayer({ align: "left" as never }))).toThrow(/layer\.align/);
    const noDirection: Record<string, unknown> = { ...textLayer() };
    delete noDirection.direction;
    expect(() => addLayer(withFont, noDirection as never)).toThrow(/layer\.direction: is required/);
  });

  it("keep Urdu and Arabic names as text, exactly, through a JSON round trip", () => {
    let design = addLayer(withFont, textLayer({ id: "urdu", value: URDU }));
    design = addLayer(design, textLayer({ id: "arabic", value: ARABIC }));
    const reread = validateDesign(JSON.parse(JSON.stringify(design)));
    expect(reread.ok && reread.value.layers.map((l) => (l.kind === "text" ? l.value : ""))).toEqual([URDU, ARABIC]);
  });

  it("refuse line breaks, tabs and text of spaces only", () => {
    expect(() => addLayer(withFont, textLayer({ value: "TWO\nLINES" }))).toThrow(/must be one line of text/);
    expect(() => addLayer(withFont, textLayer({ value: "A\tB" }))).toThrow(/must be one line of text/);
    expect(() => addLayer(withFont, textLayer({ value: "   " }))).toThrow(/must contain a visible character/);
    // Bidi marks are format characters, not control characters: allowed.
    expect(addLayer(withFont, textLayer({ value: "‏Ali 10" })).layers[0]).toMatchObject({ value: "‏Ali 10" });
  });

  it("updateLayer normalises an edited value too", () => {
    const design = addLayer(withFont, textLayer());
    expect(updateLayer(design, "text-1", { value: "Rémy" }).layers[0]).toMatchObject({ value: "Rémy" });
  });
});
