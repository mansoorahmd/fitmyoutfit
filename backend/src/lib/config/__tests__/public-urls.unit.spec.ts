import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  PUBLIC_URL_DEFAULTS,
  PublicUrlError,
  publicUrlProblem,
  publicUrlProblems,
  readPublicUrls,
} from "../public-urls"

/** KEY=value pairs from backend/.env.example. */
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

const prod = {
  NODE_ENV: "production",
  STOREFRONT_URL: "https://shop.example.com",
  BACKEND_URL: "https://api.example.com",
}

describe("readPublicUrls", () => {
  it("has the same development defaults as backend/.env.example", () => {
    const example = readEnvExample()
    expect(example.STOREFRONT_URL).toBe("http://localhost:8000")
    expect(example.BACKEND_URL).toBe("http://localhost:9000")
    expect(PUBLIC_URL_DEFAULTS).toEqual({
      STOREFRONT_URL: example.STOREFRONT_URL,
      BACKEND_URL: example.BACKEND_URL,
    })
  })

  it("falls back to the defaults in development and test when unset or blank", () => {
    for (const NODE_ENV of [undefined, "development", "test", " Test "]) {
      expect(readPublicUrls({ NODE_ENV })).toEqual({
        storefrontUrl: "http://localhost:8000",
        backendUrl: "http://localhost:9000",
      })
      expect(readPublicUrls({ NODE_ENV, STOREFRONT_URL: "  ", BACKEND_URL: "" })).toEqual({
        storefrontUrl: "http://localhost:8000",
        backendUrl: "http://localhost:9000",
      })
    }
  })

  it("returns the origin: no trailing slash, host in lower case, default port dropped", () => {
    expect(
      readPublicUrls({
        ...prod,
        STOREFRONT_URL: " https://Shop.Example.com/ ",
        BACKEND_URL: "https://api.example.com:443",
      })
    ).toEqual({ storefrontUrl: "https://shop.example.com", backendUrl: "https://api.example.com" })
    expect(
      readPublicUrls({ STOREFRONT_URL: "http://localhost:8009", BACKEND_URL: "http://127.0.0.1:9009/" })
    ).toEqual({ storefrontUrl: "http://localhost:8009", backendUrl: "http://127.0.0.1:9009" })
  })

  it("accepts a correct production configuration", () => {
    expect(publicUrlProblems(prod)).toEqual([])
    expect(readPublicUrls(prod)).toEqual({
      storefrontUrl: "https://shop.example.com",
      backendUrl: "https://api.example.com",
    })
  })

  it.each(["STOREFRONT_URL", "BACKEND_URL"] as const)(
    "requires %s outside development and test, and says what to write",
    (name) => {
      for (const NODE_ENV of ["production", "prod", "staging"]) {
        for (const value of [undefined, "", "   "]) {
          const problems = publicUrlProblems({ ...prod, NODE_ENV, [name]: value })
          expect(problems).toHaveLength(1)
          expect(problems[0]).toMatch(new RegExp(`^${name} is not set\\. Write .*https://<host>`))
          expect(() => readPublicUrls({ ...prod, NODE_ENV, [name]: value })).toThrow(PublicUrlError)
        }
      }
    }
  )

  it.each([
    ["http://shop.example.com", "must use https outside development and test"],
    ["https://shop.example.com/uk", "must not have a path"],
    ["https://shop.example.com/account/", "must not have a path"],
    ["https://shop.example.com//", "must not have a path"],
    ["https://user:pw@shop.example.com", "must not contain a user name or password"],
    ["https://user@shop.example.com", "must not contain a user name or password"],
    ["https://shop.example.com?x=1", "must not have a query"],
    ["https://shop.example.com?", "must not have a query"],
    ["https://shop.example.com#top", "must not have a query (?...) or fragment"],
    ["https://shop.example.com/#", "must not have a query (?...) or fragment"],
    ["shop.example.com", "is not a URL"],
    ["//shop.example.com", "is not a URL"],
    ["ftp://shop.example.com", "must start with https://"],
    ["javascript:alert(1)", "must start with https://"],
  ])("refuses STOREFRONT_URL=%j in production: %s", (value, message) => {
    const problems = publicUrlProblems({ ...prod, STOREFRONT_URL: value })
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain(`STOREFRONT_URL ${message}`)
    expect(problems[0]).toContain("for example https://shop.example.com")
  })

  it("never echoes the value, which may hold a password", () => {
    const problems = publicUrlProblems({
      ...prod,
      STOREFRONT_URL: "https://admin:hunter2-secret@shop.example.com/path",
      BACKEND_URL: "http://hunter3-secret.example.com",
    })
    expect(problems).toHaveLength(2)
    expect(problems.join("\n")).not.toMatch(/hunter/)
  })

  it("in development accepts http but still refuses a path, query, credentials or a non-URL", () => {
    expect(publicUrlProblem("STOREFRONT_URL", "http://localhost:8000", false)).toBeUndefined()
    expect(publicUrlProblem("STOREFRONT_URL", "https://localhost:8000", false)).toBeUndefined()
    expect(publicUrlProblem("BACKEND_URL", "http://localhost:9000/app", false)).toContain(
      "must not have a path"
    )
    expect(publicUrlProblem("BACKEND_URL", "http://localhost:9000?x", false)).toContain(
      "must not have a query"
    )
    expect(publicUrlProblem("BACKEND_URL", "http://a:b@localhost:9000", false)).toContain(
      "user name or password"
    )
    expect(publicUrlProblem("BACKEND_URL", "localhost:9000", false)).toContain(
      "must start with https://"
    )
    expect(() => readPublicUrls({ NODE_ENV: "development", STOREFRONT_URL: "nope" })).toThrow(
      "STOREFRONT_URL is not a URL"
    )
  })

  it("lists both problems at once", () => {
    expect(() =>
      readPublicUrls({ NODE_ENV: "production", STOREFRONT_URL: "http://x.example" })
    ).toThrow(/STOREFRONT_URL must use https[\s\S]*\n[\s\S]*BACKEND_URL is not set/)
  })
})
