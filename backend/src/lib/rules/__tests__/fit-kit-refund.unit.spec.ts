import { products } from "../../../scripts/seed-data/products"
import {
  BY_HAND_PROVIDER_ID,
  decideKitRefund,
  FIT_KIT_KIND,
  isFitKitKind,
  kitAmounts,
  kitRefundState,
  REFUSAL_CODES,
  REFUSAL_MESSAGES,
  type KitRefundInput,
} from "../fit-kit-refund"
import { toFixedString } from "../exact-amount"
import { readReturnDays } from "../../settings/fit-kit-refund"

const NOW = new Date("2026-12-01T10:00:00Z")

type Options = Partial<KitRefundInput> & { kit?: number; kitTotal?: number; garmentTotal?: number; digits?: number }

/** An order of one fit kit line and one garment line, paid in full by one payment. */
function order(options: Options = {}): KitRefundInput {
  const { kit, kitTotal = 5000, garmentTotal = 7000, digits, ...rest } = options
  const total = kitTotal + garmentTotal
  return {
    orderStatus: "pending",
    currencyDigits: digits ?? 0,
    orderTotal: total,
    lines: [
      { id: "kit", kind: "fit_kit", quantity: kit ?? 2, total: kitTotal },
      { id: "garment", kind: "garment", quantity: 4, total: garmentTotal },
    ],
    payments: [{ id: "pay_1", provider_id: "pp_system_default", canceled: false, captured: total, refunded: 0 }],
    prior: [],
    orderCreatedAt: "2026-11-30T10:00:00Z",
    now: NOW,
    ...rest,
  }
}

const fixed = (lines: Parameters<typeof kitAmounts>[0], digits: number) =>
  kitAmounts(lines, digits).map((amount) => toFixedString(amount, digits))

describe("which lines are fit kits", () => {
  it("is the product kind of the seed's fit kit, compared exactly", () => {
    expect(products.data.filter((p) => isFitKitKind(p.kind)).map((p) => p.handle)).toEqual(["fit-kit"])
    expect(FIT_KIT_KIND).toBe("fit_kit")
    expect(isFitKitKind("Fit_Kit")).toBe(false)
    expect(isFitKitKind(undefined)).toBe(false)
    expect(isFitKitKind("garment")).toBe(false)
  })

  it("has no fit kit when no line is one", () => {
    const state = kitRefundState({ ...order(), lines: [{ id: "g", kind: "garment", quantity: 3, total: 9000 }] })
    expect(state).toMatchObject({ applies: false, can_refund: false, reason: "no_fit_kit", kits_total: 0 })
  })
})

describe("what a return refunds", () => {
  it("is the kit lines' money only, never a garment's", () => {
    const decision = decideKitRefund(order({ kitTotal: 5000, garmentTotal: 7000 }), 2)
    expect(decision).toMatchObject({ ok: true, quantity: 2, amount: 5000, method: "medusa", paymentId: "pay_1" })
  })

  it("splits a line's total exactly across its kits, so the shares add up to the line", () => {
    const shares = fixed([{ id: "k", kind: "fit_kit", quantity: 3, total: 100 }], 2)
    expect(shares).toEqual(["33.33", "33.34", "33.33"])
  })

  it("works in PKR (0 decimals)", () => {
    const pkr = fixed([{ id: "k", kind: "fit_kit", quantity: 3, total: 5000 }], 0)
    expect(pkr).toEqual(["1667", "1666", "1667"])
    expect(pkr.reduce((s, x) => s + Number(x), 0)).toBe(5000)
  })

  it("works in GBP, AED and USD (2 decimals), and shares always add up to the line", () => {
    expect(fixed([{ id: "k", kind: "fit_kit", quantity: 1, total: "12.50" }], 2)).toEqual(["12.50"])
    const gbp = fixed([{ id: "k", kind: "fit_kit", quantity: 2, total: "25.01" }], 2)
    expect(gbp).toEqual(["12.51", "12.50"])
    const aed = fixed([{ id: "k", kind: "fit_kit", quantity: 3, total: "55.00" }], 2)
    expect(aed).toEqual(["18.33", "18.34", "18.33"])
    const usd = fixed([{ id: "k", kind: "fit_kit", quantity: 7, total: { value: "0.10" } }], 2)
    expect(usd.reduce((s, x) => s + Math.round(Number(x) * 100), 0)).toBe(10)
    const usd2 = fixed([{ id: "k", kind: "fit_kit", quantity: 3, total: 36.75 }], 2)
    expect(usd2.reduce((s, x) => s + Math.round(Number(x) * 100), 0)).toBe(3675)
  })

  it("refunds kits one after the other, by quantity", () => {
    const input = order({ kit: 2, kitTotal: 5000 })
    expect(decideKitRefund(input, 1)).toMatchObject({ ok: true, amount: 2500 })
    const afterOne = { ...input, prior: [{ quantity: 1, amount: 2500 }] }
    expect(decideKitRefund(afterOne, 1)).toMatchObject({ ok: true, amount: 2500 })
    expect(kitRefundState(afterOne)).toMatchObject({
      kits_total: 2,
      kits_returned: 1,
      kits_left: 1,
      refunded_amount: 2500,
      amounts_by_quantity: [2500],
    })
  })

  it("refuses a third return of two kits", () => {
    const input = order({ kit: 2, prior: [{ quantity: 1, amount: 2500 }, { quantity: 1, amount: 2500 }] })
    expect(decideKitRefund(input, 1)).toMatchObject({ ok: false, code: "nothing_to_refund" })
    expect(kitRefundState(input)).toMatchObject({ kits_left: 0, can_refund: false })
  })

  it("lists what returning 1, 2, ... kits refunds", () => {
    expect(kitRefundState(order({ kit: 3, kitTotal: 5000 })).amounts_by_quantity).toEqual([1667, 3333, 5000])
  })

  it("adds up two kit lines", () => {
    const input = order()
    input.lines = [
      { id: "a", kind: "fit_kit", quantity: 1, total: 1000 },
      { id: "b", kind: "fit_kit", quantity: 1, total: 1200 },
      { id: "g", kind: "garment", quantity: 1, total: 800 },
    ]
    input.orderTotal = 3000
    input.payments[0]!.captured = 3000
    expect(kitRefundState(input).amounts_by_quantity).toEqual([1000, 2200])
    expect(decideKitRefund({ ...input, prior: [{ quantity: 1, amount: 1000 }] }, 1)).toMatchObject({ ok: true, amount: 1200 })
  })
})

describe("the quantity", () => {
  it.each([0, -1, 3, 1.5, "1", null, undefined, Number.NaN, Infinity])("refuses %p of two kits", (quantity) => {
    expect(decideKitRefund(order({ kit: 2 }), quantity)).toMatchObject({ ok: false, code: "invalid_quantity" })
  })
  it("accepts 1 and 2", () => {
    expect(decideKitRefund(order({ kit: 2 }), 1).ok).toBe(true)
    expect(decideKitRefund(order({ kit: 2 }), 2).ok).toBe(true)
  })
})

describe("when", () => {
  it("refuses an order whose payment is not captured", () => {
    const input = order()
    input.payments[0]!.captured = 0
    expect(decideKitRefund(input, 1)).toMatchObject({ ok: false, code: "not_paid" })
  })
  it("refuses an order that is only partly captured", () => {
    const input = order()
    input.payments[0]!.captured = 5000
    expect(decideKitRefund(input, 1)).toMatchObject({ ok: false, code: "not_paid" })
  })
  it("refuses an order with no payment", () => {
    expect(decideKitRefund({ ...order(), payments: [] }, 1)).toMatchObject({ ok: false, code: "not_paid" })
  })
  it("ignores a canceled payment's captures", () => {
    const input = order()
    input.payments[0]!.canceled = true
    expect(decideKitRefund(input, 1)).toMatchObject({ ok: false, code: "not_paid" })
  })
  it("refuses a canceled order, by status or by date", () => {
    expect(decideKitRefund({ ...order(), orderStatus: "canceled" }, 1)).toMatchObject({ ok: false, code: "order_canceled" })
    expect(decideKitRefund({ ...order(), orderCanceledAt: "2026-11-30T12:00:00Z" }, 1)).toMatchObject({ ok: false, code: "order_canceled" })
  })
  it("refuses once the payment holds less than the kit (refunded elsewhere)", () => {
    const input = order({ kitTotal: 5000, kit: 1 })
    input.payments[0]!.refunded = 9000
    expect(decideKitRefund(input, 1)).toMatchObject({ ok: false, code: "payment_refunded_elsewhere" })
  })
  it("allows a refund up to exactly what the payment still holds", () => {
    const input = order({ kitTotal: 5000, kit: 1 })
    input.payments[0]!.refunded = 7000
    expect(decideKitRefund(input, 1)).toMatchObject({ ok: true, amount: 5000 })
  })
  it("uses the payment that has enough left among several", () => {
    const input = order({ kitTotal: 2000, kit: 1, garmentTotal: 2000 })
    input.payments = [
      { id: "small", provider_id: "pp_system_default", canceled: false, captured: 1000, refunded: 0 },
      { id: "big", provider_id: "pp_system_default", canceled: false, captured: 3000, refunded: 0 },
    ]
    expect(decideKitRefund(input, 1)).toMatchObject({ ok: true, paymentId: "big" })
  })
  it("has no time limit with no setting, 0, or null", () => {
    const old = order({ orderCreatedAt: "2020-01-01T00:00:00Z" })
    for (const returnDays of [undefined, null, 0]) {
      expect(decideKitRefund({ ...old, returnDays }, 1).ok).toBe(true)
    }
  })
  it("refuses after the window, and allows within it", () => {
    expect(decideKitRefund({ ...order({ orderCreatedAt: "2026-10-01T00:00:00Z" }), returnDays: 30 }, 1)).toMatchObject({
      ok: false,
      code: "return_window_over",
    })
    expect(decideKitRefund({ ...order({ orderCreatedAt: "2026-11-20T00:00:00Z" }), returnDays: 30 }, 1).ok).toBe(true)
  })
})

describe("by hand", () => {
  it("is the method for cash on delivery, with the amount worked out here", () => {
    const input = order()
    input.payments[0]!.provider_id = BY_HAND_PROVIDER_ID
    expect(decideKitRefund(input, 2)).toMatchObject({ ok: true, method: "by_hand", amount: 5000 })
    expect(kitRefundState(input)).toMatchObject({ method: "by_hand", can_refund: true })
  })
  it("still needs the cash collected", () => {
    const input = order()
    input.payments[0]!.provider_id = BY_HAND_PROVIDER_ID
    input.payments[0]!.captured = 0
    expect(decideKitRefund(input, 1)).toMatchObject({ ok: false, code: "not_paid" })
  })
})

describe("refusals", () => {
  it("every code has a sentence for staff", () => {
    for (const code of REFUSAL_CODES) {
      expect(REFUSAL_MESSAGES[code].length).toBeGreaterThan(10)
    }
  })
})

describe("the setting", () => {
  it("is 0 (no limit) when missing and a whole number otherwise", () => {
    expect(readReturnDays({})).toEqual({ ok: true, value: 0 })
    expect(readReturnDays(undefined)).toEqual({ ok: true, value: 0 })
    expect(readReturnDays({ fit_kit_return_days: 30 })).toEqual({ ok: true, value: 30 })
    expect(readReturnDays({ fit_kit_return_days: "14" })).toEqual({ ok: true, value: 14 })
    expect(readReturnDays({ fit_kit_return_days: -1 }).ok).toBe(false)
    expect(readReturnDays({ fit_kit_return_days: 1.5 }).ok).toBe(false)
    expect(readReturnDays({ fit_kit_return_days: "soon" }).ok).toBe(false)
  })
})
