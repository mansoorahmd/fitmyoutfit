import { describe, expect, it } from "vitest";
import designs from "./fixtures/v2-sample-designs.json";
import prints from "./fixtures/v2-sample-paint.json";
import { loadPlaceholderProduct, loadStandInJerseyProduct, loadStandInProduct } from "./fixtures";
import { paintFingerprint } from "./paint-fingerprint";
import { validateDesign } from "../design/validate";

// The sample designs were built the way the E2 demo builds them (zone colours, Latin and Urdu
// text, English and Arabic digits, a logo, a clipart), and their fingerprints recorded with the
// E2 code (format version 2), before any change of this step.
const products = [loadStandInJerseyProduct(), loadStandInProduct(), loadPlaceholderProduct()];

describe("the version 2 sample designs", () => {
  for (const product of products) {
    it(`${product.id}: paints what the E2 code painted`, () => {
      const result = validateDesign((designs as Record<string, unknown>)[product.id], { product });
      if (!result.ok) throw new Error(result.errors.map((e) => e.message).join("\n"));
      expect(paintFingerprint(product, result.value)).toEqual((prints as Record<string, unknown>)[product.id]);
    });
  }
});
