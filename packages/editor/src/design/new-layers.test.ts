import { describe, expect, it } from "vitest";
import { defaultFontSize, newLogoLayer, newNumberLayer, newTextLayer, nextLayerId } from "./new-layers";
import { createDesign } from "./create";
import { addLayer } from "./edit";
import { setSamplePlayer } from "./roles";
import { addCatalogFont } from "./font-catalog";
import { validateDesign } from "./validate";
import { DesignError } from "./validate";
import { loadPlaceholderFonts, loadPlaceholderProduct, RED } from "../test/fixtures";

const product = loadPlaceholderProduct();
const design = addCatalogFont(createDesign(product), loadPlaceholderFonts(), "oswald-700");

describe("new layers", () => {
  it("a text layer sits in the middle of its piece, in a box 80% of the piece wide, and is valid", () => {
    const layer = newTextLayer(product, { id: "t", pieceId: "back", value: "محمد علی", fontId: "oswald-700", fill: RED });
    expect(layer).toMatchObject({
      pieceId: "back",
      position: { x: 280, y: 350 },
      size: { width: 448, height: 98 },
      fontSize: 70,
      direction: "auto",
      align: "center",
    });
    expect(validateDesign(addLayer(design, layer, { product }), { product }).ok).toBe(true);
  });

  it("text is normalised to NFC when the layer is made", () => {
    expect(newTextLayer(product, { id: "t", pieceId: "front", value: "José", fontId: "oswald-700", fill: RED }).value).toBe("José");
  });

  it("the first font size follows the piece: smaller on a sleeve", () => {
    expect(defaultFontSize({ height: 700 })).toBe(70);
    expect(defaultFontSize({ height: 220 })).toBe(22);
    expect(defaultFontSize({ height: 30 })).toBe(20);
    expect(defaultFontSize({ height: 5000 })).toBe(80);
  });

  it("a number layer is large on the back, centred, and follows the number rule when added", () => {
    const layer = newNumberLayer(product, { id: "n", pieceId: "back", value: "١٠", fontId: "oswald-700", fill: RED });
    expect(layer).toMatchObject({ fontSize: 245, align: "center", position: { x: 280, y: 350 } });
    // A number layer is the player's number by default: it shows the sample player's number.
    expect(layer.role).toBe("player-number");
    const withPlayer = setSamplePlayer(design, { number: "١٠" });
    expect(addLayer(withPlayer, layer, { product }).layers).toHaveLength(1);
    expect(() => addLayer(design, layer, { product })).toThrow(/shows the sample player's number/);
    expect(() => addLayer(withPlayer, { ...layer, value: "100" }, { product })).toThrow(/more than 2 digits/);
  });

  it("a logo starts as wide as prints sharp, at most 100 mm, keeping its proportions", () => {
    const big = newLogoLayer(product, { id: "l", pieceId: "front", asset: { assetId: "a", mediaType: "image/png", width: 2000, height: 1000 } });
    expect(big.size).toEqual({ width: 100, height: 50 });
    const small = newLogoLayer(product, { id: "l", pieceId: "front", asset: { assetId: "a", mediaType: "image/png", width: 60, height: 60 } });
    expect(small.size).toEqual({ width: 20, height: 20 }); // never narrower than 20 mm, even if that is below 150 DPI
    const sleeve = newLogoLayer(product, { id: "l", pieceId: "sleeve_left", asset: { assetId: "a", mediaType: "image/png", width: 4000, height: 4000 } });
    expect(sleeve.size.width).toBe(100);
  });

  it("refuses a piece the product does not have", () => {
    expect(() => newTextLayer(product, { id: "t", pieceId: "hood", value: "A", fontId: "oswald-700", fill: RED })).toThrow(DesignError);
  });

  it("nextLayerId finds the first free id", () => {
    let d = design;
    expect(nextLayerId(d, "text")).toBe("text-1");
    d = addLayer(d, newTextLayer(product, { id: "text-1", pieceId: "front", value: "A", fontId: "oswald-700", fill: RED }));
    d = addLayer(d, newTextLayer(product, { id: "text-3", pieceId: "front", value: "B", fontId: "oswald-700", fill: RED }));
    expect(nextLayerId(d, "text")).toBe("text-2");
    expect(nextLayerId(d, "logo")).toBe("logo-1");
  });
});
