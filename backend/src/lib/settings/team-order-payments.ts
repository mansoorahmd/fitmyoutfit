/**
 * The settings of a team order's payments, read from the Store's `metadata`. Plain TypeScript, no
 * Medusa imports. The seed writes both when missing (seed-data/settings.ts).
 *
 * - `team_order_deposit_percentage`: the deposit's share of the total, in percent (seed 50, the
 *   founders' decision; 100 would mean "paid in full at approval"). A number above 0, at most 100.
 * - `team_order_payment_path`: the storefront's payment page of a team order, a path with `[id]`
 *   (and usually `[countryCode]`), joined to STOREFRONT_URL for the link in the payment emails
 *   (seed `/[countryCode]/account/team-orders/[id]/pay`).
 */
import { isPaymentPathPattern } from "../rules/team-order-payments"
import { readNumberSetting, type SettingResult } from "./read-number-setting"

export const DEPOSIT_PERCENTAGE_KEY = "team_order_deposit_percentage"
export const PAYMENT_PATH_KEY = "team_order_payment_path"

export function readDepositPercentage(settings: Readonly<Record<string, unknown>> | null | undefined): SettingResult<number> {
  const read = readNumberSetting(settings, { key: DEPOSIT_PERCENTAGE_KEY, where: "the store's metadata", min: 0, max: 100 })
  if (read.ok && read.value === 0) {
    return { ok: false, error: `${DEPOSIT_PERCENTAGE_KEY} in the store's metadata must be above 0 (a share of the total in percent), got 0.` }
  }
  return read
}

export function readPaymentPath(settings: Readonly<Record<string, unknown>> | null | undefined): SettingResult<string> {
  const raw = settings?.[PAYMENT_PATH_KEY]
  if (raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "")) {
    return {
      ok: false,
      error: `${PAYMENT_PATH_KEY} is not set. Add it to the store's metadata (a path with [id], such as /[countryCode]/account/team-orders/[id]/pay).`,
    }
  }
  if (!isPaymentPathPattern(typeof raw === "string" ? raw.trim() : raw)) {
    return {
      ok: false,
      error: `${PAYMENT_PATH_KEY} in the store's metadata must be a path that starts with / and holds [id], got ${JSON.stringify(raw)}.`,
    }
  }
  return { ok: true, value: (raw as string).trim() }
}
