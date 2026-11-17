import fs from "node:fs"
import path from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

const jar = vi.hoisted(() => ({ value: undefined as string | undefined }))
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "fmo_reset" && jar.value !== undefined ? { name, value: jar.value } : undefined) }),
}))

import ResetPasswordPage from "../app/[countryCode]/(main)/account/reset-password/page"
import { openedResetEmail } from "@lib/data/reset-email"
import { sealReset, resetSecret } from "@lib/util/reset-cookie"

const TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJlbnRpdHlfaWQiOiJhQGIuY28ifQ.c2lnbmF0dXJl"

/** A source file's code without its comments. */
const code = (file: string) =>
  fs
    .readFileSync(path.resolve(__dirname, file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")

beforeEach(() => {
  jar.value = undefined
})

// M2: on the development server React sends the browser the values a server component awaited
// (the RSC payload). The page must never hold the token, so it awaits a function that gives the email only.
describe("what the reset page's server code holds", () => {
  it("openedResetEmail gives the email and nothing else", async () => {
    jar.value = await sealReset({ token: TOKEN, email: "ali@example.com" }, resetSecret())
    const email = await openedResetEmail()
    expect(email).toBe("ali@example.com")
    expect(typeof email).toBe("string")
    expect(JSON.stringify(email)).not.toContain(TOKEN)
  })

  it("gives null when there is no usable link: no cookie, an altered one, an expired one", async () => {
    expect(await openedResetEmail()).toBeNull()
    jar.value = "v1.AAAA.BBBB"
    expect(await openedResetEmail()).toBeNull()
    jar.value = await sealReset({ token: TOKEN, email: "a@b.co" }, resetSecret(), Date.now() - 16 * 60 * 1000)
    expect(await openedResetEmail()).toBeNull()
  })

  it("the page's output holds the email and no token, not even in the props it passes on", async () => {
    jar.value = await sealReset({ token: TOKEN, email: "ali@example.com" }, resetSecret())
    const element = await ResetPasswordPage()
    expect(element.props).toEqual({ email: "ali@example.com" })
    expect(JSON.stringify(element)).not.toContain(TOKEN)
    jar.value = undefined
    expect((await ResetPasswordPage()).props).toEqual({ email: null })
  })

  it("the page does not open the cookie itself: it imports neither openReset nor the cookie's secret", () => {
    const source = code("../app/[countryCode]/(main)/account/reset-password/page.tsx")
    expect(source).not.toMatch(/openReset|resetSecret|reset-cookie|next\/headers|\.token\b/)
    expect(source).toContain("openedResetEmail")
  })

  it("the helper is not a server action the browser could call", () => {
    const source = code("../lib/data/reset-email.ts")
    expect(source).not.toMatch(/["']use server["']/)
  })
})
