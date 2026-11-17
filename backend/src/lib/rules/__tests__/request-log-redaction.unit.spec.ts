import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  CREDENTIAL_QUERY_KEYS,
  REDACTED,
  redactCredentialsInUrl,
  redactLoggedRequestFields,
} from "../request-log-redaction"

const JWT = "eyJhbGciOiJIUzI1NiJ9.eyJlbnRpdHlfaWQiOiJhQGIuY28ifQ.c2lnbmF0dXJl"

describe("redactCredentialsInUrl", () => {
  it("replaces the token's value in a path with a query and in a whole URL", () => {
    expect(CREDENTIAL_QUERY_KEYS).toEqual(["token"])
    expect(REDACTED).toBe("[redacted]")
    expect(redactCredentialsInUrl(`/app/reset-password?token=${JWT}&email=a%40b.co`)).toBe(
      "/app/reset-password?token=[redacted]&email=a%40b.co"
    )
    expect(redactCredentialsInUrl(`https://api.example.com/app/reset-password?email=a%40b.co&token=${JWT}`)).toBe(
      "https://api.example.com/app/reset-password?email=a%40b.co&token=[redacted]"
    )
    expect(redactCredentialsInUrl(`/admin/invites/accept?token=${JWT}`)).toBe("/admin/invites/accept?token=[redacted]")
  })

  it.each([
    ["TOKEN", `/x?TOKEN=${JWT}`],
    ["percent-encoded key", `/x?%74oken=${JWT}`],
    ["padded key", `/x?+token+=${JWT}`],
    ["repeated", `/x?token=${JWT}&token=${JWT}`],
    ["after a fragment-like value", `/x?a=1&token=${JWT}#frag`],
    ["empty value", "/x?token="],
    ["no equals sign", `/x?token`],
  ])("redacts the %s case and keeps no part of the token", (_name, address) => {
    const redacted = redactCredentialsInUrl(address)
    expect(redacted).toContain(REDACTED)
    for (const part of JWT.split(".")) {
      expect(redacted).not.toContain(part)
    }
  })

  it("keeps the fragment and everything else as it was", () => {
    expect(redactCredentialsInUrl(`/x?a=1&token=${JWT}&b=2#token=keep`)).toBe("/x?a=1&token=[redacted]&b=2#token=keep")
  })

  it.each([
    "/app/reset-password",
    "/store/products?limit=10&offset=0",
    "/x?tokens=1&my_token=2&tok=3",
    "/x#token=in-the-fragment",
    "/x?a=%E0%A4%A",
    "",
  ])("returns %j as it is", (address) => {
    expect(redactCredentialsInUrl(address)).toBe(address)
  })
})

describe("redactLoggedRequestFields", () => {
  it("redacts originalUrl and both referrer headers, and leaves url and other headers alone", () => {
    const req = {
      url: `/reset-password?token=${JWT}`,
      originalUrl: `/app/reset-password?token=${JWT}`,
      headers: {
        referer: `https://api.example.com/app/reset-password?token=${JWT}`,
        referrer: `https://api.example.com/app/reset-password?token=${JWT}`,
        authorization: `Bearer ${JWT}`,
      } as Record<string, unknown>,
    }
    redactLoggedRequestFields(req)
    expect(req.originalUrl).toBe("/app/reset-password?token=[redacted]")
    expect(req.headers.referer).toBe("https://api.example.com/app/reset-password?token=[redacted]")
    expect(req.headers.referrer).toBe("https://api.example.com/app/reset-password?token=[redacted]")
    expect(req.url).toBe(`/reset-password?token=${JWT}`)
    expect(req.headers.authorization).toBe(`Bearer ${JWT}`)
  })

  it("changes nothing without a credential, and copes with missing fields", () => {
    const req = { originalUrl: "/store/carts?x=1", headers: { referer: "https://shop.example.com/cart" } as Record<string, unknown> }
    redactLoggedRequestFields(req)
    expect(req).toEqual({ originalUrl: "/store/carts?x=1", headers: { referer: "https://shop.example.com/cart" } })
    const bare: { originalUrl?: unknown; headers: Record<string, unknown> } = { headers: { referer: ["a"] } }
    redactLoggedRequestFields(bare)
    expect(bare).toEqual({ headers: { referer: ["a"] } })
  })
})

describe("what Medusa's request log reads, in the installed versions", () => {
  const modules = join(__dirname, "..", "..", "..", "..", "node_modules")

  it("logs morgan's url and referrer tokens", () => {
    const loader = readFileSync(join(modules, "@medusajs/framework/dist/http/express-loader.js"), "utf8")
    expect(loader).toContain("path: tokens.url(req, res),")
    expect(loader).toContain('referrer: tokens.referrer(req, res) || "-",')
    expect(loader).toContain('":method :url ← :referrer (:status) - :response-time ms"')
  })

  it("morgan reads them from originalUrl and the referer / referrer headers", () => {
    const morgan = readFileSync(join(modules, "morgan/index.js"), "utf8")
    expect(morgan).toContain("return req.originalUrl || req.url")
    expect(morgan).toContain("return req.headers.referer || req.headers.referrer")
  })
})
