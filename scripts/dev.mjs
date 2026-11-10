#!/usr/bin/env node
// `npm run dev`: start the backend (9000) and the storefront (8000) together.
// A workspace that does not exist yet (or has no `dev` script) is skipped with a note,
// so this works in a checkout that has only some of the parts.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const targets = [
  { name: "backend", dir: "backend" },
  { name: "storefront", dir: "storefront" },
];

const children = [];

function hasDevScript(dir) {
  const pkgPath = path.join(root, dir, "package.json");
  if (!existsSync(pkgPath)) return false;
  try {
    return Boolean(JSON.parse(readFileSync(pkgPath, "utf8")).scripts?.dev);
  } catch {
    return false;
  }
}

function killTree(child) {
  if (child.exitCode !== null || child.pid === undefined) return;
  if (process.platform === "win32") {
    spawnSync(`taskkill /pid ${child.pid} /t /f`, { shell: true, stdio: "ignore" });
  } else {
    child.kill("SIGTERM");
  }
}

function shutdown(code) {
  for (const child of children) killTree(child);
  process.exit(code);
}

function prefixLines(name, stream, out) {
  let buffer = "";
  stream.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) out.write(`[${name}] ${line}\n`);
  });
  stream.on("end", () => {
    if (buffer) out.write(`[${name}] ${buffer}\n`);
  });
}

const started = [];
for (const target of targets) {
  if (!hasDevScript(target.dir)) {
    console.warn(`[dev] ${target.dir}/ not found or has no "dev" script: skipping ${target.name}`);
    continue;
  }
  const child = spawn(`npm run dev --workspace ${target.dir}`, {
    cwd: root,
    shell: true,
    stdio: ["inherit", "pipe", "pipe"],
  });
  prefixLines(target.name, child.stdout, process.stdout);
  prefixLines(target.name, child.stderr, process.stderr);
  child.on("exit", (code) => {
    console.error(`[dev] ${target.name} exited with code ${code}; stopping the others`);
    shutdown(code ?? 1);
  });
  children.push(child);
  started.push(target.name);
}

if (started.length === 0) {
  console.error("[dev] nothing to start");
  process.exit(1);
}
console.log(`[dev] started: ${started.join(", ")}. Press Ctrl+C to stop.`);

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
