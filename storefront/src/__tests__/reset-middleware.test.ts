// @vitest-environment node
import fs from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { NextRequest } from "next/server"
import { beforeAll, describe, expect, it, vi } from "vitest"

import { RESET_COOKIE, openReset, resetSecret } from "@lib/util/reset-cookie"

const TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJlbnRpdHlfaWQiOiJhQGIuY28ifQ.c2lnbmF0dXJl"

let middleware: (request: NextRequest) => Promise<Response>

beforeAll(async () => {
  vi.stubEnv("MEDUSA_BACKEND_URL", "http://backend.test")
  vi.stubEnv("NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY", "pk_test")
  vi.stubGlobal(
    "fetch",
    async () =>
      new Response(JSON.stringify({ regions: [{ id: "r1", countries: [{ iso_2: "pk" }, { iso_2: "gb" }] }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })
  )
  middleware = (await import("../middleware")).middleware as unknown as typeof middleware
})

const visit = (path: string, cookie = "_medusa_cache_id=abc") =>
  middleware(new NextRequest(`http://localhost:8009${path}`, { headers: { cookie } }))

describe("the middleware and a reset link's address", () => {
  it("moves the token and email into a sealed http-only cookie scoped to the page and redirects to the page without a query", async () => {
    const response = await visit(`/pk/account/reset-password?token=${TOKEN}&email=Ali%40Example.com`)
    expect(response.status).toBe(303)
    const location = response.headers.get("location") as string
    expect(new URL(location).pathname).toBe("/pk/account/reset-password")
    expect(location).not.toContain("?")
    expect(location).not.toContain(TOKEN)
    expect(response.headers.get("referrer-policy")).toBe("no-referrer")
    expect(response.headers.get("cache-control")).toBe("no-store")

    const setCookie = response.headers.get("set-cookie") as string
    expect(setCookie).toContain(`${RESET_COOKIE}=`)
    expect(setCookie).toMatch(/HttpOnly/i)
    expect(setCookie).toMatch(/Path=\/pk\/account\/reset-password/i)
    expect(setCookie).toMatch(/Max-Age=900/i)
    expect(setCookie).toMatch(/SameSite=lax/i)
    expect(setCookie).not.toContain(TOKEN)
    expect(setCookie).not.toMatch(/ali/i)

    const value = new RegExp(`${RESET_COOKIE}=([^;]+)`).exec(setCookie)?.[1]
    expect(await openReset(value, resetSecret())).toEqual({ token: TOKEN, email: "ali@example.com" })
  })

  it("a link with no country first goes to its country with the query kept (the existing rule), then is sealed", async () => {
    const response = await visit(`/account/reset-password?token=${TOKEN}&email=a%40b.co`)
    expect(response.status).toBe(307)
    expect(response.headers.get("location")).toBe(`http://localhost:8009/pk/account/reset-password?token=${TOKEN}&email=a%40b.co`)
  })

  it("a link missing its token clears the cookie and redirects to the clean page", async () => {
    const response = await visit("/gb/account/reset-password?email=a%40b.co")
    expect(response.status).toBe(303)
    expect(new URL(response.headers.get("location") as string).search).toBe("")
    expect(response.headers.get("set-cookie")).toMatch(new RegExp(`${RESET_COOKIE}=;`))
    expect(response.headers.get("set-cookie")).toMatch(/Max-Age=0/i)
  })

  it("the clean page, and other pages with a token in their query, pass through untouched", async () => {
    for (const path of ["/pk/account/reset-password", `/pk/account/forgot-password?token=${TOKEN}`, `/pk/store?token=${TOKEN}`]) {
      const response = await visit(path)
      expect(response.status, path).toBe(200)
      expect(response.headers.get("set-cookie"), path).toBeNull()
    }
  })

  it("sets the cache id cookie too when the visitor has none, in the same redirect", async () => {
    const response = await visit(`/pk/account/reset-password?token=${TOKEN}&email=a%40b.co`, "")
    expect(response.status).toBe(303)
    expect(response.headers.getSetCookie().join("\n")).toMatch(/_medusa_cache_id=/)
  })
})

describe("the headers of the pages a link touches (next.config.js)", () => {
  it("sends no Referer and keeps no copy, for the page with and without a country", async () => {
    // loaded here, after the environment is set: the config checks the variables when it loads
    const nextConfig = createRequire(import.meta.url)("../../next.config.js") as {
      headers: () => Promise<{ source: string; headers: { key: string; value: string }[] }[]>
    }
    const rules = await nextConfig.headers()
    expect(rules.map((r) => r.source).sort()).toEqual(["/:countryCode/account/reset-password", "/account/reset-password"])
    for (const rule of rules) {
      expect(rule.headers).toContainEqual({ key: "Referrer-Policy", value: "no-referrer" })
      expect(rule.headers).toContainEqual({ key: "Cache-Control", value: "no-store" })
    }
  })
})

describe("the middleware runs on the edge, which refuses some code (the production build failed once on it)", () => {
  const src = path.resolve(__dirname, "..")
  const alias: Record<string, string> = { "@lib/": "lib/", "@content/": "content/", "@modules/": "modules/", "types/": "types/", "styles/": "styles/" }

  /** Every file middleware.ts reaches through its imports, and every package it names. */
  const graph = () => {
    const files = new Set<string>()
    const packages = new Set<string>()
    const visit = (file: string) => {
      if (files.has(file)) return
      files.add(file)
      const text = fs.readFileSync(file, "utf8")
      for (const m of Array.from(text.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g))) {
        const spec = m[1]
        const prefix = Object.keys(alias).find((a) => spec.startsWith(a))
        const base = prefix ? path.join(src, alias[prefix], spec.slice(prefix.length)) : spec.startsWith(".") ? path.resolve(path.dirname(file), spec) : null
        if (!base) {
          packages.add(spec)
          continue
        }
        const found = [".ts", ".tsx", "/index.ts", "/index.tsx"].map((e) => base + e).find((f) => fs.existsSync(f))
        if (found) visit(found)
      }
    }
    visit(path.join(src, "middleware.ts"))
    return { files: Array.from(files).map((f) => path.relative(src, f).split(path.sep).join("/")), packages: Array.from(packages) }
  }

  it("reaches no lodash, and not the checkout's address helpers that use it", () => {
    const { files, packages } = graph()
    expect(files).toContain("lib/util/reset-cookie.ts")
    expect(files).toContain("lib/util/reset-link.ts")
    expect(packages.filter((p) => /lodash/.test(p))).toEqual([])
    expect(files.filter((f) => /checkout-address|compare-addresses|password-reset\.ts|account-auth/.test(f))).toEqual([])
  })
})
