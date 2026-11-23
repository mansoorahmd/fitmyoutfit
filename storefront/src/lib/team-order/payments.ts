// The money of a team order, apart from the pages that show it (docs/contracts/m3-team-order-payments.md):
// the shapes the pages use (camelCase), the one place that reads the backend's answers into them, what a
// failure says, and the pure decisions of the pages (what the proof's cost block shows, what the payment page
// offers at each status, what the order page says about the money, whether "Change the list" is offered).
// No sentence is written here: they are in src/content/payments.ts. Plain functions, tested on their own.

import { paymentsContent, type PaymentStep } from "@content/payments"
import { convertToLocale } from "@lib/util/money"
import { fill } from "@lib/util/wording"

import type { Failure, TeamOrderStatus } from "./types"

type Raw = Record<string, unknown>
const isRaw = (value: unknown): value is Raw => typeof value === "object" && value !== null && !Array.isArray(value)
const isNum = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value)
const isStr = (value: unknown): value is string => typeof value === "string"

// ---- the shapes ------------------------------------------------------------------------

export const PART_STATES = ["unpaid", "started", "awaiting", "authorized", "paid", "refunded", "canceled"] as const
export type PartState = (typeof PART_STATES)[number]
export type PartName = "deposit" | "balance"

export type CostLine = { size: string; quantity: number; unitPrice: number; total: number }

/** What the team order costs, for the proof that is out (`quote`) or the order that was placed (`ordered`). */
export type CostView = {
  state: "quote" | "ordered"
  proofId: string
  /** Lower case, as the backend sends it. */
  currencyCode: string
  taxFinal: boolean
  lines: CostLine[]
  pieces: number
  delivery: { name: string; amount: number; dutyPaid: boolean } | null
  rush: { amount: number; percentage: number } | null
  subtotal: number
  taxTotal: number
  total: number
  depositPercentage: number
}

export type PartView = {
  amount: number
  state: PartState
  /** The organizer may pay it now. */
  due: boolean
  paidAt: string | null
  byHand: boolean | null
  session: { id: string; providerId: string; status: string } | null
}

export type PaymentsView = {
  teamOrder: { id: string; status: TeamOrderStatus; kind: "order" | "add_on" | "reorder" }
  cost: CostView
  deposit: PartView
  balance: PartView
  paidTotal: number
  outstanding: number
  paymentStatus: string | null
  /** The Medusa order, once placed. */
  order: { id: string; displayId: number | null; status: string } | null
}

/** What `next` says to do after a payment is started. A type this storefront does not know is `unknown`. */
export type NextStep = { type: "confirm" } | { type: "redirect"; url: string } | { type: "unknown" }

export type StartedPayment = {
  payments: PaymentsView
  part: PartName
  amount: number
  currencyCode: string
  session: { id: string; providerId: string; status: string }
  next: NextStep
}

// ---- reading the answers ----------------------------------------------------------------

const STATUSES: readonly string[] = ["draft", "proof_sent", "approved", "deposit_paid", "in_production", "balance_due", "shipped"]

function readCost(json: unknown): CostView | null {
  if (!isRaw(json)) return null
  if (json.state !== "quote" && json.state !== "ordered") return null
  if (!isStr(json.proof_id) || !isStr(json.currency_code) || typeof json.tax_final !== "boolean") return null
  if (!Array.isArray(json.lines)) return null
  const lines: CostLine[] = []
  for (const l of json.lines) {
    if (!isRaw(l) || !isStr(l.size) || !isNum(l.quantity) || !isNum(l.unit_price) || !isNum(l.total)) return null
    lines.push({ size: l.size, quantity: l.quantity, unitPrice: l.unit_price, total: l.total })
  }
  if (!isNum(json.pieces) || !isNum(json.subtotal) || !isNum(json.tax_total) || !isNum(json.total) || !isNum(json.deposit_percentage)) return null
  let delivery: CostView["delivery"] = null
  if (json.delivery !== null && json.delivery !== undefined) {
    const d = json.delivery
    if (!isRaw(d) || !isStr(d.name) || !isNum(d.amount) || typeof d.duty_paid !== "boolean") return null
    delivery = { name: d.name, amount: d.amount, dutyPaid: d.duty_paid }
  }
  let rush: CostView["rush"] = null
  if (json.rush !== null && json.rush !== undefined) {
    const r = json.rush
    if (!isRaw(r) || !isNum(r.amount) || !isNum(r.percentage)) return null
    rush = { amount: r.amount, percentage: r.percentage }
  }
  return {
    state: json.state,
    proofId: json.proof_id,
    currencyCode: json.currency_code,
    taxFinal: json.tax_final,
    lines,
    pieces: json.pieces,
    delivery,
    rush,
    subtotal: json.subtotal,
    taxTotal: json.tax_total,
    total: json.total,
    depositPercentage: json.deposit_percentage,
  }
}

function readSession(json: unknown): { id: string; providerId: string; status: string } | null | undefined {
  if (json === null || json === undefined) return null
  if (!isRaw(json) || !isStr(json.id) || !isStr(json.provider_id) || !isStr(json.status)) return undefined
  return { id: json.id, providerId: json.provider_id, status: json.status }
}

function readPart(json: unknown): PartView | null {
  if (!isRaw(json) || !isNum(json.amount) || typeof json.due !== "boolean") return null
  if (!isStr(json.state) || !(PART_STATES as readonly string[]).includes(json.state)) return null
  const session = readSession(json.session)
  if (session === undefined) return null
  return {
    amount: json.amount,
    state: json.state as PartState,
    due: json.due,
    paidAt: isStr(json.paid_at) ? json.paid_at : null,
    byHand: typeof json.by_hand === "boolean" ? json.by_hand : null,
    session,
  }
}

/** The answer of GET .../payments (and the base of the answers of the two POST routes). Null: unreadable. */
export function parsePaymentsAnswer(json: unknown): PaymentsView | null {
  if (!isRaw(json) || !isRaw(json.team_order) || !isRaw(json.payments)) return null
  const t = json.team_order
  if (!isStr(t.id) || !isStr(t.status) || !STATUSES.includes(t.status)) return null
  const kind = t.kind === "add_on" || t.kind === "reorder" ? t.kind : "order"
  const cost = readCost(json.cost)
  const p = json.payments
  const deposit = readPart(p.deposit)
  const balance = readPart(p.balance)
  if (!cost || !deposit || !balance || !isNum(p.paid_total) || !isNum(p.outstanding)) return null
  let order: PaymentsView["order"] = null
  if (json.order !== null && json.order !== undefined) {
    const o = json.order
    if (!isRaw(o) || !isStr(o.id)) return null
    order = { id: o.id, displayId: isNum(o.display_id) ? o.display_id : null, status: isStr(o.status) ? o.status : "" }
  }
  return {
    teamOrder: { id: t.id, status: t.status as TeamOrderStatus, kind },
    cost,
    deposit,
    balance,
    paidTotal: p.paid_total,
    outstanding: p.outstanding,
    paymentStatus: isStr(p.payment_status) ? p.payment_status : null,
    order,
  }
}

/** The answer of POST .../payments/:part: the payments, and `payment` with `next`. */
export function parseStartAnswer(json: unknown): StartedPayment | null {
  const payments = parsePaymentsAnswer(json)
  if (!payments || !isRaw(json) || !isRaw(json.payment)) return null
  const pay = json.payment
  if ((pay.part !== "deposit" && pay.part !== "balance") || !isNum(pay.amount) || !isStr(pay.currency_code)) return null
  const session = readSession(pay.session)
  if (!session) return null
  return { payments, part: pay.part, amount: pay.amount, currencyCode: pay.currency_code, session, next: readNext(pay.next) }
}

/** A `next` this storefront does not know (or that is malformed) is `unknown`: shown as "not available here yet", never a crash. */
export function readNext(json: unknown): NextStep {
  if (isRaw(json) && json.type === "confirm") return { type: "confirm" }
  if (isRaw(json) && json.type === "redirect" && isStr(json.url) && /^https:\/\//i.test(json.url)) return { type: "redirect", url: json.url }
  return { type: "unknown" }
}

/** The payment provider of the placeholder payment: no money moves with it. A real gateway has another id. */
export const PLACEHOLDER_PROVIDER = "pp_system_default"

// ---- amounts ---------------------------------------------------------------------------------

/** An amount in the store's money format: the code, then the number ("PKR 35,125", "GBP 11.01"). */
export const moneyWords = (amount: number, currencyCode: string): string =>
  convertToLocale({ amount, currency_code: currencyCode.toUpperCase() })

// ---- failures --------------------------------------------------------------------------------

export type PaymentFailure = {
  /** The sentence for the customer. */
  text: string
  signedOut: boolean
  notFound: boolean
  /** The step could not be reached: for `complete` this means "we do not know whether it was taken". */
  unavailable: boolean
  /** The part is paid already (the backend says so): the page reads the money again and shows it. */
  alreadyPaid: boolean
  /** The started payment is no longer the one in progress: start again. */
  startAgain: boolean
}

const ALREADY_PAID = new Set(["deposit_already_paid", "balance_already_paid"])
const START_AGAIN = new Set(["payment_session_stale", "payment_session_required", "payment_failed"])

/** One sentence for a failed step, from the backend's machine code, never its message. A code with no sentence gets the step's general one. */
export function paymentFailure(step: PaymentStep, failure: Failure): PaymentFailure {
  const g = paymentsContent.general
  const base = { signedOut: false, notFound: false, unavailable: false, alreadyPaid: false, startAgain: false }
  switch (failure.kind) {
    case "signed_out":
      return { ...base, text: g.signedOut, signedOut: true }
    case "not_found":
      return { ...base, text: g.notFound, notFound: true }
    case "unavailable":
      return { ...base, text: g.unavailable[step], unavailable: true }
    case "stale":
      return { ...base, text: g.fallback[step] }
    case "refused": {
      const text = paymentsContent.refusals[step][failure.code] ?? g.fallback[step]
      return { ...base, text, alreadyPaid: step !== "load" && ALREADY_PAID.has(failure.code), startAgain: step === "complete" && START_AGAIN.has(failure.code) }
    }
  }
}

// ---- the cost block (the proof page, before signing) ------------------------------------------

export type CostRow = { key: string; label: string; value: string | null; note?: string; testId: string }

export type CostBlock = {
  /** One row per size: "M · 3 × PKR 3,500" and its line total. */
  lines: CostRow[]
  piecesText: string
  /** Delivery, rush, subtotal and tax, in the order the cart shows them. */
  extras: CostRow[]
  total: string
  deposit: { amount: string; hint: string }
  balance: { amount: string; hint: string }
  taxNotFinal: boolean
}

const w = paymentsContent.cost

/** What the cost block shows for the backend's `cost` and `payments`: every figure the backend's, formatted in the region's currency. */
export function costBlock(view: Pick<PaymentsView, "cost" | "deposit" | "balance">): CostBlock {
  const { cost } = view
  const m = (n: number) => moneyWords(n, cost.currencyCode)
  const lines: CostRow[] = cost.lines.map((l) => ({
    key: l.size,
    label: fill(w.line, { size: l.size, pieces: l.quantity, each: m(l.unitPrice) }),
    value: m(l.total),
    testId: "cost-line",
  }))
  const extras: CostRow[] = []
  if (cost.delivery) {
    extras.push({
      key: "delivery",
      label: cost.delivery.name,
      // the duty-paid line is words ("Included"), as the cart and the checkout have it; a delivery charge is an amount
      value: cost.delivery.dutyPaid ? w.deliveryIncluded : m(cost.delivery.amount),
      testId: "cost-delivery",
    })
  }
  if (cost.rush) {
    extras.push({ key: "rush", label: fill(w.rush, { percentage: cost.rush.percentage }), value: m(cost.rush.amount), testId: "cost-rush" })
  }
  extras.push({ key: "tax", label: w.tax, value: m(cost.taxTotal), ...(cost.taxFinal ? {} : { note: w.taxNotFinal }), testId: "cost-tax" })
  return {
    lines,
    piecesText: cost.pieces === 1 ? w.piecesOne : fill(w.pieces, { n: cost.pieces }),
    extras,
    total: m(cost.total),
    deposit: { amount: m(view.deposit.amount), hint: fill(w.depositHint, { percentage: cost.depositPercentage }) },
    balance: { amount: m(view.balance.amount), hint: w.balanceHint },
    taxNotFinal: !cost.taxFinal,
  }
}

/** The signing statement with the backend's total and its split in it. */
export const statementWithMoney = (view: Pick<PaymentsView, "cost" | "deposit" | "balance">): string =>
  fill(paymentsContent.statementMoney, {
    total: moneyWords(view.cost.total, view.cost.currencyCode),
    deposit: moneyWords(view.deposit.amount, view.cost.currencyCode),
    balance: moneyWords(view.balance.amount, view.cost.currencyCode),
  })

// ---- what the payment page offers ---------------------------------------------------------------

export type PayModel =
  /** No proof yet. */
  | { kind: "not_priced" }
  /** The proof is out: sign it first. */
  | { kind: "proof_out" }
  /** A part is due now: the action. */
  | { kind: "pay"; part: PartName }
  /** The deposit is paid, the balance is not due yet (`production`: the order is in production). */
  | { kind: "balance_not_due"; production: boolean }
  /** A payment is with the payment system. */
  | { kind: "processing"; part: PartName }
  /** Everything is paid (`shipped` when the order has gone). */
  | { kind: "paid_in_full"; shipped: boolean }
  | { kind: "refunded" }
  | { kind: "canceled" }
  /** Nothing is due and the page cannot say more (an unexpected combination): never a dead button. */
  | { kind: "nothing_due" }

const withSystem = (s: PartState) => s === "awaiting" || s === "authorized"

/** What the payment page shows and offers, from the backend's status and parts. Nothing is computed beyond reading them. */
export function payModel(status: TeamOrderStatus, payments: Pick<PaymentsView, "deposit" | "balance"> | null): PayModel {
  if (status === "draft") return { kind: "not_priced" }
  if (status === "proof_sent") return { kind: "proof_out" }
  if (!payments) return { kind: "nothing_due" }
  const { deposit, balance } = payments
  if (deposit.state === "canceled" || balance.state === "canceled") return { kind: "canceled" }
  if (deposit.state === "refunded" || balance.state === "refunded") return { kind: "refunded" }
  switch (status) {
    case "approved":
      if (deposit.state === "paid") return { kind: "balance_not_due", production: false }
      if (withSystem(deposit.state)) return { kind: "processing", part: "deposit" }
      return deposit.due ? { kind: "pay", part: "deposit" } : { kind: "nothing_due" }
    case "deposit_paid":
      return { kind: "balance_not_due", production: false }
    case "in_production":
      return { kind: "balance_not_due", production: true }
    case "balance_due":
      if (balance.state === "paid") return { kind: "paid_in_full", shipped: false }
      if (withSystem(balance.state)) return { kind: "processing", part: "balance" }
      return balance.due ? { kind: "pay", part: "balance" } : { kind: "nothing_due" }
    case "shipped":
      return { kind: "paid_in_full", shipped: true }
  }
}

// ---- what the order page says about the money ---------------------------------------------------------

export type MoneyKey = "draft" | "proof_sent" | "approved" | "deposit_paid" | "in_production" | "balance_due" | "balance_paid" | "shipped"

/** The money's state of an order at its status (the key into `paymentsContent.order.state`). A paid balance before shipping is `balance_paid`. */
export function moneyKey(status: TeamOrderStatus, payments: Pick<PaymentsView, "balance"> | null): MoneyKey {
  if (status === "balance_due" && payments?.balance.state === "paid") return "balance_paid"
  return status
}

/** Whether "Change the list" is offered: the backend allows it only from a proof that is out, or a signed one before any deposit money is authorised or taken. */
export function changeListOffered(status: TeamOrderStatus, payments: Pick<PaymentsView, "deposit"> | null): boolean {
  if (status === "draft") return false
  if (status === "proof_sent") return true
  if (status !== "approved") return false
  // unknown (the money could not be read): the backend decides, and refuses in a sentence
  if (!payments) return true
  return payments.deposit.state === "unpaid" || payments.deposit.state === "started"
}
