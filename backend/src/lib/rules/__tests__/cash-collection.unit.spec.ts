import {
  captureFailureMessage,
  cashCollectionState,
  decideCashCollection,
  readSlipReference,
  RECORD_FAILURE_MESSAGE,
  refusalMessage,
  SLIP_REFERENCE_MAX_LENGTH,
  UNEXPECTED_FAILURE_MESSAGE,
  type CashCollectionRecord,
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
const partly = (overrides: Partial<CollectionPayment> = {}) =>
  cod({ captured_amount: 1000, captures: [capture], ...overrides })
const card = (overrides: Partial<CollectionPayment> = {}): CollectionPayment => ({
  ...cod(),
  id: "pay_card",
  provider_id: "pp_system_default",
  ...overrides,
})
const recorded: CashCollectionRecord = {
  slip_reference: "TCS-123",
  collected_at: "2026-11-12T10:00:01.000Z",
}

describe("cashCollectionState", () => {
  it("records and captures on a cash-on-delivery order whose payment is open", () => {
    expect(cashCollectionState({ orderStatus: "pending", payments: [cod()], record: null })).toEqual({
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
      const state = cashCollectionState({ payments, record: null })
      expect(state).toMatchObject({ applies: false, stage: "unavailable", can_record: false, reason: "not_cash_on_delivery" })
    }
  })

  it("shows the recorded collection from the record, who captured from the capture record, and refuses a second one", () => {
    expect(cashCollectionState({ payments: [captured()], record: recorded })).toEqual({
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

  it("lets a payment captured without a record get one, without capturing again", () => {
    const state = cashCollectionState({ payments: [captured()], record: null })
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

  it("does not count a partly captured payment as collected, and lets the slip capture the rest", () => {
    const state = cashCollectionState({ payments: [partly()], record: null })
    expect(state).toEqual({
      applies: true,
      stage: "partly_captured",
      collected: false,
      can_record: true,
      capture_needed: true,
      reason: null,
      slip_reference: null,
      collected_at: null,
      payment_id: "pay_cod",
      amount: 2250,
      captured_amount: 1000,
      captured_by: "user_1",
      captured_at: "2026-11-12T10:00:00.000Z",
    })
  })

  it("counts a record as recorded even if the capture is not visible", () => {
    const state = cashCollectionState({ payments: [cod()], record: { slip_reference: "A1", collected_at: null } })
    expect(state).toMatchObject({ stage: "recorded", collected: false, can_record: false, reason: "already_recorded" })
  })

  it("refuses on a canceled order or a canceled payment", () => {
    expect(cashCollectionState({ orderStatus: "canceled", payments: [cod()], record: null })).toMatchObject({
      applies: true,
      can_record: false,
      reason: "order_canceled",
    })
    expect(cashCollectionState({ payments: [cod({ canceled: true })], record: null })).toMatchObject({
      applies: true,
      can_record: false,
      reason: "payment_canceled",
    })
    // A canceled order with a partly captured payment is not collected either.
    expect(cashCollectionState({ orderStatus: "canceled", payments: [partly()], record: null })).toMatchObject({
      can_record: false,
      reason: "order_canceled",
    })
  })

  it("uses the one live cash-on-delivery payment, and refuses when there are several", () => {
    const state = cashCollectionState({
      payments: [cod({ id: "a" }), cod({ id: "b", canceled: true }), card()],
      record: null,
    })
    expect(state).toMatchObject({ can_record: true, payment_id: "a" })
    const several = cashCollectionState({ payments: [cod({ id: "a" }), cod({ id: "b" })], record: null })
    expect(several).toMatchObject({ can_record: false, reason: "several_payments", payment_id: null })
  })

  it("ignores a blank recorded reference", () => {
    const state = cashCollectionState({
      payments: [cod()],
      record: { slip_reference: "  ", collected_at: "2026-11-12T10:00:01.000Z" },
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
      record: null,
    })
    expect(state).toMatchObject({ captured_by: "user_2", captured_at: "2026-11-12T12:00:00.000Z" })
  })
})

describe("readSlipReference", () => {
  const invisible = {
    ok: false,
    error:
      "The slip reference contains a line break, a tab, or a character that is invisible or " +
      "shows as blank. Type it again by hand, without pasting.",
  }

  it("keeps a reference, trimmed and with single spaces", () => {
    expect(readSlipReference("TCS-778812")).toEqual({ ok: true, value: "TCS-778812" })
    expect(readSlipReference("  Leopards   12/34  ")).toEqual({ ok: true, value: "Leopards 12/34" })
    // A no-break space is a visible space: it becomes an ordinary one.
    expect(readSlipReference("TCS\u00A012")).toEqual({ ok: true, value: "TCS 12" })
    expect(readSlipReference("TCS\u3000\u200912")).toEqual({ ok: true, value: "TCS 12" })
    expect(readSlipReference("<script>alert(1)</script>")).toEqual({ ok: true, value: "<script>alert(1)</script>" })
  })

  it("accepts Urdu and Arabic text, with Urdu and Arabic digits", () => {
    for (const text of ["رسید 42", "رسید ۴۲", "إيصال ٤٢", "ٹی سی ایس ۱۲۳۴۵", "لیپرڈز 7781"]) {
      expect(readSlipReference(text)).toEqual({ ok: true, value: text })
    }
  })

  it("accepts combining marks after a letter: Arabic and Urdu vowel marks, and accents", () => {
    for (const text of [
      "رَسِيد 42", // رَسِید: fatha and kasra
      "مُحَمَّد 7", // مُحَمَّد: damma, fatha, shadda then fatha
      "اِنْشا ۴۲", // with sukun, and Urdu digits
      "بٰل 1", // superscript alef
      "Café 12", // e and a combining acute accent
      "नि 5", // Devanagari letter and a vowel sign
    ]) {
      expect({ text, result: readSlipReference(text) }).toEqual({ text, result: { ok: true, value: text } })
    }
  })

  it("refuses a combining mark that is not on a letter or digit", () => {
    for (const raw of ["́A1", "TCS َ1", "TCS-ّ 1", "́́"]) {
      expect({ raw, result: readSlipReference(raw) }).toEqual({
        raw,
        result: {
          ok: false,
          error:
            "The slip reference has an accent or vowel mark that is not on a letter. Type it again " +
            "by hand, without pasting.",
        },
      })
    }
  })

  it("refuses a missing or blank reference", () => {
    for (const raw of [undefined, null, "", "   ", "\u00A0", 42, {}, ["A1"]]) {
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
    for (const raw of [
      "ABC\u0000123", // NUL
      "AB\u0007C", // bell
      "AB\nCD", // line feed
      "AB\r\nCD", // carriage return and line feed
      "AB\tCD", // tab
      "TCS 12\n", // a trailing line break is not trimmed away either
      "AB\u0085CD", // next line (C1)
      "AB\u2028CD", // line separator
      "AB\u2029CD", // paragraph separator
      "A\u200BB", // zero-width space
      "\u202EA1", // right-to-left override
      "A\u200EB", // left-to-right mark
      "A\u2066B\u2069", // isolates
      "\uFEFFA1", // byte order mark
      "A\u00ADB", // soft hyphen
      "رسید\u200C42", // zero-width non-joiner
      "A\ud800B", // lone surrogate
      "TCS\u{E0041}1", // tag character
    ]) {
      expect({ raw, result: readSlipReference(raw) }).toEqual({ raw, result: invisible })
    }
  })

  // QA's eighth review, N5: characters that render as nothing or as blank space.
  it("refuses Hangul fillers, the Braille blank, variation selectors and other default-ignorable characters", () => {
    for (const raw of [
      "\u3164\u3164", // Hangul filler (a letter, Lo, that shows as blank)
      "TCS\u31641", // ...inside a reference
      "\u115F1", // Hangul choseong filler
      "A\u1160B", // Hangul jungseong filler
      "\uFFA0TCS1", // halfwidth Hangul filler
      "\u2800", // Braille pattern blank
      "TCS\u28001", // ...inside a reference
      "TCS\uFE0F1", // variation selector 16
      "TCS\uFE001", // variation selector 1
      "TCS\u{E0100}1", // variation selector 17
      "TCS\u{E01EF}1", // variation selector 256
      "A\u180BB", // Mongolian free variation selector
      "A\u034FB", // combining grapheme joiner (a mark, but default-ignorable)
      "\u17B4A1", // Khmer inherent vowel
      "A\u2060B", // word joiner
      "A\u2064B", // invisible plus
      "A\u{1D173}B", // musical symbol begin beam
      "A\uE000B", // private use
      "A\u{10FFFF}B", // noncharacter (unassigned)
      "A͸B", // unassigned
    ]) {
      expect({ raw, result: readSlipReference(raw) }).toEqual({ raw, result: invisible })
    }
  })

  it("counts characters, not UTF-16 units, against the maximum: 64 accepted, 65 refused", () => {
    const tooLong = {
      ok: false,
      error: `The slip reference must be at most ${SLIP_REFERENCE_MAX_LENGTH} characters.`,
    }
    expect(SLIP_REFERENCE_MAX_LENGTH).toBe(64)
    expect(readSlipReference("A".repeat(64)).ok).toBe(true)
    expect(readSlipReference("𝟏".repeat(64)).ok).toBe(true)
    expect(readSlipReference(`  ${"A".repeat(64)}  `).ok).toBe(true)
    expect(readSlipReference("ر".repeat(64)).ok).toBe(true)
    expect(readSlipReference("A".repeat(65))).toEqual(tooLong)
    expect(readSlipReference("𝟏".repeat(65))).toEqual(tooLong)
  })
})

describe("decideCashCollection", () => {
  const open = cashCollectionState({ payments: [cod()], record: null })

  it("captures the whole amount and records a valid reference on an open cash-on-delivery order", () => {
    expect(decideCashCollection(open, " TCS 1 ")).toEqual({
      ok: true,
      slipReference: "TCS 1",
      paymentId: "pay_cod",
      capture: "full",
    })
  })

  it("captures what is still open when part of the payment is captured", () => {
    const state = cashCollectionState({ payments: [partly()], record: null })
    expect(decideCashCollection(state, "TCS 3")).toEqual({
      ok: true,
      slipReference: "TCS 3",
      paymentId: "pay_cod",
      capture: "remainder",
    })
  })

  it("records without capturing when the payment is already captured", () => {
    const state = cashCollectionState({ payments: [captured()], record: null })
    expect(decideCashCollection(state, "TCS 2")).toEqual({
      ok: true,
      slipReference: "TCS 2",
      paymentId: "pay_cod",
      capture: "none",
    })
  })

  it("refuses an invalid reference", () => {
    expect(decideCashCollection(open, "")).toMatchObject({ ok: false, reason: "invalid_reference" })
    expect(decideCashCollection(open, "\u3164")).toMatchObject({ ok: false, reason: "invalid_reference" })
  })

  it("refuses when recording is not allowed, whatever the reference", () => {
    const done = cashCollectionState({ payments: [captured()], record: recorded })
    expect(decideCashCollection(done, "TCS 2")).toEqual({
      ok: false,
      reason: "already_recorded",
      message: "The cash for this order is already recorded as collected.",
    })
    const other = cashCollectionState({ payments: [card()], record: null })
    expect(decideCashCollection(other, "TCS 2")).toEqual({
      ok: false,
      reason: "not_cash_on_delivery",
      message: "This order is not paid by cash on delivery.",
    })
  })
})

describe("what staff are told", () => {
  it("says another press captured it when the payment is fully captured now", () => {
    for (const record of [null, recorded]) {
      const after = cashCollectionState({ payments: [captured()], record })
      expect(captureFailureMessage(after)).toBe(
        "The payment was captured by another request at the same moment, so this slip reference " +
          "was not recorded. Reload the order to see what is recorded."
      )
    }
  })

  it("says the capture failed and what to do, when the payment is still open or partly captured", () => {
    for (const payment of [cod(), partly()]) {
      const after = cashCollectionState({ payments: [payment], record: null })
      expect(captureFailureMessage(after)).toBe(
        "The payment could not be captured. Nothing was recorded. Reload the order and try again; " +
          "if it fails again, check the Payments section of the order."
      )
    }
  })

  it("never puts SQL, a stack trace or an id into a message", () => {
    const messages = [
      RECORD_FAILURE_MESSAGE,
      UNEXPECTED_FAILURE_MESSAGE,
      captureFailureMessage(cashCollectionState({ payments: [cod()], record: null })),
      ...(["not_cash_on_delivery", "already_recorded", "order_canceled", "payment_canceled", "several_payments"] as const).map(
        refusalMessage
      ),
    ]
    for (const message of messages) {
      expect(message).not.toMatch(/select|insert|update|\bwhere\b|\$\d|_[0-9A-Z]{10,}|\bat .+:\d+/i)
    }
    expect(RECORD_FAILURE_MESSAGE).toBe(
      "The payment is captured, but the slip reference could not be saved. Reload the order and " +
        "enter the slip reference again; the payment will not be captured a second time."
    )
  })

  it("has a message for every refusal", () => {
    expect(refusalMessage("order_canceled")).toBe("This order is canceled.")
  })
})
