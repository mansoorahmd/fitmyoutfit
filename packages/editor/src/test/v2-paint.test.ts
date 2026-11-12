import { describe, expect, it } from "vitest";
import designs from "./fixtures/v2-sample-designs.json";
import prints from "./fixtures/v2-sample-paint.json";
import { loadPlaceholderProduct, loadStandInJerseyProduct, loadStandInProduct } from "./fixtures";
import { paintFingerprint } from "./paint-fingerprint";
import { upgradeDesign } from "../design/upgrade";
import { validateDesign } from "../design/validate";

// The sample designs were built the way the E2 demo builds them (zone colours, Latin and Urdu
// text, English and Arabic digits, a logo, a clipart), and their fingerprints recorded with the
// E2 code (format version 2), before any change of this step (commit 95a6b32). Format version 3
// must paint the same picture after the upgrade: same pixels in the texture and the flat view,
// same text calls (string, font, alignment, direction, colour, transform).
const products = [loadStandInJerseyProduct(), loadStandInProduct(), loadPlaceholderProduct()];

describe("the version 2 sample designs, upgraded to version 3", () => {
  for (const product of products) {
    const v2 = (designs as Record<string, { schemaVersion: number }>)[product.id]!;

    it(`${product.id}: the recorded document is version 2, which validateDesign sends to upgradeDesign`, () => {
      expect(v2.schemaVersion).toBe(2);
      const direct = validateDesign(v2, { product });
      expect(direct.ok).toBe(false);
      if (!direct.ok) expect(direct.errors[0]!.message).toMatch(/format version 2 is an older format .* upgradeDesign\(\)/);
    });

    it(`${product.id}: upgrades to a valid version 3 design that paints what the E2 code painted`, () => {
      const result = upgradeDesign(v2, { product });
      if (!result.ok) throw new Error(result.errors.map((e) => e.message).join("\n"));
      expect(result.value.schemaVersion).toBe(3);
      expect(paintFingerprint(product, result.value)).toEqual((prints as Record<string, unknown>)[product.id]);
    });
  }
});
