/**
 * What the seed changes on the Store record: its supported currencies and its name.
 * Plain TypeScript, no Medusa imports.
 */

export type StoreCurrency = { currency_code: string; is_default?: boolean | null }

/** The currency Medusa's starter store is created with. The launch markets do not use it. */
export const STARTER_CURRENCY = "eur"

export type StoreCurrencyContext = {
  /** The seed's currencies, in order. All of them must be supported. */
  wanted: readonly string[]
  /** The seed's default currency (pkr). It is the store's only default. */
  defaultCode: string
  /** Currency codes the store's regions use (any region, seeded or added by an admin). */
  regionCurrencies?: readonly (string | null | undefined)[]
  /**
   * Medusa's update-stores workflow writes the currencies first and then a price preference per
   * currency. These are the currencies that have one; a run that stopped between the two leaves
   * some seed currencies without, and then the list is written again (which adds them).
   */
  withPricePreference?: readonly (string | null | undefined)[]
}

const lower = (code: string | null | undefined) => (code ?? "").trim().toLowerCase()

/**
 * The store's currencies after the seed: every seed currency, with the seed default as the only
 * default, plus every other currency the store already has (an admin may have added one), except
 * the starter's `eur` when no region uses it. So a fresh database ends with exactly the seed
 * currencies, and a currency an admin added is never removed.
 *
 * Returns the list to write (Medusa replaces the whole list), or null when nothing changes.
 */
export function planStoreCurrencies(
  existing: readonly StoreCurrency[] | null | undefined,
  ctx: StoreCurrencyContext
): { currency_code: string; is_default: boolean }[] | null {
  const { wanted, defaultCode, withPricePreference } = ctx
  const wantedCodes = wanted.map(lower)
  const usedByRegion = new Set((ctx.regionCurrencies ?? []).map(lower))
  const current = existing ?? []
  const kept = current
    .map((c) => lower(c.currency_code))
    .filter((code) => code !== "" && !wantedCodes.includes(code))
    .filter((code) => code !== STARTER_CURRENCY || usedByRegion.has(code))
  const target = [
    ...wanted.map((currency_code) => ({
      currency_code,
      is_default: lower(currency_code) === lower(defaultCode),
    })),
    ...[...new Set(kept)].map((currency_code) => ({ currency_code, is_default: false })),
  ]
  const upToDate =
    current.length === target.length &&
    target.every((t) =>
      current.some(
        (c) => lower(c.currency_code) === lower(t.currency_code) && !!c.is_default === t.is_default
      )
    )
  const preferencesComplete =
    withPricePreference === undefined ||
    wantedCodes.every((code) => withPricePreference.map(lower).includes(code))
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
