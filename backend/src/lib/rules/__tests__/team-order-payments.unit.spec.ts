import { settings } from "../../../scripts/seed-data/settings"
import { add, exact, toFixedString } from "../exact-amount"
import {
  balanceAfterDeposit,
  balanceRecord,
  depositStep,
  holdsMoney,
  isAdminUserId,
  isAfter,
  isDue,
  isPaymentPart,
  isPaymentPathPattern,
  isTeamOrderOrder,
  isTeamOrderPaymentProvider,
  mayShip,
  netCaptured,
  partState,
  paymentLink,
  piecesBySize,
  splitTotal,
  whyNoPayment,
  whyNoReopenForMoney,
  type PartState,
} from "../team-order-payments"
import { TEAM_ORDER_STATUSES, type TeamOrderStatus } from "../team-order-status"

const DIGITS = { pkr: 0, gbp: 2, aed: 2, usd: 2 } as const

const split = (total: string | number, percentage: number, digits: number) => {
  const s = splitTotal(total, percentage, digits)
  return { deposit: toFixedString(s.deposit, digits), balance: toFixedString(s.balance, digits) }
}

describe("the split of a total into the deposit and the balance", () => {
  it("is the seeded share, not a literal in the code", () => {
    expect((settings.data as Record<string, unknown>).team_order_deposit_percentage).toBe(50)
  })

  it("halves an even total in every currency", () => {
    expect(split(71484, 50, DIGITS.pkr)).toEqual({ deposit: "35742", balance: "35742" })
    expect(split("440.00", 50, DIGITS.gbp)).toEqual({ deposit: "220.00", balance: "220.00" })
    expect(split("1900.00", 50, DIGITS.aed)).toEqual({ deposit: "950.00", balance: "950.00" })
    expect(split("560.00", 50, DIGITS.usd)).toEqual({ deposit: "280.00", balance: "280.00" })
  })

  it("rounds the deposit half up to the currency's smallest unit and gives the rest to the balance (odd totals)", () => {
    // PKR has no minor unit: 3,501 / 2 = 1,750.5 -> deposit 1,751, balance 1,750.
    expect(split(3501, 50, DIGITS.pkr)).toEqual({ deposit: "1751", balance: "1750" })
    // GBP 22.01 / 2 = 11.005 -> 11.01 and 11.00.
    expect(split("22.01", 50, DIGITS.gbp)).toEqual({ deposit: "11.01", balance: "11.00" })
    expect(split("95.99", 50, DIGITS.aed)).toEqual({ deposit: "48.00", balance: "47.99" })
    expect(split("0.01", 50, DIGITS.usd)).toEqual({ deposit: "0.01", balance: "0.00" })
    // A third: 100 / 3 = 33.333... -> 33.33 and 66.67.
    expect(split("100.00", 100 / 3, DIGITS.usd)).toEqual({ deposit: "33.33", balance: "66.67" })
  })

  it("one piece and a hundred pieces, with delivery and rush, in each currency", () => {
    const cases: [number | string, number][] = [
      [3500 + 250, DIGITS.pkr], // one jersey in Pakistan with delivery
      [100 * 3500 + 250 + 70000, DIGITS.pkr], // a hundred, with 20% rush
      ["22.00", DIGITS.gbp],
      ["2640.00", DIGITS.gbp],
      ["95.00", DIGITS.aed],
      ["11400.00", DIGITS.aed],
      ["28.00", DIGITS.usd],
      ["3360.00", DIGITS.usd],
    ]
    for (const [total, digits] of cases) {
      const s = splitTotal(total, 50, digits)
      expect(toFixedString(add(s.deposit, s.balance), digits)).toBe(toFixedString(exact(total), digits))
    }
  })

  it("always adds up exactly, for every total from 0.00 to 50.00 and several shares", () => {
    for (const percentage of [1, 10, 33, 50, 66.5, 99, 100]) {
      for (let cents = 0; cents <= 5000; cents += 7) {
        const total = (cents / 100).toFixed(2)
        const s = splitTotal(total, percentage, 2)
        expect(toFixedString(add(s.deposit, s.balance), 2)).toBe(total)
        expect(Number(toFixedString(s.balance, 2))).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it("keeps a total with more digits than the currency exact: the balance takes the rest", () => {
    const s = splitTotal("10.005", 50, 2)
    expect(toFixedString(s.deposit, 2)).toBe("5.00")
    expect(toFixedString(add(s.deposit, s.balance), 3)).toBe("10.005")
  })

  it("100% is the whole total and nothing left", () => {
    expect(split("440.00", 100, 2)).toEqual({ deposit: "440.00", balance: "0.00" })
  })

  it("refuses a share of 0 or more than 100, a negative total and wrong digits", () => {
    expect(() => splitTotal(100, 0, 2)).toThrow()
    expect(() => splitTotal(100, 101, 2)).toThrow()
    expect(() => splitTotal(100, Number.NaN, 2)).toThrow()
    expect(() => splitTotal(-1, 50, 2)).toThrow()
    expect(() => splitTotal(100, 50, -1)).toThrow()
    expect(() => splitTotal(100, 50, 1.5)).toThrow()
  })

  it("the balance after the deposit is the total less what the deposit captured, never below 0", () => {
    expect(toFixedString(balanceAfterDeposit("440.00", "220.00"), 2)).toBe("220.00")
    expect(toFixedString(balanceAfterDeposit("450.00", "220.00"), 2)).toBe("230.00")
    expect(toFixedString(balanceAfterDeposit("100.00", "220.00"), 2)).toBe("0.00")
  })
})

describe("the state of a part, from its Medusa payment collection", () => {
  const c = (over: Partial<Parameters<typeof partState>[0]> = {}) => partState({ amount: 100, status: "not_paid", ...over })

  it("reads every state", () => {
    expect(c()).toBe("unpaid")
    expect(c({ status: "awaiting", sessions: [{ status: "pending" }] })).toBe("started")
    expect(c({ status: "awaiting", sessions: [{ status: "requires_more" }] })).toBe("awaiting")
    expect(c({ status: "awaiting", sessions: [{ status: "pending_authorization" }] })).toBe("awaiting")
    expect(c({ status: "authorized", authorizedAmount: 100 })).toBe("authorized")
    expect(c({ status: "completed", capturedAmount: 100 })).toBe("paid")
    expect(c({ status: "completed", capturedAmount: "100.00", refundedAmount: 1 })).toBe("refunded")
    expect(c({ status: "canceled" })).toBe("canceled")
    expect(c({ status: "not_paid", capturedAmount: 40 })).toBe("unpaid")
  })

  it("a captured part stays paid even when Medusa later marks the collection canceled", () => {
    expect(c({ status: "canceled", capturedAmount: 100 })).toBe("paid")
  })

  it("money is held from awaiting on, never for unpaid, started or canceled", () => {
    const held: PartState[] = ["awaiting", "authorized", "paid", "refunded"]
    for (const s of ["unpaid", "started", "awaiting", "authorized", "paid", "refunded", "canceled"] as PartState[]) {
      expect(holdsMoney(s)).toBe(held.includes(s))
    }
  })

  it("net captured is captured less refunded", () => {
    expect(toFixedString(netCaptured({ capturedAmount: 100, refundedAmount: 30 }), 0)).toBe("70")
    expect(toFixedString(netCaptured({ capturedAmount: null, refundedAmount: null }), 0)).toBe("0")
  })
})

describe("when the organizer may pay", () => {
  const all = TEAM_ORDER_STATUSES as readonly TeamOrderStatus[]

  it("the deposit only while approved; after it, already paid", () => {
    for (const status of all) {
      const why = whyNoPayment({ part: "deposit", status, state: "unpaid" })
      if (status === "approved") expect(why).toBeNull()
      else if (isAfter(status, "approved")) expect(why).toBe("deposit_already_paid")
      else expect(why).toBe("deposit_not_due")
    }
  })

  it("the balance only while balance_due; shipped is already paid", () => {
    for (const status of all) {
      const why = whyNoPayment({ part: "balance", status, state: "unpaid" })
      if (status === "balance_due") expect(why).toBeNull()
      else if (status === "shipped") expect(why).toBe("balance_already_paid")
      else expect(why).toBe("balance_not_due")
    }
  })

  it("a part that is paid (or refunded) is refused as already paid, whatever the status", () => {
    expect(whyNoPayment({ part: "deposit", status: "approved", state: "paid" })).toBe("deposit_already_paid")
    expect(whyNoPayment({ part: "balance", status: "balance_due", state: "paid" })).toBe("balance_already_paid")
    expect(whyNoPayment({ part: "balance", status: "balance_due", state: "refunded" })).toBe("balance_already_paid")
  })

  it("a canceled order or collection is refused; a gateway at work blocks a new start only", () => {
    expect(whyNoPayment({ part: "deposit", status: "approved", state: "unpaid", orderCanceled: true })).toBe("order_canceled")
    expect(whyNoPayment({ part: "deposit", status: "approved", state: "canceled" })).toBe("order_canceled")
    expect(whyNoPayment({ part: "deposit", status: "approved", state: "awaiting", forStart: true })).toBe("payment_in_progress")
    expect(whyNoPayment({ part: "deposit", status: "approved", state: "awaiting" })).toBeNull()
    expect(whyNoPayment({ part: "deposit", status: "approved", state: "started", forStart: true })).toBeNull()
  })

  it("`due` follows the same rule", () => {
    expect(isDue("deposit", "approved", "unpaid")).toBe(true)
    expect(isDue("deposit", "proof_sent", null)).toBe(false)
    expect(isDue("balance", "in_production", "unpaid")).toBe(false)
    expect(isDue("balance", "balance_due", "started")).toBe(true)
  })

  it("parts and providers", () => {
    expect(isPaymentPart("deposit")).toBe(true)
    expect(isPaymentPart("balance")).toBe(true)
    expect(isPaymentPart("total")).toBe(false)
    expect(isTeamOrderPaymentProvider("pp_system_default")).toBe(true)
    expect(isTeamOrderPaymentProvider("pp_cod_cod")).toBe(false)
    expect(isTeamOrderPaymentProvider(undefined)).toBe(false)
  })
})

describe("the steps the money causes", () => {
  it("a paid deposit moves approved to deposit_paid, as the system", () => {
    expect(depositStep("approved", "paid", { userId: null })).toEqual({
      kind: "status",
      from: "approved",
      to: "deposit_paid",
      actor: "system",
      actorId: null,
      byHand: false,
    })
  })

  it("as an admin by hand when the capture names an admin user", () => {
    expect(depositStep("approved", "paid", { userId: "user_01ABC" })).toMatchObject({ actor: "admin", actorId: "user_01ABC", byHand: true })
    // Anything else on the capture is not taken as an admin.
    expect(depositStep("approved", "paid", { userId: "cus_01ABC" })).toMatchObject({ actor: "system" })
    expect(isAdminUserId("user_")).toBe(false)
  })

  it("nothing for a deposit that is not paid, or an order that is not approved", () => {
    for (const state of ["unpaid", "started", "awaiting", "authorized", "refunded", "canceled"] as PartState[]) {
      expect(depositStep("approved", state, { userId: null })).toBeNull()
    }
    for (const status of TEAM_ORDER_STATUSES.filter((s) => s !== "approved")) {
      expect(depositStep(status, "paid", { userId: null })).toBeNull()
    }
  })

  it("the balance is recorded once, at balance_due, by the system or the admin named on the capture", () => {
    expect(balanceRecord("balance_due", "paid", { userId: null }, false)).toEqual({ actor: "system", actorId: null, byHand: false })
    expect(balanceRecord("balance_due", "paid", { userId: "user_1" }, false)).toEqual({ actor: "admin", actorId: "user_1", byHand: true })
    expect(balanceRecord("balance_due", "paid", { userId: null }, true)).toBeNull()
    expect(balanceRecord("in_production", "paid", { userId: null }, false)).toBeNull()
    expect(balanceRecord("balance_due", "started", { userId: null }, false)).toBeNull()
  })
})

describe("the gates", () => {
  it("shipping needs the balance paid in full, nothing refunded", () => {
    expect(mayShip("paid")).toBe(true)
    for (const state of [null, "unpaid", "started", "awaiting", "authorized", "refunded", "canceled"] as (PartState | null)[]) {
      expect(mayShip(state)).toBe(false)
    }
  })

  it("going back to draft is refused once money is held or on its way", () => {
    expect(whyNoReopenForMoney(null)).toBeNull()
    expect(whyNoReopenForMoney("unpaid")).toBeNull()
    expect(whyNoReopenForMoney("started")).toBeNull()
    expect(whyNoReopenForMoney("canceled")).toBeNull()
    for (const state of ["awaiting", "authorized", "paid", "refunded"] as PartState[]) {
      expect(whyNoReopenForMoney(state)).toBe("payment_in_progress")
    }
  })
})

describe("what the order is made of", () => {
  const sizes = ["S", "M", "L", "XL"]
  const piecesOf = (line: { count: number }) => (Number.isInteger(line.count) && line.count >= 1 ? line.count : 1)

  it("sums the pieces per size, in the product's size order", () => {
    const lines = [
      { size: "L", count: 1 },
      { size: "M", count: 2 },
      { size: "L", count: 3 },
      { size: "S", count: 0 },
    ]
    expect(piecesBySize(lines, sizes, piecesOf)).toEqual([
      { size: "S", quantity: 1 },
      { size: "M", quantity: 2 },
      { size: "L", quantity: 4 },
    ])
  })

  it("one piece and a hundred pieces", () => {
    expect(piecesBySize([{ size: "M", count: 1 }], sizes, piecesOf)).toEqual([{ size: "M", quantity: 1 }])
    const hundred = Array.from({ length: 100 }, (_, i) => ({ size: sizes[i % 4]!, count: 1 }))
    expect(piecesBySize(hundred, sizes, piecesOf).reduce((n, l) => n + l.quantity, 0)).toBe(100)
  })

  it("refuses a size that is not the product's", () => {
    expect(() => piecesBySize([{ size: "XXS", count: 1 }], sizes, piecesOf)).toThrow()
  })

  it("names a team order's Medusa order by its metadata", () => {
    expect(isTeamOrderOrder({ team_order_id: "teamord_1" })).toBe(true)
    expect(isTeamOrderOrder({ team_order_id: "" })).toBe(false)
    expect(isTeamOrderOrder({})).toBe(false)
    expect(isTeamOrderOrder(null)).toBe(false)
  })
})

describe("the payment link", () => {
  const seeded = (settings.data as Record<string, unknown>).team_order_payment_path as string

  it("fills the seeded pattern", () => {
    expect(seeded).toBe("/[countryCode]/account/team-orders/[id]/pay")
    expect(paymentLink("http://localhost:8000/", seeded, { countryCode: "PK", id: "teamord_01X" })).toBe(
      "http://localhost:8000/pk/account/team-orders/teamord_01X/pay"
    )
  })

  it("escapes the values", () => {
    expect(paymentLink("https://shop.example", "/t/[id]", { countryCode: "gb", id: "a/b?c" })).toBe("https://shop.example/t/a%2Fb%3Fc")
  })

  it("accepts only a path that names the order", () => {
    expect(isPaymentPathPattern("/[countryCode]/account/team-orders/[id]/pay")).toBe(true)
    for (const bad of ["", "pay/[id]", "//evil.example/[id]", "/pay", "/x?y=[id]", "/x#[id]", "https://x/[id]", "/a b/[id]", 5, null]) {
      expect(isPaymentPathPattern(bad)).toBe(false)
    }
    expect(paymentLink("http://x", "/no-id", { countryCode: "pk", id: "1" })).toBeNull()
  })
})
