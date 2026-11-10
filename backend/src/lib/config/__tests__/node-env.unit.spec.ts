import {
  describeNodeEnv,
  isLocalNodeEnv,
  isProductionNodeEnv,
  normalizeNodeEnv,
} from "../node-env"

describe("isProductionNodeEnv (Medusa's rule: production or prod)", () => {
  it.each(["production", "prod", "PRODUCTION", "Prod", " production ", "\tprod\n"])(
    "counts %j as production",
    (value) => {
      expect(isProductionNodeEnv(value)).toBe(true)
    }
  )

  it.each(["development", "test", "staging", "", "  ", undefined, null, "production-like"])(
    "does not count %j as production",
    (value) => {
      expect(isProductionNodeEnv(value)).toBe(false)
    }
  )
})

describe("isLocalNodeEnv (dev defaults allowed)", () => {
  it.each([undefined, null, "", "  ", "development", "Development", " test ", "TEST"])(
    "allows dev defaults for %j",
    (value) => {
      expect(isLocalNodeEnv(value)).toBe(true)
    }
  )

  it.each(["production", "prod", "PRODUCTION", " production ", "staging", "qa", "dev", "develop"])(
    "applies the production checks for %j",
    (value) => {
      expect(isLocalNodeEnv(value)).toBe(false)
    }
  )
})

describe("normalizeNodeEnv and describeNodeEnv", () => {
  it("trims and lower-cases, and shows an unset value as (unset)", () => {
    expect(normalizeNodeEnv(" PROD ")).toBe("prod")
    expect(normalizeNodeEnv(undefined)).toBe("")
    expect(describeNodeEnv(undefined)).toBe("(unset)")
    expect(describeNodeEnv(" ")).toBe("(unset)")
    expect(describeNodeEnv("prod")).toBe('"prod"')
  })
})
