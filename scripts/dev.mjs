#!/usr/bin/env node
// `npm run dev`: start the backend and the storefront together.
// A part that does not exist yet (or has no `dev` script) is skipped with a note,
// so this works in a checkout that has only some of the parts.
//
// When a child exits on its own, with any code, dev stops the other one and exits non-zero, naming
// the child that ended; Ctrl+C stops both and exits 0 (scripts/lib/dev-supervisor.mjs).
//
// Ports (scripts/lib/ports.mjs): the backend listens on PORT (from the shell, else backend/.env,
// else 9000), the storefront on STOREFRONT_PORT (from the shell, else 8000). Each child gets its
// port in its environment, and dev prints both URLs.
//
// backend/.env holds MEDUSA_ADMIN_PASSWORD, so this file only ever holds the PORT from it
// (readBackendEnvFilePort), never the parsed file. ESLint (backend/eslint.scripts.config.mjs)
// refuses console.* and process.stdout / process.stderr here, and importing the .env parser:
// dev prints only through `say` / `warn` below and the output helpers in scripts/lib/output.mjs.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDevSupervisor } from "./lib/dev-supervisor.mjs";
import { writeStderr, writeStdout } from "./lib/output.mjs";
import { devChildEnv, devUrlLines, readBackendEnvFilePort } from "./lib/ports.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** dev's own status lines. */
const say = (message) => writeStdout(`[dev] ${message}\n`);
const warn = (message) => writeStderr(`[dev] ${message}\n`);

/** PORT from backend/.env; undefined when the file or the line is missing. */
const backendFilePort = readBackendEnvFilePort(path.join(root, "backend", ".env"));

const targets = [
  { name: "backend", dir: "backend" },
  { name: "storefront", dir: "storefront" },
];

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

const supervisor = createDevSupervisor({
  kill: killTree,
  exit: (code) => process.exit(code),
  warn,
});

/** Pass a child's output on through `write` (writeStdout / writeStderr), each line prefixed. */
function prefixLines(name, stream, write) {
  let buffer = "";
  stream.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) write(`[${name}] ${line}\n`);
  });
  stream.on("end", () => {
    if (buffer) write(`[${name}] ${buffer}\n`);
  });
}

/**
 * The shared packages both servers use, built once, in order, before either server starts: the roster rules,
 * then the editor (whose build needs the rules). Each script builds only what is out of date, so on a second
 * start nothing is rebuilt, and the servers' own `predev` steps then find everything current. Without this,
 * the backend's predev and the storefront's predev built packages/team-rules at the same moment and one of
 * them failed on a fresh clone (each build first deletes dist/).
 */
const sharedBuilds = [
  { name: "team-rules", script: path.join("packages", "team-rules", "scripts", "ensure-built.mjs") },
  { name: "editor", script: path.join("storefront", "scripts", "ensure-editor.mjs"), when: "storefront" },
];
for (const build of sharedBuilds) {
  if (build.when && !hasDevScript(build.when)) continue;
  if (!existsSync(path.join(root, build.script))) continue;
  say(`checking ${build.name} (built only when out of date)`);
  // The build prints its own output; it holds no secret (nothing here reads backend/.env).
  const result = spawnSync(process.execPath, [build.script], { cwd: root, stdio: "inherit" });
  if (result.status !== 0) {
    warn(`building ${build.name} failed (exit ${result.status ?? "none"}); not starting the servers`);
    process.exit(1);
  }
}

const started = [];
for (const target of targets) {
  if (!hasDevScript(target.dir)) {
    warn(`${target.dir}/ not found or has no "dev" script: skipping ${target.name}`);
    continue;
  }
  const child = spawn(`npm run dev --prefix ${target.dir}`, {
    cwd: root,
    env: devChildEnv(target.name, process.env, backendFilePort),
    shell: true,
    stdio: ["inherit", "pipe", "pipe"],
  });
  prefixLines(target.name, child.stdout, writeStdout);
  prefixLines(target.name, child.stderr, writeStderr);
  supervisor.add(target.name, child);
  started.push(target.name);
}

if (started.length === 0) {
  warn("nothing to start");
  process.exit(1);
}
for (const line of devUrlLines(started, process.env, backendFilePort)) say(line);
say(`started: ${started.join(", ")}. Press Ctrl+C to stop.`);

process.on("SIGINT", () => supervisor.stop());
process.on("SIGTERM", () => supervisor.stop());
