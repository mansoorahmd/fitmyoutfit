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
  devValueMatch,
  MIN_SECRET_LENGTH,
  productionSecretProblems,
  usesDevDatabaseCredentials,
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
    expect(() => buildHttpConfig({ NODE_ENV: "production" })).toThrow("JWT_SECRET must be set")
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
    expect(problems).toHaveLength(6)
    expect(() => buildMedusaConfig(env)).toThrow(
      /JWT_SECRET[\s\S]*MEDUSA_ADMIN_PASSWORD[\s\S]*DATABASE_URL/
    )
  })

  // Medusa runs in production mode for "production" and "prod"; staging and anything else
  // that is not development or test gets the same checks.
  it.each(["prod", "PRODUCTION", " production ", "Prod", "staging", "qa"])(
    "refuses the dev .env.example when NODE_ENV is %j",
    (nodeEnv) => {
      const env = { ...devValues, NODE_ENV: nodeEnv }
      expect(productionSecretProblems(env)).toHaveLength(6)
      expect(() => buildMedusaConfig(env)).toThrow(ConfigError)
      expect(() => buildMedusaConfig(env)).toThrow(
        `Refusing to start with NODE_ENV=${JSON.stringify(nodeEnv)}`
      )
    }
  )

  it.each(["prod", "staging"])(
    "never falls back to Medusa's 'supersecret' when NODE_ENV is %j",
    (nodeEnv) => {
      expect(() => buildHttpConfig({ NODE_ENV: nodeEnv })).toThrow("JWT_SECRET must be set")
      expect(() =>
        buildMedusaConfig({ ...goodProductionEnv, NODE_ENV: nodeEnv, COOKIE_SECRET: undefined })
      ).toThrow("COOKIE_SECRET is not set")
    }
  )

  it.each([
    ["JWT_SECRET", "SUPERSECRET"],
    ["JWT_SECRET", " Dev-Only-JWT-Secret-Change-In-Production "],
    ["COOKIE_SECRET", "SuperSecret"],
    ["S3_ACCESS_KEY_ID", "MINIOADMIN"],
    ["S3_SECRET_ACCESS_KEY", " minioadmin "],
    ["MEDUSA_ADMIN_PASSWORD", "Dev-Admin-Password"],
  ])("refuses %s=%j: dev values are compared trimmed and ignoring case", (name, value) => {
    expect(() => buildMedusaConfig({ ...goodProductionEnv, [name]: value })).toThrow(
      `${name} is a dev-only value`
    )
  })

  it.each(["JWT_SECRET", "COOKIE_SECRET", "S3_SECRET_ACCESS_KEY"])(
    "refuses a %s shorter than 16 characters in production, and accepts 16",
    (name) => {
      expect(MIN_SECRET_LENGTH).toBe(16)
      expect(() => buildMedusaConfig({ ...goodProductionEnv, [name]: "x".repeat(15) })).toThrow(
        `${name} is shorter than 16 characters`
      )
      expect(() =>
        buildMedusaConfig({ ...goodProductionEnv, [name]: ` ${"x".repeat(15)} ` })
      ).toThrow(`${name} is shorter than 16 characters`)
      expect(() =>
        buildMedusaConfig({ ...goodProductionEnv, [name]: "x".repeat(16) })
      ).not.toThrow()
    }
  )

  it("refuses a 1-character S3_SECRET_ACCESS_KEY in production (QA, third review)", () => {
    expect(() => buildMedusaConfig({ ...goodProductionEnv, S3_SECRET_ACCESS_KEY: "x" })).toThrow(
      "S3_SECRET_ACCESS_KEY is shorter than 16 characters"
    )
  })

  it("has no minimum length for S3_ACCESS_KEY_ID, which is an identifier, not a secret", () => {
    expect(productionSecretProblems({ ...goodProductionEnv, S3_ACCESS_KEY_ID: "AKIA" })).toEqual([])
  })

  // Every dev value, with something added before, after or both, in another letter case and
  // with surrounding spaces. QA started the backend with the dev JWT secret plus "1".
  const devValueVariants = Object.entries(DEV_ONLY_VALUES).flatMap(([name, values]) =>
    values.flatMap((dev) => [
      [name, `${dev}1`],
      [name, `1${dev}`],
      [name, ` prefix-${dev.toUpperCase()}-and-a-long-suffix `],
    ])
  )
  it.each(devValueVariants)(
    "refuses %s=%j in production: it contains a dev value",
    (name, value) => {
      expect(devValueMatch(name, value)).toBe("contains")
      expect(() => buildMedusaConfig({ ...goodProductionEnv, [name]: value })).toThrow(
        `${name} contains a dev-only value`
      )
    }
  )

  it("refuses the dev JWT secret with 1 appended (QA's case), and says which rule it breaks", () => {
    const value = `${devValues.JWT_SECRET}1`
    expect(productionSecretProblems({ ...goodProductionEnv, JWT_SECRET: value })).toEqual([
      "JWT_SECRET contains a dev-only value (from .env.example)",
    ])
  })

  it("tells an exact dev value from one that contains it, and accepts unrelated values", () => {
    expect(devValueMatch("S3_SECRET_ACCESS_KEY", " MinioAdmin ")).toBe("is")
    expect(devValueMatch("S3_SECRET_ACCESS_KEY", "minioadmin-2026-rotated")).toBe("contains")
    // A dev value of another variable does not count, nor does a part of a dev value.
    expect(devValueMatch("S3_SECRET_ACCESS_KEY", "dev-admin-password-and-more")).toBeUndefined()
    expect(devValueMatch("JWT_SECRET", "dev-only-jwt-secret-real-1234")).toBeUndefined()
    expect(devValueMatch("UNKNOWN", "minioadmin")).toBeUndefined()
  })

  it.each([
    "postgres://medusa:medusa@localhost:5433/medusa",
    "postgres://MEDUSA:Medusa@db.internal:5432/store",
    "postgresql://medusa:%6Dedusa@db/store?sslmode=require",
  ])("refuses the dev database user and password in production: %s", (url) => {
    expect(usesDevDatabaseCredentials(url)).toBe(true)
    expect(() => buildMedusaConfig({ ...goodProductionEnv, DATABASE_URL: url })).toThrow(
      "DATABASE_URL uses the dev-only database user and password"
    )
  })

  it("accepts other database credentials, and says nothing about an unset or odd DATABASE_URL", () => {
    expect(usesDevDatabaseCredentials("postgres://medusa:real-password@db/medusa")).toBe(false)
    expect(usesDevDatabaseCredentials("postgres://store:medusa@db/medusa")).toBe(false)
    expect(usesDevDatabaseCredentials(undefined)).toBe(false)
    expect(usesDevDatabaseCredentials("not a url")).toBe(false)
    expect(
      productionSecretProblems({ ...goodProductionEnv, DATABASE_URL: undefined })
    ).toEqual([])
  })

  // QA, third review: the dev login reached pg other ways than user:password@ in the URL.
  it.each([
    ["the password as a query parameter", "postgres://medusa@localhost:5433/db?password=medusa", {}],
    ["both as query parameters", "postgres://other:real@db/x?user=MEDUSA&password=%20Medusa%20", {}],
    ["the last of repeated parameters", "postgres://db/x?password=real&password=medusa&user=medusa", {}],
    ["a URL with an empty host", "postgres://medusa:medusa@/db", {}],
    ["PGPASSWORD with no password in the URL", "postgres://medusa@localhost:5433/db", { PGPASSWORD: "medusa" }],
    ["PGUSER and PGPASSWORD", "postgres://localhost:5433/db", { PGUSER: " Medusa ", PGPASSWORD: "MEDUSA" }],
    ["PGUSER and PGPASSWORD with DATABASE_URL unset", undefined, { PGUSER: "medusa", PGPASSWORD: "medusa" }],
    ["PGUSER and PGPASSWORD with a socket path", "/var/run/postgresql db", { PGUSER: "medusa", PGPASSWORD: "medusa" }],
    ["PGPASSWORD and the OS user", "postgres://db/x", { PGPASSWORD: "medusa", USERNAME: "medusa", USER: "medusa" }],
  ] as [string, string | undefined, Record<string, string>][])(
    "refuses the dev database login given through %s",
    (_label, url, extra) => {
      const env = { ...goodProductionEnv, DATABASE_URL: url, ...extra }
      expect(usesDevDatabaseCredentials(url, env)).toBe(true)
      expect(() => buildMedusaConfig(env)).toThrow(
        "DATABASE_URL uses the dev-only database user and password"
      )
    }
  )

  it("accepts a real login even when PGUSER / PGPASSWORD hold the dev values (the URL wins)", () => {
    const env = {
      ...goodProductionEnv,
      DATABASE_URL: "postgres://store:real-password@db/medusa",
      PGUSER: "medusa",
      PGPASSWORD: "medusa",
    }
    expect(productionSecretProblems(env)).toEqual([])
    expect(
      usesDevDatabaseCredentials("postgres://medusa@db/x?password=real-password", env)
    ).toBe(false)
  })

  it("knows the database credentials in .env.example (the list cannot drift from the file)", () => {
    expect(usesDevDatabaseCredentials(devValues.DATABASE_URL)).toBe(true)
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
    expect(productionSecretProblems({ ...devValues, NODE_ENV: " Development " })).toEqual([])
    expect(productionSecretProblems({ ...devValues, NODE_ENV: undefined })).toEqual([])
    expect(() => buildMedusaConfig({ ...devValues, NODE_ENV: "development" })).not.toThrow()
    expect(buildHttpConfig({}).jwtSecret).toBe("supersecret")
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
