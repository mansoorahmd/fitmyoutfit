/**
 * Shapes of the seed data files in this folder.
 *
 * Every data file is wrapped in `PlaceholderData`: the content is a stand-in until the real
 * input arrives (real size charts, duty-paid price quotes, tax figures), and it must be
 * replaceable without touching seed logic. Amounts are in MAJOR units (3500 means Rs 3,500,
 * 22 means GBP 22), which is how Medusa v2 stores prices: no multiplying by 100.
 */

export type PlaceholderData<T> = {
  /** Always true. The validator rejects a data file that is not marked as placeholder. */
  placeholder: true
  /** Where the real data will come from, and what to replace. */
  note: string
  data: T
}

export type CurrencyCode = string

export type RegionSeed = {
  name: string
  currency_code: CurrencyCode
  /** ISO 3166-1 alpha-2, lower case. A country can belong to only one region. */
  country_codes: string[]
  /** Free-form region metadata. `tax_final: false` drives the "tax not final" label. */
  metadata: Record<string, unknown>
}

export type StoreSeed = {
  /** Currencies the store supports. Must cover every region's currency. */
  supported_currencies: CurrencyCode[]
  default_currency_code: CurrencyCode
  default_sales_channel_name: string
  /** Title for a new publishable key. Used only if the store has no publishable key yet. */
  publishable_key_title: string
}

export type CollectionSeed = {
  title: string
  handle: string
}

export type ProductKind = "garment" | "fit_kit" | "rush_add_on"

export type ProductSeed = {
  handle: string
  title: string
  description: string
  /** Stored as `metadata.kind` so later code can find extras without relying on handles. */
  kind: ProductKind
  /** Handle of a collection in the collections file, or null for no collection. */
  collection_handle: string | null
  /** True: one variant per size. False: a single default variant. */
  has_sizes: boolean
  /** Prefix for variant SKUs, for example JERSEY gives JERSEY-YS. */
  sku_prefix: string
  /**
   * True: the product has a fixed price per unit in every supported currency (prices.ts).
   * False: it has no fixed prices at all and must have no row in prices.ts. The rush add-on is
   * like this: its charge is a percentage of the order (settings.ts), worked out in Sprint 1.
   */
  has_fixed_prices: boolean
  /**
   * File name of the product's placeholder image in seed-data/images/ (PNG, WebP or JPEG).
   * The seed uploads it through Medusa's file module and sets it as the product's thumbnail,
   * but only for a product that has no picture yet. To use another picture, replace the file
   * or name another file here. No code change needed.
   */
  image: string
}

/**
 * Per product handle, the price per unit in each currency (same price for every size).
 * Only for products with `has_fixed_prices: true`.
 */
export type PriceTableSeed = Record<string, Record<CurrencyCode, number>>

/**
 * Store-wide settings. The seed writes each one into the Store's `metadata` when it is missing,
 * and never overwrites a value there, so an admin can change it in Settings > Store > Metadata.
 */
export type StoreSettingsSeed = {
  /** Rush production charge, in percent (0 to 100). How it is applied is Sprint 1 work. */
  rush_percentage: number
}

export type SeedData = {
  regions: PlaceholderData<RegionSeed[]>
  store: PlaceholderData<StoreSeed>
  sizes: PlaceholderData<string[]>
  collections: PlaceholderData<CollectionSeed[]>
  products: PlaceholderData<ProductSeed[]>
  prices: PlaceholderData<PriceTableSeed>
  settings: PlaceholderData<StoreSettingsSeed>
}
