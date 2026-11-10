// The package is "type": "module", so TypeScript reads every .d.ts file in it as
// an ES module and rejects it from a CommonJS consumer (TS1479, under
// "module": "Node16"). dist/cjs/ holds the CommonJS build of the design entry
// and a copy of its declarations. This package.json marks that folder as
// CommonJS, so those declarations are read as CommonJS.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dir = resolve(dirname(fileURLToPath(import.meta.url)), "../dist/cjs");
mkdirSync(dir, { recursive: true });
writeFileSync(resolve(dir, "package.json"), JSON.stringify({ type: "commonjs" }, null, 2) + "\n");
console.log("Wrote dist/cjs/package.json");
