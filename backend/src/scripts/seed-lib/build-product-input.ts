/**
 * Turns one product from the seed data into the plain object Medusa's create-products workflow
 * takes. Plain TypeScript, no Medusa imports: the sizes, prices and flags all come from the
 * data files, nothing is written inline here.
 */
import type { PriceTableSeed, ProductSeed } from "../seed-data/types"

export type VariantInput = {
  title: string
  sku: string
  options: Record<string, string>
  manage_inventory: false
  allow_backorder: false
  prices: { amount: number; currency_code: string }[]
}

export type ProductInput = {
  title: string
  handle: string
  description: string
  status: "published"
  metadata: { kind: string }
  collection_id?: string
  shipping_profile_id: string
  sales_channels: { id: string }[]
  options: { title: string; values: string[] }[]
  variants: VariantInput[]
}

export type BuildContext = {
  sizes: string[]
  prices: PriceTableSeed
  /** Currency codes to price in, in order. */
  currencies: string[]
  /** Id of the collection the product belongs to, if any (resolved by the caller). */
  collectionId?: string
  shippingProfileId: string
  salesChannelId: string
}

const DEFAULT_OPTION_TITLE = "Default option"
const DEFAULT_OPTION_VALUE = "Default option value"
const SIZE_OPTION_TITLE = "Size"

/** Title of the size option on the garments. */
export const SIZE_OPTION = SIZE_OPTION_TITLE

/**
 * Medusa returns option values and variants in no particular order, so the display order of the
 * sizes (YS first, 3XL last) is stored as option value ranks. Medusa ignores ranks passed when a
 * product is created, so the seed applies them with a separate option update.
 */
export function buildSizeRanks(sizes: string[]): Record<string, number> {
  return Object.fromEntries(sizes.map((size, index) => [size, index]))
}

export function buildProductInput(product: ProductSeed, ctx: BuildContext): ProductInput {
  const row = ctx.prices[product.handle]
  if (!row) {
    throw new Error(`No prices for product "${product.handle}"`)
  }
  const variantPrices = ctx.currencies.map((currency_code) => {
    const amount = row[currency_code]
    if (amount === undefined) {
      throw new Error(`No ${currency_code} price for product "${product.handle}"`)
    }
    return { amount, currency_code }
  })

  const common = {
    manage_inventory: false,
    allow_backorder: false,
    prices: variantPrices,
  } as const

  const options = product.has_sizes
    ? [{ title: SIZE_OPTION_TITLE, values: [...ctx.sizes] }]
    : [{ title: DEFAULT_OPTION_TITLE, values: [DEFAULT_OPTION_VALUE] }]

  const variants: VariantInput[] = product.has_sizes
    ? ctx.sizes.map((size) => ({
        ...common,
        title: size,
        sku: `${product.sku_prefix}-${size}`,
        options: { [SIZE_OPTION_TITLE]: size },
        prices: variantPrices.map((p) => ({ ...p })),
      }))
    : [
        {
          ...common,
          title: product.title,
          sku: product.sku_prefix,
          options: { [DEFAULT_OPTION_TITLE]: DEFAULT_OPTION_VALUE },
          prices: variantPrices.map((p) => ({ ...p })),
        },
      ]

  return {
    title: product.title,
    handle: product.handle,
    description: product.description,
    status: "published",
    metadata: { kind: product.kind },
    ...(ctx.collectionId ? { collection_id: ctx.collectionId } : {}),
    shipping_profile_id: ctx.shippingProfileId,
    sales_channels: [{ id: ctx.salesChannelId }],
    options,
    variants,
  }
}
