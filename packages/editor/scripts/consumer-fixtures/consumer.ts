// Consumer fixture, shared by the CommonJS, ES module and Bundler checks in
// scripts/check-entrypoints.mjs. It imports the packed, built package the way a
// real consumer (the Medusa backend, for example) does, type-checks that import
// under the consumer's own module settings, then runs it.
import { readFileSync } from "node:fs";
import { createDesign, validateDesign, validateProductDefinition } from "@fitmyoutfit/editor/design";
import type { DesignDocument } from "@fitmyoutfit/editor/design";

const productPath = process.argv[2];
if (!productPath) throw new Error("usage: node consumer.js <product.json>");

const product = validateProductDefinition(JSON.parse(readFileSync(productPath, "utf8")));
if (!product.ok) throw new Error("product definition rejected: " + product.errors.map((e) => e.message).join("; "));

const design: DesignDocument = createDesign(product.value);
const good = validateDesign(JSON.parse(JSON.stringify(design)), { product: product.value });
if (!good.ok) throw new Error("a freshly created design was rejected: " + good.errors.map((e) => e.message).join("; "));

const bad = validateDesign({ schemaVersion: 1 });
if (bad.ok || bad.errors.length === 0) throw new Error("an incomplete design was accepted");

console.log(`consumer OK: ${Object.keys(design.zones).length} zones, ${bad.errors.length} errors on the bad document`);
