// Which ports the backend and the storefront listen on, for the URLs that `npm run setup` and
// `npm run dev` print. Tested in ports.test.mjs. Only readBackendEnvFilePort touches a file.
//
// - Backend: `PORT`, as Medusa reads it. A value in the shell wins over backend/.env, because
//   Medusa loads backend/.env without overriding variables that are already set. Else 9000.
// - Storefront: `STOREFRONT_PORT` from the shell, else 8000. The storefront's `dev` and `start`
//   scripts (storefront/package.json) run storefront/scripts/next-with-port.mjs, which reads it from
//   the environment only (not from a .env file) and passes it to Next.js as `-p`.
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "./env-file.mjs";

export const DEFAULT_BACKEND_PORT = "9000";
export const DEFAULT_STOREFRONT_PORT = "8000";

/** A port value trimmed, or `fallback` when it is unset or blank. */
function portOr(value, fallback) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed === "" ? fallback : trimmed;
}

/**
 * PORT from the env file at `file` (backend/.env), or undefined when the file or the line is
 * missing. Returns only that one value: backend/.env also holds MEDUSA_ADMIN_PASSWORD, so the rest
 * of the parsed file is dropped here and never reaches the caller (`npm run dev` prints lines).
 */
export function readBackendEnvFilePort(file) {
  if (!existsSync(file)) return undefined;
  return parseEnv(readFileSync(file, "utf8")).PORT;
}

/**
 * The backend's port: PORT from `shellEnv` (the process environment), else `filePort` (PORT from
 * backend/.env, see readBackendEnvFilePort), else 9000.
 */
export function backendPort(shellEnv = {}, filePort = undefined) {
  return portOr(shellEnv.PORT, portOr(filePort, DEFAULT_BACKEND_PORT));
}

/** The storefront's port: STOREFRONT_PORT from the process environment, else 8000. */
export function storefrontPort(shellEnv = {}) {
  return portOr(shellEnv.STOREFRONT_PORT, DEFAULT_STOREFRONT_PORT);
}

/** `http://localhost:<port>`. */
export function localUrl(port) {
  return `http://localhost:${port}`;
}

/** A copy of `env` without the variables named in `names` (compared ignoring case, as Windows does). */
function without(env, names) {
  const drop = new Set(names.map((name) => name.toUpperCase()));
  return Object.fromEntries(Object.entries(env).filter(([key]) => !drop.has(key.toUpperCase())));
}

/**
 * The environment `npm run dev` gives each child process, so each listens on the port dev prints.
 * - backend: the shell's environment, with PORT set to `backendPort` (Medusa reads PORT);
 *   `filePort` is PORT from backend/.env (readBackendEnvFilePort).
 * - storefront: the shell's environment with STOREFRONT_PORT set to `storefrontPort`, and without
 *   PORT, which is the backend's (Next.js would otherwise take PORT as its own port).
 */
export function devChildEnv(name, shellEnv = {}, filePort = undefined) {
  if (name === "backend") {
    return { ...without(shellEnv, ["PORT"]), PORT: backendPort(shellEnv, filePort) };
  }
  if (name === "storefront") {
    return {
      ...without(shellEnv, ["PORT", "STOREFRONT_PORT"]),
      STOREFRONT_PORT: storefrontPort(shellEnv),
    };
  }
  return { ...shellEnv };
}

/** The lines `npm run dev` prints for the parts it started: where to open each one. */
export function devUrlLines(started, shellEnv = {}, filePort = undefined) {
  const lines = [];
  if (started.includes("backend")) {
    const url = localUrl(backendPort(shellEnv, filePort));
    lines.push(`backend:    ${url} (admin at ${url}/app)`);
  }
  if (started.includes("storefront")) {
    lines.push(`storefront: ${localUrl(storefrontPort(shellEnv))}`);
  }
  return lines;
}
