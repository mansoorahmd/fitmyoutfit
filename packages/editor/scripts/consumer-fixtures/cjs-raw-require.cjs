// Plain require(), no TypeScript: what `require("@fitmyoutfit/editor/design")`
// does in a CommonJS project. Used by scripts/check-entrypoints.mjs.
const { createDesign, validateDesign, validateProductDefinition } = require("@fitmyoutfit/editor/design");
const { readFileSync } = require("node:fs");

const product = validateProductDefinition(JSON.parse(readFileSync(process.argv[2], "utf8")));
if (!product.ok) throw new Error("product definition rejected");
const design = createDesign(product.value);
if (!validateDesign(design).ok) throw new Error("a freshly created design was rejected");
if (validateDesign({}).ok) throw new Error("an empty object was accepted");
for (const name of ["createDesign", "validateDesign", "setZoneColor", "addLayer", "checkJerseyNumber", "findDuplicateJerseyNumbers"]) {
  if (typeof require("@fitmyoutfit/editor/design")[name] !== "function") throw new Error(name + " is missing");
}
const editor = require("@fitmyoutfit/editor/design");
if (editor.DEFAULT_JERSEY_NUMBER_RULES.maxValue !== 99) throw new Error("jersey number rules are missing");
if (editor.jerseyNumberValue("٠٧") !== 7) throw new Error("jerseyNumberValue is wrong");
if (!editor.isSameJerseyNumber("7", "۷") || editor.checkJerseyNumber("100").ok) throw new Error("jersey number checks are wrong");
if (editor.findDuplicateJerseyNumbers(["7", "07"]).duplicates.length !== 1) throw new Error("duplicate check is wrong");
console.log("raw require OK");
