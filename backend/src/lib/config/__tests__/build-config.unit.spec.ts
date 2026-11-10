import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  buildFileModules,
  buildHttpConfig,
  buildMedusaConfig,
  buildModules,
  buildRedisModules,
  ConfigError,
  DEV_ONLY_VALUES,
  productionSecretProblems,
} from "../build-config"

/** KEY=value pairs from backend/.env.example (the committed dev defaults). */
function readEnvExample(): Record<string, string> {
  const text = readFileSync(join(__dirname, "..", "..", "..", "..", ".env.example"), "utf8")
  const values: Record<string, string> = {}
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)=(.*)$/.exec(line)
    if (match) {
      values[match[1]] = match[2].trim()
    }
  }
  return values
}

/** A production environment with real-looking secrets everywhere. */
const goodProductionEnv = {
  NODE_ENV: "production",
  DATABASE_URL: "postgres://user:pw@db:5432/medusa",
  JWT_SECRET: "a-long-random-jwt-secret",
  COOKIE_SECRET: "a-long-random-cookie-secret",
  S3_BUCKET: "fitmyoutfit-prod",
  S3_ACCESS_KEY_ID: "AKIAREALKEY",
  S3_SECRET_ACCESS_KEY: "real-secret-access-key",
  S3_FILE_URL: "https://files.example.com",
}

const s3Env = {
  S3_ENDPOINT: "http://localhost:9100",
  S3_BUCKET: "fitmyoutfit-dev",
  S3_REGION: "us-east-1",
  S3_ACCESS_KEY_ID: "key",
  S3_SECRET_ACCESS_KEY: "secret",
  S3_FILE_URL: "http://localhost:9100/fitmyoutfit-dev",
}

describe("buildRedisModules", () => {
  it("returns nothing when REDIS_URL is not set", () => {
    expect(buildRedisModules({})).toEqual([])
    expect(buildRedisModules({ REDIS_URL: "  " })).toEqual([])
  })

  it("registers cache, event bus and workflow engine on REDIS_URL", () => {
    const modules = buildRedisModules({ REDIS_URL: "redis://localhost:6379" })
    expect(modules.map((m) => m.resolve)).toEqual([
      "@medusajs/medusa/cache-redis",
      "@medusajs/medusa/event-bus-redis",
      "@medusajs/medusa/workflow-engine-redis",
    ])
    expect(modules[0].options).toEqual({ redisUrl: "redis://localhost:6379" })
    expect(modules[2].options).toEqual({
      redis: { redisUrl: "redis://localhost:6379" },
    })
  })
})

describe("buildFileModules", () => {
  it("returns nothing when no S3 variable is set", () => {
    expect(buildFileModules({})).toEqual([])
  })

  it("uses the S3 provider with path-style addressing when an endpoint is set", () => {
    const [fileModule] = buildFileModules(s3Env)
    expect(fileModule.resolve).toBe("@medusajs/medusa/file")
    const [provider] = (fileModule.options as { providers: any[] }).providers
    expect(provider.resolve).toBe("@medusajs/medusa/file-s3")
    expect(provider.options).toMatchObject({
      bucket: "fitmyoutfit-dev",
      endpoint: "http://localhost:9100",
      file_url: "http://localhost:9100/fitmyoutfit-dev",
      additional_client_config: { forcePathStyle: true },
    })
  })

  it("leaves path-style off and omits the endpoint for plain AWS S3", () => {
    const { S3_ENDPOINT: _omit, ...awsEnv } = s3Env
    const [fileModule] = buildFileModules(awsEnv)
    const [provider] = (fileModule.options as { providers: any[] }).providers
    expect(provider.options.endpoint).toBeUndefined()
    expect(provider.options.additional_client_config).toEqual({})
  })

  it("refuses a half-configured S3 setup instead of silently using local files", () => {
    expect(() => buildFileModules({ S3_BUCKET: "x" })).toThrow(ConfigError)
  })
})

describe("buildHttpConfig", () => {
  it("falls back to dev secrets outside production", () => {
    const config = buildHttpConfig({ NODE_ENV: "development" })
    expect(config.jwtSecret).toBe("supersecret")
    expect(config.cookieSecret).toBe("supersecret")
  })

  it("requires real secrets in production", () => {
    expect(() => buildHttpConfig({ NODE_ENV: "production" })).toThrow(
      "JWT_SECRET must be set in production"
    )
    const config = buildHttpConfig({
      NODE_ENV: "production",
      JWT_SECRET: "a",
      COOKIE_SECRET: "b",
    })
    expect(config.jwtSecret).toBe("a")
  })
})

describe("production secrets", () => {
  const devValues = readEnvExample()

  it("starts in production with real secrets, and with no admin password at all", () => {
    expect(productionSecretProblems(goodProductionEnv)).toEqual([])
    const config = buildMedusaConfig(goodProductionEnv)
    expect(config.projectConfig.http.jwtSecret).toBe("a-long-random-jwt-secret")
  })

  it.each(["JWT_SECRET", "COOKIE_SECRET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"])(
    "refuses to start in production when %s is missing or blank",
    (name) => {
      const env = { ...goodProductionEnv, [name]: undefined }
      expect(() => buildMedusaConfig(env)).toThrow(ConfigError)
      expect(() => buildMedusaConfig(env)).toThrow(`${name} is not set`)
      expect(() => buildMedusaConfig({ ...goodProductionEnv, [name]: "  " })).toThrow(
        `${name} is not set`
      )
    }
  )

  it.each([
    "JWT_SECRET",
    "COOKIE_SECRET",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
    "MEDUSA_ADMIN_PASSWORD",
  ])("refuses to start in production when %s has the dev value from .env.example", (name) => {
    expect(devValues[name]).toBeTruthy()
    const env = { ...goodProductionEnv, [name]: devValues[name] }
    expect(() => buildMedusaConfig(env)).toThrow(`${name} is a dev-only value`)
  })

  it("refuses the whole dev .env.example in production and lists every problem at once", () => {
    const env = { ...devValues, NODE_ENV: "production" }
    const problems = productionSecretProblems(env)
    expect(problems).toHaveLength(5)
    expect(() => buildMedusaConfig(env)).toThrow(/JWT_SECRET[\s\S]*MEDUSA_ADMIN_PASSWORD/)
  })

  it("refuses the built-in 'supersecret' fallback as a production secret", () => {
    expect(() =>
      buildMedusaConfig({ ...goodProductionEnv, JWT_SECRET: "supersecret" })
    ).toThrow("JWT_SECRET is a dev-only value")
  })

  it("knows every secret value in .env.example (the list cannot drift from the file)", () => {
    for (const name of Object.keys(DEV_ONLY_VALUES)) {
      expect(DEV_ONLY_VALUES[name]).toContain(devValues[name])
    }
  })

  it("accepts the dev values outside production", () => {
    expect(productionSecretProblems({ ...devValues, NODE_ENV: "development" })).toEqual([])
    expect(productionSecretProblems({ ...devValues, NODE_ENV: "test" })).toEqual([])
    expect(() => buildMedusaConfig({ ...devValues, NODE_ENV: "development" })).not.toThrow()
  })
})

describe("buildMedusaConfig", () => {
  it("passes the database and Redis URLs through, and leaves Redis out when unset", () => {
    const config = buildMedusaConfig({
      DATABASE_URL: "postgres://x/y",
      REDIS_URL: "redis://r:6379",
    })
    expect(config.projectConfig.databaseUrl).toBe("postgres://x/y")
    expect(config.projectConfig.redisUrl).toBe("redis://r:6379")
    expect(buildMedusaConfig({ REDIS_URL: "" }).projectConfig.redisUrl).toBeUndefined()
  })
})

describe("buildModules", () => {
  it("combines redis and file modules", () => {
    const modules = buildModules({ ...s3Env, REDIS_URL: "redis://x:6379" })
    expect(modules).toHaveLength(4)
  })
})
