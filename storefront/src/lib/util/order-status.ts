// "Did this cart become an order?" (docs/design/05-m1-pages.md, 6.8 c, and
// the contract, docs/contracts/m1-checkout.md, 8.1). Asked by "Check my
// order" after a lost connection, and wherever the storefront meets a cart
// that is already an order (QA S1-4, D1): the cart page, the checkout, the
// header's cart and adding to the cart. Rule 6.8 c: never an order the
// customer cannot see.
//
// The answer comes from a route handler (app/[countryCode]/(checkout)/
// checkout/order-status), not a server action: Next.js runs server actions
// one after another, so a check sent as an action would wait behind a
// "Place order" that is still hanging (QA D5). The browser asks with
// fetch and gives up after CHECK_ORDER_TIMEOUT_MS.

import { BackendCall, readCartStatus, readCompletion } from "./checkout-order"
import { within } from "./deadline"

/** What the check found. */
export type OrderStatus =
  /** The cart is an order: its confirmation's path. */
  | { kind: "order"; url: string }
  /** The cart is an order, but the order couldn't be read just now. */
  | { kind: "placed" }
  /** The cart is not an order: nothing was placed. */
  | { kind: "open" }
  /** The backend doesn't know the cart. */
  | { kind: "cart_lost" }
  /** No answer (backend down, a timeout): still unknown. */
  | { kind: "no_answer" }

/** The browser gives up waiting for the check after this long, and says so. */
export const CHECK_ORDER_TIMEOUT_MS = 15_000

/** The route's own limit for its calls to the backend, so it answers before the browser gives up. */
export const ORDER_STATUS_BACKEND_MS = 12_000

/** The order confirmation, under the order's country (the URL's when the order has none). */
export const confirmationPath = (
  orderId: string,
  orderCountry: string | null | undefined,
  urlCountry: string
): string => `/${(orderCountry || urlCountry).toLowerCase()}/order/${encodeURIComponent(orderId)}/confirmed`

/** The route that answers the check, under the page's country. */
export const orderStatusUrl = (countryCode: string): string =>
  `/${encodeURIComponent(countryCode)}/checkout/order-status`

/** A Medusa cart id, as the route accepts it (nothing else reaches the backend's URL). */
export const isCartId = (value: unknown): value is string =>
  typeof value === "string" && /^cart_[A-Za-z0-9]{1,64}$/.test(value)

/** Adding to a cart that is already an order (QA S1-4, D1): the caller opens the order instead. */
export class CompletedCartError extends Error {
  readonly cartId: string
  constructor(cartId: string) {
    super("The cart is already an order")
    this.name = "CompletedCartError"
    this.cartId = cartId
  }
}

/** What the server side found before it builds the answer. */
export type FoundOrder =
  | { kind: "order"; orderId: string; countryCode: string | null }
  | Exclude<OrderStatus, { kind: "order" }>

/**
 * Reads the cart; when it is an order, completes it again, which returns
 * that same order and never a new one (contract 8.1). A completed cart
 * whose order can't be read now (no answer, 409, 5xx) is "placed": the
 * order exists, the confirmation can be opened later.
 */
export const findOrderFlow = async ({
  readCart,
  complete,
}: {
  readCart: () => Promise<BackendCall<{ completed_at?: string | Date | null } | null>>
  complete: () => Promise<BackendCall<never>>
}): Promise<FoundOrder> => {
  const status = readCartStatus(await readCart())
  if (status.kind !== "completed") {
    return status
  }
  const completion = readCompletion(await complete())
  if (completion.kind === "order") {
    return { kind: "order", orderId: completion.orderId, countryCode: completion.countryCode }
  }
  return { kind: "placed" }
}

const KINDS = new Set(["order", "placed", "open", "cart_lost", "no_answer"])

/** The route's answer, checked; anything else is "no answer". The path must stay on this site. */
export const parseOrderStatus = (json: unknown): OrderStatus => {
  const value = json as { kind?: unknown; url?: unknown } | null
  if (!value || typeof value.kind !== "string" || !KINDS.has(value.kind)) {
    return { kind: "no_answer" }
  }
  if (value.kind === "order") {
    const url = value.url
    return typeof url === "string" && url.startsWith("/") && !url.startsWith("//")
      ? { kind: "order", url }
      : { kind: "no_answer" }
  }
  return { kind: value.kind } as OrderStatus
}

/**
 * Asks the route, from the browser. `cartId` is the checkout's cart (the
 * cookie may be gone once the order exists); without it the route uses the
 * cart cookie. Always settles within `timeoutMs`: a timeout, no
 * connection or an unexpected answer is "no_answer".
 */
export const requestOrderStatus = async ({
  countryCode,
  cartId,
  timeoutMs = CHECK_ORDER_TIMEOUT_MS,
  fetchImpl = (input, init) => fetch(input, init),
}: {
  countryCode: string
  cartId?: string | null
  timeoutMs?: number
  fetchImpl?: (input: string, init: RequestInit) => Promise<Response>
}): Promise<OrderStatus> => {
  try {
    return await within(timeoutMs, async (signal) => {
      const response = await fetchImpl(orderStatusUrl(countryCode), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cartId: cartId ?? null }),
        cache: "no-store",
        credentials: "same-origin",
        signal,
      })
      if (!response.ok) {
        return { kind: "no_answer" } as const
      }
      return parseOrderStatus(await response.json())
    })
  } catch {
    return { kind: "no_answer" }
  }
}
