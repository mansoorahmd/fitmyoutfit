/**
 * Plain functions that turn environment variables into Medusa configuration.
 * No Medusa imports, so they can be unit tested without booting the app.
 * medusa-config.ts only calls `buildMedusaConfig`.
 */
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
 * Shortest JWT_SECRET and COOKIE_SECRET accepted outside development and test. A short secret
 * can be guessed; 16 characters is a floor, not a recommendation (use 32+ random characters).
 */
export const MIN_SECRET_LENGTH = 16
const MIN_LENGTH_IN_PRODUCTION = ["JWT_SECRET", "COOKIE_SECRET"] as const

/**
 * Database user and password pairs that are dev-only: the PostgreSQL in docker-compose.yml
 * (POSTGRES_USER / POSTGRES_PASSWORD in the root .env.example, used by DATABASE_URL in
 * backend/.env.example). Compared without regard to case.
 */
export const DEV_DATABASE_CREDENTIALS: readonly { user: string; password: string }[] = [
  { user: "medusa", password: "medusa" },
]

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

/** Dev-only values are compared trimmed and without regard to case (`SUPERSECRET` is refused). */
function isDevValue(name: string, value: string): boolean {
  const normalized = value.trim().toLowerCase()
  return (DEV_ONLY_VALUES[name] ?? []).some((dev) => dev.toLowerCase() === normalized)
}

/** True when DATABASE_URL logs in with a dev-only user and password (such as medusa:medusa). */
export function usesDevDatabaseCredentials(databaseUrl: string | undefined): boolean {
  const url = clean(databaseUrl)
  if (!url) {
    return false
  }
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  const decode = (part: string) => {
    try {
      return decodeURIComponent(part)
    } catch {
      return part
    }
  }
  const user = decode(parsed.username).trim().toLowerCase()
  const password = decode(parsed.password).trim().toLowerCase()
  return DEV_DATABASE_CREDENTIALS.some(
    (dev) => dev.user.toLowerCase() === user && dev.password.toLowerCase() === password
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
    if (!value) {
      problems.push(`${name} is not set`)
    } else if (isDevValue(name, value)) {
      problems.push(`${name} is a dev-only value (from .env.example)`)
    } else if (
      (MIN_LENGTH_IN_PRODUCTION as readonly string[]).includes(name) &&
      value.length < MIN_SECRET_LENGTH
    ) {
      problems.push(`${name} is shorter than ${MIN_SECRET_LENGTH} characters`)
    }
  }
  for (const name of NOT_DEV_IN_PRODUCTION) {
    const value = clean(env[name])
    if (value && isDevValue(name, value)) {
      problems.push(`${name} is a dev-only value (from .env.example)`)
    }
  }
  if (usesDevDatabaseCredentials(env.DATABASE_URL)) {
    problems.push("DATABASE_URL uses the dev-only database user and password (from .env.example)")
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

export function buildModules(env: Env): ModuleEntry[] {
  return [...buildRedisModules(env), ...buildFileModules(env)]
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
