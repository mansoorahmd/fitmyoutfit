import { describe, expect, it } from "vitest"

import { MIN_PASSWORD_LENGTH, authHref, authNotice, newPasswordError, validateCreate } from "@lib/util/account-auth"
import {
  RESET_LINK_MINUTES,
  afterResetPath,
  carryEmail,
  cleanEmail,
  cleanToken,
  requestBody,
  requestOutcome,
  takeCarriedEmail,
  updateBody,
  updateOutcome,
  validateForgot,
  validateNewPassword,
} from "@lib/util/password-reset"
import {
  RESET_COOKIE,
  RESET_COOKIE_MAX_AGE,
  openReset,
  resetLinkRedirect,
  resetSecret,
  sealReset,
} from "@lib/util/reset-cookie"

const SECRET = "a-test-secret-of-more-than-thirty-two-characters"
const TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJlbnRpdHlfaWQiOiJhQGIuY28ifQ.c2lnbmF0dXJl"
const NOW = 1_800_000_000_000

describe("the link's life", () => {
  it("is 15 minutes, as the backend fixes it", () => {
    expect(RESET_LINK_MINUTES).toBe(15)
    expect(RESET_COOKIE_MAX_AGE).toBe(15 * 60)
  })
})

describe("the email asked for a link (contract section 1)", () => {
  it("is sent trimmed and in lower case, as the only field", () => {
    expect(requestBody("  Ali.Raza@Example.COM \n")).toEqual({ identifier: "ali.raza@example.com" })
    expect(Object.keys(requestBody("a@b.co"))).toEqual(["identifier"])
  })

  it("needs a real-looking email within the store's limit", () => {
    expect(validateForgot({ email: "ali@example.com" })).toEqual({})
    expect(validateForgot({ email: "" }).email).toBeTruthy()
    expect(validateForgot({ email: "not an email" }).email).toBeTruthy()
    expect(validateForgot({ email: `${"a".repeat(250)}@b.co` }).email).toMatch(/254/)
    expect(validateForgot({ email: undefined as unknown as string }).email).toBeTruthy()
  })

  it("every answer that came back below 500 is the same, so no account is revealed", () => {
    expect(requestOutcome({ ok: true, body: null })).toBe("requested")
    for (const status of [200, 400, 401, 404, 429]) {
      expect(requestOutcome({ ok: false, status }), String(status)).toBe("requested")
    }
  })

  it("only no answer or a server error is a failed request", () => {
    expect(requestOutcome({ ok: false })).toBe("failed")
    for (const status of [500, 502, 503]) expect(requestOutcome({ ok: false, status })).toBe("failed")
  })
})

describe("the update (contract section 1)", () => {
  it("has a body of only the password; the token is never in it", () => {
    expect(updateBody("a-good-password")).toEqual({ password: "a-good-password" })
    expect(Object.keys(updateBody("x"))).toEqual(["password"])
  })

  it("401 alone is a dead link; no answer, 5xx and other statuses leave it usable", () => {
    expect(updateOutcome({ ok: true, body: null })).toBe("changed")
    expect(updateOutcome({ ok: false, status: 401 })).toBe("gone")
    expect(updateOutcome({ ok: false })).toBe("failed")
    for (const status of [400, 404, 409, 500, 503]) expect(updateOutcome({ ok: false, status }), String(status)).toBe("failed")
  })
})

describe("the new password is checked before anything is sent", () => {
  it("has create account's rule, from one place", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8)
    expect(validateNewPassword({ password: "1234567" })).toEqual({ password: "Use at least 8 characters" })
    expect(validateNewPassword({ password: "" })).toEqual({ password: "Use at least 8 characters" })
    expect(validateNewPassword({ password: "        " })).toEqual({
      password: "Use letters, numbers or symbols, not only spaces",
    })
    expect(validateNewPassword({ password: "12345678" })).toEqual({})
    expect(validateNewPassword({ password: "pass word" })).toEqual({})
    expect(validateNewPassword({ password: undefined as unknown as string })).toEqual({ password: "Use at least 8 characters" })
    expect(validateNewPassword({ password: 12345678 as unknown as string })).toEqual({ password: "Use at least 8 characters" })
  })

  it("is the rule create account uses", () => {
    for (const password of ["1234567", "        ", "12345678"]) {
      expect(validateCreate({ firstName: "A", lastName: "", email: "a@b.co", phone: "", password }, "pk").password).toBe(
        newPasswordError(password)
      )
    }
  })
})

describe("the token and email as a link gives them", () => {
  it("takes a token made of a JWT's characters, one string, not empty, not huge", () => {
    expect(cleanToken(TOKEN)).toBe(TOKEN)
    for (const bad of ["", " ", `${TOKEN} `, "a b", "tok<en>", "a".repeat(4097), undefined, null, 5, ["a"], "x;y"]) {
      expect(cleanToken(bad), String(bad)).toBeNull()
    }
  })

  it("takes a plain email, trimmed and in lower case", () => {
    expect(cleanEmail(" Ali@Example.com ")).toBe("ali@example.com")
    for (const bad of ["", "ali", "ali@", undefined, null, 3, `${"a".repeat(250)}@b.co`]) {
      expect(cleanEmail(bad), String(bad)).toBeNull()
    }
  })
})

describe("the sealed cookie (the token between the page load and the submit)", () => {
  it("opens to what was sealed, and the sealed text holds neither the token nor the email", async () => {
    const sealed = await sealReset({ token: TOKEN, email: "ali@example.com" }, SECRET, NOW)
    expect(sealed).not.toContain(TOKEN)
    expect(sealed).not.toContain("ali")
    expect(sealed).not.toContain("example")
    expect(await openReset(sealed, SECRET, NOW + 1000)).toEqual({ token: TOKEN, email: "ali@example.com" })
  })

  it("seals the same link differently each time", async () => {
    const link = { token: TOKEN, email: "ali@example.com" }
    expect(await sealReset(link, SECRET, NOW)).not.toBe(await sealReset(link, SECRET, NOW))
  })

  it("is refused after the link's 15 minutes", async () => {
    const sealed = await sealReset({ token: TOKEN, email: "ali@example.com" }, SECRET, NOW)
    expect(await openReset(sealed, SECRET, NOW + 15 * 60 * 1000 - 1)).not.toBeNull()
    expect(await openReset(sealed, SECRET, NOW + 15 * 60 * 1000)).toBeNull()
  })

  it("is refused with another secret, when altered, or when it is not ours", async () => {
    const sealed = await sealReset({ token: TOKEN, email: "ali@example.com" }, SECRET, NOW)
    expect(await openReset(sealed, `${SECRET}x`, NOW)).toBeNull()
    const [v, iv, body] = sealed.split(".")
    const flipped = `${v}.${iv}.${body.slice(0, -2)}${body.endsWith("AA") ? "BB" : "AA"}`
    expect(await openReset(flipped, SECRET, NOW)).toBeNull()
    expect(await openReset(`v2.${iv}.${body}`, SECRET, NOW)).toBeNull()
    expect(await openReset(`${sealed}.extra`, SECRET, NOW)).toBeNull()
    for (const junk of ["", "x", "v1..", "v1.a.b", undefined, null, TOKEN]) {
      expect(await openReset(junk as string, SECRET, NOW), String(junk)).toBeNull()
    }
  })

  it("needs RESET_COOKIE_SECRET in production, and stands one in only elsewhere", () => {
    expect(resetSecret({ RESET_COOKIE_SECRET: SECRET, NODE_ENV: "production" })).toBe(SECRET)
    expect(() => resetSecret({ NODE_ENV: "production" })).toThrow(/RESET_COOKIE_SECRET/)
    expect(() => resetSecret({ RESET_COOKIE_SECRET: "short", NODE_ENV: "production" })).toThrow()
    expect(resetSecret({ NODE_ENV: "development" }).length).toBeGreaterThanOrEqual(32)
    expect(resetSecret({ NODE_ENV: "test" }).length).toBeGreaterThanOrEqual(32)
  })
})

describe("the middleware's rule for the link's address", () => {
  const query = (params: Record<string, string>) => `?${new URLSearchParams(params).toString()}`

  it("moves the token and email into a cookie scoped to the page and redirects to the page without a query", async () => {
    const result = await resetLinkRedirect(
      "/gb/account/reset-password",
      query({ token: TOKEN, email: "Ali@Example.com" }),
      SECRET,
      NOW
    )
    expect(result?.location).toBe("/gb/account/reset-password")
    expect(result?.location).not.toContain("?")
    expect(result?.cookie).toMatchObject({ name: RESET_COOKIE, path: "/gb/account/reset-password", maxAge: 900 })
    expect(result?.cookie.value).not.toContain(TOKEN)
    expect(await openReset(result?.cookie.value, SECRET, NOW)).toEqual({ token: TOKEN, email: "ali@example.com" })
  })

  it("leaves other paths and a request with no query alone", async () => {
    expect(await resetLinkRedirect("/gb/account/reset-password", "", SECRET, NOW)).toBeNull()
    expect(await resetLinkRedirect("/gb/account/reset-password", "?", SECRET, NOW)).toBeNull()
    expect(await resetLinkRedirect("/gb/account", query({ token: TOKEN, email: "a@b.co" }), SECRET, NOW)).toBeNull()
    expect(await resetLinkRedirect("/gb/account/forgot-password", query({ token: TOKEN }), SECRET, NOW)).toBeNull()
    expect(await resetLinkRedirect("/gb/account/reset-password/x", query({ token: TOKEN }), SECRET, NOW)).toBeNull()
    expect(await resetLinkRedirect("/account/reset-password", query({ token: TOKEN }), SECRET, NOW)).toBeNull()
  })

  it("a link missing its token or email, or with a malformed one, clears the cookie instead of setting one", async () => {
    for (const params of [
      { email: "a@b.co" },
      { token: TOKEN },
      { token: "", email: "a@b.co" },
      { token: TOKEN, email: "not-an-email" },
      { token: "has space", email: "a@b.co" },
      { foo: "bar" },
    ] as Record<string, string>[]) {
      const result = await resetLinkRedirect("/pk/account/reset-password", query(params), SECRET, NOW)
      expect(result?.location, JSON.stringify(params)).toBe("/pk/account/reset-password")
      expect(result?.cookie).toMatchObject({ value: "", maxAge: 0, path: "/pk/account/reset-password" })
    }
  })
})

describe("the sign-in page after a reset", () => {
  it("is /account with the email filled in and the notice", () => {
    expect(afterResetPath("pk", "ali@example.com")).toBe(
      "/pk/account?view=signin&email=ali%40example.com&notice=password-changed"
    )
  })

  it("shows the notice only when asked for, only on sign-in", () => {
    expect(authNotice("password-changed", "signin")).toBe("password-changed")
    expect(authNotice("password-changed", "create")).toBeNull()
    for (const v of [undefined, "", "other", ["password-changed"]]) expect(authNotice(v, "signin")).toBeNull()
    expect(authHref("signin", { email: "a@b.co", notice: "password-changed" })).toBe(
      "/account?view=signin&email=a%40b.co&notice=password-changed"
    )
  })
})

describe("the email carried to the forgot-password page", () => {
  it("is kept in the browser and taken once", () => {
    window.sessionStorage.clear()
    carryEmail("  ali@example.com ")
    expect(takeCarriedEmail()).toBe("ali@example.com")
    expect(takeCarriedEmail()).toBe("")
  })

  it("an empty email clears what was kept", () => {
    carryEmail("ali@example.com")
    carryEmail("   ")
    expect(takeCarriedEmail()).toBe("")
  })
})
