/**
 * The time zone of the store's day, read from the Store's `metadata` (key `schedule_time_zone`,
 * an IANA name such as `Asia/Karachi`). "Today" for the need-by arithmetic of a team order is the
 * calendar day in this zone. Plain TypeScript, no Medusa imports.
 */
import type { SettingResult } from "./read-number-setting"

export const SCHEDULE_TIME_ZONE_KEY = "schedule_time_zone"

/** True when the runtime knows `timeZone` as an IANA zone name. */
export function isKnownTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone })
    return true
  } catch {
    return false
  }
}

/** The zone name, or one readable error naming the key and where to set it. */
export function readScheduleTimeZone(
  settings: Readonly<Record<string, unknown>> | null | undefined
): SettingResult<string> {
  const raw = settings?.[SCHEDULE_TIME_ZONE_KEY]
  if (raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "")) {
    return {
      ok: false,
      error: `${SCHEDULE_TIME_ZONE_KEY} is not set. Add it to the store's metadata (a time zone name such as Asia/Karachi).`,
    }
  }
  if (typeof raw !== "string" || !isKnownTimeZone(raw.trim())) {
    return {
      ok: false,
      error: `${SCHEDULE_TIME_ZONE_KEY} in the store's metadata must be a time zone name such as Asia/Karachi, got ${JSON.stringify(raw)}.`,
    }
  }
  return { ok: true, value: raw.trim() }
}
