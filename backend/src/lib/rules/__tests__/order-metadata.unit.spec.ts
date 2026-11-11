import { deliveryPromise } from "../delivery-promise"
import {
  checkCompletionMetadata,
  completionMetadataPatch,
  readPromisedDelivery,
} from "../order-metadata"

const days = { standard: 15, rush: 10 }
const today = deliveryPromise("2026-11-11", days, "standard")
const kept = { date: "2026-11-26", days: 15, based_on: "2026-11-11", applies: "standard" }

describe("completionMetadataPatch", () => {
  it("writes the promised delivery that applies", () => {
    expect(completionMetadataPatch({ team: "Lahore Lions" }, today)).toEqual({ delivery_promise: kept })
    expect(completionMetadataPatch(null, deliveryPromise("2026-11-11", days, "rush"))).toEqual({
      delivery_promise: { date: "2026-11-21", days: 10, based_on: "2026-11-11", applies: "rush" },
    })
  })

  it("empties staff-only keys a customer put on the cart", () => {
    expect(
      completionMetadataPatch(
        { cod_slip_reference: "forged", cod_collected_at: "", cod_collected_by: null },
        today
      )
    ).toEqual({ delivery_promise: kept, cod_slip_reference: null, cod_collected_at: null })
  })
})

describe("readPromisedDelivery", () => {
  it("returns the kept promise, and null for a missing or malformed one", () => {
    expect(readPromisedDelivery({ ...kept, extra: true })).toEqual(kept)
    for (const value of [undefined, null, "2026-11-26", { ...kept, applies: "express" }, { ...kept, date: 5 }]) {
      expect(readPromisedDelivery(value)).toBeNull()
    }
  })
})

describe("checkCompletionMetadata", () => {
  it("accepts the promise the rule gives today", () => {
    expect(checkCompletionMetadata({ delivery_promise: kept }, today)).toEqual({ ok: true })
  })

  it("accepts emptied staff-only keys", () => {
    expect(
      checkCompletionMetadata({ delivery_promise: kept, cod_slip_reference: null, cod_collected_at: "" }, today)
    ).toEqual({ ok: true })
  })

  it("accepts a promise made just before midnight in Karachi", () => {
    const tomorrow = deliveryPromise("2026-11-12", days, "standard")
    expect(checkCompletionMetadata({ delivery_promise: kept }, tomorrow)).toEqual({ ok: true })
    const dayAfter = deliveryPromise("2026-11-13", days, "standard")
    expect(checkCompletionMetadata({ delivery_promise: kept }, dayAfter).ok).toBe(false)
  })

  it("refuses a cart with no promise or a malformed one", () => {
    for (const metadata of [null, {}, { delivery_promise: "2026-11-26" }, { delivery_promise: { ...kept, days: "15" } }]) {
      expect(checkCompletionMetadata(metadata, today)).toEqual({
        ok: false,
        error: "The cart carries no promised delivery date.",
      })
    }
  })

  it("refuses a promise that is not the rule's answer", () => {
    const wrong = [
      { ...kept, date: "2026-11-20" },
      { ...kept, days: 5, date: "2026-11-16" },
      { ...kept, applies: "rush" },
      { ...kept, based_on: "2026-11-01", date: "2026-11-16" },
      { ...kept, based_on: "not a date" },
    ]
    for (const promise of wrong) {
      expect(checkCompletionMetadata({ delivery_promise: promise }, today)).toEqual({
        ok: false,
        error: "The cart's promised delivery date does not match the delivery rule.",
      })
    }
  })

  it("refuses staff-only keys on the cart", () => {
    expect(
      checkCompletionMetadata({ delivery_promise: kept, cod_slip_reference: "forged", cod_collected_by: "me" }, today)
    ).toEqual({ ok: false, error: "The cart must not carry cod_slip_reference, cod_collected_by." })
  })
})
