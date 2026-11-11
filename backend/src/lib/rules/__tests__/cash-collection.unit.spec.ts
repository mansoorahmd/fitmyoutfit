import {
  captureFailureMessage,
  cashCollectedMetadata,
  cashCollectionState,
  decideCashCollection,
  readSlipReference,
  refusalMessage,
  SLIP_REFERENCE_MAX_LENGTH,
  type CollectionPayment,
} from "../cash-collection"

const capture = { created_by: "user_1", created_at: "2026-11-12T10:00:00.000Z" }
const cod = (overrides: Partial<CollectionPayment> = {}): CollectionPayment => ({
  id: "pay_cod",
  provider_id: "pp_cod_cod",
  amount: 2250,
  captured_amount: 0,
  fully_captured: false,
  canceled: false,
  captures: [],
  ...overrides,
})
const captured = (overrides: Partial<CollectionPayment> = {}) =>
  cod({ captured_amount: 2250, fully_captured: true, captures: [capture], ...overrides })
const card = (overrides: Partial<CollectionPayment> = {}): CollectionPayment => ({
  ...cod(),
  id: "pay_card",
  provider_id: "pp_system_default",
  ...overrides,
})

describe("cashCollectionState", () => {
  it("records and captures on a cash-on-delivery order whose payment is open", () => {
    expect(cashCollectionState({ orderStatus: "pending", payments: [cod()], metadata: {} })).toEqual({
      applies: true,
      stage: "not_collected",
      collected: false,
      can_record: true,
      capture_needed: true,
      reason: null,
      slip_reference: null,
      collected_at: null,
      payment_id: "pay_cod",
      amount: 2250,
      captured_amount: 0,
      captured_by: null,
      captured_at: null,
    })
  })

  it("does not apply to an order paid another way, or with no payment", () => {
    for (const payments of [[card()], [card({ fully_captured: true })], []]) {
      const state = cashCollectionState({ payments, metadata: null })
      expect(state).toMatchObject({ applies: false, stage: "unavailable", can_record: false, reason: "not_cash_on_delivery" })
    }
  })

  it("shows a recorded collection, who captured from the capture record, and refuses a second one", () => {
    const metadata = {
      delivery_promise: { date: "2026-11-26" },
      cod_slip_reference: "TCS-123",
      cod_collected_at: "2026-11-12T10:00:01.000Z",
      // Left by S1-1b on some orders; no longer read.
      cod_collected_by: "user_old",
    }
    expect(cashCollectionState({ payments: [captured()], metadata })).toEqual({
      applies: true,
      stage: "recorded",
      collected: true,
      can_record: false,
      capture_needed: false,
      reason: "already_recorded",
      slip_reference: "TCS-123",
      collected_at: "2026-11-12T10:00:01.000Z",
      payment_id: "pay_cod",
      amount: 2250,
      captured_amount: 2250,
      captured_by: "user_1",
      captured_at: "2026-11-12T10:00:00.000Z",
    })
  })

  it("lets a payment captured without a slip reference get one, without capturing again", () => {
    const state = cashCollectionState({ payments: [captured()], metadata: { cod_slip_reference: null } })
    expect(state).toMatchObject({
      stage: "captured_without_slip",
      collected: true,
      can_record: true,
      capture_needed: false,
      reason: null,
      slip_reference: null,
      payment_id: "pay_cod",
      captured_by: "user_1",
    })
  })

  it("does not count a partly captured payment as collected, and refuses the slip", () => {
    const state = cashCollectionState({
      payments: [cod({ captured_amount: 1000, captures: [capture] })],
      metadata: {},
    })
    expect(state).toMatchObject({
      stage: "partly_captured",
      collected: false,
      can_record: false,
      capture_needed: false,
      reason: "partly_captured",
      amount: 2250,
      captured_amount: 1000,
    })
  })

  it("counts a recorded reference as recorded even if the capture is not visible", () => {
    const state = cashCollectionState({ payments: [cod()], metadata: { cod_slip_reference: "A1" } })
    expect(state).toMatchObject({ stage: "recorded", collected: false, can_record: false, reason: "already_recorded" })
  })

  it("refuses on a canceled order or a canceled payment", () => {
    expect(cashCollectionState({ orderStatus: "canceled", payments: [cod()], metadata: {} })).toMatchObject({
      applies: true,
      can_record: false,
      reason: "order_canceled",
    })
    expect(cashCollectionState({ payments: [cod({ canceled: true })], metadata: {} })).toMatchObject({
      applies: true,
      can_record: false,
      reason: "payment_canceled",
    })
  })

  it("uses the one live cash-on-delivery payment, and refuses when there are several", () => {
    const state = cashCollectionState({
      payments: [cod({ id: "a" }), cod({ id: "b", canceled: true }), card()],
      metadata: {},
    })
    expect(state).toMatchObject({ can_record: true, payment_id: "a" })
    const several = cashCollectionState({ payments: [cod({ id: "a" }), cod({ id: "b" })], metadata: {} })
    expect(several).toMatchObject({ can_record: false, reason: "several_payments", payment_id: null })
  })

  it("ignores empty recorded values", () => {
    const state = cashCollectionState({
      payments: [cod()],
      metadata: { cod_slip_reference: "  ", cod_collected_at: "" },
    })
    expect(state).toMatchObject({ can_record: true, slip_reference: null, collected_at: null })
  })

  it("shows the latest capture", () => {
    const state = cashCollectionState({
      payments: [
        captured({
          captures: [
            { created_by: "user_2", created_at: "2026-11-12T12:00:00.000Z" },
            { created_by: "user_1", created_at: "2026-11-12T09:00:00.000Z" },
          ],
        }),
      ],
      metadata: {},
    })
    expect(state).toMatchObject({ captured_by: "user_2", captured_at: "2026-11-12T12:00:00.000Z" })
  })
})

describe("readSlipReference", () => {
  it("keeps a reference, trimmed and with single spaces", () => {
    expect(readSlipReference("TCS-778812")).toEqual({ ok: true, value: "TCS-778812" })
    expect(readSlipReference("  Leopards   12/34  ")).toEqual({ ok: true, value: "Leopards 12/34" })
    // A no-break space is a visible space: it becomes an ordinary one.
    expect(readSlipReference("TCS 12")).toEqual({ ok: true, value: "TCS 12" })
    expect(readSlipReference("<script>alert(1)</script>")).toEqual({ ok: true, value: "<script>alert(1)</script>" })
  })

  it("accepts Urdu and Arabic text, with Urdu and Arabic digits", () => {
    for (const text of ["رسید 42", "رسید ۴۲", "إيصال ٤٢", "ٹی سی ایس ۱۲۳۴۵", "لیپرڈز 7781"]) {
      expect(readSlipReference(text)).toEqual({ ok: true, value: text })
    }
  })

  it("refuses a missing or blank reference", () => {
    for (const raw of [undefined, null, "", "   ", " ", 42, {}, ["A1"]]) {
      expect(readSlipReference(raw)).toEqual({
        ok: false,
        error: "Enter the slip reference from the courier's slip.",
      })
    }
  })

  it("refuses a reference with no letter or digit", () => {
    expect(readSlipReference("--- / ---")).toEqual({
      ok: false,
      error: "The slip reference must contain a letter or a digit.",
    })
    expect(readSlipReference("😀😀").ok).toBe(false)
  })

  it("refuses, rather than changes, control, line-break and invisible format characters", () => {
    const refused = {
      ok: false,
      error:
        "The slip reference contains a line break, a tab, or an invisible or control character. " +
        "Type it again by hand, without pasting.",
    }
    for (const raw of [
      "ABC\u0000123", // NUL
      "AB\u0007C", // bell
      "AB\nCD", // line feed
      "AB\r\nCD", // carriage return and line feed
      "AB\tCD", // tab
      "TCS 12\n", // a trailing line break is not trimmed away either
      "AB\u0085CD", // next line (C1)
      "AB CD", // line separator
      "AB CD", // paragraph separator
      "A​B", // zero-width space
      "‮A1", // right-to-left override
      "A‎B", // left-to-right mark
      "A⁦B⁩", // isolates
      "﻿A1", // byte order mark
      "A­B", // soft hyphen
      "رسید‌42", // zero-width non-joiner
      "A\ud800B", // lone surrogate
    ]) {
      expect({ raw, result: readSlipReference(raw) }).toEqual({ raw, result: refused })
    }
  })

  it("counts characters, not UTF-16 units, against the maximum", () => {
    expect(readSlipReference("A".repeat(SLIP_REFERENCE_MAX_LENGTH)).ok).toBe(true)
    expect(readSlipReference("𝟏".repeat(SLIP_REFERENCE_MAX_LENGTH)).ok).toBe(true)
    expect(readSlipReference(`  ${"A".repeat(SLIP_REFERENCE_MAX_LENGTH)}  `).ok).toBe(true)
    expect(readSlipReference("A".repeat(SLIP_REFERENCE_MAX_LENGTH + 1))).toEqual({
      ok: false,
      error: `The slip reference must be at most ${SLIP_REFERENCE_MAX_LENGTH} characters.`,
    })
  })
})

describe("decideCashCollection", () => {
  const open = cashCollectionState({ payments: [cod()], metadata: {} })

  it("captures and records a valid reference on an open cash-on-delivery order", () => {
    expect(decideCashCollection(open, " TCS 1 ")).toEqual({
      ok: true,
      slipReference: "TCS 1",
      paymentId: "pay_cod",
      captureNeeded: true,
    })
  })

  it("records without capturing when the payment is already captured", () => {
    const state = cashCollectionState({ payments: [captured()], metadata: {} })
    expect(decideCashCollection(state, "TCS 2")).toEqual({
      ok: true,
      slipReference: "TCS 2",
      paymentId: "pay_cod",
      captureNeeded: false,
    })
  })

  it("refuses an invalid reference", () => {
    expect(decideCashCollection(open, "")).toMatchObject({ ok: false, reason: "invalid_reference" })
  })

  it("refuses when recording is not allowed, whatever the reference", () => {
    const recorded = cashCollectionState({ payments: [captured()], metadata: { cod_slip_reference: "TCS 1" } })
    expect(decideCashCollection(recorded, "TCS 2")).toEqual({
      ok: false,
      reason: "already_recorded",
      message: "The cash for this order is already recorded as collected.",
    })
    const partly = cashCollectionState({ payments: [cod({ captured_amount: 1 })], metadata: {} })
    expect(decideCashCollection(partly, "TCS 2")).toEqual({
      ok: false,
      reason: "partly_captured",
      message:
        "Only part of this payment is captured. Capture the rest in the order's Payments section " +
        "(Capture payment), then record the slip reference here.",
    })
    const other = cashCollectionState({ payments: [card()], metadata: {} })
    expect(decideCashCollection(other, "TCS 2")).toEqual({
      ok: false,
      reason: "not_cash_on_delivery",
      message: "This order is not paid by cash on delivery.",
    })
  })
})

describe("captureFailureMessage", () => {
  it("says another press captured it when the payment is captured now", () => {
    for (const metadata of [{}, { cod_slip_reference: "TCS 1" }]) {
      const after = cashCollectionState({ payments: [captured()], metadata })
      expect(captureFailureMessage(after, "You cannot capture more than the authorized amount")).toBe(
        "The payment was captured by another request at the same moment, so this slip reference " +
          "was not recorded. Reload the order to see what is recorded."
      )
    }
  })

  it("says the capture failed, why, and what to do, when the payment is still open", () => {
    const after = cashCollectionState({ payments: [cod()], metadata: {} })
    expect(captureFailureMessage(after, "Provider unreachable.")).toBe(
      "The payment could not be captured (Provider unreachable). Nothing was recorded. Reload the " +
        "order and try again; if it fails again, check the Payments section of the order."
    )
    expect(captureFailureMessage(after, "")).toBe(
      "The payment could not be captured. Nothing was recorded. Reload the order and try again; " +
        "if it fails again, check the Payments section of the order."
    )
  })
})

describe("cashCollectedMetadata", () => {
  it("writes the reference and the time, and not who recorded it", () => {
    expect(
      cashCollectedMetadata({ slipReference: "TCS 1", collectedAt: new Date("2026-11-12T10:00:00Z") })
    ).toEqual({
      cod_slip_reference: "TCS 1",
      cod_collected_at: "2026-11-12T10:00:00.000Z",
    })
  })

  it("has a message for every refusal", () => {
    expect(refusalMessage("order_canceled")).toBe("This order is canceled.")
  })
})
