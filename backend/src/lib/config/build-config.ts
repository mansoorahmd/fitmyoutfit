/**
 * Plain functions that turn environment variables into Medusa configuration.
 * No Medusa imports, so they can be unit tested without booting the app.
 * medusa-config.ts only calls `buildMedusaConfig`.
 */

export type Env = Record<string, string | undefined>

export type ModuleEntry = {
  resolve: string
  options?: Record<string, unknown>
}

/** Secrets that have a dev-only fallback outside production. */
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

export class ConfigError extends Error {}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

export function isProduction(env: Env): boolean {
  return clean(env.NODE_ENV) === "production"
}

/**
 * Problems with the secrets for a production start. Empty outside production, or when every
 * secret is set to something other than a dev-only value.
 */
export function productionSecretProblems(env: Env): string[] {
  if (!isProduction(env)) {
    return []
  }
  const problems: string[] = []
  const isDevValue = (name: string, value: string) =>
    (DEV_ONLY_VALUES[name] ?? []).includes(value)
  for (const name of REQUIRED_IN_PRODUCTION) {
    const value = clean(env[name])
    if (!value) {
      problems.push(`${name} is not set`)
    } else if (isDevValue(name, value)) {
      problems.push(`${name} is a dev-only value (from .env.example)`)
    }
  }
  for (const name of NOT_DEV_IN_PRODUCTION) {
    const value = clean(env[name])
    if (value && isDevValue(name, value)) {
      problems.push(`${name} is a dev-only value (from .env.example)`)
    }
  }
  return problems
}

/** Throws one ConfigError listing every problem, so a production start fails fast. */
export function assertProductionSecrets(env: Env): void {
  const problems = productionSecretProblems(env)
  if (problems.length > 0) {
    throw new ConfigError(
      `Refusing to start with NODE_ENV=production:\n- ${problems.join("\n- ")}\n` +
        "Set real values in the production environment. The values in .env.example are for local development only."
    )
  }
}

function secret(env: Env, name: string): string {
  const value = clean(env[name])
  if (value) {
    return value
  }
  if (isProduction(env)) {
    throw new ConfigError(`${name} must be set in production`)
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
