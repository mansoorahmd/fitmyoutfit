/**
 * The rush charge (docs/contracts/m1-checkout.md, section 9; decision 011). Plain TypeScript, no
 * Medusa imports.
 *
 * Rush is one cart line of the seeded "Rush Production" product (`metadata.kind` `rush_add_on`),
 * quantity 1, whose unit price is set by the server, never by the customer:
 *
 *   charge = (garment lines after item discounts, before delivery and tax) × rush_percentage / 100,
 *            rounded half up to the currency's smallest unit.
 *
 * Garment lines are every line whose product kind is not `fit_kit` or `rush_add_on` (the same rule
 * as the minimum quantity: a missing or unknown kind counts as a garment). The fit kit is a
 * refundable deposit and delivery is not production work, so neither is charged for rush.
 *
 * The functions take any list of lines, so team orders (M2) can apply the same rule to a deposit
 * or a balance. The Medusa code (workflows/rush/) loads the cart, calls these, and writes what they
 * decide.
 */
import { countsTowardMinimum } from "./minimum-quantity"
import {
  add,
  compare,
  div,
  exact,
  max,
  mul,
  readExact,
  roundHalfUp,
  sub,
  sum,
  toDecimalString,
  toFixedString,
  toNumber,
  ZERO,
  type AmountInput,
  type Exact,
} from "./exact-amount"

/** The `metadata.kind` of the rush product (delivery-promise.ts says "rush" for a line of it). */
export const RUSH_KIND = "rush_add_on"

/**
 * The handle of the seeded rush product (scripts/seed-data/products.ts; a unit test keeps the two
 * equal). The store finds the rush product by it, and checks its kind.
 */
export const RUSH_PRODUCT_HANDLE = "rush-add-on"

/** The quantity of the rush line: a cart holds rush or it does not. */
export const RUSH_QUANTITY = 1

/** True for the rush product's kind (compared exactly, like every kind). */
export function isRushKind(kind: unknown): boolean {
  return kind === RUSH_KIND
}

/**
 * True when a line of this kind is charged for rush: every kind but the fit kit and rush itself,
 * exactly the lines that count toward the minimum quantity.
 */
export function isChargedForRush(kind: unknown): boolean {
  return countsTowardMinimum(kind)
}

/** One cart (or order) line, as far as the rush rule needs it. */
export type RushRuleLine = {
  /** The product's `metadata.kind`, whatever it holds (missing counts as a garment). */
  kind?: unknown
  /** The unit price as kept on the line (missing counts as 0). */
  unitPrice?: AmountInput | null
  quantity: AmountInput | null | undefined
  /** The line's item discounts (Medusa's adjustment amounts), as kept on the line. */
  adjustments?: readonly (AmountInput | null | undefined)[] | null
  /** True when the unit price includes tax (a tax-inclusive price preference). */
  taxInclusive?: boolean | null
  /** The line's tax rates, in percent (Medusa's tax line `rate`), used only when tax-inclusive. */
  taxRates?: readonly (AmountInput | null | undefined)[] | null
}

function amountOf(value: AmountInput | null | undefined, what: string): Exact {
  if (value === null || value === undefined) {
    return ZERO
  }
  return exact(value, what)
}

/**
 * What one line contributes to the base: its price times its quantity, less its item discounts,
 * before tax, and never below 0 (a discount larger than the line takes the line to 0, it does not
 * lower the other lines). For a tax-inclusive price the tax is taken out at the line's rates, the
 * way Medusa works out a line's subtotal.
 */
export function lineBase(line: RushRuleLine): Exact {
  const quantity = amountOf(line.quantity, "quantity")
  const gross = mul(amountOf(line.unitPrice, "unit price"), quantity)
  const discounts = sum((line.adjustments ?? []).map((a) => amountOf(a, "adjustment")))
  const afterDiscounts = sub(gross, discounts)
  if (!line.taxInclusive) {
    return max(afterDiscounts, ZERO)
  }
  const rate = sum((line.taxRates ?? []).map((r) => amountOf(r, "tax rate")))
  const divisor = add({ num: 1n, den: 1n }, div(rate, { num: 100n, den: 1n }))
  return max(div(afterDiscounts, divisor), ZERO)
}

/** The base of the charge: the garment lines after item discounts, before delivery and tax. */
export function rushBase(lines: readonly RushRuleLine[]): Exact {
  return sum(lines.filter((line) => isChargedForRush(line.kind)).map(lineBase))
}

/** True when the lines hold at least one garment line with a quantity above 0. */
export function hasGarment(lines: readonly RushRuleLine[]): boolean {
  return lines.some((line) => {
    if (!isChargedForRush(line.kind)) {
      return false
    }
    const quantity = readExact(line.quantity ?? 0)
    return quantity !== null && compare(quantity, ZERO) > 0
  })
}

/**
 * The charge, exactly, rounded half up to `currencyDigits` decimal places (the currency's smallest
 * unit, from Medusa's currency data: 0 for PKR, 2 for GBP, AED and USD).
 */
export function rushCharge(
  lines: readonly RushRuleLine[],
  percentage: number,
  currencyDigits: number
): Exact {
  if (!Number.isFinite(percentage) || percentage < 0) {
    throw new Error(`Expected a percentage of 0 or more, got ${percentage}`)
  }
  const share = div(exact(percentage, "percentage"), { num: 100n, den: 1n })
  return roundHalfUp(mul(rushBase(lines), share), currencyDigits)
}

/** Why rush is not offered for a cart: no garment line, or a percentage of 0 (the founder's off switch). */
export type RushUnavailableReason = "no_garment" | "not_offered"

export type RushOffer =
  | { available: true; reason: null; amount: Exact }
  | { available: false; reason: RushUnavailableReason; amount: Exact }

/** Whether rush can be added to these lines, and what it costs (0 when it cannot). */
export function rushOffer(
  lines: readonly RushRuleLine[],
  percentage: number,
  currencyDigits: number
): RushOffer {
  if (!(percentage > 0)) {
    return { available: false, reason: "not_offered", amount: ZERO }
  }
  if (!hasGarment(lines)) {
    return { available: false, reason: "no_garment", amount: ZERO }
  }
  return { available: true, reason: null, amount: rushCharge(lines, percentage, currencyDigits) }
}

/** The refusal sentence for adding rush when it is not offered. */
export function rushRefusalMessage(reason: RushUnavailableReason): string {
  return reason === "no_garment"
    ? "Rush production can only be added to a cart with at least one garment."
    : "Rush production is not offered at the moment."
}

/** A cart line with what the plan needs to tell the rush lines apart and change them. */
export type RushCartLine = RushRuleLine & {
  id: string
  /**
   * Medusa's custom-price flag. The rush line must not have it: Medusa deletes every custom-priced
   * line when a cart moves to another region, and rush must survive that (it is priced again).
   */
  isCustomPrice?: boolean | null
  /** True when promotions may discount the line. The rush line must not be: see planRushLine. */
  isDiscountable?: boolean | null
  /** When the line was added (ISO time or Date), to keep the oldest of several rush lines. */
  createdAt?: string | Date | null
}

/** What to write so that the cart's rush line follows the rule. */
export type RushLinePlan = {
  /** Rush lines to remove: extras (two adds at once), or every one when rush no longer applies. */
  remove: string[]
  /** The rush line to keep, with what it must hold, or null when none is kept. */
  keep: {
    id: string
    unitPrice: Exact
    /** True when the line differs from what it must hold and has to be written. */
    update: boolean
  } | null
  /** Why the rush lines are removed, when they are (for the log). */
  removedBecause: RushUnavailableReason | "duplicate" | null
}

function createdTime(line: RushCartLine): number {
  if (!line.createdAt) {
    return Number.POSITIVE_INFINITY
  }
  const time = new Date(line.createdAt).getTime()
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time
}

/** The rush lines of a cart, oldest first (then by id, so every server picks the same one). */
export function rushLinesOf<T extends RushCartLine>(lines: readonly T[]): T[] {
  return lines
    .filter((line) => isRushKind(line.kind))
    .sort((a, b) => createdTime(a) - createdTime(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/**
 * What the cart's rush line must become (the server prices it again after every change):
 * - no rush line: nothing;
 * - no garment line left, or rush no longer offered (percentage 0): every rush line goes;
 * - otherwise the oldest rush line stays (any other, from two adds at once, goes) and must hold
 *   quantity 1, the charge as its unit price (not flagged as a custom price, see RushCartLine), no
 *   item discount and a price before tax. It is written only when it differs.
 *
 * The rush line is never discountable: the charge is already worked out on the discounted
 * garments, so a promotion on the rush line would discount the same thing twice, and a
 * discountable rush line would change how Medusa spreads an order-wide discount over the garments,
 * which the charge depends on.
 */
export function planRushLine(
  lines: readonly RushCartLine[],
  percentage: number,
  currencyDigits: number
): RushLinePlan {
  const rush = rushLinesOf(lines)
  if (rush.length === 0) {
    return { remove: [], keep: null, removedBecause: null }
  }
  const offer = rushOffer(lines, percentage, currencyDigits)
  if (!offer.available) {
    return { remove: rush.map((line) => line.id), keep: null, removedBecause: offer.reason }
  }
  const [kept, ...extra] = rush
  const quantity = readExact(kept.quantity ?? 0)
  const price = readExact(kept.unitPrice ?? "")
  const update =
    price === null ||
    compare(price, offer.amount) !== 0 ||
    quantity === null ||
    compare(quantity, { num: BigInt(RUSH_QUANTITY), den: 1n }) !== 0 ||
    kept.isCustomPrice === true ||
    kept.isDiscountable !== false ||
    kept.taxInclusive === true ||
    (kept.adjustments ?? []).length > 0
  return {
    remove: extra.map((line) => line.id),
    keep: { id: kept.id, unitPrice: offer.amount, update },
    removedBecause: extra.length > 0 ? "duplicate" : null,
  }
}

/**
 * Whether lines that are about to become an order hold rush exactly as the rule says: no rush
 * line, or exactly one, of quantity 1, priced at the charge for the other lines, with no
 * discount, alongside at least one garment. Returns null when they do, else a sentence saying
 * what differs (for the log; the customer is told to try again).
 */
export function rushMismatch(
  lines: readonly RushCartLine[],
  percentage: number,
  currencyDigits: number
): string | null {
  const rush = rushLinesOf(lines)
  if (rush.length === 0) {
    return null
  }
  if (rush.length > 1) {
    return `the cart has ${rush.length} rush lines`
  }
  const offer = rushOffer(lines, percentage, currencyDigits)
  if (!offer.available) {
    return `the cart has a rush line but rush is not available (${offer.reason})`
  }
  const [line] = rush
  const quantity = readExact(line.quantity ?? 0)
  if (quantity === null || compare(quantity, { num: 1n, den: 1n }) !== 0) {
    return `the rush line has quantity ${quantity ? toDecimalString(quantity) : "none"}`
  }
  const price = readExact(line.unitPrice ?? "")
  if (price === null || compare(price, offer.amount) !== 0) {
    return (
      `the rush line costs ${price ? toDecimalString(price) : "nothing"} but the rule says ` +
      toFixedString(offer.amount, currencyDigits)
    )
  }
  if ((line.adjustments ?? []).length > 0 || line.taxInclusive === true) {
    return "the rush line carries a discount or a tax-inclusive price"
  }
  return null
}

/** The figure for JSON answers (whole currency units, like `cod_max_total`: 400, 44, 2.07). */
export function amountForJson(amount: Exact): number {
  return toNumber(amount)
}
