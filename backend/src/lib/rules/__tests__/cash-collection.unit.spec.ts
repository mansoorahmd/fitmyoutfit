import {
  cashCollectedMetadata,
  cashCollectionState,
  decideCashCollection,
  readSlipReference,
  SLIP_REFERENCE_MAX_LENGTH,
  type CollectionPayment,
} from "../cash-collection"

const cod = (overrides: Partial<CollectionPayment> = {}): CollectionPayment => ({
  id: "pay_cod",
  provider_id: "pp_cod_cod",
  captured: false,
  canceled: false,
  ...overrides,
})
const card = (overrides: Partial<CollectionPayment> = {}): CollectionPayment => ({
  id: "pay_card",
  provider_id: "pp_system_default",
  captured: false,
  canceled: false,
  ...overrides,
})

describe("cashCollectionState", () => {
  it("allows collection on a cash-on-delivery order whose payment is not captured", () => {
    expect(cashCollectionState({ orderStatus: "pending", payments: [cod()], metadata: {} })).toEqual({
      applies: true,
      collected: false,
      can_collect: true,
      reason: null,
      slip_reference: null,
      collected_at: null,
      collected_by: null,
      payment_id: "pay_cod",
    })
  })

  it("does not apply to an order paid another way, or with no payment", () => {
    for (const payments of [[card()], [card({ captured: true })], []]) {
      const state = cashCollectionState({ payments, metadata: null })
      expect(state).toMatchObject({ applies: false, can_collect: false, reason: "not_cash_on_delivery" })
    }
  })

  it("shows a recorded collection and refuses a second one", () => {
    const metadata = {
      delivery_promise: { date: "2026-11-26" },
      cod_slip_reference: "TCS-123",
      cod_collected_at: "2026-11-12T10:00:00.000Z",
      cod_collected_by: "user_1",
    }
    expect(cashCollectionState({ payments: [cod({ captured: true })], metadata })).toEqual({
      applies: true,
      collected: true,
      can_collect: false,
      reason: "already_collected",
      slip_reference: "TCS-123",
      collected_at: "2026-11-12T10:00:00.000Z",
      collected_by: "user_1",
      payment_id: null,
    })
  })

  it("counts a payment captured in Medusa's own admin as collected, with no reference", () => {
    const state = cashCollectionState({ payments: [cod({ captured: true })], metadata: {} })
    expect(state).toMatchObject({ collected: true, can_collect: false, slip_reference: null })
  })

  it("counts a recorded reference as collected even if the capture is not visible yet", () => {
    const state = cashCollectionState({ payments: [cod()], metadata: { cod_slip_reference: "A1" } })
    expect(state).toMatchObject({ collected: true, can_collect: false, reason: "already_collected" })
  })

  it("refuses on a canceled order or a canceled payment", () => {
    expect(cashCollectionState({ orderStatus: "canceled", payments: [cod()], metadata: {} })).toMatchObject({
      applies: true,
      can_collect: false,
      reason: "order_canceled",
    })
    expect(cashCollectionState({ payments: [cod({ canceled: true })], metadata: {} })).toMatchObject({
      applies: true,
      can_collect: false,
      reason: "payment_canceled",
    })
  })

  it("captures the one open cash-on-delivery payment, and refuses when there are several", () => {
    const state = cashCollectionState({
      payments: [cod({ id: "a" }), cod({ id: "b", canceled: true }), card()],
      metadata: {},
    })
    expect(state).toMatchObject({ can_collect: true, payment_id: "a" })
    const several = cashCollectionState({ payments: [cod({ id: "a" }), cod({ id: "b" })], metadata: {} })
    expect(several).toMatchObject({ can_collect: false, reason: "several_payments", payment_id: null })
  })

  it("ignores empty recorded values", () => {
    const state = cashCollectionState({
      payments: [cod()],
      metadata: { cod_slip_reference: null, cod_collected_at: "", cod_collected_by: "  " },
    })
    expect(state).toMatchObject({ can_collect: true, slip_reference: null, collected_at: null, collected_by: null })
  })
})

describe("readSlipReference", () => {
  it("keeps a reference, trimmed and with single spaces", () => {
    expect(readSlipReference("TCS-778812")).toEqual({ ok: true, value: "TCS-778812" })
    expect(readSlipReference("  Leopards \t 12/34  ")).toEqual({ ok: true, value: "Leopards 12/34" })
    expect(readSlipReference("رسید 42")).toEqual({ ok: true, value: "رسید 42" })
  })

  it("refuses a missing or blank reference", () => {
    for (const raw of [undefined, null, "", "   ", 42, {}]) {
      expect(readSlipReference(raw)).toEqual({
        ok: false,
        error: "Enter the slip reference from the courier's slip.",
      })
    }
  })

  it("refuses a reference with no letter or digit, or with control characters", () => {
    expect(readSlipReference("--- / ---").ok).toBe(false)
    expect(readSlipReference("ABC\u0000123")).toEqual({
      ok: false,
      error: "The slip reference contains characters that cannot be stored.",
    })
  })

  it("refuses a reference longer than the maximum, and keeps one at it", () => {
    expect(readSlipReference("A".repeat(SLIP_REFERENCE_MAX_LENGTH)).ok).toBe(true)
    expect(readSlipReference("A".repeat(SLIP_REFERENCE_MAX_LENGTH + 1))).toEqual({
      ok: false,
      error: `The slip reference must be at most ${SLIP_REFERENCE_MAX_LENGTH} characters.`,
    })
  })
})

describe("decideCashCollection", () => {
  const open = cashCollectionState({ payments: [cod()], metadata: {} })

  it("allows a valid reference on an open cash-on-delivery order", () => {
    expect(decideCashCollection(open, " TCS 1 ")).toEqual({
      ok: true,
      slipReference: "TCS 1",
      paymentId: "pay_cod",
    })
  })

  it("refuses an invalid reference", () => {
    expect(decideCashCollection(open, "")).toMatchObject({ ok: false, reason: "invalid_reference" })
  })

  it("refuses when collection is not allowed, whatever the reference", () => {
    const collected = cashCollectionState({ payments: [cod({ captured: true })], metadata: {} })
    expect(decideCashCollection(collected, "TCS 2")).toEqual({
      ok: false,
      reason: "already_collected",
      message: "The cash for this order is already recorded as collected.",
    })
    const other = cashCollectionState({ payments: [card()], metadata: {} })
    expect(decideCashCollection(other, "TCS 2")).toEqual({
      ok: false,
      reason: "not_cash_on_delivery",
      message: "This order is not paid by cash on delivery.",
    })
  })
})

describe("cashCollectedMetadata", () => {
  it("writes the reference, the time and who recorded it", () => {
    expect(
      cashCollectedMetadata({
        slipReference: "TCS 1",
        collectedAt: new Date("2026-11-12T10:00:00Z"),
        collectedBy: "user_1",
      })
    ).toEqual({
      cod_slip_reference: "TCS 1",
      cod_collected_at: "2026-11-12T10:00:00.000Z",
      cod_collected_by: "user_1",
    })
  })
})
