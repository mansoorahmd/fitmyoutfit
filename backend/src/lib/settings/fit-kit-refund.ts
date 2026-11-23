/**
 * The fit kit refund's setting, read from the Store's `metadata`. Plain TypeScript, no Medusa
 * imports. The seed writes it when missing (seed-data/settings.ts).
 *
 * - `fit_kit_return_days`: how many days after the order a kit may come back and be refunded. A
 *   whole number, 0 for no limit (seed 0: how long a customer has is not settled, a question for
 *   the founders). A missing setting means no limit too, so an old database keeps working.
 */
import { RETURN_DAYS_KEY } from "../rules/fit-kit-refund"
import { readNumberSetting, type SettingResult } from "./read-number-setting"

export { RETURN_DAYS_KEY }

export function readReturnDays(settings: Readonly<Record<string, unknown>> | null | undefined): SettingResult<number> {
  const raw = settings?.[RETURN_DAYS_KEY]
  if (raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "")) {
    return { ok: true, value: 0 }
  }
  return readNumberSetting(settings, { key: RETURN_DAYS_KEY, where: "the store's metadata", min: 0, max: 3650, integer: true })
}
