/**
 * What an existing seeded product still needs after a seed run that may have stopped half-way.
 * Plain TypeScript, no Medusa imports: the seed reads the products from Medusa, passes them in
 * here, and applies only what this returns.
 *
 * Medusa's create-products workflow writes a product in several steps (the product with its
 * options; its sales channel and shipping profile links; its variants; their price sets; their
 * price links), and the seed then sets the size ranks. A run killed between two of those leaves a
 * product that exists but is incomplete, which a plain "the handle exists, so skip it" check never
 * notices. Each part is checked here on its own.
 *
 * What counts as "missing" is chosen so that an admin's edits are kept:
 * - variants: only a product with no variants at all gets the seed's variants;
 * - prices: only a variant with no price at all gets the seed's prices (a variant an admin
 *   priced, even in fewer currencies, is left alone); a variant with no price set gets one;
 * - size ranks: only when a size has no rank, or two sizes share one (an order an admin set,
 *   with distinct ranks, is kept);
 * - sales channel and shipping profile: only a product linked to none.
 */
import type { PriceTableSeed, ProductSeed } from "../seed-data/types"
import { buildProductInput, buildSizeRanks, SIZE_OPTION, type VariantInput } from "./build-product-input"

export type ExistingOptionValue = { value: string; rank?: number | null }
export type ExistingOption = {
  id: string
  title: string
  values?: readonly (ExistingOptionValue | null)[] | null
}
export type ExistingVariant = {
  id: string
  title?: string | null
  variant_rank?: number | null
  options?: readonly ({ value?: string | null } | null)[] | null
  price_set?: {
    id: string
    prices?: readonly ({ id: string } | null)[] | null
  } | null
}
export type ExistingSeededProduct = {
  id: string
  handle: string
  options?: readonly (ExistingOption | null)[] | null
  variants?: readonly (ExistingVariant | null)[] | null
  sales_channels?: readonly ({ id: string } | null)[] | null
  shipping_profile?: { id: string } | null
}

export type RepairContext = {
  sizes: string[]
  prices: PriceTableSeed
  currencies: string[]
  salesChannelId: string
  shippingProfileId: string
}

export type ProductRepair = {
  productId: string
  handle: string
  /** The seed's variants (with prices and ranks), for a product that has none. */
  createVariants: (VariantInput & { product_id: string })[]
  /** Ranks to write on the size option, or null when the sizes are already ordered. */
  sizeRanks: { optionId: string; ranks: Record<string, number> } | null
  /** Variant ranks to write (display order of the size variants). */
  variantRanks: { id: string; variant_rank: number }[]
  /**
   * Variants with no price set (any product), or with an empty one where the seed has prices:
   * the prices to give them (none for a product without fixed prices: then only the price set).
   */
  prices: {
    variantId: string
    /** The variant's price set, or null when it has none (then one is created and linked). */
    priceSetId: string | null
    prices: { amount: number; currency_code: string }[]
  }[]
  linkSalesChannel: boolean
  linkShippingProfile: boolean
}

function present<T>(items: readonly (T | null | undefined)[] | null | undefined): T[] {
  return (items ?? []).filter((item): item is T => item !== null && item !== undefined)
}

/** True when every name has a rank and no two names share one. */
function ranksComplete(names: string[], rankOf: (name: string) => number | null | undefined) {
  const ranks = names.map(rankOf)
  if (ranks.some((rank) => rank === null || rank === undefined)) {
    return false
  }
  return new Set(ranks).size === ranks.length
}

function sizeOfVariant(variant: ExistingVariant, sizes: string[]): string | undefined {
  const fromOptions = present(variant.options)
    .map((o) => o.value ?? undefined)
    .find((value) => value !== undefined && sizes.includes(value))
  if (fromOptions) {
    return fromOptions
  }
  return variant.title && sizes.includes(variant.title) ? variant.title : undefined
}

export function planProductRepair(
  product: ExistingSeededProduct,
  seed: ProductSeed,
  ctx: RepairContext
): ProductRepair {
  const repair: ProductRepair = {
    productId: product.id,
    handle: product.handle,
    createVariants: [],
    sizeRanks: null,
    variantRanks: [],
    prices: [],
    linkSalesChannel: present(product.sales_channels).length === 0,
    linkShippingProfile: !product.shipping_profile?.id,
  }

  const seedInput = buildProductInput(seed, {
    sizes: ctx.sizes,
    prices: ctx.prices,
    currencies: ctx.currencies,
    shippingProfileId: ctx.shippingProfileId,
    salesChannelId: ctx.salesChannelId,
  })

  const variants = present(product.variants)
  if (variants.length === 0) {
    repair.createVariants = seedInput.variants.map((v) => ({ ...v, product_id: product.id }))
  }

  if (seed.has_sizes) {
    const sizeOption = present(product.options).find((o) => o.title === SIZE_OPTION)
    if (sizeOption) {
      const values = present(sizeOption.values)
      const seedSizesPresent = ctx.sizes.filter((size) => values.some((v) => v.value === size))
      const rankOf = (size: string) => values.find((v) => v.value === size)?.rank
      if (!ranksComplete(seedSizesPresent, rankOf)) {
        const all = buildSizeRanks(ctx.sizes)
        // Only values the option has: Medusa rejects a rank for a value that does not exist.
        const ranks = Object.fromEntries(seedSizesPresent.map((size) => [size, all[size]]))
        repair.sizeRanks = { optionId: sizeOption.id, ranks }
      }
    }

    const sized = variants
      .map((variant) => ({ variant, size: sizeOfVariant(variant, ctx.sizes) }))
      .filter((entry): entry is { variant: ExistingVariant; size: string } => !!entry.size)
    const variantComplete = ranksComplete(
      sized.map((entry) => entry.variant.id),
      (id) => sized.find((entry) => entry.variant.id === id)?.variant.variant_rank
    )
    if (!variantComplete) {
      const ranks = buildSizeRanks(ctx.sizes)
      repair.variantRanks = sized.map(({ variant, size }) => ({
        id: variant.id,
        variant_rank: ranks[size],
      }))
    }
  }

  // Every variant needs a price set, even one with no fixed price (the rush add-on): Medusa's
  // update-variant workflow, which the admin uses to edit prices, only writes into an existing
  // price set, so prices entered for a variant without one would be dropped.
  const seedPrices = seed.has_fixed_prices ? (seedInput.variants[0]?.prices ?? []) : []
  for (const variant of variants) {
    const hasPriceSet = !!variant.price_set?.id
    const priceCount = present(variant.price_set?.prices).length
    if (!hasPriceSet || (priceCount === 0 && seedPrices.length > 0)) {
      repair.prices.push({
        variantId: variant.id,
        priceSetId: variant.price_set?.id ?? null,
        prices: seedPrices.map((p) => ({ ...p })),
      })
    }
  }

  return repair
}

/** Short descriptions of what a repair changes, for the seed's log. Empty when nothing. */
export function describeRepair(repair: ProductRepair): string[] {
  const parts: string[] = []
  if (repair.createVariants.length > 0) parts.push(`${repair.handle}: variants`)
  if (repair.sizeRanks) parts.push(`${repair.handle}: size ranks`)
  if (repair.variantRanks.length > 0) parts.push(`${repair.handle}: variant ranks`)
  if (repair.prices.some((p) => p.prices.length > 0)) parts.push(`${repair.handle}: prices`)
  else if (repair.prices.length > 0) parts.push(`${repair.handle}: price set`)
  if (repair.linkSalesChannel) parts.push(`${repair.handle}: sales channel`)
  if (repair.linkShippingProfile) parts.push(`${repair.handle}: shipping profile`)
  return parts
}

/**
 * Ids for new products, in seed order, that sort in that order. Medusa lists products by id
 * (ascending) when no order is asked for, and products created in one run share one
 * `created_at`, so the ids decide the store's default order. `generate` makes one Medusa id
 * (`prod_` plus a ULID); ids made in the same millisecond do not sort by creation, so the
 * generated ids are sorted before they are handed out.
 */
export function orderedIds(count: number, generate: () => string): string[] {
  const ids = Array.from({ length: count }, generate)
  if (new Set(ids).size !== ids.length) {
    throw new Error("Generated product ids are not unique")
  }
  return ids.sort()
}
