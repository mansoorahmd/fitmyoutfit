/**
 * Medusa glue for the rush charge: finds the rush product, loads a cart's lines as the plain rule
 * needs them (lib/rules/rush-charge.ts), and writes what the rule decides on the cart's rush line
 * through the cart module. No business rule lives here.
 *
 * Who calls repriceRushLine (decision 011, "the server prices the line again after every change"):
 * - the hook on Medusa's refreshCartItemsWorkflow (workflows/hooks/refresh-cart-items-rush.ts),
 *   which every store cart change runs inside the cart's lock;
 * - our promotions route (api/store/carts/[id]/promotions/route.ts) and the step before completion
 *   (api/middlewares.ts), through ./rush-workflows.ts, also inside the cart's lock.
 */
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError, Modules } from "@medusajs/framework/utils"
import { readExact, toNumber, type Exact } from "../../lib/rules/exact-amount"
import {
  hasGarment,
  isRushKind,
  planRushLine,
  RUSH_KIND,
  RUSH_PRODUCT_HANDLE,
  RUSH_QUANTITY,
  type RushCartLine,
} from "../../lib/rules/rush-charge"
import { readRushPercentage } from "../../lib/settings/rush-percentage"

type Metadata = Record<string, unknown> | null | undefined

/** A line item as Query or Medusa's workflows return it (only what is read here). */
export type RawLineItem = {
  id: string
  quantity?: unknown
  unit_price?: unknown
  raw_unit_price?: unknown
  is_custom_price?: boolean | null
  is_discountable?: boolean | null
  is_tax_inclusive?: boolean | null
  created_at?: string | Date | null
  product_id?: string | null
  variant_id?: string | null
  product?: { metadata?: Metadata } | null
  adjustments?: ({ id?: string; amount?: unknown; raw_amount?: unknown } | null)[] | null
  tax_lines?: ({ rate?: unknown } | null)[] | null
} | null

/** The plain rule's line for a Medusa line item; `kind` from the line's product (or `kinds`). */
export function ruleLine(item: NonNullable<RawLineItem>, kind: unknown): RushCartLine {
  return {
    id: item.id,
    kind,
    unitPrice: (item.raw_unit_price ?? item.unit_price ?? null) as RushCartLine["unitPrice"],
    quantity: (item.quantity ?? null) as RushCartLine["quantity"],
    adjustments: (item.adjustments ?? []).flatMap((a) =>
      a ? [(a.raw_amount ?? a.amount ?? 0) as NonNullable<RushCartLine["unitPrice"]>] : []
    ),
    taxInclusive: item.is_tax_inclusive ?? false,
    taxRates: (item.tax_lines ?? []).flatMap((t) =>
      t ? [(t.rate ?? 0) as NonNullable<RushCartLine["unitPrice"]>] : []
    ),
    isCustomPrice: item.is_custom_price ?? null,
    isDiscountable: item.is_discountable ?? null,
    createdAt: item.created_at ?? null,
  }
}

/** The fields of a cart's lines that ruleLine reads (for Query). */
export const RUSH_LINE_FIELDS = [
  "items.id",
  "items.quantity",
  "items.unit_price",
  "items.raw_unit_price",
  "items.is_custom_price",
  "items.is_discountable",
  "items.is_tax_inclusive",
  "items.created_at",
  "items.product_id",
  "items.variant_id",
  "items.product.metadata",
  "items.adjustments.id",
  "items.adjustments.amount",
  "items.adjustments.raw_amount",
  "items.tax_lines.rate",
]

export type RushCart = {
  id: string
  currencyCode: string
  completed: boolean
  lines: RushCartLine[]
  /** The adjustment ids of each line, by line id (the rush line must have none). */
  adjustmentIds: Record<string, string[]>
}

/** The cart's lines as the rule needs them, or null for an unknown cart. */
export async function loadRushCart(container: MedusaContainer, cartId: string): Promise<RushCart | null> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "cart",
    fields: ["id", "currency_code", "completed_at", ...RUSH_LINE_FIELDS],
    filters: { id: cartId },
  })
  const cart = (data as unknown as {
    id: string
    currency_code: string
    completed_at?: unknown
    items?: RawLineItem[] | null
  }[])[0]
  if (!cart) {
    return null
  }
  const items = (cart.items ?? []).flatMap((item) => (item ? [item] : []))
  return {
    id: cart.id,
    currencyCode: cart.currency_code,
    completed: Boolean(cart.completed_at),
    lines: items.map((item) => ruleLine(item, item.product?.metadata?.kind)),
    adjustmentIds: Object.fromEntries(
      items.map((item) => [item.id, (item.adjustments ?? []).flatMap((a) => (a?.id ? [a.id] : []))])
    ),
  }
}

/** The product kinds (`metadata.kind`) of these products, deleted ones included. */
export async function productKinds(
  container: MedusaContainer,
  productIds: readonly (string | null | undefined)[]
): Promise<Map<string, unknown>> {
  const ids = [...new Set(productIds.filter((id): id is string => !!id))]
  if (ids.length === 0) {
    return new Map()
  }
  const products = await container
    .resolve(Modules.PRODUCT)
    .listProducts({ id: ids }, { select: ["id", "metadata"], withDeleted: true, take: ids.length })
  return new Map(products.map((product) => [product.id, product.metadata?.kind]))
}

/** True when one of these variants belongs to a product of kind `rush_add_on`. */
export async function includesRushVariant(
  container: MedusaContainer,
  variantIds: readonly unknown[]
): Promise<boolean> {
  const ids = [...new Set(variantIds.filter((id): id is string => typeof id === "string" && id !== ""))]
  if (ids.length === 0) {
    return false
  }
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "variant",
    fields: ["id", "product.metadata"],
    filters: { id: ids },
  })
  return (data as unknown as { product?: { metadata?: Metadata } | null }[]).some((variant) =>
    isRushKind(variant.product?.metadata?.kind)
  )
}

/** The Store's metadata, where the settings live. */
export async function readStoreSettings(container: MedusaContainer): Promise<Metadata> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "store", fields: ["metadata"] })
  return (data as unknown as { metadata?: Metadata }[])[0]?.metadata
}

/** `rush_percentage`, or HTTP 500 naming the key, like every other checkout setting. */
export async function rushPercentage(container: MedusaContainer): Promise<number> {
  const result = readRushPercentage(await readStoreSettings(container))
  if (!result.ok) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      `The store's checkout settings are incomplete: ${result.error}`
    )
  }
  return result.value
}

/**
 * Decimal places of a currency's smallest unit, from Medusa's currency data (`decimal_digits`:
 * 0 for PKR, 2 for GBP, AED and USD). HTTP 500 for a currency Medusa does not know.
 */
export async function currencyDigits(container: MedusaContainer, currencyCode: string): Promise<number> {
  const [currency] = await container
    .resolve(Modules.CURRENCY)
    .listCurrencies({ code: [currencyCode.toLowerCase()] }, { take: 1 })
  // decimal_digits is a column of Medusa's currency (its model), not listed in CurrencyDTO.
  const digits = Number((currency as { decimal_digits?: unknown } | undefined)?.decimal_digits)
  if (!currency || !Number.isInteger(digits) || digits < 0) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      `The currency ${currencyCode.toUpperCase()} has no decimal digits in Medusa's currency data.`
    )
  }
  return digits
}

/**
 * The rush product's variant, or HTTP 500 naming it: the seeded product with handle
 * RUSH_PRODUCT_HANDLE, published, of kind `rush_add_on`, with a variant.
 */
export async function findRushVariant(container: MedusaContainer): Promise<{ productId: string; variantId: string }> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product",
    fields: ["id", "status", "metadata", "variants.id", "variants.variant_rank", "variants.created_at"],
    filters: { handle: RUSH_PRODUCT_HANDLE },
  })
  const product = (data as unknown as {
    id: string
    status?: string
    metadata?: Metadata
    variants?: ({ id: string; variant_rank?: number | null; created_at?: string | Date | null } | null)[] | null
  }[])[0]
  const variants = (product?.variants ?? [])
    .flatMap((v) => (v ? [v] : []))
    .sort((a, b) => (a.variant_rank ?? 0) - (b.variant_rank ?? 0) || (a.id < b.id ? -1 : 1))
  if (!product || product.status !== "published" || !isRushKind(product.metadata?.kind) || variants.length === 0) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      `The rush product is missing: the store needs a published product with handle ` +
        `"${RUSH_PRODUCT_HANDLE}", metadata.kind "${RUSH_KIND}" and a variant. Run npm run setup ` +
        "or restore it in the admin."
    )
  }
  return { productId: product.id, variantId: variants[0].id }
}

/** What repriceRushLine changed, so a failed workflow can put it back (compensation). */
export type RushUndo = {
  /** The rush line as it was before it was written. */
  updated: {
    id: string
    unit_price: unknown
    quantity: unknown
    is_custom_price: boolean | null
    is_discountable: boolean | null
    is_tax_inclusive: boolean | null
  } | null
  /** Rush lines removed (soft-deleted), restored on undo. */
  removed: string[]
  /** Adjustments removed from the rush line (soft-deleted), restored on undo. */
  removedAdjustments: string[]
}

export type RushRepriceOutcome = {
  /** True when anything was written. */
  changed: boolean
  undo: RushUndo
}

const NOTHING: RushRepriceOutcome = {
  changed: false,
  undo: { updated: null, removed: [], removedAdjustments: [] },
}

/**
 * Brings the cart's rush line in line with the rule (planRushLine): priced again, quantity 1, no
 * discount, extras removed, and removed altogether with the last garment or when rush is switched
 * off. A cart without a rush line is left alone and its settings are not read. The caller holds
 * the cart's lock (Medusa's cart workflows, or ./rush-workflows.ts).
 *
 * Throws HTTP 500 naming the key when the cart has rush and a garment but `rush_percentage` is
 * missing or invalid: the store does not guess a price. Removing the rush line (the customer's
 * way out) never needs the setting.
 */
export async function repriceRushLine(container: MedusaContainer, cartId: string): Promise<RushRepriceOutcome> {
  const cart = await loadRushCart(container, cartId)
  if (!cart || cart.completed || !cart.lines.some((line) => isRushKind(line.kind))) {
    return NOTHING
  }
  const plan = hasGarment(cart.lines)
    ? planRushLine(cart.lines, await rushPercentage(container), await currencyDigits(container, cart.currencyCode))
    : planRushLine(cart.lines, 0, 0)
  const cartModule = container.resolve(Modules.CART)
  const undo: RushUndo = { updated: null, removed: [], removedAdjustments: [] }

  if (plan.remove.length > 0) {
    await cartModule.softDeleteLineItems(plan.remove)
    undo.removed = plan.remove
  }
  if (plan.keep?.update) {
    const before = cart.lines.find((line) => line.id === plan.keep?.id) as RushCartLine
    const adjustments = cart.adjustmentIds[plan.keep.id] ?? []
    if (adjustments.length > 0) {
      await cartModule.softDeleteLineItemAdjustments(adjustments)
      undo.removedAdjustments = adjustments
    }
    await cartModule.updateLineItems(plan.keep.id, {
      unit_price: toNumber(plan.keep.unitPrice),
      quantity: RUSH_QUANTITY,
      // Not a custom price: Medusa deletes custom-priced lines when the cart's region changes.
      // The line's price is still only ever the server's: Medusa sets it from the variant's
      // placeholder price (0) only when it reprices every line (a region change), and this
      // runs right after that, in the same workflow.
      is_custom_price: false,
      is_discountable: false,
      is_tax_inclusive: false,
    } as Record<string, unknown>)
    const beforePrice = readExact(before.unitPrice ?? null)
    undo.updated = {
      id: plan.keep.id,
      unit_price: beforePrice ? toNumber(beforePrice) : null,
      quantity: before.quantity,
      is_custom_price: before.isCustomPrice ?? null,
      is_discountable: before.isDiscountable ?? null,
      is_tax_inclusive: before.taxInclusive ?? null,
    }
  }
  const changed = plan.remove.length > 0 || Boolean(plan.keep?.update)
  return { changed, undo }
}

function numberOr(value: unknown, fallback: number): number {
  const amount: Exact | null = readExact(value)
  return amount ? toNumber(amount) : fallback
}

/** Puts back what repriceRushLine wrote (a workflow's compensation). */
export async function undoRushReprice(container: MedusaContainer, undo: RushUndo | undefined): Promise<void> {
  if (!undo) {
    return
  }
  const cartModule = container.resolve(Modules.CART)
  if (undo.updated) {
    const { id, unit_price, quantity, is_custom_price, is_discountable, is_tax_inclusive } = undo.updated
    await cartModule.updateLineItems(id, {
      ...(unit_price === null ? {} : { unit_price: unit_price as number }),
      quantity: numberOr(quantity, RUSH_QUANTITY),
      ...(is_custom_price === null ? {} : { is_custom_price }),
      ...(is_discountable === null ? {} : { is_discountable }),
      ...(is_tax_inclusive === null ? {} : { is_tax_inclusive }),
    } as Record<string, unknown>)
  }
  if (undo.removedAdjustments.length > 0) {
    await cartModule.restoreLineItemAdjustments(undo.removedAdjustments)
  }
  if (undo.removed.length > 0) {
    await cartModule.restoreLineItems(undo.removed)
  }
}
