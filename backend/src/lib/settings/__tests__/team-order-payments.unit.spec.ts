import { DEPOSIT_PERCENTAGE_KEY, PAYMENT_PATH_KEY, readDepositPercentage, readPaymentPath } from "../team-order-payments"

describe("the deposit percentage setting", () => {
  it("reads a number or a numeric string above 0 and at most 100", () => {
    expect(readDepositPercentage({ [DEPOSIT_PERCENTAGE_KEY]: 50 })).toEqual({ ok: true, value: 50 })
    expect(readDepositPercentage({ [DEPOSIT_PERCENTAGE_KEY]: "30" })).toEqual({ ok: true, value: 30 })
    expect(readDepositPercentage({ [DEPOSIT_PERCENTAGE_KEY]: 100 })).toEqual({ ok: true, value: 100 })
    expect(readDepositPercentage({ [DEPOSIT_PERCENTAGE_KEY]: 33.5 })).toEqual({ ok: true, value: 33.5 })
  })

  it("refuses a missing, zero, negative, too large or non-numeric value, naming the key", () => {
    for (const value of [undefined, null, "", 0, -1, 101, "half", true]) {
      const read = readDepositPercentage({ [DEPOSIT_PERCENTAGE_KEY]: value })
      expect(read.ok).toBe(false)
      if (!read.ok) expect(read.error).toContain(DEPOSIT_PERCENTAGE_KEY)
    }
    expect(readDepositPercentage(null).ok).toBe(false)
  })
})

describe("the payment page setting", () => {
  it("reads a path with [id]", () => {
    expect(readPaymentPath({ [PAYMENT_PATH_KEY]: " /[countryCode]/account/team-orders/[id]/pay " })).toEqual({
      ok: true,
      value: "/[countryCode]/account/team-orders/[id]/pay",
    })
  })

  it("refuses a missing value, a full address or a path without [id], naming the key", () => {
    for (const value of [undefined, "", "/pay", "https://evil.example/[id]", "//evil.example/[id]", 5]) {
      const read = readPaymentPath({ [PAYMENT_PATH_KEY]: value })
      expect(read.ok).toBe(false)
      if (!read.ok) expect(read.error).toContain(PAYMENT_PATH_KEY)
    }
  })
})
