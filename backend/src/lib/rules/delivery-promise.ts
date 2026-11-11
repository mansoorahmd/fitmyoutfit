/**
 * Delivery promise: base date + `delivery_days_standard` calendar days, or + `delivery_days_rush`
 * with paid rush. Plain TypeScript, no Medusa imports.
 *
 * The base date is an argument, so the rule never reads the clock. In M1 the caller passes today's
 * date in Asia/Karachi (standing in for the proof-approval date, which arrives with team orders
 * in M2). A real capacity calendar comes later.
 */
import type { DeliveryDays } from "../settings/delivery-days"

/** The company works from Lahore: "today" for the promise is today there. */
export const DELIVERY_TIME_ZONE = "Asia/Karachi"

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/

export type DeliveryOption = { days: number; date: string }

/** Which of the two dates is promised: standard, or rush when the order pays for rush. */
export type DeliverySpeed = "standard" | "rush"

export const DELIVERY_SPEEDS: readonly DeliverySpeed[] = ["standard", "rush"]

export type DeliveryPromise = {
  /** The base date, YYYY-MM-DD. */
  based_on: string
  standard: DeliveryOption
  rush: DeliveryOption
  /** Which of `standard` and `rush` applies to this cart. */
  applies: DeliverySpeed
}

/**
 * The one date promised to an order, kept in the order's `metadata.delivery_promise`
 * (docs/contracts/m1-checkout.md, section 8).
 */
export type PromisedDelivery = {
  /** The promised delivery date, YYYY-MM-DD. */
  date: string
  /** Calendar days from `based_on` to `date`. */
  days: number
  /** The base date, YYYY-MM-DD. */
  based_on: string
  applies: DeliverySpeed
}

/** The calendar date (YYYY-MM-DD) that `instant` falls on in `timeZone`. */
export function calendarDateIn(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant)
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? ""
  return `${part("year")}-${part("month")}-${part("day")}`
}

/** `date` (YYYY-MM-DD) plus `days` calendar days, as YYYY-MM-DD. Throws on a malformed date. */
export function addCalendarDays(date: string, days: number): string {
  const match = ISO_DATE_RE.exec(date)
  if (!match) {
    throw new Error(`Expected a date as YYYY-MM-DD, got ${JSON.stringify(date)}`)
  }
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const base = new Date(Date.UTC(year, month - 1, day))
  if (
    base.getUTCFullYear() !== year ||
    base.getUTCMonth() !== month - 1 ||
    base.getUTCDate() !== day
  ) {
    throw new Error(`Not a calendar date: ${date}`)
  }
  if (!Number.isInteger(days)) {
    throw new Error(`Days must be a whole number, got ${days}`)
  }
  base.setUTCDate(base.getUTCDate() + days)
  return base.toISOString().slice(0, 10)
}

/**
 * Both dates, and which one applies. `applies` is the caller's answer to "does this cart pay for
 * rush?"; until the rush charge exists (a later M1 task) the caller always passes "standard".
 */
export function deliveryPromise(
  baseDate: string,
  days: DeliveryDays,
  applies: DeliverySpeed
): DeliveryPromise {
  if (!DELIVERY_SPEEDS.includes(applies)) {
    throw new Error(`Expected "standard" or "rush", got ${JSON.stringify(applies)}`)
  }
  return {
    based_on: addCalendarDays(baseDate, 0),
    standard: { days: days.standard, date: addCalendarDays(baseDate, days.standard) },
    rush: { days: days.rush, date: addCalendarDays(baseDate, days.rush) },
    applies,
  }
}

/** The date that applies, in the shape kept on the order. */
export function promisedDelivery(promise: DeliveryPromise): PromisedDelivery {
  const option = promise[promise.applies]
  return {
    date: option.date,
    days: option.days,
    based_on: promise.based_on,
    applies: promise.applies,
  }
}
