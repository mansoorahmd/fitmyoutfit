/**
 * Plain functions that turn environment variables into Medusa configuration.
 * No Medusa imports, so they can be unit tested without booting the app.
 * medusa-config.ts only calls `buildMedusaConfig`.
 */
import {
  databaseHostProblem,
  databaseUrlReadings,
  effectiveDatabaseLogin,
  type DatabaseHostProblem,
  type DatabaseLogin,
} from "./database-login"
import { describeNodeEnv, isLocalNodeEnv } from "./node-env"

export type Env = Record<string, string | undefined>

export type ModuleEntry = {
  resolve: string
  options?: Record<string, unknown>
}

/** Secrets that have a dev-only fallback, in development and test only. */
const DEV_SECRET_FALLBACK = "supersecret"

/**
 * The dev-only values that must never reach production: the defaults committed in
 * backend/.env.example, plus the fallback above. A unit test reads backend/.env.example and
 * fails when a value there is missing from this list, so the two cannot drift apart.
 * (The list lives in code, not in .env.example, because a production build has no
 * .env.example to read.)
 */
export const DEV_ONLY_VALUES: Readonly<Record<string, readonly string[]>> = {
  JWT_SECRET: ["dev-only-jwt-secret-change-in-production", DEV_SECRET_FALLBACK],
  COOKIE_SECRET: ["dev-only-cookie-secret-change-in-production", DEV_SECRET_FALLBACK],
  S3_ACCESS_KEY_ID: ["minioadmin"],
  S3_SECRET_ACCESS_KEY: ["minioadmin"],
  MEDUSA_ADMIN_PASSWORD: ["dev-admin-password"],
}

/** Must be set, and not to a dev-only value, in production. */
const REQUIRED_IN_PRODUCTION = [
  "JWT_SECRET",
  "COOKIE_SECRET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
] as const

/**
 * May be unset in production (the seed creates no dev admin there), but must not hold a
 * dev-only value when it is set.
 */
const NOT_DEV_IN_PRODUCTION = ["MEDUSA_ADMIN_PASSWORD"] as const

/**
 * Shortest JWT_SECRET, COOKIE_SECRET and S3_SECRET_ACCESS_KEY accepted outside development and
 * test. A short secret can be guessed; 16 characters is a floor, not a recommendation (use 32+
 * random characters). Real S3 secret keys are longer anyway (AWS: 40 characters, Cloudflare R2:
 * 64), so the floor only stops placeholders. S3_ACCESS_KEY_ID is an identifier, not a secret, and
 * has no minimum.
 */
export const MIN_SECRET_LENGTH = 16
const MIN_LENGTH_IN_PRODUCTION = ["JWT_SECRET", "COOKIE_SECRET", "S3_SECRET_ACCESS_KEY"] as const

/**
 * Database user and password pairs that are dev-only: the PostgreSQL in docker-compose.yml
 * (POSTGRES_USER / POSTGRES_PASSWORD in the root .env.example, used by DATABASE_URL in
 * backend/.env.example). Compared without regard to case.
 */
export const DEV_DATABASE_CREDENTIALS: readonly { user: string; password: string }[] = [
  { user: "medusa", password: "medusa" },
]

/**
 * The problem reported when DATABASE_URL is unset, empty or only spaces outside development and
 * test. Why it is refused rather than left to Medusa (@medusajs/framework and @medusajs/utils
 * 2.22.6): our config hands Medusa `databaseUrl: undefined`, so its main connection gets no
 * connection string and pg falls back to PGHOST / PGUSER / PGPASSWORD / PGDATABASE (or
 * localhost:5432 as the operating-system user), while the module loader and the migrations read
 * MEDUSA_DATABASE_URL, then a per-module <MODULE>_DATABASE_URL (PRODUCT_DATABASE_URL, ...)
 * instead (utils, load-module-database-config.js). None of those is what the checks below read.
 */
export const DATABASE_URL_NOT_SET =
  "DATABASE_URL is not set. Set it to the production database's connection string, " +
  "postgres://<user>:<password>@<host>:<port>/<database>. MEDUSA_DATABASE_URL, " +
  "<MODULE>_DATABASE_URL and the PG* variables are not used in its place"

/**
 * The problems reported when DATABASE_URL is set but does not name its database server outside
 * development and test (databaseHostProblem in database-login.ts says why each one lets
 * something other than DATABASE_URL choose the server). Never the value itself.
 */
export const DATABASE_HOST_PROBLEMS: Readonly<Record<DatabaseHostProblem, string>> = {
  not_a_url:
    "DATABASE_URL is not a postgres:// connection URL (a socket path or the host=... user=... " +
    "form is not accepted outside development and test). Write it as " +
    "postgres://<user>:<password>@<host>:<port>/<database>, with special characters in the user " +
    "or password percent-encoded (an @ as %40)",
  no_host:
    "DATABASE_URL names no database host after the @, so the PostgreSQL driver would take the " +
    "server from PGHOST or its default instead. Write the server's host name or IP address " +
    "after the @: postgres://<user>:<password>@<host>:<port>/<database>",
  host_parameter:
    "DATABASE_URL has a host or hostaddr query parameter, which would choose the database " +
    "server in place of the host after the @. Remove the parameter and write the server's host " +
    "after the @: postgres://<user>:<password>@<host>:<port>/<database>",
}

export class ConfigError extends Error {}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

/**
 * True when the production checks apply: every NODE_ENV other than unset, `development` and
 * `test` (so `production`, `prod`, `staging` and typos all count). See node-env.ts.
 */
export function requiresProductionSecrets(env: Env): boolean {
  return !isLocalNodeEnv(env.NODE_ENV)
}

/**
 * A dev value shorter than this counts only when a secret is exactly that value, not when a secret
 * merely contains it. A 64-character random secret contains a given 8-character string by chance
 * with a probability well under one in ten million (worst case: hex secret, hex-only string), but it
 * could well contain a 3- or 4-character word, so a short dev value added to DEV_ONLY_VALUES later
 * must not start refusing real secrets. (Every dev value today is 10 characters or longer, so
 * today every one of them is also looked for inside secrets.)
 */
export const MIN_CONTAINED_DEV_VALUE_LENGTH = 8

/** How a value matches the dev-only values, and whose dev values it matches. */
export type DevValueMatch = {
  /** `"is"`: the value is a dev value; `"contains"`: it has one inside it. */
  kind: "is" | "contains"
  /** The variables whose dev value matched (a dev value can belong to more than one). */
  variables: string[]
}

/**
 * Whether `value` is a dev-only value of any variable in `devValues` (`"is"`), has one inside it
 * (`"contains"`: a dev value with something added before or after, such as
 * `dev-only-jwt-secret-change-in-production1`), or neither (`undefined`). The dev values of every
 * variable count, so a dev value moved to another variable (the dev COOKIE_SECRET as JWT_SECRET) is
 * caught too. Compared trimmed and without regard to case, so `SUPERSECRET` and ` MinioAdmin `
 * count. Dev values shorter than MIN_CONTAINED_DEV_VALUE_LENGTH count only as `"is"`.
 */
export function devValueMatch(
  value: string,
  devValues: Readonly<Record<string, readonly string[]>> = DEV_ONLY_VALUES
): DevValueMatch | undefined {
  const normalized = value.trim().toLowerCase()
  const entries = Object.entries(devValues).flatMap(([variable, values]) =>
    values.map((dev) => ({ variable, dev: dev.trim().toLowerCase() }))
  ).filter(({ dev }) => dev !== "")
  const whose = (matches: { variable: string }[]) => [
    ...new Set(matches.map(({ variable }) => variable)),
  ]
  const exact = entries.filter(({ dev }) => dev === normalized)
  if (exact.length > 0) {
    return { kind: "is", variables: whose(exact) }
  }
  const inside = entries.filter(
    ({ dev }) => dev.length >= MIN_CONTAINED_DEV_VALUE_LENGTH && normalized.includes(dev)
  )
  if (inside.length > 0) {
    return { kind: "contains", variables: whose(inside) }
  }
  return undefined
}

function devValueProblem(name: string, value: string): string | undefined {
  const match = devValueMatch(value)
  if (!match) {
    return undefined
  }
  // Name the other variable when the value is not this variable's own dev value. Never the value.
  const own = match.variables.includes(name)
  const verb = match.kind === "is" ? "is" : "contains"
  return own
    ? `${name} ${verb} a dev-only value (from .env.example)`
    : `${name} ${verb} the dev-only value of ${match.variables.join(" and ")} (from .env.example)`
}

/**
 * The logins pg could use for `databaseUrl`, one per reading of it (as given, trimmed, and after
 * Medusa's `ssl_mode` rewrite: databaseUrlReadings in database-login.ts). A reading pg cannot parse
 * gives no login.
 */
function possibleDatabaseLogins(databaseUrl: string | undefined, env: Env): DatabaseLogin[] {
  return databaseUrlReadings(databaseUrl)
    .map((reading) => effectiveDatabaseLogin(reading || undefined, env))
    .filter((login): login is DatabaseLogin => login !== null)
}

function isDevDatabaseUser(user: string | undefined): boolean {
  const normalized = user?.trim().toLowerCase()
  return (
    normalized !== undefined &&
    DEV_DATABASE_CREDENTIALS.some((dev) => dev.user.toLowerCase() === normalized)
  )
}

/**
 * True when the backend would log in to PostgreSQL with a dev-only user and password (such as
 * medusa / medusa), wherever pg would take them from: the user and password in DATABASE_URL, its
 * `user` and `password` query parameters (which win), or PGUSER / PGPASSWORD (see
 * database-login.ts). DATABASE_URL is read as given, trimmed, and after Medusa's `ssl_mode`
 * rewrite; any reading counts. Compared trimmed, percent-decoded and without regard to case.
 */
export function usesDevDatabaseCredentials(databaseUrl: string | undefined, env: Env = {}): boolean {
  return possibleDatabaseLogins(databaseUrl, env).some((login) => {
    if (!login.user || !login.password) {
      return false
    }
    const user = login.user.trim().toLowerCase()
    const password = login.password.trim().toLowerCase()
    return DEV_DATABASE_CREDENTIALS.some(
      (dev) => dev.user.toLowerCase() === user && dev.password.toLowerCase() === password
    )
  })
}

/**
 * True when the backend would log in as a dev-only database user (such as `medusa`) with no
 * password in DATABASE_URL or PGPASSWORD (in any reading, as above). pg would then take the
 * password from a pgpass file (PGPASSFILE, ~/.pgpass, or on Windows
 * %APPDATA%\postgresql\pgpass.conf even with no variable set), which this check does not read, so
 * the dev user counts only with an explicit password.
 */
export function usesDevDatabaseUserWithoutPassword(
  databaseUrl: string | undefined,
  env: Env = {}
): boolean {
  return possibleDatabaseLogins(databaseUrl, env).some(
    (login) => isDevDatabaseUser(login.user) && !login.password
  )
}

/**
 * Problems with the secrets for a start outside development and test. Empty in development and
 * test, or when every secret is set, long enough, and not a dev-only value.
 */
export function productionSecretProblems(env: Env): string[] {
  if (!requiresProductionSecrets(env)) {
    return []
  }
  const problems: string[] = []
  for (const name of REQUIRED_IN_PRODUCTION) {
    const value = clean(env[name])
    const devProblem = value ? devValueProblem(name, value) : undefined
    if (!value) {
      problems.push(`${name} is not set`)
    } else if (devProblem) {
      problems.push(devProblem)
    } else if (
      (MIN_LENGTH_IN_PRODUCTION as readonly string[]).includes(name) &&
      value.length < MIN_SECRET_LENGTH
    ) {
      problems.push(`${name} is shorter than ${MIN_SECRET_LENGTH} characters`)
    }
  }
  for (const name of NOT_DEV_IN_PRODUCTION) {
    const value = clean(env[name])
    const devProblem = value ? devValueProblem(name, value) : undefined
    if (devProblem) {
      problems.push(devProblem)
    }
  }
  const databaseUrl = clean(env.DATABASE_URL)
  if (!databaseUrl) {
    problems.push(DATABASE_URL_NOT_SET)
  } else {
    const hostProblem = databaseHostProblem(env.DATABASE_URL ?? databaseUrl)
    if (hostProblem) {
      problems.push(DATABASE_HOST_PROBLEMS[hostProblem])
    }
  }
  if (env.DATABASE_URL?.includes("#")) {
    problems.push(
      "DATABASE_URL contains a '#'. Medusa and the PostgreSQL driver read the part after it " +
        "differently, so it is refused: write a '#' in the password as %23"
    )
  }
  if (usesDevDatabaseCredentials(env.DATABASE_URL, env)) {
    problems.push(
      "DATABASE_URL uses the dev-only database user and password (from .env.example), " +
        "in the URL, its user / password parameters, or PGUSER / PGPASSWORD"
    )
  } else if (usesDevDatabaseUserWithoutPassword(env.DATABASE_URL, env)) {
    problems.push(
      "DATABASE_URL logs in as the dev-only database user (from .env.example) with no password " +
        "in DATABASE_URL or PGPASSWORD, so the PostgreSQL driver would take one from a pgpass " +
        "file, which is not checked: give the password explicitly in DATABASE_URL or PGPASSWORD, " +
        "or use a different database user"
    )
  }
  return problems
}

/** Throws one ConfigError listing every problem, so a production start fails fast. */
export function assertProductionSecrets(env: Env): void {
  const problems = productionSecretProblems(env)
  if (problems.length > 0) {
    throw new ConfigError(
      `Refusing to start with NODE_ENV=${describeNodeEnv(env.NODE_ENV)}:\n- ${problems.join("\n- ")}\n` +
        "Every NODE_ENV other than development and test needs real values. " +
        "The values in .env.example are for local development only."
    )
  }
}

function secret(env: Env, name: string): string {
  const value = clean(env[name])
  if (value) {
    return value
  }
  if (requiresProductionSecrets(env)) {
    throw new ConfigError(
      `${name} must be set when NODE_ENV is ${describeNodeEnv(env.NODE_ENV)} (only development and test have a fallback)`
    )
  }
  return DEV_SECRET_FALLBACK
}

export function buildHttpConfig(env: Env) {
  return {
    storeCors: env.STORE_CORS ?? "",
    adminCors: env.ADMIN_CORS ?? "",
    authCors: env.AUTH_CORS ?? "",
    jwtSecret: secret(env, "JWT_SECRET"),
    cookieSecret: secret(env, "COOKIE_SECRET"),
  }
}

/**
 * Redis-backed infrastructure modules, only when REDIS_URL is set.
 * Without it Medusa falls back to its in-memory cache, event bus and workflow engine.
 */
export function buildRedisModules(env: Env): ModuleEntry[] {
  const redisUrl = clean(env.REDIS_URL)
  if (!redisUrl) {
    return []
  }
  return [
    { resolve: "@medusajs/medusa/cache-redis", options: { redisUrl } },
    { resolve: "@medusajs/medusa/event-bus-redis", options: { redisUrl } },
    {
      resolve: "@medusajs/medusa/workflow-engine-redis",
      options: { redis: { redisUrl } },
    },
  ]
}

const S3_REQUIRED = [
  "S3_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "S3_FILE_URL",
] as const

/**
 * The S3 file provider, only when the S3_* variables are set.
 * Without them Medusa uses the local file provider (files in backend/static).
 * When S3_ENDPOINT is set (MinIO, R2 and similar) path-style addressing is turned on,
 * because those servers do not serve buckets as sub-domains.
 */
export function buildFileModules(env: Env): ModuleEntry[] {
  const missing = S3_REQUIRED.filter((name) => !clean(env[name]))
  if (missing.length === S3_REQUIRED.length) {
    return []
  }
  if (missing.length > 0) {
    throw new ConfigError(
      `S3 file storage is partly configured. Missing: ${missing.join(", ")}`
    )
  }
  const endpoint = clean(env.S3_ENDPOINT)
  return [
    {
      resolve: "@medusajs/medusa/file",
      options: {
        providers: [
          {
            resolve: "@medusajs/medusa/file-s3",
            id: "s3",
            options: {
              file_url: clean(env.S3_FILE_URL),
              access_key_id: clean(env.S3_ACCESS_KEY_ID),
              secret_access_key: clean(env.S3_SECRET_ACCESS_KEY),
              region: clean(env.S3_REGION) ?? "us-east-1",
              bucket: clean(env.S3_BUCKET),
              ...(endpoint ? { endpoint } : {}),
              additional_client_config: endpoint ? { forcePathStyle: true } : {},
            },
          },
        ],
      },
    },
  ]
}

/**
 * The payment module with our own providers. Medusa always registers its placeholder provider
 * `pp_system_default` as well; a provider listed here is registered as `pp_<identifier>_<id>`,
 * so cash on delivery (identifier "cod", id "cod") is `pp_cod_cod`. Which region may use which
 * provider is seed data (scripts/seed-data/regions.ts).
 * The path is relative to the directory Medusa runs in (backend/, or .medusa/server after a build).
 */
export function buildPaymentModules(): ModuleEntry[] {
  return [
    {
      resolve: "@medusajs/medusa/payment",
      options: {
        providers: [{ resolve: "./src/modules/cod", id: "cod" }],
      },
    },
  ]
}

export function buildModules(env: Env): ModuleEntry[] {
  return [...buildRedisModules(env), ...buildFileModules(env), ...buildPaymentModules()]
}

/**
 * The whole Medusa configuration (what medusa-config.ts passes to `defineConfig`).
 * In production it first refuses missing or dev-only secrets.
 */
export function buildMedusaConfig(env: Env) {
  assertProductionSecrets(env)
  return {
    projectConfig: {
      databaseUrl: env.DATABASE_URL,
      redisUrl: clean(env.REDIS_URL),
      http: buildHttpConfig(env),
    },
    modules: buildModules(env),
  }
}
