/**
 * Which user and password the backend logs in to PostgreSQL with, worked out the way `pg`
 * (node-postgres, which Medusa uses through knex) works it out. Plain TypeScript, no imports, so
 * the production checks in build-config.ts can use it before anything connects.
 *
 * Medusa hands DATABASE_URL to pg unchanged, as `connectionString` (@medusajs/utils,
 * create-pg-connection.js; with DATABASE_URL unset, Medusa uses
 * `postgres://localhost/medusa-starter-default`). pg then decides, in this order:
 *
 * 1. pg-connection-string `parse()`: a string starting with `/` is a Unix socket path and has no
 *    login. Anything else is read as a URL relative to `postgres://base`, so a string that is not
 *    a URL at all (`not a url`, or libpq's `host=... user=... password=...` keyword form, which pg
 *    does not support) is read as a path and also has no login. A URL with an empty host
 *    (`postgres://u:p@/db`) is read again with a dummy host. The `user` and `password` query
 *    parameters win over the user and password before the `@`; when a parameter is repeated, the
 *    last one counts.
 * 2. pg's ConnectionParameters: a user or password still empty after that comes from `PGUSER` /
 *    `PGPASSWORD`; a user still empty is the operating-system user (`USERNAME` on Windows, `USER`
 *    elsewhere).
 *
 * Not covered: a password pg reads from a pgpass file (`PGPASSFILE`, `~/.pgpass`) when none is
 * given any other way, and `databaseDriverOptions.dynamicPassword` (our config sets none).
 *
 * The unit tests compare this with what the installed pg actually resolves.
 */
import type { Env } from "./build-config"

export type DatabaseLogin = {
  /** The user pg logs in as; undefined when it would have none. */
  user: string | undefined
  /** The password pg sends; undefined when it would send none (it then tries a pgpass file). */
  password: string | undefined
}

/** The base pg-connection-string resolves a connection string against. */
const PARSE_BASE = "postgres://base"

function decode(part: string): string {
  try {
    return decodeURIComponent(part)
  } catch {
    return part
  }
}

/** The last value of a query parameter, as pg-connection-string keeps it; "" when absent. */
function lastParam(url: URL, name: string): string {
  const values = url.searchParams.getAll(name)
  return values.length > 0 ? values[values.length - 1] : ""
}

/**
 * The user and password a connection string itself holds ("" for a part it does not give), as
 * pg-connection-string reads them. Null when pg cannot read the string at all (pg then throws and
 * the backend does not connect).
 */
export function connectionStringLogin(
  connectionString: string
): { user: string; password: string } | null {
  let str = connectionString
  if (str.charAt(0) === "/") {
    return { user: "", password: "" }
  }
  // pg-connection-string encodes spaces and stray % signs before parsing, the same way.
  if (/ |%[^a-f0-9]|%[a-f0-9][^a-f0-9]/i.test(str)) {
    str = encodeURI(str).replace(/%25(\d\d)/g, "%$1")
  }
  let url: URL
  try {
    try {
      url = new URL(str, PARSE_BASE)
    } catch {
      url = new URL(str.replace("@/", "@___DUMMY___/"), PARSE_BASE)
    }
  } catch {
    return null
  }
  return {
    user: lastParam(url, "user") || decode(url.username),
    password: lastParam(url, "password") || decode(url.password),
  }
}

/**
 * The login pg would use for `databaseUrl` with the environment `env` (in the backend this is
 * process.env). Null only when pg could not read the connection string. `platform` decides which
 * variable holds the operating-system user, as in pg's defaults.
 */
export function effectiveDatabaseLogin(
  databaseUrl: string | undefined,
  env: Env,
  platform: string = process.platform
): DatabaseLogin | null {
  const fromString = databaseUrl ? connectionStringLogin(databaseUrl) : { user: "", password: "" }
  if (!fromString) {
    return null
  }
  const osUser = platform === "win32" ? env.USERNAME : env.USER
  return {
    user: fromString.user || env.PGUSER || osUser || undefined,
    password: fromString.password || env.PGPASSWORD || undefined,
  }
}
