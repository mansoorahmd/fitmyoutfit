import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { chooseProduct, DEMO_PRODUCTS } from "./products";
import { START_PLACEMENTS } from "./placements";

const root = resolve(import.meta.dirname, "..");

describe("the demo's products", () => {
  it("opens on the stand-in football jersey, and keeps the T-shirt and the placeholder reachable by address", () => {
    expect(chooseProduct("").id).toBe("stand-in-jersey");
    expect(chooseProduct("?product=stand-in-tshirt").id).toBe("stand-in-tshirt");
    expect(chooseProduct("?product=placeholder-jersey").id).toBe("placeholder-jersey");
    expect(chooseProduct("?product=nothing-like-it").id).toBe("stand-in-jersey");
  });

  it("names only products whose definition and model are in samples/", () => {
    for (const p of DEMO_PRODUCTS) {
      const product = JSON.parse(readFileSync(resolve(root, `samples/products/${p.id}.json`), "utf8")) as { id: string; model: { url: string } };
      expect(product.id).toBe(p.id);
      expect(existsSync(resolve(root, `samples${product.model.url}`)), product.model.url).toBe(true);
    }
  });

  it("credits each downloaded model as its licence notice says", () => {
    for (const p of DEMO_PRODUCTS) {
      const notice = resolve(root, `samples/models/${p.id}.LICENSE.txt`);
      if (!p.credit) {
        expect(existsSync(notice), `${p.id} is ours and needs no notice`).toBe(false);
        continue;
      }
      const text = readFileSync(notice, "utf8");
      expect(text).toContain(p.credit.title);
      expect(text).toContain(p.credit.author);
      expect(text).toContain(p.credit.sourceUrl.replace(/\/$/, ""));
      expect(p.credit.changed).toBe(true);
    }
    expect(DEMO_PRODUCTS.find((p) => p.id === "stand-in-jersey")!.credit!.licence).toBe("CC BY 4.0");
  });

  it("has print positions for the jersey's front, back and sleeves", () => {
    const jersey = START_PLACEMENTS["stand-in-jersey"]!;
    expect(jersey.back!.text!.position.y).toBeLessThan(jersey.back!.number!.position.y); // name above the number
    expect(jersey.front!.logo!.position.x).toBeGreaterThan(jersey.front!.text!.position.x); // badge on the wearer's left chest
    expect(jersey.sleeve_left!.logo).toBeDefined();
    expect(jersey.sleeve_right!.logo).toBeDefined();
  });
});
