import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  jar: new Map<string, string>(),
  set: [] as { name: string; value: string; options: Record<string, unknown> }[],
  fetches: [] as { url: string; init: RequestInit }[],
  answer: (() => new Response(null, { status: 200 })) as () => Response | Promise<Response>,
  customer: { kind: "signed_out" } as unknown,
}))

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (state.jar.has(name) ? { name, value: state.jar.get(name) } : undefined),
    set: (name: string, value: string, options: Record<string, unknown>) => {
      state.set.push({ name, value, options })
      if (options?.maxAge === 0 || value === "") state.jar.delete(name)
      else state.jar.set(name, value)
    },
  }),
}))
vi.mock("@lib/data/customer", () => ({ customerState: async () => state.customer }))

import { requestPasswordReset, requestPasswordResetForMe, resetPassword } from "@lib/data/password-reset"
import { RESET_COOKIE, resetSecret, sealReset } from "@lib/util/reset-cookie"

const TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJlbnRpdHlfaWQiOiJhQGIuY28ifQ.c2lnbmF0dXJl"

const putLink = async (token = TOKEN, email = "ali@example.com") => {
  state.jar.set(RESET_COOKIE, await sealReset({ token, email }, resetSecret()))
}

beforeEach(() => {
  state.jar = new Map()
  state.set = []
  state.fetches = []
  state.answer = () => new Response(null, { status: 200 })
  state.customer = { kind: "signed_out" }
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    state.fetches.push({ url, init })
    return state.answer()
  })
})

const sentHeaders = (i = 0) => state.fetches[i].init.headers as Record<string, string>

describe("requestPasswordReset (the forgot-password page)", () => {
  it("asks Medusa for a link with the email trimmed and in lower case as the only field", async () => {
    expect(await requestPasswordReset({ email: "  Ali@Example.COM " })).toEqual({ kind: "requested" })
    expect(state.fetches).toHaveLength(1)
    expect(state.fetches[0].url).toMatch(/\/auth\/customer\/emailpass\/reset-password$/)
    expect(state.fetches[0].init.method).toBe("POST")
    expect(JSON.parse(state.fetches[0].init.body as string)).toEqual({ identifier: "ali@example.com" })
    expect(sentHeaders().authorization).toBeUndefined()
  })

  it("answers the same for every answer that came back, whatever the status", async () => {
    const answers: number[] = []
    for (const status of [200, 201, 400, 401, 404, 429]) {
      state.answer = () => new Response(null, { status })
      answers.push(JSON.stringify(await requestPasswordReset({ email: "ali@example.com" })) === '{"kind":"requested"}' ? status : -1)
    }
    expect(answers).toEqual([200, 201, 400, 401, 404, 429])
  })

  it("says it failed when the backend is down or errs", async () => {
    state.answer = () => {
      throw new TypeError("fetch failed")
    }
    expect(await requestPasswordReset({ email: "ali@example.com" })).toEqual({ kind: "failed" })
    state.answer = () => new Response(null, { status: 503 })
    expect(await requestPasswordReset({ email: "ali@example.com" })).toEqual({ kind: "failed" })
  })

  it("sends nothing for an email that fails the check", async () => {
    const result = await requestPasswordReset({ email: "nope" })
    expect(result.kind).toBe("invalid")
    expect(state.fetches).toHaveLength(0)
    expect((await requestPasswordReset(undefined as never)).kind).toBe("invalid")
  })
})

describe("requestPasswordResetForMe (the profile's Password row)", () => {
  it("asks for a link for the signed-in account's own email", async () => {
    state.customer = { kind: "signed_in", customer: { email: "Mine@Example.com" } }
    expect(await requestPasswordResetForMe()).toEqual({ kind: "requested", email: "Mine@Example.com" })
    expect(JSON.parse(state.fetches[0].init.body as string)).toEqual({ identifier: "mine@example.com" })
  })

  it("sends nothing when signed out, and fails when the request fails", async () => {
    expect(await requestPasswordResetForMe()).toEqual({ kind: "signed_out" })
    expect(state.fetches).toHaveLength(0)
    state.customer = { kind: "signed_in", customer: { email: "mine@example.com" } }
    state.answer = () => new Response(null, { status: 500 })
    expect(await requestPasswordResetForMe()).toEqual({ kind: "failed" })
    state.customer = { kind: "failed" }
    expect(await requestPasswordResetForMe()).toEqual({ kind: "failed" })
  })
})

describe("resetPassword (the page a link opens)", () => {
  it("puts the token in the Authorization header and sends only { password }", async () => {
    await putLink()
    const result = await resetPassword({ password: "a-good-password", email: "ali@example.com" }, "pk")
    expect(result).toEqual({
      kind: "changed",
      href: "/pk/account?view=signin&email=ali%40example.com&notice=password-changed",
    })
    expect(state.fetches).toHaveLength(1)
    expect(state.fetches[0].url).toMatch(/\/auth\/customer\/emailpass\/update$/)
    expect(sentHeaders().authorization).toBe(`Bearer ${TOKEN}`)
    expect(JSON.parse(state.fetches[0].init.body as string)).toEqual({ password: "a-good-password" })
    expect(state.fetches[0].url).not.toContain(TOKEN)
    expect(String(state.fetches[0].init.body)).not.toContain(TOKEN)
  })

  it("checks the password before anything is sent: a short one or only spaces uses no link up", async () => {
    await putLink()
    for (const password of ["1234567", "        ", ""]) {
      const result = await resetPassword({ password, email: "ali@example.com" }, "pk")
      expect(result.kind, password).toBe("invalid")
    }
    expect(state.fetches).toHaveLength(0)
    // the link is still there for a good password
    expect(state.jar.has(RESET_COOKIE)).toBe(true)
    expect((await resetPassword({ password: "a-good-password", email: "ali@example.com" }, "pk")).kind).toBe("changed")
  })

  it("clears the link's cookie, on its own path, once the password is changed", async () => {
    await putLink()
    await resetPassword({ password: "a-good-password", email: "ali@example.com" }, "gb")
    expect(state.jar.has(RESET_COOKIE)).toBe(false)
    expect(state.set.at(-1)).toMatchObject({ name: RESET_COOKIE, value: "", options: { path: "/gb/account/reset-password", maxAge: 0 } })
  })

  it("an expired, used or wrong link (401) is gone, and its cookie is cleared", async () => {
    await putLink()
    state.answer = () => new Response(null, { status: 401 })
    expect(await resetPassword({ password: "a-good-password", email: "ali@example.com" }, "pk")).toEqual({ kind: "gone" })
    expect(state.jar.has(RESET_COOKIE)).toBe(false)
  })

  it("with no cookie, or one that is altered or expired, it is gone and nothing is sent", async () => {
    expect(await resetPassword({ password: "a-good-password", email: "ali@example.com" }, "pk")).toEqual({ kind: "gone" })
    state.jar.set(RESET_COOKIE, "v1.AAAA.BBBB")
    expect(await resetPassword({ password: "a-good-password", email: "ali@example.com" }, "pk")).toEqual({ kind: "gone" })
    state.jar.set(RESET_COOKIE, await sealReset({ token: TOKEN, email: "a@b.co" }, resetSecret(), Date.now() - 16 * 60 * 1000))
    expect(await resetPassword({ password: "a-good-password", email: "ali@example.com" }, "pk")).toEqual({ kind: "gone" })
    expect(state.fetches).toHaveLength(0)
  })

  it("the backend down or erring keeps the link usable: the cookie stays and the answer is 'failed'", async () => {
    await putLink()
    state.answer = () => {
      throw new TypeError("fetch failed")
    }
    expect(await resetPassword({ password: "a-good-password", email: "ali@example.com" }, "pk")).toEqual({ kind: "failed" })
    state.answer = () => new Response(null, { status: 502 })
    expect(await resetPassword({ password: "a-good-password", email: "ali@example.com" }, "pk")).toEqual({ kind: "failed" })
    expect(state.jar.has(RESET_COOKIE)).toBe(true)
    state.answer = () => new Response(null, { status: 200 })
    expect((await resetPassword({ password: "a-good-password", email: "ali@example.com" }, "pk")).kind).toBe("changed")
  })

  it("sends the update only when the email the form shows is the cookie's (trimmed, any case)", async () => {
    await putLink(TOKEN, "ali@example.com")
    const result = await resetPassword({ password: "a-good-password", email: "  Ali@Example.COM " }, "pk")
    expect(result.kind).toBe("changed")
    expect(state.fetches).toHaveLength(1)
  })

  it("another link's cookie (a second link opened in another tab): nothing is sent, the cookie stays, the answer is 'stale'", async () => {
    await putLink(TOKEN, "bob@example.com")
    const before = state.jar.get(RESET_COOKIE)
    expect(await resetPassword({ password: "a-good-password", email: "ali@example.com" }, "pk")).toEqual({ kind: "stale" })
    expect(state.fetches).toHaveLength(0)
    expect(state.set).toHaveLength(0)
    expect(state.jar.get(RESET_COOKIE)).toBe(before)
    // the page that really belongs to the cookie's link still works afterwards
    expect((await resetPassword({ password: "a-good-password", email: "bob@example.com" }, "pk")).kind).toBe("changed")
    expect(state.fetches).toHaveLength(1)
  })

  it("a form that sent no email (or a blank or odd one) cannot be matched: nothing is sent, the cookie stays", async () => {
    await putLink()
    for (const email of [undefined, "", "   ", null, 42, "not an email"]) {
      const result = await resetPassword({ password: "a-good-password", email } as unknown as { password: string; email: string }, "pk")
      expect(result, String(email)).toEqual({ kind: "stale" })
    }
    expect(await resetPassword({ password: "a-good-password" } as unknown as { password: string; email: string }, "pk")).toEqual({ kind: "stale" })
    expect(state.fetches).toHaveLength(0)
    expect(state.jar.has(RESET_COOKIE)).toBe(true)
    expect(state.set).toHaveLength(0)
  })

  it("a dead cookie is still 'gone' (and cleared) whatever email the form sent", async () => {
    expect(await resetPassword({ password: "a-good-password", email: "ali@example.com" }, "pk")).toEqual({ kind: "gone" })
    expect(state.fetches).toHaveLength(0)
  })

  it("refuses a country code that is not two letters", async () => {
    await putLink()
    expect(await resetPassword({ password: "a-good-password", email: "ali@example.com" }, "../x")).toEqual({ kind: "gone" })
    expect(state.fetches).toHaveLength(0)
  })
})
