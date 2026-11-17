import { describe, expect, it } from "vitest"

import { NOTICE_COOKIE, NOTICE_MAX_AGE, noticePath, noticeToClear } from "@lib/util/password-notice"

const load = (over: Partial<Parameters<typeof noticeToClear>[0]> & { headers?: Record<string, string> } = {}) =>
  noticeToClear({
    pathname: "/pk/account",
    search: "?view=signin&email=a%40b.co&notice=password-changed",
    hasFlag: true,
    header: (name) => over.headers?.[name] ?? null,
    ...over,
  })

describe("the sign-in page's one-time flag (M3)", () => {
  it("is short-lived and scoped to one country's account pages", () => {
    expect(NOTICE_COOKIE).toBe("fmo_pw_notice")
    expect(NOTICE_MAX_AGE).toBeLessThanOrEqual(300)
    expect(noticePath("gb")).toBe("/gb/account")
  })

  it("is cleared by a real load of the sign-in page that asks for the notice, in the page's own country", () => {
    expect(load()).toBe("pk")
    expect(load({ pathname: "/GB/account/" })).toBe("gb")
  })

  it("is not cleared without the flag, on another page, without the notice in the query, or by a prefetch or client-side fetch", () => {
    expect(load({ hasFlag: false })).toBeNull()
    expect(load({ pathname: "/pk/account/forgot-password" })).toBeNull()
    expect(load({ pathname: "/pk/store" })).toBeNull()
    expect(load({ search: "?view=signin" })).toBeNull()
    expect(load({ search: "?notice=other" })).toBeNull()
    expect(load({ headers: { rsc: "1" } })).toBeNull()
    expect(load({ headers: { "next-router-prefetch": "1" } })).toBeNull()
    expect(load({ headers: { purpose: "prefetch" } })).toBeNull()
  })
})
