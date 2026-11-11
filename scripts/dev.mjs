#!/usr/bin/env node
// `npm run dev`: start the backend and the storefront together.
// A part that does not exist yet (or has no `dev` script) is skipped with a note,
// so this works in a checkout that has only some of the parts.
//
// Ports (scripts/lib/ports.mjs): the backend listens on PORT (from the shell, else backend/.env,
// else 9000), the storefront on STOREFRONT_PORT (from the shell, else 8000). Each child gets its
// port in its environment, and dev prints both URLs.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "./lib/env-file.mjs";
import { devChildEnv, devUrlLines } from "./lib/ports.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** backend/.env, parsed; empty when the file does not exist yet. */
function readBackendEnvFile() {
  const file = path.join(root, "backend", ".env");
  return existsSync(file) ? parseEnv(readFileSync(file, "utf8")) : {};
}
const backendEnvFile = readBackendEnvFile();

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
  const child = spawn(`npm run dev --prefix ${target.dir}`, {
    cwd: root,
    env: devChildEnv(target.name, process.env, backendEnvFile),
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
for (const line of devUrlLines(started, process.env, backendEnvFile)) console.log(`[dev] ${line}`);
console.log(`[dev] started: ${started.join(", ")}. Press Ctrl+C to stop.`);

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
