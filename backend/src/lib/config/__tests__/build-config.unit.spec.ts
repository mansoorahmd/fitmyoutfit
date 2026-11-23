import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  buildFileModules,
  buildHttpConfig,
  buildMedusaConfig,
  buildModules,
  buildRedisModules,
  ConfigError,
  DATABASE_HOST_PROBLEMS,
  DATABASE_URL_NOT_SET,
  DEV_ONLY_VALUES,
  devValueMatch,
  MIN_CONTAINED_DEV_VALUE_LENGTH,
  MIN_SECRET_LENGTH,
  productionSecretProblems,
  usesDevDatabaseCredentials,
  usesDevDatabaseUserWithoutPassword,
} from "../build-config"
import { COD_PAYMENT_PROVIDER_ID, COD_PROVIDER_IDENTIFIER } from "../../../modules/cod/constants"

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
  STOREFRONT_URL: "https://shop.example.com",
  BACKEND_URL: "https://api.example.com",
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
    expect(problems).toHaveLength(8)
    expect(() => buildMedusaConfig(env)).toThrow(
      /JWT_SECRET[\s\S]*MEDUSA_ADMIN_PASSWORD[\s\S]*DATABASE_URL[\s\S]*STOREFRONT_URL must use https[\s\S]*BACKEND_URL must use https/
    )
  })

  // Medusa runs in production mode for "production" and "prod"; staging and anything else
  // that is not development or test gets the same checks.
  it.each(["prod", "PRODUCTION", " production ", "Prod", "staging", "qa"])(
    "refuses the dev .env.example when NODE_ENV is %j",
    (nodeEnv) => {
      const env = { ...devValues, NODE_ENV: nodeEnv }
      expect(productionSecretProblems(env)).toHaveLength(8)
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
      expect(devValueMatch(value)?.kind).toBe("contains")
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
    expect(devValueMatch(" MinioAdmin ")).toEqual({
      kind: "is",
      variables: ["S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"],
    })
    expect(devValueMatch("minioadmin-2026-rotated")?.kind).toBe("contains")
    // A part of a dev value does not count.
    expect(devValueMatch("dev-only-jwt-secret-real-1234")).toBeUndefined()
    expect(devValueMatch("a-long-random-jwt-secret")).toBeUndefined()
  })

  // QA, fourth review: each variable was compared only with its own dev values, so the two dev
  // secrets swapped passed.
  it("refuses the dev JWT and cookie secrets swapped (QA's case), naming whose value it is", () => {
    const env = {
      ...goodProductionEnv,
      JWT_SECRET: devValues.COOKIE_SECRET,
      COOKIE_SECRET: devValues.JWT_SECRET,
    }
    expect(productionSecretProblems(env)).toEqual([
      "JWT_SECRET is the dev-only value of COOKIE_SECRET (from .env.example)",
      "COOKIE_SECRET is the dev-only value of JWT_SECRET (from .env.example)",
    ])
    expect(() => buildMedusaConfig(env)).toThrow(ConfigError)
  })

  // Every checked variable against every dev value of every other variable: as it is, and with
  // something added before and after.
  const checkedVariables = [
    "JWT_SECRET",
    "COOKIE_SECRET",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
    "MEDUSA_ADMIN_PASSWORD",
  ]
  const movedDevValues = checkedVariables.flatMap((name) =>
    Object.entries(DEV_ONLY_VALUES)
      .filter(([owner]) => owner !== name)
      .flatMap(([, values]) => values)
      .filter((dev) => !(DEV_ONLY_VALUES[name] ?? []).includes(dev))
      .flatMap((dev) => [
        [name, dev, "is"],
        [name, `x-${dev.toUpperCase()}-0123456789abcdef`, "contains"],
      ])
  )
  it.each(movedDevValues)(
    "refuses %s=%j in production: another variable's dev value (%s)",
    (name, value, kind) => {
      expect(devValueMatch(value)?.kind).toBe(kind)
      expect(() => buildMedusaConfig({ ...goodProductionEnv, [name]: value })).toThrow(
        `${name} ${kind} the dev-only value of `
      )
    }
  )

  it("looks for a short dev value only as the whole value, so a random secret is not refused by chance", () => {
    expect(MIN_CONTAINED_DEV_VALUE_LENGTH).toBe(8)
    const table = { SOME_KEY: ["abc"], OTHER: ["longer-dev-value"] }
    expect(devValueMatch(" ABC ", table)).toEqual({ kind: "is", variables: ["SOME_KEY"] })
    expect(devValueMatch("9fabc3e1d2c4b5a6f7e8d9c0b1a2f3e4", table)).toBeUndefined()
    expect(devValueMatch("x-longer-dev-value-y", table)).toEqual({
      kind: "contains",
      variables: ["OTHER"],
    })
    // Every dev value today is long enough to be looked for inside a secret as well.
    for (const values of Object.values(DEV_ONLY_VALUES)) {
      for (const dev of values) {
        expect(dev.length).toBeGreaterThanOrEqual(MIN_CONTAINED_DEV_VALUE_LENGTH)
      }
    }
  })

  it("accepts strong random secrets (2000 derived hex and base64url values)", () => {
    for (let i = 0; i < 1000; i++) {
      const digest = createHash("sha512").update(`secret-${i}`).digest()
      for (const secret of [digest.toString("hex"), digest.toString("base64url")]) {
        expect(devValueMatch(secret)).toBeUndefined()
        expect(
          productionSecretProblems({ ...goodProductionEnv, JWT_SECRET: secret, COOKIE_SECRET: secret })
        ).toEqual([])
      }
    }
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

  it("accepts other database credentials, and finds no dev login in an unset or odd DATABASE_URL", () => {
    expect(usesDevDatabaseCredentials("postgres://medusa:real-password@db/medusa")).toBe(false)
    expect(usesDevDatabaseCredentials("postgres://store:medusa@db/medusa")).toBe(false)
    expect(usesDevDatabaseCredentials(undefined)).toBe(false)
    expect(usesDevDatabaseCredentials("not a url")).toBe(false)
    // An unset DATABASE_URL is refused on its own (below), not as a dev login.
    expect(productionSecretProblems({ ...goodProductionEnv, DATABASE_URL: undefined })).toEqual([
      DATABASE_URL_NOT_SET,
    ])
  })

  // S1-7: with DATABASE_URL unset Medusa takes the database from MEDUSA_DATABASE_URL, a
  // per-module <MODULE>_DATABASE_URL or the PG* variables, which the checks here do not read.
  it.each([
    ["unset", undefined],
    ["empty", ""],
    ["a space", " "],
    ["spaces, a tab and a line break", "  \t\r\n "],
  ] as [string, string | undefined][])(
    "refuses to start outside development and test when DATABASE_URL is %s",
    (_label, value) => {
      const env = {
        ...goodProductionEnv,
        DATABASE_URL: value,
        MEDUSA_DATABASE_URL: "postgres://store:real-password@db:5432/medusa",
        PRODUCT_DATABASE_URL: "postgres://store:real-password@db:5432/medusa",
      }
      expect(productionSecretProblems(env)).toEqual([DATABASE_URL_NOT_SET])
      expect(() => buildMedusaConfig(env)).toThrow(ConfigError)
      expect(() => buildMedusaConfig(env)).toThrow("DATABASE_URL is not set")
      for (const nodeEnv of ["prod", "staging", " Production "]) {
        expect(productionSecretProblems({ ...env, NODE_ENV: nodeEnv })).toEqual([
          DATABASE_URL_NOT_SET,
        ])
      }
    }
  )

  it("says what to set when DATABASE_URL is missing, and never echoes the fallback's value", () => {
    const fallback = "postgres://store:s3cret-fallback-pw@db:5432/medusa"
    let message = ""
    try {
      buildMedusaConfig({ ...goodProductionEnv, DATABASE_URL: undefined, MEDUSA_DATABASE_URL: fallback })
    } catch (error) {
      message = (error as Error).message
    }
    expect(message).toContain(
      "DATABASE_URL is not set. Set it to the production database's connection string, " +
        "postgres://<user>:<password>@<host>:<port>/<database>"
    )
    expect(message).toContain("MEDUSA_DATABASE_URL")
    expect(message).not.toContain("s3cret-fallback-pw")
  })

  it.each([undefined, "", "   "])(
    "leaves an unset or blank DATABASE_URL (%j) alone in development and test",
    (value) => {
      for (const nodeEnv of [undefined, "", "development", "test", " Test "]) {
        expect(productionSecretProblems({ NODE_ENV: nodeEnv, DATABASE_URL: value })).toEqual([])
        expect(() => buildMedusaConfig({ NODE_ENV: nodeEnv, DATABASE_URL: value })).not.toThrow()
      }
    }
  )

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

  // QA, fourth review: Medusa removes `ssl_mode` from the URL before pg sees it, and that rewrite
  // moved a `password` parameter out of the fragment, where the check had ignored it.
  it("refuses QA's ssl_mode URL, which logs in as medusa / medusa after Medusa's rewrite", () => {
    const url = "postgres://medusa:real@localhost:5433/db?ssl_mode=disable#&password=medusa"
    expect(usesDevDatabaseCredentials(url)).toBe(true)
    expect(usesDevDatabaseCredentials(url.replace("#", ""))).toBe(true)
    expect(
      usesDevDatabaseCredentials("postgres://real:real@db/x?ssl_mode=1#&user=medusa&password=medusa")
    ).toBe(true)
    const problems = productionSecretProblems({ ...goodProductionEnv, DATABASE_URL: url })
    expect(problems).toContain(
      "DATABASE_URL uses the dev-only database user and password (from .env.example), " +
        "in the URL, its user / password parameters, or PGUSER / PGPASSWORD"
    )
  })

  it.each([
    "postgres://store:real-password@db:5432/medusa#anything",
    "postgres://store:pass#word@db:5432/medusa",
    "postgres://store:real-password@db:5432/medusa?ssl_mode=disable#",
  ])("refuses any DATABASE_URL with a '#' in production, and says to write it as %%23: %s", (url) => {
    const problems = productionSecretProblems({ ...goodProductionEnv, DATABASE_URL: url })
    expect(problems).toEqual([
      "DATABASE_URL contains a '#'. Medusa and the PostgreSQL driver read the part after it " +
        "differently, so it is refused: write a '#' in the password as %23",
    ])
    expect(() => buildMedusaConfig({ ...goodProductionEnv, DATABASE_URL: url })).toThrow("%23")
    // Written as %23 it is accepted, and outside production a '#' is not checked.
    expect(
      productionSecretProblems({ ...goodProductionEnv, DATABASE_URL: url.replace(/#/g, "%23") })
    ).toEqual([])
    expect(productionSecretProblems({ NODE_ENV: "development", DATABASE_URL: url })).toEqual([])
  })

  // QA, eighth review: the login was checked, but the server was chosen elsewhere (PGHOST for a
  // URL with no host, a ?host= parameter over the visible host).
  it.each([
    ["an empty host", "postgres://store:real-password@/medusa", "no_host"],
    ["an empty host with a port (QA's tenth review, M5)", "postgres://store:real-password@:5433/medusa", "no_host"],
    ["no authority at all", "postgres:///medusa", "no_host"],
    ["an empty host after Medusa's rewrite", "postgres://store:real-password@/medusa?ssl_mode=disable", "no_host"],
    ["a percent-encoded socket path as host", "postgres://store:real-password@%2Fvar%2Frun%2Fpostgresql/medusa", "no_host"],
    ["a host parameter", "postgres://store:real-password@db:5432/medusa?host=evil.example", "host_parameter"],
    ["an empty host parameter", "postgres://store:real-password@db/medusa?sslmode=require&host=", "host_parameter"],
    ["a HOST parameter in capitals", "postgres://store:real-password@db/medusa?HOST=evil", "host_parameter"],
    ["a hostaddr parameter", "postgresql://store:real-password@db/medusa?hostaddr=10.0.0.9", "host_parameter"],
    ["a socket path", "/var/run/postgresql medusa", "not_a_url"],
    ["libpq's keyword form", "host=db user=store password=real-password dbname=medusa", "not_a_url"],
    ["plain words", "not a url", "not_a_url"],
    ["another scheme", "mysql://store:real-password@db/medusa", "not_a_url"],
    ["a URL with no scheme", "store:real-password@db/medusa", "not_a_url"],
  ] as [string, string, keyof typeof DATABASE_HOST_PROBLEMS][])(
    "refuses a DATABASE_URL that does not name its server in production: %s",
    (_label, url, problem) => {
      const env = { ...goodProductionEnv, DATABASE_URL: url, PGHOST: "elsewhere.example" }
      expect(productionSecretProblems(env)).toEqual([DATABASE_HOST_PROBLEMS[problem]])
      expect(() => buildMedusaConfig(env)).toThrow(ConfigError)
      for (const nodeEnv of ["prod", "staging"]) {
        expect(productionSecretProblems({ ...env, NODE_ENV: nodeEnv })).toEqual([
          DATABASE_HOST_PROBLEMS[problem],
        ])
      }
      // Development and test are unchanged.
      for (const nodeEnv of [undefined, "development", "test"]) {
        expect(productionSecretProblems({ ...env, NODE_ENV: nodeEnv })).toEqual([])
      }
    }
  )

  it("says what to write instead, and never echoes the value", () => {
    for (const message of Object.values(DATABASE_HOST_PROBLEMS)) {
      expect(message).toContain("postgres://<user>:<password>@<host>:<port>/<database>")
    }
    let message = ""
    try {
      buildMedusaConfig({ ...goodProductionEnv, DATABASE_URL: "postgres://store:s3cret-pw@/medusa" })
    } catch (error) {
      message = (error as Error).message
    }
    expect(message).toContain("DATABASE_URL names no database host after the @")
    expect(message).not.toContain("s3cret-pw")
  })

  it.each([
    "postgres://store:real-password@db:5432/medusa",
    "postgresql://store:real-password@db.internal.example.com/medusa?sslmode=require",
    "postgres://store:real-password@10.0.0.5:5432/medusa?ssl_mode=disable",
    "postgres://store:real-password@[::1]:5432/medusa",
    "postgres://store:real-password@my_db-1:5432/medusa?application_name=medusa",
    " postgres://store:real-password@db:5432/medusa ",
    // The '#' is reported on its own, once (below), not also as a missing host.
    "postgres://store:pass%23word@db:5432/medusa",
  ])("accepts a DATABASE_URL that names its server: %s", (url) => {
    expect(productionSecretProblems({ ...goodProductionEnv, DATABASE_URL: url, PGHOST: "x" })).toEqual([])
  })

  // QA, fourth review: with no password given, pg reads one from a pgpass file (on Windows
  // %APPDATA%\postgresql\pgpass.conf even without PGPASSFILE), which the check cannot see.
  it.each([
    ["the user in the URL", "postgres://medusa@localhost:5433/db", {}],
    ["an empty password in the URL", "postgres://medusa:@localhost:5433/db", {}],
    ["the user parameter", "postgres://db/x?user=Medusa", {}],
    ["PGUSER", "postgres://localhost:5433/db", { PGUSER: " medusa " }],
    ["PGUSER with DATABASE_URL unset", undefined, { PGUSER: "medusa" }],
    ["the OS user", "postgres://db/x", { USERNAME: "medusa", USER: "medusa" }],
    ["an empty PGPASSWORD", "postgres://medusa@db/x", { PGPASSWORD: "" }],
    ["the user after Medusa's rewrite", "postgres://store@db/x?ssl_mode=1#&user=medusa", {}],
    ["PGPASSFILE (not read)", "postgres://medusa@localhost:5433/db", { PGPASSFILE: "C:/pgpass.conf" }],
  ] as [string, string | undefined, Record<string, string>][])(
    "refuses the dev database user with no explicit password, given through %s",
    (_label, url, extra) => {
      const env = { ...goodProductionEnv, DATABASE_URL: url, ...extra }
      expect(usesDevDatabaseUserWithoutPassword(url, env)).toBe(true)
      expect(productionSecretProblems(env)).toContain(
        "DATABASE_URL logs in as the dev-only database user (from .env.example) with no password " +
          "in DATABASE_URL or PGPASSWORD, so the PostgreSQL driver would take one from a pgpass " +
          "file, which is not checked: give the password explicitly in DATABASE_URL or PGPASSWORD, " +
          "or use a different database user"
      )
      expect(() => buildMedusaConfig(env)).toThrow(ConfigError)
    }
  )

  it("accepts the dev database user with an explicit real password, and another user without one", () => {
    const withPassword = { ...goodProductionEnv, DATABASE_URL: "postgres://medusa:real-pw@db/x" }
    expect(productionSecretProblems(withPassword)).toEqual([])
    const withPgPassword = {
      ...goodProductionEnv,
      DATABASE_URL: "postgres://medusa@db/x",
      PGPASSWORD: "real-pw",
    }
    expect(productionSecretProblems(withPgPassword)).toEqual([])
    // Another user may rely on a pgpass file.
    const otherUser = { ...goodProductionEnv, DATABASE_URL: "postgres://store@db/x" }
    expect(productionSecretProblems(otherUser)).toEqual([])
    // The dev login with the dev password is reported once, as the dev login.
    expect(
      productionSecretProblems({ ...goodProductionEnv, DATABASE_URL: "postgres://medusa:medusa@db/x" })
    ).toHaveLength(1)
    // Outside production nothing is checked.
    expect(
      productionSecretProblems({ NODE_ENV: "development", DATABASE_URL: "postgres://medusa@db/x" })
    ).toEqual([])
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

describe("public URLs at start (STOREFRONT_URL, BACKEND_URL)", () => {
  it.each([
    ["unset", undefined, "STOREFRONT_URL is not set"],
    ["empty", "", "STOREFRONT_URL is not set"],
    ["http", "http://shop.example.com", "STOREFRONT_URL must use https"],
    ["with a path", "https://shop.example.com/pk", "STOREFRONT_URL must not have a path"],
    ["with credentials", "https://u:p@shop.example.com", "STOREFRONT_URL must not contain a user name or password"],
  ])("refuses to start in production with STOREFRONT_URL %s, saying what to write", (_name, value, message) => {
    const env = { ...goodProductionEnv, STOREFRONT_URL: value }
    expect(() => buildMedusaConfig(env)).toThrow(ConfigError)
    expect(() => buildMedusaConfig(env)).toThrow(
      new RegExp(`Refusing to start with NODE_ENV="production":\n- ${message}.*Write .*https://<host>`)
    )
  })

  it("refuses BACKEND_URL the same way, and starts with both correct", () => {
    expect(() => buildMedusaConfig({ ...goodProductionEnv, BACKEND_URL: undefined })).toThrow(
      "BACKEND_URL is not set"
    )
    expect(() =>
      buildMedusaConfig({ ...goodProductionEnv, BACKEND_URL: "http://api.example.com" })
    ).toThrow("BACKEND_URL must use https")
    expect(() => buildMedusaConfig(goodProductionEnv)).not.toThrow()
  })

  it("in development starts without them, but refuses one that is set and unusable", () => {
    expect(() => buildMedusaConfig({ NODE_ENV: "development" })).not.toThrow()
    expect(() =>
      buildMedusaConfig({ NODE_ENV: "development", STOREFRONT_URL: "http://localhost:8000/uk" })
    ).toThrow(/Refusing to start with NODE_ENV="development":\n- STOREFRONT_URL must not have a path/)
    expect(() => buildMedusaConfig({ NODE_ENV: "test", BACKEND_URL: "localhost:9000" })).toThrow(
      ConfigError
    )
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
  it("combines redis, file and payment modules, and our own", () => {
    const modules = buildModules({ ...s3Env, REDIS_URL: "redis://x:6379" })
    expect(modules).toHaveLength(10)
  })

  it("always registers the design and team-order modules", () => {
    for (const env of [{}, { ...s3Env, REDIS_URL: "redis://x:6379" }]) {
      expect(buildModules(env)).toContainEqual({ resolve: "./src/modules/design" })
      expect(buildModules(env)).toContainEqual({ resolve: "./src/modules/team-order" })
    }
  })

  it("always registers the cash-collection record's module", () => {
    for (const env of [{}, { ...s3Env, REDIS_URL: "redis://x:6379" }]) {
      expect(buildModules(env)).toContainEqual({ resolve: "./src/modules/cash-collection" })
    }
  })

  it("always registers cash on delivery so that Medusa names it pp_cod_cod", () => {
    const payment = buildModules({}).find((m) => m.resolve === "@medusajs/medusa/payment")
    const providers = (payment?.options?.providers ?? []) as { resolve: string; id: string }[]
    expect(providers).toEqual([{ resolve: "./src/modules/cod", id: "cod" }])
    expect(`pp_${COD_PROVIDER_IDENTIFIER}_${providers[0].id}`).toBe(COD_PAYMENT_PROVIDER_ID)
    expect(COD_PAYMENT_PROVIDER_ID).toBe("pp_cod_cod")
  })
})
