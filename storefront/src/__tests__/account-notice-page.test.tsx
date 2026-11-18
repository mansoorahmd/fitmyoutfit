import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({ cookies: new Set<string>() }))
vi.mock("next/headers", () => ({ cookies: async () => ({ has: (name: string) => state.cookies.has(name), get: () => undefined }) }))
vi.mock("@lib/data/customer", () => ({ customerState: async () => ({ kind: "signed_out" }) }))
vi.mock("@lib/data/orders", () => ({ listAccountOrders: async () => ({ ok: true, orders: [], promises: [] }) }))
vi.mock("@lib/data/regions", () => ({ listRegions: async () => [] }))

import AccountPage from "../app/[countryCode]/(main)/account/page"

const show = async (query: Record<string, string>) => {
  const element = (await AccountPage({ searchParams: Promise.resolve(query) })) as { props: { notice: string | null } }
  return element.props.notice
}

beforeEach(() => {
  state.cookies = new Set()
})

// M3: `?notice=password-changed` typed into an address must not say the password was changed.
describe("the sign-in page's password-changed notice", () => {
  const query = { view: "signin", email: "a@b.co", notice: "password-changed" }

  it("shows only while the reset action's flag is there", async () => {
    expect(await show(query)).toBeNull()
    state.cookies.add("fmo_pw_notice")
    expect(await show(query)).toBe("password-changed")
  })

  it("needs the notice in the query too, and the sign-in view", async () => {
    state.cookies.add("fmo_pw_notice")
    expect(await show({ view: "signin" })).toBeNull()
    expect(await show({ view: "signin", notice: "other" })).toBeNull()
    expect(await show({ view: "create", notice: "password-changed" })).toBeNull()
  })
})
