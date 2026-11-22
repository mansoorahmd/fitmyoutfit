// After a build: the package must load through both of its entries (require and import), by its
// own name, and give the same functions.
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(resolve(root, "package.json"));
const cjs = require(resolve(root, "dist/cjs/index.js"));
const esm = await import(new URL("../dist/esm/index.js", import.meta.url).href);

const names = ["analyzeRoster", "checkRoster", "readPastedList", "parseRosterInput", "normalizeLines", "DEFAULT_LIMITS"];
for (const name of names) {
  if (cjs[name] === undefined || esm[name] === undefined) {
    console.error(`check-entrypoints: ${name} is missing from the ${cjs[name] === undefined ? "CommonJS" : "ES module"} build`);
    process.exit(1);
  }
}
const sample = { name: "Ali", number: "07", size: "M", count: 1, noName: false, noNumber: false };
const settings = { prints: { name: true, number: true }, sizes: ["M"] };
const a = JSON.stringify(cjs.analyzeRoster([sample], settings));
const b = JSON.stringify(esm.analyzeRoster([sample], settings));
if (a !== b) {
  console.error("check-entrypoints: the two builds disagree");
  process.exit(1);
}
console.log("check-entrypoints: require and import both work");
