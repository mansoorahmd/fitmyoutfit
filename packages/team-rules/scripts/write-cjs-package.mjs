// The package is "type": "module", so Node and TypeScript read every file in it as an ES module.
// dist/cjs/ holds the CommonJS build (for the backend, which compiles to CommonJS); this
// package.json marks that folder as CommonJS, JavaScript and declarations alike.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dir = resolve(dirname(fileURLToPath(import.meta.url)), "../dist/cjs");
mkdirSync(dir, { recursive: true });
writeFileSync(resolve(dir, "package.json"), JSON.stringify({ type: "commonjs" }, null, 2) + "\n");
console.log("Wrote dist/cjs/package.json");
