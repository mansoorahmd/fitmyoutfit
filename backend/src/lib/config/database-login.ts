/**
 * Which user and password the backend logs in to PostgreSQL with, worked out the way `pg`
 * (node-postgres, which Medusa uses through knex) works it out. Plain TypeScript, no imports, so
 * the production checks in build-config.ts can use it before anything connects.
 *
 * Medusa does NOT hand DATABASE_URL to pg unchanged. Before it creates the connection it removes
 * its own `ssl_mode` query parameter (@medusajs/framework, database/pg-connection-loader.js, and the
 * same code in @medusajs/utils, modules-sdk/load-module-database-config.js); see medusaClientUrl
 * below. That rewrite can change the login: its `[^&]*` also eats a `#`, so in
 * `...?ssl_mode=disable#&password=medusa` the `password` parameter moves out of the fragment (where
 * pg ignores it) into the query (where it wins). The result goes to pg as `connectionString`
 * (@medusajs/utils, create-pg-connection.js). With DATABASE_URL unset our config passes
 * `databaseUrl: undefined`, which replaces Medusa's default `postgres://localhost/medusa-starter-default`
 * in defineConfig, so pg gets no connection string at all; neither gives a login, so the result
 * below is the same. (Outside development and test an unset DATABASE_URL is refused anyway:
 * DATABASE_URL_NOT_SET in build-config.ts.) pg then decides, in this order:
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
 * Not covered: a password pg reads from a pgpass file (`PGPASSFILE`, `~/.pgpass`, on Windows
 * `%APPDATA%\postgresql\pgpass.conf`) when none is given any other way (build-config.ts refuses the
 * dev user without an explicit password instead of reading those files), and
 * `databaseDriverOptions.dynamicPassword` (our config sets none).
 *
 * The unit tests compare this with what the installed pg actually resolves, and medusaClientUrl
 * with the rewrite in the installed Medusa.
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
 * The database URL as Medusa hands it to pg: every `ssl_mode` query parameter removed, with the
 * same pattern and replacement as @medusajs/framework's pg-connection-loader.js (and
 * @medusajs/utils' load-module-database-config.js). A unit test runs the rewrite found in the
 * installed files against this one, so a Medusa upgrade that changes it fails there.
 */
export function medusaClientUrl(databaseUrl: string): string {
  return databaseUrl.replace(
    /(\?|&)ssl_mode=[^&]*(&|$)/gi,
    (_match: string, prefix: string, suffix: string) => {
      if (prefix === "?" && suffix === "&") {
        return "?"
      }
      if (prefix === "?" && suffix === "") {
        return ""
      }
      if (prefix === "&") {
        return suffix
      }
      return ""
    }
  )
}

/**
 * Every way DATABASE_URL may be read before pg sees it: as given, trimmed, and each of those after
 * Medusa's rewrite (medusaClientUrl). A check that looks at all of them cannot be fooled by a
 * difference between what it reads and what pg gets. Undefined stays undefined.
 */
export function databaseUrlReadings(databaseUrl: string | undefined): (string | undefined)[] {
  if (databaseUrl === undefined) {
    return [undefined]
  }
  const asGiven = [databaseUrl, databaseUrl.trim()]
  return [...new Set([...asGiven, ...asGiven.map(medusaClientUrl)])]
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
