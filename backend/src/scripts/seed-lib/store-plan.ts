/**
 * What the seed changes on the Store record: its supported currencies and its name.
 * Plain TypeScript, no Medusa imports.
 */

export type StoreCurrency = { currency_code: string; is_default?: boolean | null }

/**
 * The store's currencies must be exactly the seed list, with the seed default marked default.
 * Medusa creates its store with `eur`, which the launch markets do not use, so it is removed.
 *
 * Medusa's update-stores workflow writes the currencies first and then a price preference per
 * currency. `withPricePreference` lists the currencies that have one; a run that stopped between
 * the two leaves some without, and then the list is written again (which adds them).
 *
 * Returns the list to write, or null when the store already has exactly that.
 */
export function planStoreCurrencies(
  existing: readonly StoreCurrency[] | null | undefined,
  wanted: readonly string[],
  defaultCode: string,
  withPricePreference?: readonly (string | null | undefined)[]
): { currency_code: string; is_default: boolean }[] | null {
  const target = wanted.map((currency_code) => ({
    currency_code,
    is_default: currency_code === defaultCode,
  }))
  const current = existing ?? []
  const upToDate =
    current.length === target.length &&
    target.every((t) =>
      current.some((c) => c.currency_code === t.currency_code && !!c.is_default === t.is_default)
    )
  const preferencesComplete =
    withPricePreference === undefined || wanted.every((code) => withPricePreference.includes(code))
  return upToDate && preferencesComplete ? null : target
}

/** The name Medusa gives the store it creates. Only a store still called this gets renamed. */
export const MEDUSA_DEFAULT_STORE_NAME = "Medusa Store"

/**
 * The name to write, or null to leave the name alone. The seed renames only a store that still
 * has Medusa's default name (or none), so a name an admin chose is never overwritten.
 */
export function planStoreName(current: string | null | undefined, seedName: string): string | null {
  const name = (current ?? "").trim()
  if (name === seedName) {
    return null
  }
  return name === "" || name === MEDUSA_DEFAULT_STORE_NAME ? seedName : null
}
