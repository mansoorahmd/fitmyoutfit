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
 * - prices: a variant gets the seed's price for each seed currency it has no base price in (a
 *   price with no price list and no rules, which is what the seed and the admin's price editor
 *   write). A price that exists is never changed, so an amount an admin set stays. A variant
 *   with no price set gets one. The rush add-on has no fixed prices, so it gets none;
 * - option values: a seed variant (matched by SKU, then by title) with no value for one of its
 *   product's options gets the seed's value back (its size, for the garments). When that is not
 *   possible (the option lacks the value, another variant already has that combination, or the
 *   variant is not a seed variant) the variant is left alone and a warning names it;
 * - size ranks: only when a size has no rank, or two sizes share one (an order an admin set,
 *   with distinct ranks, is kept);
 * - sales channel and shipping profile: only a product linked to none.
 */
import type { PriceTableSeed, ProductSeed } from "../seed-data/types"
import { buildProductInput, buildSizeRanks, SIZE_OPTION, type VariantInput } from "./build-product-input"

export type ExistingOptionValue = { id?: string; value: string; rank?: number | null }
export type ExistingOption = {
  id: string
  title: string
  values?: readonly (ExistingOptionValue | null)[] | null
}
/** One of a variant's option values (Medusa's variant.options). */
export type ExistingVariantOptionValue = {
  value?: string | null
  /** The option this value belongs to. */
  option_id?: string | null
}
export type ExistingPrice = {
  id: string
  currency_code?: string | null
  /** Set on a price that belongs to a price list (a sale or override), not the base price. */
  price_list_id?: string | null
  /** Number of rules (such as a region) on the price; 0 or null for a base price. */
  rules_count?: number | null
}
export type ExistingVariant = {
  id: string
  sku?: string | null
  title?: string | null
  variant_rank?: number | null
  options?: readonly (ExistingVariantOptionValue | null)[] | null
  price_set?: {
    id: string
    prices?: readonly (ExistingPrice | null)[] | null
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

export type PriceRepair = {
  variantId: string
  /** The variant's SKU (or title, or id), for the log. */
  label: string
  /** The variant's price set, or null when it has none (then one is created and linked). */
  priceSetId: string | null
  /** The prices to add: only currencies the variant has no base price in. */
  prices: { amount: number; currency_code: string }[]
  /** True when the variant already had a base price in some seed currencies. */
  partial: boolean
}

export type OptionValueRepair = {
  variantId: string
  label: string
  /**
   * The variant's full option values, by option title, as Medusa's variant update takes them
   * (it needs a value for every option of the product): the existing ones plus the restored ones.
   */
  options: Record<string, string>
  /** Only the values that were missing, by option title, for the log. */
  restored: Record<string, string>
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
   * Variants with no price set (any product), or lacking a base price in a seed currency where
   * the seed has prices: the prices to give them (none for a product without fixed prices: then
   * only the price set).
   */
  prices: PriceRepair[]
  /** Seed variants that lost one of their option values (their size). */
  optionValues: OptionValueRepair[]
  linkSalesChannel: boolean
  linkShippingProfile: boolean
  /** Problems the seed cannot repair safely; logged as warnings, nothing is changed. */
  warnings: string[]
}

function present<T>(items: readonly (T | null | undefined)[] | null | undefined): T[] {
  return (items ?? []).filter((item): item is T => item !== null && item !== undefined)
}

const lower = (text: string | null | undefined) => (text ?? "").trim().toLowerCase()

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

function labelOf(variant: ExistingVariant): string {
  return variant.sku || variant.title || variant.id
}

/** A base price: not part of a price list and without rules (what the seed writes). */
function isBasePrice(price: ExistingPrice): boolean {
  return !price.price_list_id && !price.rules_count
}

/** The variant's value for an option, or undefined when it has none. */
function valueForOption(variant: ExistingVariant, option: ExistingOption): string | undefined {
  const values = present(variant.options)
  const byId = values.find((v) => !!v.option_id && v.option_id === option.id)
  if (byId?.value) {
    return byId.value
  }
  // Without option ids, a value counts when it is one of the option's values.
  const optionValues = present(option.values).map((v) => v.value)
  return values.find((v) => !v.option_id && !!v.value && optionValues.includes(v.value))?.value ?? undefined
}

/** The seed variant an existing variant stands for: same SKU, or else same title. */
function seedVariantFor(
  variant: ExistingVariant,
  seedVariants: readonly VariantInput[]
): VariantInput | undefined {
  return (
    (variant.sku ? seedVariants.find((s) => lower(s.sku) === lower(variant.sku)) : undefined) ??
    (variant.title ? seedVariants.find((s) => s.title === variant.title) : undefined)
  )
}

function planOptionValues(
  product: ExistingSeededProduct,
  variants: ExistingVariant[],
  seedVariants: readonly VariantInput[],
  repair: ProductRepair
): void {
  const options = present(product.options)
  if (options.length === 0) {
    return
  }
  const currentValues = (variant: ExistingVariant) =>
    Object.fromEntries(
      options
        .map((option) => [option.title, valueForOption(variant, option)] as const)
        .filter((entry): entry is readonly [string, string] => entry[1] !== undefined)
    )
  // Option combinations in use, including the ones this plan restores.
  const combinations = new Map(variants.map((v) => [v.id, currentValues(v)]))
  const sameCombination = (a: Record<string, string>, b: Record<string, string>) =>
    options.every((o) => a[o.title] !== undefined && a[o.title] === b[o.title])

  for (const variant of variants) {
    const current = currentValues(variant)
    const missing = options.filter((option) => current[option.title] === undefined)
    if (missing.length === 0) {
      continue
    }
    const label = labelOf(variant)
    const missingTitles = missing.map((o) => o.title).join(", ")
    const seedVariant = seedVariantFor(variant, seedVariants)
    if (!seedVariant) {
      repair.warnings.push(
        `${product.handle}: variant ${label} has no ${missingTitles} value and is not a seed ` +
          "variant, so the seed cannot tell which value it should have. Set it in the admin."
      )
      continue
    }
    const restored: Record<string, string> = {}
    const problems: string[] = []
    for (const option of missing) {
      const value = seedVariant.options[option.title]
      if (value === undefined) {
        problems.push(`the seed has no ${option.title} value for it`)
      } else if (!present(option.values).some((v) => v.value === value)) {
        problems.push(`the ${option.title} option has no value ${value}`)
      } else {
        restored[option.title] = value
      }
    }
    const full = { ...current, ...restored }
    const taken = [...combinations.entries()].find(
      ([id, combination]) => id !== variant.id && sameCombination(full, combination)
    )
    if (problems.length === 0 && taken) {
      const other = variants.find((v) => v.id === taken[0])
      problems.push(`another variant (${other ? labelOf(other) : taken[0]}) already has those values`)
    }
    if (problems.length > 0) {
      repair.warnings.push(
        `${product.handle}: variant ${label} has no ${missingTitles} value and was left as it is: ` +
          `${problems.join("; ")}. Set it in the admin.`
      )
      continue
    }
    combinations.set(variant.id, full)
    repair.optionValues.push({ variantId: variant.id, label, options: full, restored })
  }
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
    optionValues: [],
    linkSalesChannel: present(product.sales_channels).length === 0,
    linkShippingProfile: !product.shipping_profile?.id,
    warnings: [],
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

  planOptionValues(product, variants, seedInput.variants, repair)

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
    const label = labelOf(variant)
    if (!variant.price_set?.id) {
      repair.prices.push({
        variantId: variant.id,
        label,
        priceSetId: null,
        prices: seedPrices.map((p) => ({ ...p })),
        partial: false,
      })
      continue
    }
    const priced = new Set(
      present(variant.price_set.prices)
        .filter(isBasePrice)
        .map((p) => lower(p.currency_code))
        .filter((code) => code !== "")
    )
    const missing = seedPrices.filter((p) => !priced.has(lower(p.currency_code)))
    if (missing.length > 0) {
      repair.prices.push({
        variantId: variant.id,
        label,
        priceSetId: variant.price_set.id,
        prices: missing.map((p) => ({ ...p })),
        partial: missing.length < seedPrices.length,
      })
    }
  }

  return repair
}

/** Short descriptions of what a repair changes, for the seed's log. Empty when nothing. */
export function describeRepair(repair: ProductRepair): string[] {
  const parts: string[] = []
  const h = repair.handle
  if (repair.createVariants.length > 0) parts.push(`${h}: variants`)
  for (const entry of repair.optionValues) {
    const values = Object.entries(entry.restored).map(([title, value]) => `${title} ${value}`)
    parts.push(`${h}: ${entry.label} option ${values.join(", ")}`)
  }
  if (repair.sizeRanks) parts.push(`${h}: size ranks`)
  if (repair.variantRanks.length > 0) parts.push(`${h}: variant ranks`)
  const whole = repair.prices.filter((p) => !p.partial)
  if (whole.some((p) => p.prices.length > 0)) parts.push(`${h}: prices`)
  else if (whole.length > 0) parts.push(`${h}: price set`)
  for (const entry of repair.prices.filter((p) => p.partial)) {
    parts.push(`${h}: ${entry.label} prices ${entry.prices.map((p) => p.currency_code).join(", ")}`)
  }
  if (repair.linkSalesChannel) parts.push(`${h}: sales channel`)
  if (repair.linkShippingProfile) parts.push(`${h}: shipping profile`)
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
