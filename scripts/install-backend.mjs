#!/usr/bin/env node
// Installs the backend's dependencies into backend/node_modules from backend/package-lock.json.
// Runs automatically at the end of a root `npm install` or `npm ci` (the root `postinstall` script),
// or by hand with `npm run install:backend`.
//
// Why: the backend is not an npm workspace. Medusa's admin needs React 18, the storefront and the
// editor need React 19. In one shared install npm hoisted React 18 to the root, where the
// storefront's libraries picked it up. With its own install the backend keeps one React 18 to itself.
// See docs/decisions/006-react-and-tool-versions.md.
//
// A root `npm ci` runs `npm ci` in backend/ (exact lockfile, as in CI); a root `npm install` runs
// `npm install` there.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backendDir = path.join(root, "backend");
const log = (message) => console.log(`[install-backend] ${message}`);

if (!existsSync(path.join(backendDir, "package.json"))) {
  log("backend/package.json not found: skipping the backend install");
  process.exit(0);
}

const command = process.env.npm_command === "ci" ? "ci" : "install";

// The root npm passes its own settings to lifecycle scripts as npm_* variables (for example the
// root folder as the install prefix, or a --workspace flag). Drop them, and drop the root's
// node_modules/.bin folders from PATH, so this behaves like a plain `npm <command>` typed in backend/.
const rootModules = path.join(root, "node_modules").toLowerCase();
const env = {};
for (const [key, value] of Object.entries(process.env)) {
  if (key.startsWith("npm_")) continue;
  if (key.toUpperCase() === "PATH" && value) {
    env[key] = value
      .split(path.delimiter)
      .filter((entry) => !path.resolve(entry).toLowerCase().startsWith(rootModules))
      .join(path.delimiter);
    continue;
  }
  env[key] = value;
}

log(`npm ${command} in backend/`);
const result = spawnSync(`npm ${command}`, { cwd: backendDir, env, shell: true, stdio: "inherit" });
if (result.error) {
  console.error(`[install-backend] could not run npm: ${result.error.message}`);
  process.exit(1);
}
process.exit(result.status ?? 1);
