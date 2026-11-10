// Run after the build (it is the last step of `npm run build`).
//
// 1. Every built file named in package.json "exports" exists.
// 2. The `./design` entry points (ES module and CommonJS) import nothing from
//    React or Three.js. The backend relies on that.
// 3. The package, packed as it would be published, works for real consumers:
//    - a CommonJS project using TypeScript "module": "Node16" (the Medusa
//      backend): type-checks, then runs, an import of the design functions,
//      and also a plain require();
//    - an ES module project using "module": "NodeNext";
//    - a bundler-style project ("moduleResolution": "Bundler", as in Vite and
//      Next.js), including the root entry (React component).
//    A regression in "exports", in the emitted declarations or in the CommonJS
//    build fails the build.
//
// The consumer projects are created under node_modules/.cache/ (git-ignored),
// from the fixtures in scripts/consumer-fixtures/. They resolve `zod` from this
// package's own node_modules, as a real install would from the host's.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

const problems = [];

/** All file paths named in an exports value (a string, or nested conditions). */
function exportFiles(target) {
  if (typeof target === "string") return [target];
  return Object.values(target).flatMap(exportFiles);
}

for (const [key, target] of Object.entries(pkg.exports)) {
  for (const file of exportFiles(target)) {
    if (!existsSync(resolve(root, file))) problems.push(`exports["${key}"] points to ${file}, which does not exist`);
  }
}

// ---- 2. The design entry loads nothing from React or Three.js ----

const forbidden = /^(react|react-dom|three|@react-three\/.*)($|\/)/;
const importPattern = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["']([^"']+)["']/g;

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

for (const file of ["dist/design.js", "dist/cjs/design.cjs"]) {
  const abs = resolve(root, file);
  if (!existsSync(abs)) continue;
  const bare = [...collect(abs)];
  for (const spec of bare) {
    if (forbidden.test(spec)) problems.push(`${file} loads "${spec}"; the design entry must not use React or Three.js`);
  }
  console.log(`${file} external imports: ${bare.join(", ") || "none"}`);
}

if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}

// ---- 3. Consumer projects ----

function run(label, command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", shell: command === "npm" });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
  if (result.status !== 0) {
    problems.push(`${label} failed (exit ${result.status}):\n${output}`);
    return false;
  }
  console.log(`${label}: ok${output ? `\n  ${output.replaceAll("\n", "\n  ")}` : ""}`);
  return true;
}

const work = resolve(root, "node_modules/.cache/editor-entrypoint-check");
rmSync(work, { recursive: true, force: true });
const installed = resolve(work, "node_modules/@fitmyoutfit/editor");
mkdirSync(installed, { recursive: true });

// Copy exactly the files `npm pack` would publish.
const packList = spawnSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { cwd: root, encoding: "utf8", shell: true });
if (packList.status !== 0) {
  console.error(`npm pack --dry-run failed:\n${packList.stdout}\n${packList.stderr}`);
  process.exit(1);
}
const packed = JSON.parse(packList.stdout)[0].files.map((f) => f.path);
for (const file of packed) {
  const to = resolve(installed, file);
  mkdirSync(dirname(to), { recursive: true });
  cpSync(resolve(root, file), to);
}
console.log(`packed ${packed.length} files into a fake node_modules install`);

// The TypeScript this package resolves (hoisted to the workspace root when versions match).
const tsc = createRequire(import.meta.url).resolve("typescript/bin/tsc");
const fixtures = resolve(root, "scripts/consumer-fixtures");
const productJson = resolve(root, "samples/products/placeholder-jersey.json");

function makeConsumer(name, packageType, compilerOptions, files) {
  const dir = resolve(work, name);
  mkdirSync(dir, { recursive: true });
  for (const file of files) cpSync(resolve(fixtures, file), resolve(dir, file));
  writeFileSync(resolve(dir, "package.json"), JSON.stringify({ type: packageType }) + "\n");
  writeFileSync(
    resolve(dir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { target: "ES2022", strict: true, types: ["node"], skipLibCheck: false, outDir: "out", ...compilerOptions },
      files: files.filter((f) => f.endsWith(".ts")),
    }),
  );
  return dir;
}

// CommonJS project, Node16 resolution: how the Medusa backend is set up.
{
  const dir = makeConsumer(
    "cjs-node16",
    "commonjs",
    { module: "Node16", moduleResolution: "Node16" },
    ["consumer.ts", "cjs-raw-require.cjs"],
  );
  if (run('CommonJS + "module": "Node16" type-check', process.execPath, [tsc, "-p", "."], dir)) {
    run("CommonJS consumer, compiled by tsc, run on Node " + process.versions.node, process.execPath, ["out/consumer.js", productJson], dir);
  }
  run("CommonJS require() on Node " + process.versions.node, process.execPath, ["cjs-raw-require.cjs", productJson], dir);
}

// ES module project, NodeNext resolution.
{
  const dir = makeConsumer("esm-nodenext", "module", { module: "NodeNext", moduleResolution: "NodeNext" }, ["consumer.ts"]);
  if (run('ES module + "module": "NodeNext" type-check', process.execPath, [tsc, "-p", "."], dir)) {
    run("ES module consumer run on Node " + process.versions.node, process.execPath, ["out/consumer.js", productJson], dir);
  }
}

// Bundler-style project, both entries.
{
  const dir = makeConsumer(
    "bundler",
    "module",
    { module: "ESNext", moduleResolution: "Bundler", jsx: "react-jsx", noEmit: true },
    ["consumer.ts", "bundler-root.ts"],
  );
  run('"moduleResolution": "Bundler" type-check (design and root entries)', process.execPath, [tsc, "-p", "."], dir);
}

if (problems.length > 0) {
  console.error(problems.join("\n\n"));
  process.exit(1);
}
console.log("Entry points OK");
