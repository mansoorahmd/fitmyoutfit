/**
 * The need-by date of a team order, worked backwards: the latest day the proof can be signed so
 * that delivery (15 days after approval, or 10 with paid rush: the delivery-days settings) is on
 * or before the date the team needs the kit. Plain TypeScript, no Medusa imports; the clock is an
 * argument, never read here.
 *
 * Days are CALENDAR days, the same counting as the delivery promise of an ordinary order
 * (delivery-promise.ts, `addCalendarDays`): delivery date = approval date + N days, weekends and
 * holidays included. The day itself counts as day 0: a proof signed today for 15 days is delivered
 * on today + 15.
 *
 * States:
 * - `none`          no need-by date;
 * - `ok`            today is on or before the latest signing day for standard delivery;
 * - `needs_rush`    standard delivery would be late, rush would not: sign today with rush;
 * - `cannot_be_met` even rush would be late.
 * Nothing here refuses anything: the state is for the storefront to show (and to offer rush).
 */
import type { DeliveryDays } from "../settings/delivery-days"
import { addCalendarDays } from "./delivery-promise"

export const SCHEDULE_STATES = ["none", "ok", "needs_rush", "cannot_be_met"] as const
export type ScheduleState = (typeof SCHEDULE_STATES)[number]

export function isScheduleState(value: unknown): value is ScheduleState {
  return typeof value === "string" && (SCHEDULE_STATES as readonly string[]).includes(value)
}

export type Schedule = {
  state: ScheduleState
  /** The date the team needs the kit, YYYY-MM-DD, or null. */
  need_by_date: string | null
  /** The store's day the answer was worked out for, YYYY-MM-DD. */
  today: string
  /** The delivery days used (calendar days from approval). */
  days: { standard: number; rush: number }
  /** Latest day to sign for standard delivery / for rush delivery; null without a need-by date. */
  latest_sign_standard: string | null
  latest_sign_rush: string | null
  /** Days from today to those days: 0 is today, negative is already past; null without a date. */
  days_left_standard: number | null
  days_left_rush: number | null
  /** The delivery date if the proof were signed today, standard and rush. */
  delivery_if_signed_today: { standard: string; rush: string }
}

/** Whole calendar days from `from` to `to` (both YYYY-MM-DD); negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const parse = (date: string) => {
    const [y, m, d] = date.split("-").map(Number)
    return Date.UTC(y!, m! - 1, d!)
  }
  return Math.round((parse(to) - parse(from)) / 86_400_000)
}

/** True when `needBy` (YYYY-MM-DD) is before `today`. The date of today itself is not in the past. */
export function isInThePast(needBy: string, today: string): boolean {
  return needBy < today
}

export function scheduleFor(input: { needBy: string | null; today: string; days: DeliveryDays }): Schedule {
  const { needBy, today, days } = input
  const deliveryIfSignedToday = {
    standard: addCalendarDays(today, days.standard),
    rush: addCalendarDays(today, days.rush),
  }
  if (needBy === null) {
    return {
      state: "none",
      need_by_date: null,
      today,
      days: { ...days },
      latest_sign_standard: null,
      latest_sign_rush: null,
      days_left_standard: null,
      days_left_rush: null,
      delivery_if_signed_today: deliveryIfSignedToday,
    }
  }
  const latestStandard = addCalendarDays(needBy, -days.standard)
  const latestRush = addCalendarDays(needBy, -days.rush)
  const state: ScheduleState = today <= latestStandard ? "ok" : today <= latestRush ? "needs_rush" : "cannot_be_met"
  return {
    state,
    need_by_date: needBy,
    today,
    days: { ...days },
    latest_sign_standard: latestStandard,
    latest_sign_rush: latestRush,
    days_left_standard: daysBetween(today, latestStandard),
    days_left_rush: daysBetween(today, latestRush),
    delivery_if_signed_today: deliveryIfSignedToday,
  }
}
