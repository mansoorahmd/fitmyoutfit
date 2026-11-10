// Run after the build. Checks that the built files named in package.json
// "exports" exist, and that the `./design` entry point (and every chunk it
// loads) imports nothing from React or Three.js. The backend relies on that.
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

const problems = [];

for (const [key, target] of Object.entries(pkg.exports)) {
  const files = typeof target === "string" ? [target] : Object.values(target);
  for (const file of files) {
    if (!existsSync(resolve(root, file))) problems.push(`exports["${key}"] points to ${file}, which does not exist`);
  }
}

const forbidden = /^(react|react-dom|three|@react-three\/.*)($|\/)/;
const importPattern = /(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/g;

function collect(file, seen = new Set(), bare = new Set()) {
  if (seen.has(file)) return bare;
  seen.add(file);
  const source = readFileSync(file, "utf8");
  for (const match of source.matchAll(importPattern)) {
    const spec = match[1];
    if (spec.startsWith(".")) collect(resolve(dirname(file), spec), seen, bare);
    else bare.add(spec);
  }
  return bare;
}

const designFile = resolve(root, "dist/design.js");
if (existsSync(designFile)) {
  const bare = [...collect(designFile)];
  for (const spec of bare) {
    if (forbidden.test(spec)) problems.push(`dist/design.js loads "${spec}"; the design entry must not use React or Three.js`);
  }
  console.log(`dist/design.js external imports: ${bare.join(", ") || "none"}`);
}

if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log("Entry points OK");
