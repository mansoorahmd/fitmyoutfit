/**
 * What an order keeps in its metadata, and which metadata keys a customer may not write. Plain
 * TypeScript, no Medusa imports.
 *
 * The promised delivery date (`metadata.delivery_promise`) is the server's answer for the order:
 * worked out from the order's own creation time, never taken from the cart a customer can write.
 * It is written on the order after it is created (workflows/delivery-promise/), so creating an
 * order is never refused for a metadata reason, whoever completes the cart (the store route, a
 * payment provider's webhook, a draft order).
 *
 * Medusa copies a cart's metadata into the order it becomes. So the key the server writes on an
 * order (the promise) is refused when a customer sends it on a cart (api/middlewares.ts), and so
 * is every `cod_` key, kept reserved for staff although cash collection is no longer kept in
 * metadata (it has a table of its own, modules/cash-collection).
 */
import {
  addCalendarDays,
  calendarDateIn,
  deliveryPromise,
  DELIVERY_SPEEDS,
  DELIVERY_TIME_ZONE,
  promisedDelivery,
  type DeliverySpeed,
  type PromisedDelivery,
} from "./delivery-promise"
import type { DeliveryDays } from "../settings/delivery-days"
import type { SettingResult } from "../settings/read-number-setting"

/** Key of the promised delivery in the order's metadata. */
export const DELIVERY_PROMISE_KEY = "delivery_promise"

/**
 * Every key that starts with this is reserved for staff (cash on delivery). Nothing is written
 * under it today: the cash-collection record has a table of its own. The keys stay refused on a
 * cart (docs/contracts/m1-checkout.md, section 8.1), so they mean nothing a customer wrote.
 */
export const STAFF_ONLY_KEY_PREFIX = "cod_"

/** Whether only staff may write this metadata key. */
export function isStaffOnlyKey(key: string): boolean {
  return key.startsWith(STAFF_ONLY_KEY_PREFIX)
}

/**
 * A copy of `metadata` without the staff-only keys (what a customer may be shown). Anything that
 * is not a plain object is returned as it is.
 */
export function withoutStaffOnlyKeys<T>(metadata: T): T {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
    return metadata
  }
  const entries = Object.entries(metadata as Record<string, unknown>)
  if (!entries.some(([key]) => isStaffOnlyKey(key))) {
    return metadata
  }
  return Object.fromEntries(entries.filter(([key]) => !isStaffOnlyKey(key))) as T
}

/**
 * A store answer about orders (`{ order }` or `{ orders: [...] }`) with the staff-only keys left
 * out of each order's metadata. Other answers are returned as they are.
 */
export function hideStaffOnlyKeysInOrders<T>(body: T): T {
  if (typeof body !== "object" || body === null) {
    return body
  }
  const answer = body as { order?: unknown; orders?: unknown }
  const clean = (order: unknown) =>
    typeof order === "object" && order !== null && "metadata" in order
      ? { ...order, metadata: withoutStaffOnlyKeys((order as { metadata?: unknown }).metadata) }
      : order
  return {
    ...answer,
    ...("order" in answer ? { order: clean(answer.order) } : {}),
    ...(Array.isArray(answer.orders) ? { orders: answer.orders.map(clean) } : {}),
  } as T
}

/** Whether a customer may not write this metadata key on a cart. */
export function isReservedKey(key: string): boolean {
  return key === DELIVERY_PROMISE_KEY || isStaffOnlyKey(key)
}

/**
 * The reserved keys in metadata a customer sent, whatever their values (null included). Empty
 * when `metadata` is not an object: Medusa's own validation answers that.
 */
export function reservedKeysIn(metadata: unknown): string[] {
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
    return []
  }
  return Object.keys(metadata).filter(isReservedKey).sort()
}

/** The message a customer gets for reserved keys in a cart's metadata. */
export function reservedKeysMessage(keys: readonly string[]): string {
  return `A cart's metadata may not contain ${keys.join(", ")}: the store writes these on the order.`
}

function isSet(value: unknown): boolean {
  return value !== undefined && value !== null && value !== ""
}

const PROMISE_KEYS = ["applies", "based_on", "date", "days"]

/**
 * The promised delivery kept in metadata when it is a valid kept promise, else null. Valid means:
 * an object with exactly the keys date, days, based_on and applies; days a whole number of 1 or
 * more; based_on and date calendar dates (YYYY-MM-DD) with date = based_on + days; applies
 * "standard" or "rush".
 */
export function readPromisedDelivery(value: unknown): PromisedDelivery | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null
  }
  const kept = value as Record<string, unknown>
  if (Object.keys(kept).sort().join(",") !== PROMISE_KEYS.join(",")) {
    return null
  }
  const { date, days, based_on, applies } = kept
  if (
    typeof date !== "string" ||
    typeof based_on !== "string" ||
    typeof days !== "number" ||
    !Number.isInteger(days) ||
    days < 1 ||
    !DELIVERY_SPEEDS.includes(applies as DeliverySpeed)
  ) {
    return null
  }
  try {
    if (addCalendarDays(based_on, days) !== date || addCalendarDays(date, 0) !== date) {
      return null
    }
  } catch {
    return null
  }
  return { date, days, based_on, applies: applies as DeliverySpeed }
}

/** The promise the server gives an order: its creation date in Asia/Karachi plus the days. */
export function orderDeliveryPromise(
  createdAt: Date,
  days: DeliveryDays,
  applies: DeliverySpeed
): PromisedDelivery {
  return promisedDelivery(
    deliveryPromise(calendarDateIn(createdAt, DELIVERY_TIME_ZONE), days, applies)
  )
}

function samePromise(a: PromisedDelivery, b: PromisedDelivery): boolean {
  return a.date === b.date && a.days === b.days && a.based_on === b.based_on && a.applies === b.applies
}

/**
 * How far a kept promise is trusted:
 * - `server_answer_only` when the order is placed (the order-placed subscriber): what the order
 *   carries then came from its cart or its draft, so only a promise exactly equal to the server's
 *   answer now is kept;
 * - `order_own` on every read (GET /store/orders/:id/delivery-promise), also before that
 *   subscriber has run: a kept promise is trusted only if it is the order's own (isOrderOwnPromise
 *   below), and is then never rewritten, also when the days setting changes later. Anything else
 *   is treated as at placement.
 */
export type PromiseTrust = "server_answer_only" | "order_own"

export type OrderPromiseInput = {
  /** The order's `metadata.delivery_promise`, as stored. */
  kept: unknown
  /**
   * The `delivery_promise` in the metadata of the cart the order was made from, as stored
   * (undefined when the order has no cart, or the cart none). Medusa copies a cart's metadata into
   * its order, and before the reserved-key refusal (S1-1c) a customer could write it.
   */
  cartKept?: unknown
  /** The order's creation time. */
  createdAt: Date
  /** The delivery days settings as they are now. */
  days: SettingResult<DeliveryDays>
  /** Which date applies to the order. */
  applies: DeliverySpeed
  trust: PromiseTrust
}

export type OrderPromiseOutcome =
  /** The kept promise stays. */
  | { action: "keep"; promise: PromisedDelivery }
  /** Write this promise. */
  | { action: "write"; promise: PromisedDelivery }
  /**
   * The settings are invalid, so no promise can be worked out: `error` names the key. With
   * `clear`, the order carries a promise the server cannot vouch for (copied from the cart, or
   * not a valid promise of this order): it is emptied (set to null) so it is never shown, also
   * not in a customer's order list, and worked out on the first read once the settings are fixed.
   */
  | { action: "fail"; error: string; clear: boolean }

/**
 * Whether a kept promise is the order's own: a valid promise (readPromisedDelivery) for the date
 * that applies to the order (`applies`), based on the order's own creation date in Asia/Karachi,
 * with `date` = `based_on` + `days`, and not a copy of the promise its cart carried. The days may
 * differ from today's setting: an order keeps the days of the setting when it was placed.
 *
 * Why the cart is compared: a forged promise can be based on the right date and still be false
 * (QA's eighth review: `{ based_on: <creation date>, days: 1 }` on a cart written before the
 * reserved-key refusal). A promise identical to the cart's came from the cart, and is kept only if
 * it is exactly the server's answer (decideOrderPromise). The server writes its answer on the
 * order once, so the order's own promise differs from a forged one on the cart.
 */
export function isOrderOwnPromise(
  kept: PromisedDelivery,
  input: Pick<OrderPromiseInput, "cartKept" | "createdAt" | "applies">
): boolean {
  if (kept.applies !== input.applies) {
    return false
  }
  if (kept.based_on !== calendarDateIn(input.createdAt, DELIVERY_TIME_ZONE)) {
    return false
  }
  const fromCart = readPromisedDelivery(input.cartKept)
  return !(fromCart && samePromise(fromCart, kept))
}

/** What to do with an order's promise. Never invents a date: invalid settings are an error. */
export function decideOrderPromise(input: OrderPromiseInput): OrderPromiseOutcome {
  const kept = readPromisedDelivery(input.kept)
  if (kept && input.trust === "order_own" && isOrderOwnPromise(kept, input)) {
    return { action: "keep", promise: kept }
  }
  if (!input.days.ok) {
    return { action: "fail", error: input.days.error, clear: isSet(input.kept) }
  }
  const server = orderDeliveryPromise(input.createdAt, input.days.value, input.applies)
  if (kept && samePromise(kept, server)) {
    return { action: "keep", promise: kept }
  }
  return { action: "write", promise: server }
}
