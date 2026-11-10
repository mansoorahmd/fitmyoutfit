/**
 * Plain functions that turn environment variables into Medusa configuration.
 * No Medusa imports, so they can be unit tested without booting the app.
 * medusa-config.ts only calls these.
 */

export type Env = Record<string, string | undefined>

export type ModuleEntry = {
  resolve: string
  options?: Record<string, unknown>
}

/** Secrets that have a dev-only fallback outside production. */
const DEV_SECRET_FALLBACK = "supersecret"

export class ConfigError extends Error {}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function secret(env: Env, name: string): string {
  const value = clean(env[name])
  if (value) {
    return value
  }
  if (env.NODE_ENV === "production") {
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
