/**
 * The text fields (E3c, S5 and minors): emoji refused with the coach's
 * sentence; tabs and line breaks become spaces; an empty line of text says
 * why; leaving a field after an invalid entry clears the message; a saved
 * design holding emoji is listed in the Done panel.
 */
import { describe, expect, it } from "vitest";
import { createDesign } from "../design/create";
import { addLayer } from "../design/edit";
import { addCatalogFont } from "../design/font-catalog";
import { newTextLayer } from "../design/new-layers";
import { loadPlaceholderFonts, loadStandInJerseyProduct } from "../test/fixtures";
import { designChecks, itemChecks } from "./checks";
import { EDITOR_WORDING as W } from "./content";
import { fieldCheck, fieldStep } from "./lettering";

describe("text fields", () => {
  it("refuse emoji in names and text, with a sentence for the coach", () => {
    expect(fieldCheck(W, "LIONS 🦁", "name")).toEqual({ value: "LIONS 🦁", error: W.lettering.noPictographs });
    expect(fieldCheck(W, "Since 1990 🔥", "text").error).toBe(W.lettering.noPictographs);
    expect(fieldCheck(W, "محمد علی", "name")).toEqual({ value: "محمد علی", error: null });
  });

  it("turn a pasted tab or line break into a space, never dropping the change", () => {
    expect(fieldCheck(W, "LAHORE\tLIONS", "name")).toEqual({ value: "LAHORE LIONS", error: null });
    expect(fieldCheck(W, "SINCE\n1990", "text")).toEqual({ value: "SINCE 1990", error: null });
  });

  it("say why a line of text can't be empty; names may be empty", () => {
    expect(fieldCheck(W, "   ", "text").error).toBe(W.lettering.textBlank);
    expect(fieldCheck(W, "", "name").error).toBeNull();
  });

  it("numbers keep the coach-grade number errors", () => {
    expect(fieldCheck(W, "100", "number").error).toBe(W.lettering.numberTooLong);
    expect(fieldCheck(W, "1٢", "number").error).toBe(W.lettering.numberMixed);
    expect(fieldCheck(W, "07", "number")).toEqual({ value: "07", error: null });
  });

  it("leaving a field after an invalid entry shows the last good value and clears the message (minor)", () => {
    const typed = fieldStep({ draft: null, error: null }, { type: "typed", raw: "100", error: W.lettering.numberTooLong });
    expect(typed).toEqual({ draft: "100", error: W.lettering.numberTooLong });
    expect(fieldStep(typed, { type: "left" })).toEqual({ draft: null, error: null });
  });
});

describe("a saved design holding emoji (S5)", () => {
  it("is a check on the item and a line in the Done panel", () => {
    const product = loadStandInJerseyProduct();
    const fonts = loadPlaceholderFonts();
    const font = fonts.fonts.find((f) => f.uses.includes("text"))!;
    let d = addCatalogFont(createDesign(product), fonts, font.id);
    d = addLayer(d, newTextLayer(product, { id: "text-1", preset: "lower-back", value: "LIONS 🦁", fontId: font.id, fill: d.teamColors.second }), { product });
    expect(itemChecks(product, d, d.layers[0]!)).toContain("pictographs");
    const lines = designChecks(W, product, d);
    expect(lines.some((c) => c.check === "pictographs" && c.text.includes(W.done.checks.pictographs))).toBe(true);
  });
});
