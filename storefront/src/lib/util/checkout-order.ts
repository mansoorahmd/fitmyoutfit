// "Place order" (docs/design/05-m1-pages.md, 6.6 to 6.8, and the contract,
// docs/contracts/m1-checkout.md, sections 6 and 8.1): what keeps the button
// inactive, how each answer from the backend maps to what the customer
// sees, and how a refusal is explained from the rules (never from the
// backend's message). Plain functions; the server action and the
// place-order block only call them.

import { CheckoutRules, MinimumView, minimumView } from "./checkout-rules"
import { COD_PROVIDER_ID, PaymentChoiceView, selectableOption } from "./checkout-payment"
import { convertToLocale } from "./money"

/** Why "Place order" is inactive, in the order it is checked. Null: it can be pressed. */
export type PlaceOrderBlock =
  | { kind: "offline" }
  | { kind: "minimum"; missing: number }
  | { kind: "delivery" }
  | { kind: "payment" }
  | null

export const placeOrderBlock = ({
  online,
  minimum,
  deliveryReady,
  choice,
  chosenId,
}: {
  online: boolean
  minimum: MinimumView | null
  /** The cart has its delivery method. */
  deliveryReady: boolean
  choice: PaymentChoiceView
  chosenId: string | null
}): PlaceOrderBlock => {
  if (!online) return { kind: "offline" }
  if (minimum && !minimum.reached) return { kind: "minimum", missing: minimum.missing }
  if (!deliveryReady) return { kind: "delivery" }
  if (!selectableOption(choice, chosenId)) return { kind: "payment" }
  return null
}

/**
 * A call to the backend, as the data layer reports it: the body, or the
 * HTTP status (none: no answer) with the backend's message, which is read
 * only where the contract names an answer by it (completionRetry).
 */
export type BackendCall<T> = { ok: true; body: T } | { ok: false; status?: number; message?: string }

/** What completing the cart came to. */
export type CompletionResult =
  | { kind: "order"; orderId: string; countryCode: string | null }
  /** HTTP 409: completing again may work (contract 8.1). */
  | { kind: "conflict" }
  /** Any other 4xx: refused; re-read the rules and explain. */
  | { kind: "refused" }
  /** HTTP 404: the cart is gone. */
  | { kind: "cart_lost" }
  /** HTTP 5xx: the store is misconfigured (a setting) or failing. */
  | { kind: "server" }
  /** No answer at all: the order may or may not exist. */
  | { kind: "no_answer" }
  /** The backend answered with the cart: the payment didn't go through. */
  | { kind: "payment_failed" }

type CompleteBody =
  | { type: "order"; order: { id: string; shipping_address?: { country_code?: string | null } | null } }
  | { type: "cart"; cart?: unknown; error?: unknown }

/** A failed call by its status (refusals are never read from the message). */
export const failureKind = (status: number | undefined): CompletionResult["kind"] => {
  if (typeof status !== "number") return "no_answer"
  if (status === 404) return "cart_lost"
  if (status === 409) return "conflict"
  if (status >= 500) return "server"
  if (status >= 400) return "refused"
  return "no_answer"
}

/** POST /store/carts/:id/complete's answer, as a result. */
export const readCompletion = (call: BackendCall<CompleteBody>): CompletionResult => {
  if (!call.ok) {
    return { kind: failureKind(call.status) } as CompletionResult
  }
  if (call.body?.type === "order" && call.body.order?.id) {
    return {
      kind: "order",
      orderId: call.body.order.id,
      countryCode: call.body.order.shipping_address?.country_code?.toLowerCase() ?? null,
    }
  }
  return { kind: "payment_failed" }
}

/** What the customer sees after pressing "Place order", once the backend has answered. */
export type PlaceOrderOutcome =
  | Exclude<CompletionResult, { kind: "conflict" } | { kind: "no_answer" }>
  /** Unknown: the connection was lost, or completing kept answering 409 ("Check my order"). */
  | { kind: "unknown" }
  /**
   * The cart's total is not the one the customer saw (the rush price
   * changed at that moment, contract 9): nothing was placed; the page shows
   * the new total and the customer presses "Place order" again.
   */
  | { kind: "total_changed"; total: number; currencyCode: string }

/**
 * The completion answers that mean "make sure of the payment session and
 * complete again" (contract 9), or null for any other answer:
 * - 409 `conflict`: another request changed the cart during completion;
 * - 400 "Payment sessions are required to complete cart": the rush price
 *   changed at that moment and Medusa dropped the session;
 * - 404 naming a payment session (Medusa's own race, rare).
 * The two last are told from other refusals by the backend's message, as
 * the contract names them; a 400 or 404 without it is what it always was
 * (a refusal; the cart is gone).
 */
export const completionRetry = (
  call: BackendCall<unknown>
): "conflict" | "session_required" | "session_missing" | null => {
  if (call.ok) return null
  if (call.status === 409) return "conflict"
  if (call.status === 400 && /payment sessions are required/i.test(call.message ?? "")) {
    return "session_required"
  }
  if (call.status === 404 && /payment[ _-]?session/i.test(call.message ?? "")) {
    return "session_missing"
  }
  return null
}

/** How many times a completion is tried again after one of those answers (the brief: at most twice). */
export const COMPLETION_RETRIES = 2

/**
 * Whether the cart's total differs from the one the customer saw. Unknown
 * on either side: no difference is claimed.
 */
export const totalChanged = (
  expected: number | null | undefined,
  actual: number | null | undefined
): boolean =>
  typeof expected === "number" &&
  typeof actual === "number" &&
  Number.isFinite(expected) &&
  Number.isFinite(actual) &&
  Math.abs(expected - actual) >= 0.005

/** The cart as ensureSession read it: whether it is an order already, and its total. */
type SessionCart = {
  completed_at?: string | Date | null
  total?: number | null
  currency_code?: string | null
}

/**
 * The server side of "Place order":
 * 1. make sure the cart has a payment session for the chosen method, since
 *    Medusa drops it after any cart change (a refusal here, such as cash on
 *    delivery over the limit, is explained like a refused order);
 * 2. if the cart's total is not `expectedTotal` (the one the page showed),
 *    stop: "total_changed", nothing placed;
 * 3. complete the cart. On one of the answers that mean "try again"
 *    (completionRetry: 409, the dropped session, the missing session),
 *    steps 1 and 2 again and complete again, at most COMPLETION_RETRIES
 *    times. When the tries run out: after a 409 the result is unknown
 *    ("Check my order", as before); after the other two nothing was
 *    placed, a refusal.
 * Completing a cart that is already an order returns that order, so a
 * second press, or a second try, never makes a second order; and a cart
 * that is an order already is never stopped for its total.
 */
export const placeOrderFlow = async ({
  ensureSession,
  complete,
  expectedTotal,
}: {
  ensureSession: () => Promise<BackendCall<unknown>>
  complete: () => Promise<BackendCall<CompleteBody>>
  /** The total the customer saw; without it the total is not checked. */
  expectedTotal?: number | null
}): Promise<PlaceOrderOutcome> => {
  /** Steps 1 and 2: null when the cart is ready to complete, else the outcome. */
  const ready = async (): Promise<PlaceOrderOutcome | null> => {
    const session = await ensureSession()
    if (!session.ok) {
      const kind = failureKind(session.status)
      if (kind === "conflict" || kind === "no_answer") return { kind: "unknown" }
      return { kind } as PlaceOrderOutcome
    }
    const cart = (session.body ?? {}) as SessionCart
    if (!cart.completed_at && totalChanged(expectedTotal, cart.total)) {
      return { kind: "total_changed", total: cart.total as number, currencyCode: cart.currency_code ?? "" }
    }
    return null
  }

  const first = await ready()
  if (first) return first

  for (let retry = 0; ; retry++) {
    const answer = await complete()
    const again = completionRetry(answer)
    if (again) {
      if (retry >= COMPLETION_RETRIES) {
        return again === "conflict" ? { kind: "unknown" } : { kind: "refused" }
      }
      const stop = await ready()
      if (stop) return stop
      continue
    }
    const result = readCompletion(answer as BackendCall<CompleteBody>)
    if (result.kind === "no_answer" || result.kind === "conflict") return { kind: "unknown" }
    return result
  }
}

/** The cart as it is now ("Check my order", lib/util/order-status.ts). */
export type CartStatus =
  | { kind: "completed" }
  | { kind: "open" }
  | { kind: "cart_lost" }
  | { kind: "no_answer" }

/** The cart, read again: completed (an order exists), open, gone or unknown. */
export const readCartStatus = (
  call: BackendCall<{ completed_at?: string | Date | null } | null>
): CartStatus => {
  if (!call.ok) {
    return call.status === 404 ? { kind: "cart_lost" } : { kind: "no_answer" }
  }
  return call.body?.completed_at ? { kind: "completed" } : { kind: "open" }
}

/** The alert above "Place order" after a refusal (05, 6.8 a), from the rules read again. */
export type RefusalView =
  | { kind: "minimum"; required: number; counted: number; missing: number }
  | { kind: "cod_over_limit"; limit: string; total: string }
  | { kind: "cod_region" }
  | { kind: "generic" }

/**
 * Checked in the specification's order: the minimum, then cash on delivery
 * (when it was the chosen method) over the limit, then refused for the
 * region; otherwise the general "We couldn't place your order". With no
 * rules (they failed to load again), the general one.
 */
export const explainRefusal = ({
  rules,
  chosenId,
  total,
  currencyCode,
}: {
  rules: CheckoutRules | null
  chosenId: string | null
  /** The cart's total, in whole units. */
  total: number
  currencyCode: string
}): RefusalView => {
  if (!rules) {
    return { kind: "generic" }
  }
  const minimum = minimumView(rules)
  if (minimum && !minimum.reached) {
    return {
      kind: "minimum",
      required: minimum.required,
      counted: minimum.counted,
      missing: minimum.missing,
    }
  }
  const cod = rules.cash_on_delivery
  if (chosenId === COD_PROVIDER_ID && cod && !cod.available) {
    if (cod.reason === "over_limit") {
      return {
        kind: "cod_over_limit",
        limit: convertToLocale({ amount: cod.limit, currency_code: cod.limit_currency_code }),
        total: convertToLocale({ amount: total, currency_code: currencyCode }),
      }
    }
    if (cod.reason === "region") {
      return { kind: "cod_region" }
    }
  }
  return { kind: "generic" }
}

/** The client gives up waiting for "Place order" after this long (05, 6.8 c). */
export const PLACE_ORDER_TIMEOUT_MS = 30_000

/**
 * The server action's own limit for its calls to the backend, under the
 * client's 30 s: a hung backend ends the action as "unknown", so the
 * browser's queue of server actions moves on (QA S1-4, D5).
 */
export const PLACE_ORDER_SERVER_MS = 25_000
