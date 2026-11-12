import {
  captureFailureMessage,
  capturedAmount,
  captureMismatch,
  captureMismatchWarning,
  cashCollectionState,
  decideCashCollection,
  isFullyCaptured,
  readSlipReference,
  RECORD_FAILURE_MESSAGE,
  recordedNothingMessage,
  recordRefusalAtInsert,
  refundedAmount,
  refusalMessage,
  remainingToCapture,
  SLIP_REFERENCE_ALLOWED,
  SLIP_REFERENCE_MAX_LENGTH,
  UNEXPECTED_FAILURE_MESSAGE,
  type CashCollectionRecord,
  type CashCollectionRefusal,
  type CollectionPayment,
} from "../cash-collection"
import { toDecimalString } from "../exact-amount"

const at = "2026-11-12T10:00:00.000Z"
const capture = (amount: CollectionPayment["amount"] = 2250) => ({ amount, created_by: "user_1", created_at: at })
const cod = (overrides: Partial<CollectionPayment> = {}): CollectionPayment => ({
  id: "pay_cod",
  provider_id: "pp_cod_cod",
  amount: 2250,
  captured_at: null,
  canceled: false,
  captures: [],
  refunds: [],
  ...overrides,
})
const captured = (overrides: Partial<CollectionPayment> = {}) =>
  cod({ captured_at: at, captures: [capture()], ...overrides })
const partly = (overrides: Partial<CollectionPayment> = {}) => cod({ captures: [capture(1000)], ...overrides })
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
      refunded_amount: 0,
      order_canceled: false,
      remaining: "2250",
      captured_by: null,
      captured_at: null,
      label: "Not collected",
      tone: "orange",
      note: null,
      capture_mismatch: null,
      capture_warning: null,
    })
  })

  it("does not apply to an order paid another way, or with no payment", () => {
    for (const payments of [[card()], [card({ captured_at: at, captures: [capture()] })], []]) {
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
      refunded_amount: 0,
      order_canceled: false,
      remaining: null,
      captured_by: "user_1",
      captured_at: "2026-11-12T10:00:00.000Z",
      label: "Collected",
      tone: "green",
      note: null,
      capture_mismatch: null,
      capture_warning: null,
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
      refunded_amount: 0,
      order_canceled: false,
      remaining: "1250",
      captured_by: "user_1",
      captured_at: "2026-11-12T10:00:00.000Z",
      label: "Partly captured",
      tone: "orange",
      note: null,
      capture_mismatch: null,
      capture_warning: null,
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
            { amount: 1000, created_by: "user_2", created_at: "2026-11-12T12:00:00.000Z" },
            { amount: 1250, created_by: "user_1", created_at: "2026-11-12T09:00:00.000Z" },
          ],
        }),
      ],
      record: null,
    })
    expect(state).toMatchObject({ captured_by: "user_2", captured_at: "2026-11-12T12:00:00.000Z" })
  })
})

describe("readSlipReference", () => {
  const refused = (problem: string) => ({ ok: false, error: `${SLIP_REFERENCE_ALLOWED} ${problem}` })
  const control = refused(
    "This one has a line break, a tab or another control character in it. Type it on one line, by hand, without pasting."
  )
  const invisible = refused(
    "This one has a character in it that is invisible or shows as blank (often pasted along with the text). Type it again by hand, without pasting."
  )
  const symbol = refused(
    "This one has a symbol in it that is not punctuation, such as an emoji, a box or a blank placeholder. Type it again by hand, without pasting."
  )
  const looseMark = refused(
    "This one has an accent or vowel mark that is not on a letter of its own writing system. Type it again by hand, without pasting."
  )

  // QA's tenth review, M4: every refusal says what is allowed, in words staff understand.
  it("says what is allowed, at the start of every refusal", () => {
    expect(SLIP_REFERENCE_ALLOWED).toBe(
      "A slip reference can have letters, digits, spaces and punctuation such as - / # . ( ), up to 64 characters, with at least one letter or digit."
    )
    for (const raw of ["", "A\nB", "A​B", "TCS \u{1F4E6} 1", "́A", "---", "A".repeat(65)]) {
      const result = readSlipReference(raw)
      expect(result.ok).toBe(false)
      expect(result.ok ? "" : result.error.startsWith(SLIP_REFERENCE_ALLOWED)).toBe(true)
    }
  })

  it("keeps a reference, trimmed and with single spaces", () => {
    expect(readSlipReference("TCS-778812")).toEqual({ ok: true, value: "TCS-778812" })
    expect(readSlipReference("  Leopards   12/34  ")).toEqual({ ok: true, value: "Leopards 12/34" })
    // A no-break space is a visible space: it becomes an ordinary one.
    expect(readSlipReference("TCS 12")).toEqual({ ok: true, value: "TCS 12" })
    expect(readSlipReference("TCS　 12")).toEqual({ ok: true, value: "TCS 12" })
    expect(readSlipReference("<script>alert(1)</script>")).toEqual({ ok: true, value: "<script>alert(1)</script>" })
    // Mathematical and currency signs are not "other symbols".
    expect(readSlipReference("COD Rs 2,250 + 10 = $8")).toEqual({ ok: true, value: "COD Rs 2,250 + 10 = $8" })
  })

  it("accepts Urdu and Arabic text, with Urdu and Arabic digits", () => {
    for (const text of ["رسید 42", "رسید ۴۲", "إيصال ٤٢", "ٹی سی ایس ۱۲۳۴۵"]) {
      expect(readSlipReference(text)).toEqual({ ok: true, value: text })
    }
  })

  it("accepts combining marks after a letter: Arabic and Urdu vowel marks, and accents", () => {
    for (const text of [
      "رَسِيد 42", // fatha and kasra
      "مُحَمَّد 7", // damma, fatha, shadda then fatha
      "بٰل 1", // superscript alef
      "Café 12", // e and a combining acute accent
      "नि 5", // Devanagari letter and a vowel sign
    ]) {
      expect({ text, result: readSlipReference(text) }).toEqual({ text, result: { ok: true, value: text } })
    }
  })

  // QA's tenth review, M3: a mutation that refused marks on digits survived; this pins it.
  it("accepts a combining mark on a digit, as on a letter", () => {
    for (const text of ["TCS 12́", "1̂̃ A", "١ٰ رسید"]) {
      expect({ text, result: readSlipReference(text) }).toEqual({ text, result: { ok: true, value: text } })
    }
  })

  it("refuses a combining mark that is not on a letter or digit", () => {
    for (const raw of ["́A1", "TCS َ1", "TCS-ّ 1", "́́"]) {
      expect({ raw, result: readSlipReference(raw) }).toEqual({ raw, result: looseMark })
    }
  })

  // M4: a mark of one writing system hung on a Latin letter or a digit (the Khitan filler shows as
  // nothing) is refused by a general rule; marks shared by scripts (accents, Arabic vowels) are not.
  it("refuses a mark of another writing system on a Latin letter or a digit", () => {
    for (const raw of ["A\u{16FE4}1", "TCS 1\u{16FE4}", "Aे 1" /* a Devanagari vowel sign on A */]) {
      expect({ raw, result: readSlipReference(raw) }).toEqual({ raw, result: looseMark })
    }
  })

  it("refuses a missing or blank reference", () => {
    for (const raw of [undefined, null, "", "   ", " ", 42, {}, ["A1"]]) {
      expect(readSlipReference(raw)).toEqual(refused("Enter the reference from the courier's slip."))
    }
  })

  it("refuses a reference with no letter or digit", () => {
    expect(readSlipReference("--- / ---")).toEqual(refused("This one has no letter or digit."))
  })

  it("refuses, rather than changes, control and line-break characters", () => {
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
    ]) {
      expect({ raw, result: readSlipReference(raw) }).toEqual({ raw, result: control })
    }
  })

  it("refuses, rather than changes, invisible format characters", () => {
    for (const raw of [
      "A​B", // zero-width space
      "‮A1", // right-to-left override
      "A‎B", // left-to-right mark
      "A⁦B⁩", // isolates
      "﻿A1", // byte order mark
      "A­B", // soft hyphen
      "A‍B", // zero-width joiner
      "A\ud800B", // lone surrogate
      "TCS\u{E0041}1", // tag character
    ]) {
      expect({ raw, result: readSlipReference(raw) }).toEqual({ raw, result: invisible })
    }
  })

  // M4: the zero-width non-joiner is part of Urdu and Persian spelling (some keyboards type it).
  it("keeps a zero-width non-joiner between two Arabic-script letters, and refuses it anywhere else", () => {
    for (const text of [
      "می‌خواهم 12", // Persian mi-khaham
      "مِ‌خ 3", // a vowel mark on the first letter in between
      "TCS نا‌مه", // Persian nameh
    ]) {
      expect({ text, result: readSlipReference(text) }).toEqual({ text, result: { ok: true, value: text } })
    }
    for (const raw of [
      "رسید‌42", // before a digit
      "TC‌S 1", // between Latin letters
      "‌رسید 1", // at the start
      "رسید‌ 1", // before a space
      "ر‌‌س 1", // twice
      "A1‌", // at the end
    ]) {
      expect({ raw, result: readSlipReference(raw) }).toEqual({ raw, result: invisible })
    }
  })

  // QA's eighth review, N5: characters that render as nothing or as blank space.
  it("refuses Hangul fillers, variation selectors and other default-ignorable characters", () => {
    for (const raw of [
      "ㅤㅤ", // Hangul filler (a letter, Lo, that shows as blank)
      "TCSㅤ1", // ...inside a reference
      "ᅟ1", // Hangul choseong filler
      "AᅠB", // Hangul jungseong filler
      "ﾠTCS1", // halfwidth Hangul filler
      "TCS️1", // variation selector 16
      "TCS︀1", // variation selector 1
      "TCS\u{E0100}1", // variation selector 17
      "TCS\u{E01EF}1", // variation selector 256
      "A᠋B", // Mongolian free variation selector
      "A͏B", // combining grapheme joiner (a mark, but default-ignorable)
      "឴A1", // Khmer inherent vowel
      "A⁠B", // word joiner
      "A⁤B", // invisible plus
      "A\u{1D173}B", // musical symbol begin beam
      "AB", // private use
      "A\u{10FFFF}B", // noncharacter (unassigned)
      "A͸B", // unassigned
    ]) {
      expect({ raw, result: readSlipReference(raw) }).toEqual({ raw, result: invisible })
    }
  })

  // M4: QA's tenth review found these accepted; one general rule refuses "other" symbols.
  it("refuses other symbols: placeholders that show as a box or blank, the Braille blank, emoji", () => {
    for (const raw of [
      "TCS￼1", // object replacement character
      "TCS \u{1D159} 1", // musical symbol null notehead
      "⠀", // Braille pattern blank
      "TCS⠀1", // ...inside a reference
      "TCS \u{1F4E6} 1", // emoji (package)
      "\u{1F600}\u{1F600}",
      "TCS ★ 1", // black star
    ]) {
      expect({ raw, result: readSlipReference(raw) }).toEqual({ raw, result: symbol })
    }
  })

  it("counts characters, not UTF-16 units, against the maximum: 64 accepted, 65 refused", () => {
    expect(SLIP_REFERENCE_MAX_LENGTH).toBe(64)
    expect(readSlipReference("A".repeat(64)).ok).toBe(true)
    expect(readSlipReference("\u{1D7CF}".repeat(64)).ok).toBe(true)
    expect(readSlipReference(`  ${"A".repeat(64)}  `).ok).toBe(true)
    expect(readSlipReference("ر".repeat(64)).ok).toBe(true)
    expect(readSlipReference("A".repeat(65))).toEqual(refused("This one has 65."))
    expect(readSlipReference("\u{1D7CF}".repeat(65))).toEqual(refused("This one has 65."))
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
      amount: "1250",
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
      ...(["not_cash_on_delivery", "already_recorded", "order_canceled", "payment_canceled", "payment_refunded", "several_payments"] as const).map(
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
    expect(refusalMessage("order_canceled")).toBe("This order is canceled, so the cash cannot be recorded as collected.")
  })
})

// QA's tenth review, S3: the money rules, moved out of the Medusa glue, worked out exactly.
describe("what counts as captured, and what is left to capture", () => {
  const withCaptures = (amount: CollectionPayment["amount"], ...amounts: CollectionPayment["amount"][]) =>
    cod({ amount, captures: amounts.map((a) => capture(a)) })

  it("leaves exactly the rest, to the last digit, for fractional amounts", () => {
    expect(remainingToCapture(withCaptures("1124.995", "333.5"))).toBe("791.495")
    expect(remainingToCapture(withCaptures("1124.995", "0.01"))).toBe("1124.985")
    expect(remainingToCapture(withCaptures("1124.995", "333.5", "791.49"))).toBe("0.005")
    expect(remainingToCapture(withCaptures("0.03", "0.01", "0.01"))).toBe("0.01")
    // Medusa's big-number objects and numbers are read the same way.
    expect(remainingToCapture(withCaptures({ value: "2250" }, { value: "333.5" }))).toBe("1916.5")
    expect(remainingToCapture(withCaptures(0.3, 0.1, 0.1))).toBe("0.1")
  })

  it("never leaves less than nothing", () => {
    expect(remainingToCapture(withCaptures("100", "60", "60"))).toBe("0")
    expect(remainingToCapture(withCaptures("2250", "2250"))).toBe("0")
  })

  it("counts the whole amount captured only when the captures reach it, or Medusa says so", () => {
    expect(isFullyCaptured(withCaptures("1124.995", "333.5", "791.49"))).toBe(false)
    expect(isFullyCaptured(withCaptures("1124.995", "333.5", "791.495"))).toBe(true)
    expect(isFullyCaptured(withCaptures("0.03", "0.01", "0.01"))).toBe(false)
    expect(isFullyCaptured(withCaptures("0.03", "0.01", "0.01", "0.01"))).toBe(true)
    // 0.1 + 0.2 is 0.30000000000000004 in floating point; exactly it is 0.3.
    expect(isFullyCaptured(withCaptures("0.3", 0.1, 0.2))).toBe(true)
    expect(isFullyCaptured(withCaptures("0.3", "0.1", "0.19999999999999998"))).toBe(false)
    expect(isFullyCaptured(cod({ captured_at: at }))).toBe(true)
    // A payment of 0 is not captured by having no captures.
    expect(isFullyCaptured(withCaptures("0"))).toBe(false)
  })

  it("adds captures and refunds exactly", () => {
    expect(toDecimalString(capturedAmount(withCaptures("1124.995", "333.5", "0.01")))).toBe("333.51")
    expect(toDecimalString(refundedAmount(cod({ refunds: ["0.01", "333.5", { value: "791.485" }] })))).toBe("1124.995")
  })

  it("is what the state shows and what recording the slip captures", () => {
    const state = cashCollectionState({ payments: [withCaptures("1124.995", "333.5")], record: null })
    expect(state).toMatchObject({ stage: "partly_captured", amount: 1124.995, captured_amount: 333.5, remaining: "791.495" })
    expect(decideCashCollection(state, "TCS 9")).toEqual({
      ok: true,
      slipReference: "TCS 9",
      paymentId: "pay_cod",
      capture: "remainder",
      amount: "791.495",
    })
    const almost = cashCollectionState({ payments: [withCaptures("1124.995", "333.5", "791.49")], record: null })
    expect(almost).toMatchObject({ stage: "partly_captured", collected: false, remaining: "0.005" })
  })
})

// QA's tenth review, S1: Medusa's own fault, shown to staff, not patched.
describe("the order's capture transactions against the payment's captures", () => {
  it("agree when they add up to the same figure, also in another order or as decimals", () => {
    expect(captureMismatch(["2250"], [captured()])).toBeNull()
    expect(captureMismatch(["333.5", "1916.5"], [cod({ captures: [capture("1916.5"), capture("333.5")] })])).toBeNull()
    expect(captureMismatch([], [cod()])).toBeNull()
  })

  it("names both figures when the order shows more (or less) than was captured", () => {
    // QA's phantom transaction: captures 2,250, transactions 2,583.
    expect(captureMismatch(["333", "1917", "333"], [cod({ captures: [capture(333), capture(1917)] })])).toEqual({
      order_transactions: 2583,
      payment_captures: 2250,
    })
    expect(captureMismatch(["1124.995"], [cod({ captures: [capture("1124.99")] })])).toEqual({
      order_transactions: 1124.995,
      payment_captures: 1124.99,
    })
  })

  it("is a plain warning with both figures and what to do, shown in any state", () => {
    const state = cashCollectionState({
      currencyCode: "pkr",
      payments: [captured()],
      record: recorded,
      orderCaptureTransactions: ["2250", "333"],
    })
    expect(state.capture_mismatch).toEqual({ order_transactions: 2583, payment_captures: 2250 })
    expect(state.capture_warning).toBe(
      "Medusa's payment figures for this order disagree: the order's payment history shows PKR 2,583 captured, " +
        "but the payment's captures add up to PKR 2,250. This is a known Medusa fault when two captures run at " +
        "the same moment. Do not refund or chase payment from the order's paid figure; tell the developer, with " +
        "the order number."
    )
    expect(captureMismatchWarning({ order_transactions: 10.5, payment_captures: 10 }, "gbp")).toContain(
      "shows GBP 10.5 captured, but the payment's captures add up to GBP 10."
    )
    const open = cashCollectionState({ payments: [cod()], record: null, orderCaptureTransactions: ["5"] })
    expect(open).toMatchObject({ stage: "not_collected", capture_mismatch: { order_transactions: 5, payment_captures: 0 } })
  })
})

// QA's tenth review, M2: canceled and refunded orders, told truthfully; no record on them.
describe("after the cash: canceled and refunded orders", () => {
  const refundedAll = (overrides: Partial<CollectionPayment> = {}) => captured({ refunds: ["2250"], ...overrides })

  it("keeps showing a recorded collection, and says what happened since", () => {
    const cases: [string | null, CollectionPayment, string, string, RegExp | null][] = [
      [null, captured(), "Collected", "green", null],
      ["canceled", refundedAll(), "Collected, then canceled and refunded", "grey", /canceled afterwards and the payment refunded\. PKR 2,250 of the PKR 2,250 captured is refunded\./],
      ["canceled", captured({ refunds: ["1000"] }), "Collected, then canceled, partly refunded", "red", /PKR 1,000 of the PKR 2,250 captured is refunded\. Refund the rest/],
      ["canceled", captured(), "Collected, then canceled, not refunded", "red", /nothing is refunded/],
      // The cancel canceled the payment (it read it before the capture): still captured, shown.
      ["canceled", captured({ canceled: true }), "Collected, then canceled, not refunded", "red", /nothing is refunded/],
      [null, refundedAll(), "Collected, then refunded", "grey", /refunded afterwards\. PKR 2,250 of the PKR 2,250/],
      [null, captured({ refunds: ["0.01"] }), "Collected, partly refunded", "orange", /PKR 0\.01 of the PKR 2,250 captured/],
    ]
    for (const [orderStatus, payment, label, tone, note] of cases) {
      const state = cashCollectionState({ orderStatus, currencyCode: "pkr", payments: [payment], record: recorded })
      expect({ label, state }).toMatchObject({
        label,
        state: { stage: "recorded", label, tone, can_record: false, reason: "already_recorded", slip_reference: "TCS-123" },
      })
      if (note) {
        expect(state.note).toMatch(note)
      } else {
        expect(state.note).toBeNull()
      }
    }
  })

  it("never records on a canceled order, a canceled payment or a refunded payment", () => {
    const cases: [string | null, CollectionPayment, CashCollectionRefusal, string][] = [
      ["canceled", cod(), "order_canceled", "Canceled, not collected"],
      ["canceled", refundedAll(), "order_canceled", "Canceled, not collected"],
      [null, cod({ canceled: true }), "payment_canceled", "Payment canceled, not collected"],
      [null, refundedAll(), "payment_refunded", "Refunded, not collected"],
      [null, partly({ refunds: ["1"] }), "payment_refunded", "Refunded, not collected"],
    ]
    for (const [orderStatus, payment, reason, label] of cases) {
      const state = cashCollectionState({ orderStatus, payments: [payment], record: null })
      expect({ reason, state }).toMatchObject({
        reason,
        state: { stage: "unavailable", can_record: false, capture_needed: false, reason, label, tone: "grey" },
      })
      expect(decideCashCollection(state, "TCS 1")).toEqual({ ok: false, reason, message: refusalMessage(reason) })
    }
  })

  // The order of the checks (cashCollectionState's comment): each pair below has both
  // conditions true, and the earlier check must win.
  it("checks in a fixed order: not cash on delivery, recorded, order canceled, payment canceled, several, refunded", () => {
    const at2 = (orderStatus: string | null, payments: CollectionPayment[], record: CashCollectionRecord | null = null) =>
      cashCollectionState({ orderStatus, payments, record })
    // 1 before 2: a record on an order with no cash-on-delivery payment does not apply.
    expect(at2(null, [card()], recorded)).toMatchObject({ applies: false, reason: "not_cash_on_delivery" })
    // 2 before 3, 4, 6: a record is never hidden.
    expect(at2("canceled", [refundedAll({ canceled: true })], recorded)).toMatchObject({ stage: "recorded" })
    // 3 before 4: canceled order and canceled payment.
    expect(at2("canceled", [cod({ canceled: true })])).toMatchObject({ reason: "order_canceled" })
    // 3 before 6: canceled order and refunded payment.
    expect(at2("canceled", [refundedAll()])).toMatchObject({ reason: "order_canceled" })
    // 4 before 5: two payments, both canceled.
    expect(at2(null, [cod({ id: "a", canceled: true }), cod({ id: "b", canceled: true })])).toMatchObject({ reason: "payment_canceled" })
    // 5 before 6: two live payments, one refunded.
    expect(at2(null, [cod({ id: "a" }), refundedAll({ id: "b" })])).toMatchObject({ reason: "several_payments" })
    // 6 before 7: refunded and fully captured is not "captured without slip".
    expect(at2(null, [refundedAll()])).toMatchObject({ reason: "payment_refunded" })
  })

  it("checks again at the insert, under the row locks, in the same order", () => {
    expect(recordRefusalAtInsert({ orderStatus: "pending", paymentCanceled: false, refunds: 0 })).toBeNull()
    expect(recordRefusalAtInsert({ orderStatus: "canceled", paymentCanceled: true, refunds: 2 })).toBe("order_canceled")
    expect(recordRefusalAtInsert({ orderStatus: "pending", paymentCanceled: true, refunds: 2 })).toBe("payment_canceled")
    expect(recordRefusalAtInsert({ orderStatus: "pending", paymentCanceled: false, refunds: 1 })).toBe("payment_refunded")
    expect(recordRefusalAtInsert({ orderStatus: null, paymentCanceled: false, refunds: 0 })).toBeNull()
  })

  it("tells the press that lost to a cancel or a refund what happened", () => {
    expect(recordedNothingMessage("order_canceled")).toBe(
      "This order is canceled, so the cash cannot be recorded as collected. It changed at the same moment as " +
        "this press, so the slip reference was not recorded. Reload the order to see what happened to the payment."
    )
    const canceledNow = cashCollectionState({ orderStatus: "canceled", payments: [cod()], record: null })
    expect(captureFailureMessage(canceledNow)).toBe(
      "This order is canceled, so the cash cannot be recorded as collected. It happened at the same moment as " +
        "this press; nothing was recorded."
    )
  })
})
