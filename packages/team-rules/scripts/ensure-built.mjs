// Builds @fitmyoutfit/team-rules (`npm run build`: clean, compile, check) only when its dist is missing or older
// than its source, and never in two processes at once. The backend's scripts (build:rules), the storefront's
// ensure-editor and the root `npm run dev` call this file instead of the build itself.
//
// Why: the build starts by deleting dist/. When the backend's predev and the storefront's predev (through the
// editor's build) both built the package at the same moment, one deleted the files the other was checking, and
// `npm run dev` failed on a fresh clone (ERR_MODULE_NOT_FOUND .../dist/esm/index.js from check-entrypoints.mjs).
//
// How: a lock folder in the system's temp folder, one per checkout (mkdir is atomic). A second caller waits for
// the first, then finds dist current and builds nothing. A lock left by a process that died is taken over after
// LOCK_STALE_MS. A current dist is left alone (nothing is cleaned or rebuilt).
//
// `--force` builds even when dist is current (for a release build that must not trust file times).
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rules = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const built = ["dist/esm/index.js", "dist/esm/index.d.ts", "dist/cjs/index.js", "dist/cjs/index.d.ts", "dist/cjs/package.json"].map((f) =>
  resolve(rules, f),
);
const inputs = ["package.json", "tsconfig.json", "tsconfig.build.json", "tsconfig.build.cjs.json"].map((f) => resolve(rules, f));

/** How long a lock may be held before it counts as left behind by a process that died. */
const LOCK_STALE_MS = 5 * 60 * 1000;
/** How long a caller waits for another build in all. */
const WAIT_MS = 10 * 60 * 1000;

const lock = resolve(tmpdir(), `fitmyoutfit-team-rules-build-${createHash("sha256").update(rules).digest("hex").slice(0, 16)}.lock`);

/** The newest modification time among the files under a folder (0 when it is missing). */
function newest(dir) {
  if (!existsSync(dir)) return 0;
  let t = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    t = Math.max(t, entry.isDirectory() ? newest(path) : statSync(path).mtimeMs);
  }
  return t;
}

/** True when a built file is missing or older than the newest source or build setting. */
function isStale() {
  const sources = Math.max(newest(resolve(rules, "src")), ...inputs.filter((f) => existsSync(f)).map((f) => statSync(f).mtimeMs));
  return built.some((f) => !existsSync(f) || statSync(f).mtimeMs < sources);
}

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function takeLock() {
  const started = Date.now();
  for (;;) {
    try {
      mkdirSync(lock);
      return;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
    }
    try {
      if (Date.now() - statSync(lock).mtimeMs > LOCK_STALE_MS) {
        rmSync(lock, { recursive: true, force: true });
        continue;
      }
    } catch {
      continue; // the lock went away between the two calls: try again
    }
    if (Date.now() - started > WAIT_MS) {
      console.error(`[team-rules] another build has held ${lock} for too long; remove it if no build is running`);
      process.exit(1);
    }
    sleep(250);
  }
}

const force = process.argv.includes("--force");
if (!force && !isStale()) process.exit(0);

takeLock();
let status = 0;
try {
  // Checked again under the lock: another process may have built it while this one waited.
  if (force || isStale()) {
    console.log("[team-rules] building @fitmyoutfit/team-rules");
    const result = spawnSync("npm", ["run", "build"], { cwd: rules, stdio: "inherit", shell: true });
    status = result.status ?? 1;
  }
} finally {
  rmSync(lock, { recursive: true, force: true });
}
process.exit(status);
