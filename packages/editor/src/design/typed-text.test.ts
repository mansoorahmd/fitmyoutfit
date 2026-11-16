/**
 * Text as typed or pasted (E3c, S5 and the pasted-text minor): pictographs
 * refused and removable; tabs and line breaks become single spaces.
 */
import { describe, expect, it } from "vitest";
import { checkTypedText, hasPictographs, singleLine, stripPictographs } from "./typed-text";

describe("pictographs (S5)", () => {
  it("finds emoji, flags, keycaps, skin tones and emoji joined sequences", () => {
    for (const t of ["LIONS 🦁", "🔥🔥", "Pakistan 🇵🇰", "No. 1️⃣", "👍🏽", "👨‍👩‍👧", "★ STARS ★".replace(/★/g, "⭐"), "I ❤️ LHR", "☺"]) {
      expect(hasPictographs(t), t).toBe(true);
    }
  });

  it("lets letters, digits and punctuation through, in every script, and ©, ® and ™ as text", () => {
    for (const t of ["TIGERS", "Ali Raza", "محمد علی", "عبدالله الهاشمي", "٧", "07", "Since 1990!", "Café Olé", "FC © 2026", "BRAND®", "Lions™", "#1 & #2", "Ali-Raza (C)", "خوش آمدید", "ک‍"]) {
      expect(hasPictographs(t), t).toBe(false);
    }
    // ... but not with the emoji selector.
    expect(hasPictographs("©️")).toBe(true);
  });

  it("removes them, and the joiners that held them, keeping letters (and a joiner between letters)", () => {
    expect(stripPictographs("LIONS 🦁")).toBe("LIONS");
    expect(stripPictographs("🔥 LIONS 🔥 FC")).toBe("LIONS FC");
    expect(stripPictographs("I ❤️ LHR")).toBe("I LHR");
    expect(stripPictographs("Family 👨‍👩‍👧 FC")).toBe("Family FC");
    expect(stripPictographs("Pakistan 🇵🇰")).toBe("Pakistan");
    expect(stripPictographs("ک‍ی")).toBe("ک‍ی");
    expect(stripPictographs("Lions™")).toBe("Lions™");
    for (const t of ["🦁", "👍🏽 ok", "a🇵🇰b"]) expect(hasPictographs(stripPictographs(t))).toBe(false);
  });
});

describe("pasted text (minor)", () => {
  it("turns tabs and line breaks into single spaces; nothing is silently dropped", () => {
    expect(singleLine("LAHORE\tLIONS")).toBe("LAHORE LIONS");
    expect(singleLine("LAHORE\r\nLIONS")).toBe("LAHORE LIONS");
    expect(singleLine("LAHORE \n\n LIONS")).toBe("LAHORE LIONS");
    expect(singleLine("A" + String.fromCharCode(0x2028) + "B")).toBe("A B");
    expect(singleLine("A\u0007B")).toBe("AB");
    expect(singleLine("Café")).toBe("Café");
  });

  it("says what is wrong, for the field's message", () => {
    expect(checkTypedText("LIONS\t1990")).toEqual({ value: "LIONS 1990", problem: null });
    expect(checkTypedText("LIONS 🦁").problem).toBe("pictographs");
    expect(checkTypedText("  \t ").problem).toBe("blank");
    expect(checkTypedText("", { allowEmpty: true }).problem).toBeNull();
  });
});
