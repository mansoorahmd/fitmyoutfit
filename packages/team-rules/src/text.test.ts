import { describe, expect, it } from "vitest";
import { cleanText, disallowedNameCharacters, mixesScripts, nameLength } from "./text.js";

describe("cleanText", () => {
  it("trims, makes runs of white space one space, and uses NFC", () => {
    expect(cleanText("  Ali \n\t Raza  ")).toBe("Ali Raza");
    expect(cleanText("é")).toBe("é");
  });
  it("removes direction marks, zero-width spaces and the byte-order mark, and keeps the ZWNJ", () => {
    expect(cleanText("\uFEFF\u200FAli\u200B \u202AR\u202C")).toBe("Ali R");
    expect(cleanText("a\u200Cb")).toBe("a\u200Cb");
  });
});

describe("disallowedNameCharacters", () => {
  it("lists each bad character once, in order", () => {
    expect(disallowedNameCharacters("A!B!C?")).toEqual({ characters: ["!", "?"], hasDigit: false });
  });
  it("says when one is a digit, in any digit system", () => {
    expect(disallowedNameCharacters("Ali7")?.hasDigit).toBe(true);
    expect(disallowedNameCharacters("Ali۷")?.hasDigit).toBe(true);
  });
  it("accepts Latin with accents, Arabic and Urdu letters with their marks", () => {
    for (const name of ["Zöe", "Øyvind", "احمد", "بِلال", "خان صاحب"]) {
      expect(disallowedNameCharacters(name)).toBeNull();
    }
  });
  it("refuses other scripts", () => {
    expect(disallowedNameCharacters("张伟")).not.toBeNull();
    expect(disallowedNameCharacters("Али")).not.toBeNull();
  });
});

describe("nameLength", () => {
  it("counts letters, not marks or the ZWNJ, and a letter outside the BMP once", () => {
    expect(nameLength("Ali")).toBe(3);
    expect(nameLength("á")).toBe(1);
    expect(nameLength("a\u200Cb")).toBe(2);
    expect(nameLength("😀")).toBe(1);
  });
});

describe("mixesScripts", () => {
  it("is true only for Latin and Arabic-script letters together", () => {
    expect(mixesScripts("Ali علی")).toBe(true);
    expect(mixesScripts("Ali")).toBe(false);
    expect(mixesScripts("علی")).toBe(false);
    expect(mixesScripts("Ali 7")).toBe(false);
  });
});
