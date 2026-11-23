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
  /**
   * Region metadata. `tax_final: false` drives the "tax not final" label; `min_garment_quantity`
   * is the fewest garment pieces in one order. The seed writes only keys that are missing.
   */
  metadata: Record<string, unknown>
  /**
   * Payment provider ids for the region (`pp_<identifier>_<id>`). The seed links the ones a
   * region lacks and keeps others an admin linked.
   */
  payment_providers: string[]
}

export type StoreSeed = {
  /**
   * The store's name in the admin. Written only while the store still has Medusa's default
   * name ("Medusa Store"), so a name changed in the admin is kept.
   */
  name: string
  /**
   * Currencies the store must support. The seed adds any that are missing and keeps
   * currencies an admin added; it removes only Medusa's starter `eur`, and only while no region
   * uses it. Must cover every seed region's currency.
   */
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
   * False: the server prices its cart line, and it must have no row in prices.ts. The rush add-on
   * is like this: its charge is a percentage of the garments (settings.ts,
   * lib/rules/rush-charge.ts). Its variant still gets a placeholder price of 0 in every supported
   * currency, because Medusa puts a variant in a cart, and reprices a cart moved to another
   * region, only when the variant has a price in the cart's currency; the server then sets the
   * line's real price in the same step. The 0 is never charged.
   */
  has_fixed_prices: boolean
  /**
   * The product's pictures. A product with `files` gets our own pictures (the seed uploads them
   * through Medusa's File Module); one without gets its stand-in `urls` (web links). The seed sets
   * the first as the thumbnail and all as the product's images, and only on a product that has no
   * picture yet or still shows exactly the stand-in `urls`, so a photo set in the admin is never
   * replaced (product-images.ts).
   */
  images: ProductImagesSeed
}

export type ProductImagesSeed = {
  /**
   * True while these are stand-ins (not photos of our garments). The validator requires it;
   * the real photos are uploaded in the admin or listed here before any public launch.
   */
  placeholder: true
  /**
   * The stand-in photos as web URLs (`https://` only), at least one; the first becomes the
   * thumbnail. For a product that also has `files` they are the old stand-ins: the seed replaces
   * them with the files, and only when a product still shows exactly these.
   */
  urls: string[]
  /**
   * Our own pictures, by file name under `packages/editor/samples/pictures/products/` (data, not
   * a URL), in display order; the first becomes the thumbnail. Optional: a product without them
   * keeps its stand-in `urls`.
   */
  files?: string[]
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
  /** Largest cart total, in PKR (major units), that can be paid by cash on delivery. */
  cod_max_total: number
  /** Calendar days from proof approval to delivery. */
  delivery_days_standard: number
  /** The same, with paid rush. */
  delivery_days_rush: number
  /** Team lists: most lines in a list, most of one shirt on a line, longest name (characters). */
  roster_max_lines: number
  roster_max_count: number
  roster_max_name_length: number
  /** IANA time zone of the store's day, for the need-by date of a team order. */
  schedule_time_zone: string
  /** A team order's deposit, in percent of its total (above 0, at most 100); the balance is the rest. */
  team_order_deposit_percentage: number
  /** The storefront path of a team order's payment page, with [countryCode] and [id]; the payment emails link to it. */
  team_order_payment_path: string
  /** Days after the order within which a fit kit may be refunded; 0 for no limit. */
  fit_kit_return_days: number
}

/**
 * A garment-measurement chart (the garment laid flat), stored as `metadata.size_chart` on the
 * product. Shape from docs/contracts/m1-checkout.md, section 2.
 */
export type SizeChartSeed = {
  /** True while the measurements are placeholders; the storefront then shows a note. */
  draft: boolean
  unit: "cm"
  columns: { key: string; label: string }[]
  /** One row per size, in the size order of sizes.ts; `values` has a number per column key. */
  rows: { size: string; values: Record<string, number> }[]
}

export type ShippingOptionSeed = {
  /** Country code of the region the option is for (regions are matched by country code). */
  region_country_code: string
  /** Name of the service zone created for the region (its geo zones are the region's countries). */
  service_zone_name: string
  /** Shown to the customer at checkout. */
  name: string
  /** Flat amount in MAJOR units of the region's currency. */
  amount: number
  /** True for the single duty-paid line of an export market; stored as `data.ddp`. */
  ddp: boolean
  /** Medusa's shipping option type (code, label, description). */
  type: { code: string; label: string; description: string }
}

export type ShippingSeed = {
  /** The one place orders ship from. Matched by name. */
  stock_location: {
    name: string
    address: { address_1: string; city: string; country_code: string }
  }
  /** Name of the fulfillment set (type shipping) that holds one service zone per region. */
  fulfillment_set_name: string
  options: ShippingOptionSeed[]
}

export type SeedData = {
  regions: PlaceholderData<RegionSeed[]>
  store: PlaceholderData<StoreSeed>
  sizes: PlaceholderData<string[]>
  collections: PlaceholderData<CollectionSeed[]>
  products: PlaceholderData<ProductSeed[]>
  prices: PlaceholderData<PriceTableSeed>
  settings: PlaceholderData<StoreSettingsSeed>
  /** Per product handle: the product's `metadata.size_chart`. */
  sizeCharts: PlaceholderData<Record<string, SizeChartSeed>>
  shipping: PlaceholderData<ShippingSeed>
}
