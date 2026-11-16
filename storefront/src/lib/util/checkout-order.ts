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

/** A call to the backend, as the data layer reports it: the body, or the HTTP status (none: no answer). */
export type BackendCall<T> = { ok: true; body: T } | { ok: false; status?: number }

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
  /** Unknown: the connection was lost, or completing failed twice with 409 ("Check my order"). */
  | { kind: "unknown" }

/**
 * The server side of "Place order":
 * 1. make sure the cart has a payment session for the chosen method, since
 *    Medusa drops it after any cart change (a refusal here, such as cash on
 *    delivery over the limit, is explained like a refused order);
 * 2. complete the cart; on HTTP 409 complete once more, and if that fails
 *    too, the result is unknown.
 * Completing a cart that is already an order returns that order, so a
 * second press, or a second try, never makes a second order.
 */
export const placeOrderFlow = async ({
  ensureSession,
  complete,
}: {
  ensureSession: () => Promise<BackendCall<unknown>>
  complete: () => Promise<BackendCall<CompleteBody>>
}): Promise<PlaceOrderOutcome> => {
  const session = await ensureSession()
  if (!session.ok) {
    const kind = failureKind(session.status)
    if (kind === "conflict" || kind === "no_answer") return { kind: "unknown" }
    return { kind } as PlaceOrderOutcome
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    const result = readCompletion(await complete())
    if (result.kind === "conflict") continue
    if (result.kind === "no_answer") return { kind: "unknown" }
    return result
  }
  return { kind: "unknown" }
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
