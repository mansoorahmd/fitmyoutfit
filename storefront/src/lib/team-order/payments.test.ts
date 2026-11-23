import { describe, expect, it } from "vitest"

import { apiPayments, apiStarted } from "./payments-fixtures"
import {
  changeListOffered,
  costBlock,
  moneyKey,
  moneyWords,
  parsePaymentsAnswer,
  parseStartAnswer,
  paymentFailure,
  payModel,
  readNext,
  statementWithMoney,
} from "./payments"
import type { TeamOrderStatus } from "./types"

// Intl puts a no-break space after the currency code: the tests compare with a plain space
const plain = <T,>(x: T): T => JSON.parse(JSON.stringify(x).replace(/ /g, " "))
const view = (over: Parameters<typeof apiPayments>[0] = {}) => parsePaymentsAnswer(apiPayments(over))!

describe("reading the payments answer", () => {
  it("reads the cost, both parts, the totals and the Medusa order", () => {
    const v = view({ deposit: { state: "paid", due: false, paid_at: "2026-11-23T10:00:00.000Z", by_hand: false } })
    expect(v.teamOrder).toEqual({ id: "teamord_1", status: "approved", kind: "order" })
    expect(v.cost.lines).toEqual([
      { size: "M", quantity: 3, unitPrice: 3500, total: 10500 },
      { size: "L", quantity: 17, unitPrice: 3500, total: 59500 },
    ])
    expect(v.cost.delivery).toEqual({ name: "Delivery in Pakistan", amount: 250, dutyPaid: false })
    expect(v.cost.rush).toBeNull()
    expect(v.deposit).toMatchObject({ amount: 35125, state: "paid", paidAt: "2026-11-23T10:00:00.000Z", byHand: false })
    expect(v.paidTotal).toBe(0)
    expect(v.order).toEqual({ id: "order_1", displayId: 4, status: "pending" })
  })
  it("a quote has no Medusa order; a rush charge and a duty-paid delivery are read", () => {
    const v = parsePaymentsAnswer(
      apiPayments({ order: null, cost: { state: "quote", currency_code: "gbp", delivery: { name: "Shipping & duties included", amount: 0, duty_paid: true }, rush: { amount: 88, percentage: 20 } } })
    )!
    expect(v.order).toBeNull()
    expect(v.cost.state).toBe("quote")
    expect(v.cost.rush).toEqual({ amount: 88, percentage: 20 })
    expect(v.cost.delivery?.dutyPaid).toBe(true)
  })
  it("an answer that cannot be read is null, never a half object", () => {
    expect(parsePaymentsAnswer(null)).toBeNull()
    expect(parsePaymentsAnswer({})).toBeNull()
    expect(parsePaymentsAnswer(apiPayments({ cost: { total: "70250" } }))).toBeNull()
    expect(parsePaymentsAnswer(apiPayments({ deposit: { state: "mystery" } }))).toBeNull()
    expect(parsePaymentsAnswer(apiPayments({ team_order: { status: "paid" } }))).toBeNull()
    expect(parsePaymentsAnswer(apiPayments({ cost: { lines: [{ size: "M" }] } }))).toBeNull()
  })
  it("reads the session of a started part", () => {
    const v = view({ deposit: { state: "started", session: { id: "payses_1", provider_id: "pp_system_default", status: "pending" } } })
    expect(v.deposit.session).toEqual({ id: "payses_1", providerId: "pp_system_default", status: "pending" })
  })
})

describe("the start answer and next", () => {
  it("confirm", () => {
    const s = parseStartAnswer(apiStarted())!
    expect(s).toMatchObject({ part: "deposit", amount: 35125, currencyCode: "pkr", next: { type: "confirm" } })
    expect(s.session).toEqual({ id: "payses_1", providerId: "pp_system_default", status: "pending" })
  })
  it("a redirect with an https address is known; any other type or a bad address is unknown, never a crash", () => {
    expect(readNext({ type: "redirect", url: "https://pay.example/x" })).toEqual({ type: "redirect", url: "https://pay.example/x" })
    expect(readNext({ type: "redirect", url: "javascript:alert(1)" })).toEqual({ type: "unknown" })
    expect(readNext({ type: "redirect" })).toEqual({ type: "unknown" })
    expect(readNext({ type: "three_d_secure" })).toEqual({ type: "unknown" })
    expect(readNext(null)).toEqual({ type: "unknown" })
    expect(parseStartAnswer(apiStarted({ next: { type: "wallet" } }))!.next).toEqual({ type: "unknown" })
  })
  it("a start answer with no session is unreadable", () => {
    const bad = { ...apiStarted(), payment: { part: "deposit", amount: 1, currency_code: "pkr", session: null, next: { type: "confirm" } } }
    expect(parseStartAnswer(bad)).toBeNull()
  })
})

describe("the cost block", () => {
  it("Pakistan: a line per size, delivery as an amount, no rush, tax not final, total and split", () => {
    const b = plain(costBlock(view({ cost: { state: "quote" } })))
    expect(b.lines.map((l) => [l.label, l.value])).toEqual([
      ["M · 3 × PKR 3,500", "PKR 10,500"],
      ["L · 17 × PKR 3,500", "PKR 59,500"],
    ])
    expect(b.piecesText).toBe("20 pieces")
    expect(b.extras.map((r) => [r.key, r.label, r.value, r.note])).toEqual([
      ["delivery", "Delivery in Pakistan", "PKR 250", undefined],
      ["tax", "Tax", "PKR 0", "Tax not final"],
    ])
    expect(b.total).toBe("PKR 70,250")
    expect(b.deposit.amount).toBe("PKR 35,125")
    expect(b.deposit.hint).toContain("50%")
    expect(b.balance.amount).toBe("PKR 35,125")
  })
  it("UK: the duty-paid delivery is words, the rush line has its share, pounds have pence", () => {
    const b = plain(costBlock(
      view({
        cost: {
          currency_code: "gbp",
          lines: [{ size: "XS", quantity: 3, unit_price: 22, total: 66 }],
          delivery: { name: "Shipping & duties included", amount: 0, duty_paid: true },
          rush: { amount: 13.2, percentage: 20 },
          tax_total: 1.5,
          tax_final: true,
          total: 22.01,
        },
        deposit: { amount: 11.01 },
        balance: { amount: 11 },
      })
    ))
    expect(b.lines[0]).toMatchObject({ label: "XS · 3 × GBP 22.00", value: "GBP 66.00" })
    expect(b.extras.map((r) => [r.key, r.label, r.value])).toEqual([
      ["delivery", "Shipping & duties included", "Included"],
      ["rush", "Rush delivery (20% of the garments)", "GBP 13.20"],
      ["tax", "Tax", "GBP 1.50"],
    ])
    expect(b.extras[2]!.note).toBeUndefined()
    expect(b.total).toBe("GBP 22.01")
    expect(b.deposit.amount).toBe("GBP 11.01")
    expect(b.balance.amount).toBe("GBP 11.00")
  })
  it("one piece is said in the singular", () => {
    expect(costBlock(view({ cost: { pieces: 1 } })).piecesText).toBe("1 piece")
  })
  it("the signing statement names the total, the deposit and the balance the backend gave", () => {
    const s = plain(statementWithMoney(view({ balance: { amount: 35125 } })))
    expect(s).toContain("the total is PKR 70,250")
    expect(s).toContain("a deposit of PKR 35,125")
    expect(s).toContain("balance of PKR 35,125")
  })
  it("money words are the store format: the code, then the number", () => {
    expect(plain(moneyWords(3500, "pkr"))).toBe("PKR 3,500")
    expect(plain(moneyWords(95, "aed"))).toBe("AED 95.00")
  })
})

describe("what the payment page offers", () => {
  const parts = (deposit: Record<string, unknown>, balance: Record<string, unknown> = {}) => {
    const v = parsePaymentsAnswer(apiPayments({ deposit, balance }))!
    return { deposit: v.deposit, balance: v.balance }
  }
  const model = (status: TeamOrderStatus, deposit: Record<string, unknown>, balance: Record<string, unknown> = {}) => payModel(status, parts(deposit, balance))

  it("a draft and a proof that is out have nothing to pay", () => {
    expect(payModel("draft", null)).toEqual({ kind: "not_priced" })
    expect(payModel("proof_sent", null)).toEqual({ kind: "proof_out" })
  })
  it("approved: the deposit is due, also when it was started and not finished", () => {
    expect(model("approved", { due: true })).toEqual({ kind: "pay", part: "deposit" })
    expect(model("approved", { due: true, state: "started" })).toEqual({ kind: "pay", part: "deposit" })
  })
  it("approved with the deposit with the payment system: processing, no button", () => {
    expect(model("approved", { due: false, state: "authorized" })).toEqual({ kind: "processing", part: "deposit" })
    expect(model("approved", { due: false, state: "awaiting" })).toEqual({ kind: "processing", part: "deposit" })
  })
  it("deposit paid and in production: the balance is not due yet", () => {
    expect(model("deposit_paid", { state: "paid", due: false })).toEqual({ kind: "balance_not_due", production: false })
    expect(model("in_production", { state: "paid", due: false })).toEqual({ kind: "balance_not_due", production: true })
  })
  it("balance due: the balance is the action; paid: paid in full; shipped: paid in full and shipped", () => {
    expect(model("balance_due", { state: "paid", due: false }, { due: true })).toEqual({ kind: "pay", part: "balance" })
    expect(model("balance_due", { state: "paid", due: false }, { state: "paid", due: false })).toEqual({ kind: "paid_in_full", shipped: false })
    expect(model("shipped", { state: "paid", due: false }, { state: "paid", due: false })).toEqual({ kind: "paid_in_full", shipped: true })
  })
  it("a refunded or canceled part is said, not offered", () => {
    expect(model("balance_due", { state: "paid", due: false }, { state: "refunded" })).toEqual({ kind: "refunded" })
    expect(model("approved", { state: "canceled" })).toEqual({ kind: "canceled" })
  })
  it("nothing due and no reading: never a dead button", () => {
    expect(model("approved", { due: false })).toEqual({ kind: "nothing_due" })
    expect(payModel("approved", null)).toEqual({ kind: "nothing_due" })
  })
})

describe("the money state on the order page", () => {
  const bal = (state: string) => ({ balance: parsePaymentsAnswer(apiPayments({ balance: { state } }))!.balance })
  it("is the status, except a balance already paid before shipping", () => {
    for (const s of ["draft", "proof_sent", "approved", "deposit_paid", "in_production", "shipped"] as const) expect(moneyKey(s, null)).toBe(s)
    expect(moneyKey("balance_due", bal("unpaid"))).toBe("balance_due")
    expect(moneyKey("balance_due", bal("paid"))).toBe("balance_paid")
    expect(moneyKey("balance_due", null)).toBe("balance_due")
  })
  it("Change the list: while a proof is out, and from the signed proof until deposit money is authorised or taken", () => {
    const dep = (state: string) => ({ deposit: parsePaymentsAnswer(apiPayments({ deposit: { state } }))!.deposit })
    expect(changeListOffered("draft", null)).toBe(false)
    expect(changeListOffered("proof_sent", null)).toBe(true)
    expect(changeListOffered("approved", dep("unpaid"))).toBe(true)
    expect(changeListOffered("approved", dep("started"))).toBe(true)
    expect(changeListOffered("approved", dep("authorized"))).toBe(false)
    expect(changeListOffered("approved", dep("awaiting"))).toBe(false)
    expect(changeListOffered("approved", dep("paid"))).toBe(false)
    expect(changeListOffered("approved", dep("refunded"))).toBe(false)
    expect(changeListOffered("approved", null)).toBe(true)
    for (const s of ["deposit_paid", "in_production", "balance_due", "shipped"] as const) expect(changeListOffered(s, null)).toBe(false)
  })
})

describe("failures", () => {
  const refused = (code: string) => ({ kind: "refused" as const, status: 400, code })
  it("signed out, not found and unavailable", () => {
    expect(paymentFailure("start", { kind: "signed_out" }).signedOut).toBe(true)
    expect(paymentFailure("load", { kind: "not_found" }).notFound).toBe(true)
    const u = paymentFailure("complete", { kind: "unavailable" })
    expect(u.unavailable).toBe(true)
    expect(u.text).toContain("Do not pay again")
    expect(paymentFailure("start", { kind: "unavailable" }).text).toContain("Nothing was taken")
  })
  it("already paid and start-again are told apart", () => {
    expect(paymentFailure("complete", refused("deposit_already_paid")).alreadyPaid).toBe(true)
    expect(paymentFailure("start", refused("balance_already_paid")).alreadyPaid).toBe(true)
    expect(paymentFailure("complete", refused("payment_session_stale")).startAgain).toBe(true)
    expect(paymentFailure("complete", refused("payment_failed")).startAgain).toBe(true)
    expect(paymentFailure("complete", refused("payment_requires_action")).startAgain).toBe(false)
  })
  it("a code with no sentence gets the general one of its step, never nothing", () => {
    expect(paymentFailure("start", refused("brand_new_code")).text).toMatch(/Nothing was taken/)
    expect(paymentFailure("complete", refused("brand_new_code")).text.length).toBeGreaterThan(10)
  })
  it("the message of the backend is never shown", () => {
    const f = paymentFailure("start", { kind: "refused", status: 400, code: "deposit_not_due", extra: { message: "for developers" } })
    expect(f.text).not.toContain("developers")
  })
})
