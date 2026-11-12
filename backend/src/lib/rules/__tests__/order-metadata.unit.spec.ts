import {
  decideOrderPromise,
  hideStaffOnlyKeysInOrders,
  legacyCashCollectionPlan,
  withoutStaffOnlyKeys,
  isOrderOwnPromise,
  isReservedKey,
  orderDeliveryPromise,
  readPromisedDelivery,
  reservedKeysIn,
  reservedKeysMessage,
} from "../order-metadata"
import type { PromisedDelivery } from "../delivery-promise"

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

describe("isOrderOwnPromise", () => {
  const order = { createdAt: noonOn11th, applies: "standard" as const }
  const own = (promise: object, extra: object = {}) =>
    isOrderOwnPromise(promise as PromisedDelivery, { ...order, ...extra })

  it("trusts a promise based on the order's own creation date, whatever the days", () => {
    expect(own(kept)).toBe(true)
    expect(own({ date: "2026-11-23", days: 12, based_on: "2026-11-11", applies: "standard" })).toBe(true)
  })

  it("refuses one based on another date, for another option, or copied from the cart", () => {
    expect(own({ date: "2026-11-25", days: 15, based_on: "2026-11-10", applies: "standard" })).toBe(false)
    expect(own({ date: "2026-11-21", days: 10, based_on: "2026-11-11", applies: "rush" })).toBe(false)
    // QA's eighth review (N4): a forged promise on the right base date, copied from the cart.
    const forged = { date: "2026-11-12", days: 1, based_on: "2026-11-11", applies: "standard" }
    expect(own(forged, { cartKept: { ...forged } })).toBe(false)
    // The cart's promise counts only when it is the same promise (key order does not matter).
    expect(own(kept, { cartKept: { applies: "standard", based_on: "2026-11-11", days: 15, date: "2026-11-26" } })).toBe(false)
    expect(own(kept, { cartKept: forged })).toBe(true)
    expect(own(kept, { cartKept: { ...kept, note: "x" } })).toBe(true)
    expect(own(kept, { cartKept: null })).toBe(true)
  })

  it("takes the creation date in Asia/Karachi, just before and just after midnight there", () => {
    const on11th = { date: "2026-11-26", days: 15, based_on: "2026-11-11", applies: "standard" }
    const on12th = { date: "2026-11-27", days: 15, based_on: "2026-11-12", applies: "standard" }
    const before = { createdAt: new Date("2026-11-11T18:59:59.999Z") }
    const after = { createdAt: new Date("2026-11-11T19:00:00.000Z") }
    expect([own(on11th, before), own(on12th, before)]).toEqual([true, false])
    expect([own(on11th, after), own(on12th, after)]).toEqual([false, true])
  })
})

describe("decideOrderPromise", () => {
  const input = (overrides: Partial<Parameters<typeof decideOrderPromise>[0]>) =>
    decideOrderPromise({
      kept: undefined,
      createdAt: noonOn11th,
      days,
      applies: "standard",
      trust: "order_own",
      ...overrides,
    })
  const changed = { ok: true as const, value: { standard: 12, rush: 8 } }
  const forged = { date: "2026-11-12", days: 1, based_on: "2026-11-11", applies: "standard" }
  const yesterday = { date: "2026-11-25", days: 15, based_on: "2026-11-10", applies: "standard" }

  it("writes the server's answer on an order without a promise", () => {
    expect(input({})).toEqual({ action: "write", promise: kept })
    expect(input({ kept: null, trust: "server_answer_only" })).toEqual({ action: "write", promise: kept })
  })

  it("never rewrites the order's own promise on a read, also when the days setting changed or is invalid", () => {
    expect(input({ kept, days: changed })).toEqual({ action: "keep", promise: kept })
    expect(input({ kept, days: invalidDays })).toEqual({ action: "keep", promise: kept })
    // Worked out under an older setting of 12 days: kept, with today's setting of 15.
    const olderSetting = { date: "2026-11-23", days: 12, based_on: "2026-11-11", applies: "standard" }
    expect(input({ kept: olderSetting })).toEqual({ action: "keep", promise: olderSetting })
  })

  // QA's eighth review, N4: the read route returned a promise copied from an old cart.
  it("on a read, replaces a promise copied from the cart, even one on the right base date", () => {
    expect(input({ kept: forged, cartKept: forged })).toEqual({ action: "write", promise: kept })
    // A copy that is exactly the server's answer is kept as it is.
    expect(input({ kept, cartKept: kept })).toEqual({ action: "keep", promise: kept })
    // ...and with invalid settings a copy is emptied, never shown.
    expect(input({ kept: forged, cartKept: forged, days: invalidDays })).toEqual({
      action: "fail",
      error: invalidDays.error,
      clear: true,
    })
  })

  it("on a read, replaces a promise based on another date than the order's creation date", () => {
    expect(input({ kept: yesterday })).toEqual({ action: "write", promise: kept })
    const tomorrow = { date: "2026-11-27", days: 15, based_on: "2026-11-12", applies: "standard" }
    expect(input({ kept: tomorrow, days: changed })).toEqual({
      action: "write",
      promise: { date: "2026-11-23", days: 12, based_on: "2026-11-11", applies: "standard" },
    })
  })

  it("replaces a malformed promise", () => {
    expect(input({ kept: { ...kept, note: "forged" } })).toEqual({ action: "write", promise: kept })
    expect(input({ kept: "2026-11-26" })).toEqual({ action: "write", promise: kept })
  })

  it("at placement keeps only a promise exactly equal to the server's answer", () => {
    expect(input({ kept, trust: "server_answer_only" })).toEqual({ action: "keep", promise: kept })
    expect(input({ kept: yesterday, trust: "server_answer_only" })).toEqual({ action: "write", promise: kept })
    const rush = { date: "2026-11-21", days: 10, based_on: "2026-11-11", applies: "rush" }
    expect(input({ kept: rush, trust: "server_answer_only" })).toEqual({ action: "write", promise: kept })
    expect(input({ kept: forged, trust: "server_answer_only" })).toEqual({ action: "write", promise: kept })
  })

  it("uses the option that applies", () => {
    const rushPromise = { date: "2026-11-21", days: 10, based_on: "2026-11-11", applies: "rush" }
    expect(input({ applies: "rush" })).toEqual({ action: "write", promise: rushPromise })
    // A standard promise on an order whose rush date applies is not its own.
    expect(input({ kept, applies: "rush" })).toEqual({ action: "write", promise: rushPromise })
  })

  it("never invents a date when the settings are invalid", () => {
    expect(input({ days: invalidDays })).toEqual({ action: "fail", error: invalidDays.error, clear: false })
    expect(input({ kept: null, days: invalidDays })).toEqual({ action: "fail", error: invalidDays.error, clear: false })
  })

  it("empties a promise the server cannot vouch for when the settings are invalid", () => {
    for (const [value, trust] of [
      [kept, "server_answer_only"],
      [{ ...kept, days: "15" }, "order_own"],
      [yesterday, "order_own"],
    ] as const) {
      expect(input({ kept: value, days: invalidDays, trust })).toEqual({
        action: "fail",
        error: invalidDays.error,
        clear: true,
      })
    }
  })

  it("settings invalid at placement and fixed later: nothing is shown until then, then the answer for the creation date", () => {
    // At placement, with a promise copied from the cart: emptied.
    expect(input({ kept: forged, cartKept: forged, days: invalidDays, trust: "server_answer_only" })).toMatchObject({
      action: "fail",
      clear: true,
    })
    // The order now carries null; a read while the settings are invalid fails, naming the key...
    expect(input({ kept: null, cartKept: forged, days: invalidDays })).toEqual({
      action: "fail",
      error: invalidDays.error,
      clear: false,
    })
    // ...and once fixed (to 12 days), the first read writes the answer for the creation date.
    expect(input({ kept: null, cartKept: forged, days: changed })).toEqual({
      action: "write",
      promise: { date: "2026-11-23", days: 12, based_on: "2026-11-11", applies: "standard" },
    })
  })
})


// QA's tenth review, M1.
describe("legacy cod_ keys on orders recorded before 12 Nov", () => {
  it("plans the record from the keys, and removes every cod_ key", () => {
    expect(
      legacyCashCollectionPlan({
        delivery_promise: kept,
        cod_slip_reference: "  TCS 778812 ",
        cod_collected_at: "2026-11-11T09:30:00.000Z",
        cod_collected_by: "user_01ABC",
        team: "Lahore Lions",
      })
    ).toEqual({
      record: { slip_reference: "TCS 778812", collected_at: "2026-11-11T09:30:00.000Z" },
      staffKeys: ["cod_collected_at", "cod_collected_by", "cod_slip_reference"],
    })
  })

  it("keeps a slip reference as it was recorded, even one today's rule would refuse", () => {
    expect(legacyCashCollectionPlan({ cod_slip_reference: "A".repeat(80) }).record?.slip_reference).toBe("A".repeat(80))
  })

  it("leaves the time to the caller when the key holds no valid time", () => {
    for (const at of [undefined, null, "", "yesterday", 1731300000000]) {
      expect(legacyCashCollectionPlan({ cod_slip_reference: "TCS 1", cod_collected_at: at }).record).toEqual({
        slip_reference: "TCS 1",
        collected_at: null,
      })
    }
  })

  it("records nothing without a slip reference, but still removes the keys", () => {
    for (const slip of [undefined, null, "", "   ", 42, { ref: "TCS 1" }]) {
      expect(legacyCashCollectionPlan({ cod_slip_reference: slip, cod_collected_by: "user_1" })).toEqual({
        record: null,
        staffKeys: ["cod_collected_by", "cod_slip_reference"],
      })
    }
    expect(legacyCashCollectionPlan({ cod_note: "x" })).toEqual({ record: null, staffKeys: ["cod_note"] })
  })

  it("has nothing to do for metadata without cod_ keys, or that is not an object", () => {
    for (const metadata of [{}, { team: "A" }, null, undefined, "cod_slip_reference", ["cod_x"]]) {
      expect(legacyCashCollectionPlan(metadata)).toEqual({ record: null, staffKeys: [] })
    }
  })
})

describe("cod_ keys in store answers about orders", () => {
  it("are left out of each order's metadata, other keys kept", () => {
    const metadata = { delivery_promise: kept, cod_slip_reference: "TCS 1", cod_collected_by: "user_1", team: "A" }
    expect(withoutStaffOnlyKeys(metadata)).toEqual({ delivery_promise: kept, team: "A" })
    expect(hideStaffOnlyKeysInOrders({ order: { id: "o1", metadata } })).toEqual({
      order: { id: "o1", metadata: { delivery_promise: kept, team: "A" } },
    })
    expect(
      hideStaffOnlyKeysInOrders({ orders: [{ id: "o1", metadata }, { id: "o2", metadata: null }], count: 2 })
    ).toEqual({
      orders: [{ id: "o1", metadata: { delivery_promise: kept, team: "A" } }, { id: "o2", metadata: null }],
      count: 2,
    })
    // The completion's answer.
    expect(hideStaffOnlyKeysInOrders({ type: "order", order: { metadata: { cod_x: 1 } } })).toEqual({
      type: "order",
      order: { metadata: {} },
    })
  })

  it("leaves other answers, and orders without metadata, as they are", () => {
    const cart = { type: "cart", cart: { metadata: { cod_x: 1 } }, error: { message: "m" } }
    expect(hideStaffOnlyKeysInOrders(cart)).toEqual(cart)
    expect(hideStaffOnlyKeysInOrders({ order: { id: "o1" } })).toEqual({ order: { id: "o1" } })
    for (const body of [null, "text", 42]) {
      expect(hideStaffOnlyKeysInOrders(body)).toBe(body)
    }
  })
})
