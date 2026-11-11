// Which ports the backend and the storefront listen on, for the URLs that `npm run setup` and
// `npm run dev` print. Plain functions with no side effects, tested in ports.test.mjs.
//
// - Backend: `PORT`, as Medusa reads it. A value in the shell wins over backend/.env, because
//   Medusa loads backend/.env without overriding variables that are already set. Else 9000.
// - Storefront: `STOREFRONT_PORT` from the shell (storefront/package.json reads it), else 8000.

export const DEFAULT_BACKEND_PORT = "9000";
export const DEFAULT_STOREFRONT_PORT = "8000";

/** A port value trimmed, or `fallback` when it is unset or blank. */
function portOr(value, fallback) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed === "" ? fallback : trimmed;
}

/**
 * The backend's port: PORT from `shellEnv` (the process environment), else PORT from
 * `backendEnvFile` (the parsed backend/.env), else 9000.
 */
export function backendPort(shellEnv = {}, backendEnvFile = {}) {
  return portOr(shellEnv.PORT, portOr(backendEnvFile.PORT, DEFAULT_BACKEND_PORT));
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
 * - backend: the shell's environment, with PORT set to `backendPort` (Medusa reads PORT).
 * - storefront: the shell's environment with STOREFRONT_PORT set to `storefrontPort`, and without
 *   PORT, which is the backend's (Next.js would otherwise take PORT as its own port).
 */
export function devChildEnv(name, shellEnv = {}, backendEnvFile = {}) {
  if (name === "backend") {
    return { ...without(shellEnv, ["PORT"]), PORT: backendPort(shellEnv, backendEnvFile) };
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
export function devUrlLines(started, shellEnv = {}, backendEnvFile = {}) {
  const lines = [];
  if (started.includes("backend")) {
    const url = localUrl(backendPort(shellEnv, backendEnvFile));
    lines.push(`backend:    ${url} (admin at ${url}/app)`);
  }
  if (started.includes("storefront")) {
    lines.push(`storefront: ${localUrl(storefrontPort(shellEnv))}`);
  }
  return lines;
}
