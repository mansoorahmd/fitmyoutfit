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
 * Medusa copies a cart's metadata into the order it becomes. So the keys only the server or staff
 * write on an order (the promise, and cash on delivery collected) are refused when a customer
 * sends them on a cart (api/middlewares.ts), and the completion hook refuses a cart that carries
 * a staff-only key all the same.
 */
import { COD_COLLECTED_AT_KEY, COD_SLIP_REFERENCE_KEY } from "./cash-collection"
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

type Metadata = Readonly<Record<string, unknown>> | null | undefined

/** Key of the promised delivery in the order's metadata. */
export const DELIVERY_PROMISE_KEY = "delivery_promise"

/** Every key that starts with this belongs to staff (cash on delivery collected). */
export const STAFF_ONLY_KEY_PREFIX = "cod_"

/** The staff-only keys written today. Every other `cod_` key is reserved for staff as well. */
export const STAFF_ONLY_ORDER_KEYS: readonly string[] = [COD_SLIP_REFERENCE_KEY, COD_COLLECTED_AT_KEY]

/** Whether only staff may write this metadata key. */
export function isStaffOnlyKey(key: string): boolean {
  return key.startsWith(STAFF_ONLY_KEY_PREFIX)
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

export type CartMetadataCheck = { ok: true } | { ok: false; error: string }

/**
 * The completion hook's second barrier: a cart carrying a staff-only key with a value is refused.
 * (The door, api/middlewares.ts, already refuses them; an emptied key, which carts completed
 * before this rule may carry, is harmless.) The promise is not checked: the order's own is written
 * after the order is created, whatever the cart carried.
 */
export function checkCartMetadataForCompletion(cartMetadata: Metadata): CartMetadataCheck {
  const staffKeys = Object.keys(cartMetadata ?? {})
    .filter((key) => isStaffOnlyKey(key) && isSet(cartMetadata?.[key]))
    .sort()
  if (staffKeys.length > 0) {
    return { ok: false, error: `The cart must not carry ${staffKeys.join(", ")}.` }
  }
  return { ok: true }
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
 * - `server_answer_only` when the order is placed: what the order carries came from the cart, so
 *   only a promise exactly equal to the server's answer is kept;
 * - `any_valid` afterwards: a valid kept promise is the one the order was given, and is never
 *   rewritten, also when the days setting changes later.
 */
export type PromiseTrust = "server_answer_only" | "any_valid"

export type OrderPromiseInput = {
  /** The order's `metadata.delivery_promise`, as stored. */
  kept: unknown
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
   * `clear` (only when the order is placed), the order carries a promise copied from the cart,
   * which the server cannot vouch for: it is emptied (set to null) so it is never shown, and
   * worked out on the first read once the settings are fixed.
   */
  | { action: "fail"; error: string; clear: boolean }

/** What to do with an order's promise. Never invents a date: invalid settings are an error. */
export function decideOrderPromise(input: OrderPromiseInput): OrderPromiseOutcome {
  const kept = readPromisedDelivery(input.kept)
  if (kept && input.trust === "any_valid") {
    return { action: "keep", promise: kept }
  }
  if (!input.days.ok) {
    return {
      action: "fail",
      error: input.days.error,
      clear: input.trust === "server_answer_only" && isSet(input.kept),
    }
  }
  const server = orderDeliveryPromise(input.createdAt, input.days.value, input.applies)
  if (kept && samePromise(kept, server)) {
    return { action: "keep", promise: kept }
  }
  return { action: "write", promise: server }
}
