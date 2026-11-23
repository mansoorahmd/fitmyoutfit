import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { apiPayments, apiStarted } from "@lib/team-order/payments-fixtures"

vi.mock("./cookies", () => ({ getAuthHeaders: async () => ({ authorization: "Bearer test-token" }) }))

import { completePayment, retrievePayments, startPayment } from "./team-order-payments"

type Reply = { status: number; body?: unknown }
let replies: Reply[] = []
let requests: { url: string; init: RequestInit }[] = []

beforeEach(() => {
  replies = []
  requests = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      requests.push({ url, init })
      const reply = replies.shift()
      if (!reply) throw new Error("no connection")
      return { status: reply.status, json: async () => reply.body ?? null }
    })
  )
})
afterEach(() => vi.unstubAllGlobals())

describe("what each payments call sends", () => {
  it("reads the payments with the customer's token", async () => {
    replies.push({ status: 200, body: apiPayments() })
    const r = await retrievePayments("teamord_1")
    expect(r.ok).toBe(true)
    expect(requests[0]!.url).toMatch(/\/store\/team-orders\/teamord_1\/payments$/)
    expect(requests[0]!.init.method).toBe("GET")
    expect((requests[0]!.init.headers as Record<string, string>).authorization).toBe("Bearer test-token")
  })

  it("starts a part with no amount in the body (the amount is the backend's rule)", async () => {
    replies.push({ status: 200, body: apiStarted() })
    const r = await startPayment("teamord_1", "deposit")
    expect(r.ok && r.value.next).toEqual({ type: "confirm" })
    expect(requests[0]!.url).toMatch(/\/payments\/deposit$/)
    expect(requests[0]!.init.method).toBe("POST")
    expect(JSON.parse(String(requests[0]!.init.body))).toEqual({})
  })

  it("completes with the session id and nothing else", async () => {
    replies.push({ status: 200, body: apiPayments({ team_order: { status: "deposit_paid" } }) })
    const r = await completePayment("teamord_1", "balance", "payses_9")
    expect(r.ok).toBe(true)
    expect(requests[0]!.url).toMatch(/\/payments\/balance\/complete$/)
    expect(JSON.parse(String(requests[0]!.init.body))).toEqual({ session_id: "payses_9" })
  })

  it("answers a refusal with its code, not found for another customer's order, and unavailable for no answer or an unreadable one", async () => {
    replies.push({ status: 400, body: { type: "not_allowed", code: "deposit_not_due", message: "m", status: "draft" } })
    const refused = await startPayment("teamord_1", "deposit")
    expect(refused).toEqual({ ok: false, failure: { kind: "refused", status: 400, code: "deposit_not_due", extra: { status: "draft" } } })
    replies.push({ status: 404, body: { type: "not_found", code: "team_order_not_found", message: "m" } })
    expect(await retrievePayments("teamord_2")).toEqual({ ok: false, failure: { kind: "not_found" } })
    replies.push({ status: 409, body: { type: "conflict", code: "payment_busy", message: "m" } })
    const busy = await completePayment("teamord_1", "deposit", "payses_1")
    expect(busy.ok === false && busy.failure.kind === "refused" && busy.failure.code).toBe("payment_busy")
    expect((await retrievePayments("teamord_1")).ok).toBe(false)
    replies.push({ status: 200, body: { team_order: {} } })
    expect(await retrievePayments("teamord_1")).toEqual({ ok: false, failure: { kind: "unavailable" } })
  })
})
