import {
  checkCartMetadataForCompletion,
  decideOrderPromise,
  isReservedKey,
  orderDeliveryPromise,
  readPromisedDelivery,
  reservedKeysIn,
  reservedKeysMessage,
} from "../order-metadata"

const days = { ok: true as const, value: { standard: 15, rush: 10 } }
const invalidDays = { ok: false as const, error: "delivery_days_standard is not set." }
const kept = { date: "2026-11-26", days: 15, based_on: "2026-11-11", applies: "standard" }
/** 12:00 in Asia/Karachi (UTC+5) on 11 Nov 2026. */
const noonOn11th = new Date("2026-11-11T07:00:00.000Z")

describe("reserved metadata keys", () => {
  it("reserves delivery_promise and every cod_ key", () => {
    for (const key of ["delivery_promise", "cod_slip_reference", "cod_collected_at", "cod_collected_by", "cod_anything"]) {
      expect(isReservedKey(key)).toBe(true)
    }
    for (const key of ["team", "delivery_promise_note", "cod", "Delivery_promise", "kit_cod_note"]) {
      expect(isReservedKey(key)).toBe(false)
    }
  })

  it("finds reserved keys whatever their value, null included", () => {
    expect(
      reservedKeysIn({
        team: "Lahore Lions",
        delivery_promise: null,
        cod_slip_reference: "",
        cod_collected_by: { id: "user_1" },
      })
    ).toEqual(["cod_collected_by", "cod_slip_reference", "delivery_promise"])
    expect(reservedKeysIn({ team: "Lahore Lions" })).toEqual([])
  })

  it("ignores what is not an object (Medusa's own validation answers it)", () => {
    for (const metadata of [undefined, null, "delivery_promise", 5, ["delivery_promise"]]) {
      expect(reservedKeysIn(metadata)).toEqual([])
    }
  })

  it("names the keys in the refusal", () => {
    expect(reservedKeysMessage(["cod_slip_reference", "delivery_promise"])).toBe(
      "A cart's metadata may not contain cod_slip_reference, delivery_promise: the store writes these on the order."
    )
  })
})

describe("checkCartMetadataForCompletion", () => {
  it("passes a cart without staff-only values, whatever promise it carries", () => {
    for (const metadata of [null, undefined, {}, { team: "A" }, { delivery_promise: { forged: true } }]) {
      expect(checkCartMetadataForCompletion(metadata)).toEqual({ ok: true })
    }
  })

  it("passes staff-only keys that were emptied (carts from before the door refused them)", () => {
    expect(checkCartMetadataForCompletion({ cod_slip_reference: null, cod_collected_by: "" })).toEqual({ ok: true })
  })

  it("refuses a cart carrying a staff-only value, any cod_ key", () => {
    expect(
      checkCartMetadataForCompletion({ cod_slip_reference: "forged", cod_collected_by: "me", cod_other: 1 })
    ).toEqual({ ok: false, error: "The cart must not carry cod_collected_by, cod_other, cod_slip_reference." })
  })
})

describe("readPromisedDelivery", () => {
  it("returns a valid kept promise", () => {
    expect(readPromisedDelivery(kept)).toEqual(kept)
    expect(readPromisedDelivery({ ...kept, applies: "rush", days: 10, date: "2026-11-21" })).toEqual({
      date: "2026-11-21",
      days: 10,
      based_on: "2026-11-11",
      applies: "rush",
    })
  })

  it("refuses anything but exactly the four keys", () => {
    const { applies: _applies, ...withoutApplies } = kept
    expect(readPromisedDelivery({ ...kept, note: "forged-by-customer" })).toBeNull()
    expect(readPromisedDelivery(withoutApplies)).toBeNull()
  })

  it("refuses wrong types and values", () => {
    for (const value of [
      undefined,
      null,
      "2026-11-26",
      [kept],
      { ...kept, applies: "express" },
      { ...kept, date: 5 },
      { ...kept, days: "15" },
      { ...kept, days: 15.5 },
      { ...kept, days: 0, date: "2026-11-11" },
      { ...kept, based_on: "11/11/2026" },
      { ...kept, based_on: "2026-02-30", date: "2026-03-17" },
      { ...kept, date: "2026-11-26T00:00:00Z" },
    ]) {
      expect(readPromisedDelivery(value)).toBeNull()
    }
  })

  it("refuses a date that is not based_on plus days", () => {
    expect(readPromisedDelivery({ ...kept, date: "2026-11-25" })).toBeNull()
    expect(readPromisedDelivery({ ...kept, days: 14 })).toBeNull()
  })
})

describe("orderDeliveryPromise", () => {
  it("counts from the order's creation date in Asia/Karachi", () => {
    expect(orderDeliveryPromise(noonOn11th, days.value, "standard")).toEqual(kept)
    expect(orderDeliveryPromise(noonOn11th, days.value, "rush")).toEqual({
      date: "2026-11-21",
      days: 10,
      based_on: "2026-11-11",
      applies: "rush",
    })
  })

  it("takes the Karachi date of an order created just before or just after midnight there", () => {
    // Midnight in Karachi (UTC+5) is 19:00 UTC the evening before.
    const beforeMidnight = orderDeliveryPromise(new Date("2026-11-11T18:59:59.999Z"), days.value, "standard")
    const afterMidnight = orderDeliveryPromise(new Date("2026-11-11T19:00:00.000Z"), days.value, "standard")
    expect(beforeMidnight).toEqual(kept)
    expect(afterMidnight).toEqual({ date: "2026-11-27", days: 15, based_on: "2026-11-12", applies: "standard" })
  })
})

describe("decideOrderPromise", () => {
  const input = (overrides: Partial<Parameters<typeof decideOrderPromise>[0]>) =>
    decideOrderPromise({
      kept: undefined,
      createdAt: noonOn11th,
      days,
      applies: "standard",
      trust: "any_valid",
      ...overrides,
    })

  it("writes the server's answer on an order without a promise", () => {
    expect(input({})).toEqual({ action: "write", promise: kept })
    expect(input({ kept: null, trust: "server_answer_only" })).toEqual({ action: "write", promise: kept })
  })

  it("never rewrites a valid kept promise after placement, also when the days setting changed", () => {
    const changed = { ok: true as const, value: { standard: 12, rush: 8 } }
    expect(input({ kept, days: changed })).toEqual({ action: "keep", promise: kept })
    // An older promise on another base date is kept as well, and the settings are not needed.
    const older = { date: "2026-11-25", days: 15, based_on: "2026-11-10", applies: "standard" }
    expect(input({ kept: older, days: invalidDays })).toEqual({ action: "keep", promise: older })
  })

  it("replaces a malformed promise", () => {
    expect(input({ kept: { ...kept, note: "forged" } })).toEqual({ action: "write", promise: kept })
    expect(input({ kept: "2026-11-26" })).toEqual({ action: "write", promise: kept })
  })

  it("at placement keeps only a promise exactly equal to the server's answer", () => {
    expect(input({ kept, trust: "server_answer_only" })).toEqual({ action: "keep", promise: kept })
    const yesterday = { date: "2026-11-25", days: 15, based_on: "2026-11-10", applies: "standard" }
    expect(input({ kept: yesterday, trust: "server_answer_only" })).toEqual({ action: "write", promise: kept })
    const rush = { date: "2026-11-21", days: 10, based_on: "2026-11-11", applies: "rush" }
    expect(input({ kept: rush, trust: "server_answer_only" })).toEqual({ action: "write", promise: kept })
  })

  it("uses the option that applies", () => {
    expect(input({ applies: "rush" })).toEqual({
      action: "write",
      promise: { date: "2026-11-21", days: 10, based_on: "2026-11-11", applies: "rush" },
    })
  })

  it("never invents a date when the settings are invalid", () => {
    expect(input({ days: invalidDays })).toEqual({ action: "fail", error: invalidDays.error, clear: false })
    expect(input({ kept: { ...kept, days: "15" }, days: invalidDays })).toEqual({
      action: "fail",
      error: invalidDays.error,
      clear: false,
    })
  })

  it("at placement empties a promise copied from the cart that the server cannot check", () => {
    expect(input({ kept, days: invalidDays, trust: "server_answer_only" })).toEqual({
      action: "fail",
      error: invalidDays.error,
      clear: true,
    })
    expect(input({ kept: null, days: invalidDays, trust: "server_answer_only" })).toEqual({
      action: "fail",
      error: invalidDays.error,
      clear: false,
    })
  })
})
