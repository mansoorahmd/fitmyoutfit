import {
  buildFileModules,
  buildHttpConfig,
  buildModules,
  buildRedisModules,
  ConfigError,
} from "../build-config"

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

describe("buildModules", () => {
  it("combines redis and file modules", () => {
    const modules = buildModules({ ...s3Env, REDIS_URL: "redis://x:6379" })
    expect(modules).toHaveLength(4)
  })
})
