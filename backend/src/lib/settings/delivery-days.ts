/**
 * The delivery promise settings: calendar days from proof approval to delivery, standard and
 * with paid rush. Read from the Store's `metadata`. Plain TypeScript, no Medusa imports.
 * The rule that uses them is in lib/rules/delivery-promise.ts.
 */
import { readNumberSetting, type SettingResult } from "./read-number-setting"

export const DELIVERY_DAYS_STANDARD_KEY = "delivery_days_standard"
export const DELIVERY_DAYS_RUSH_KEY = "delivery_days_rush"

export type DeliveryDays = { standard: number; rush: number }

function readDays(
  settings: Readonly<Record<string, unknown>> | null | undefined,
  key: string
): SettingResult<number> {
  return readNumberSetting(settings, {
    key,
    where: "the store's metadata",
    min: 1,
    integer: true,
  })
}

/**
 * Returns both values (whole numbers, 1 or more, with rush lower than standard: paid rush must
 * deliver sooner), or one readable error naming every problem and every key involved.
 */
export function readDeliveryDays(
  settings: Readonly<Record<string, unknown>> | null | undefined
): SettingResult<DeliveryDays> {
  const standard = readDays(settings, DELIVERY_DAYS_STANDARD_KEY)
  const rush = readDays(settings, DELIVERY_DAYS_RUSH_KEY)
  if (standard.ok && rush.ok) {
    if (!(rush.value < standard.value)) {
      return {
        ok: false,
        error:
          `${DELIVERY_DAYS_RUSH_KEY} in the store's metadata must be lower than ` +
          `${DELIVERY_DAYS_STANDARD_KEY}, got ${DELIVERY_DAYS_RUSH_KEY} ${rush.value} and ` +
          `${DELIVERY_DAYS_STANDARD_KEY} ${standard.value}.`,
      }
    }
    return { ok: true, value: { standard: standard.value, rush: rush.value } }
  }
  const errors = [standard, rush].flatMap((r) => (r.ok ? [] : [r.error]))
  return { ok: false, error: errors.join(" ") }
}
