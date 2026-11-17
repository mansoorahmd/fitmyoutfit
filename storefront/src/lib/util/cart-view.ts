// Plain views of the cart for the cart page, the cart panel and the
// "Added to your cart" confirmation (docs/design/05-m1-pages.md, section 4).
// Components lay these out; the decisions are here, with their tests.

import { HttpTypes } from "@medusajs/types"

import { isPakistan } from "./home-regions"
import { convertToLocale } from "./money"
import { productKind } from "./product-kind"
import { showsTaxNote } from "./product-page"
import { withoutRush } from "./rush"
import { isAdultSize, isSizeOption, isYouthSize } from "./sizes"

type LineLike = Pick<
  HttpTypes.StoreCartLineItem,
  "quantity" | "variant_title" | "variant_option_values"
> & {
  variant?: {
    options?: { value?: string | null; option?: { title?: string | null } | null }[] | null
  } | null
  product?: { metadata?: Record<string, unknown> | null } | null
}

/**
 * The number of pieces: the sum of the quantities, not the number of lines.
 * Garments and the fit kit; never the rush line (contract 9), which is a
 * charge, not a piece. A line read without its product counts.
 */
export const pieceCount = (
  items:
    | (Pick<HttpTypes.StoreCartLineItem, "quantity"> & {
        product?: { metadata?: Record<string, unknown> | null } | null
      })[]
    | null
    | undefined
): number => withoutRush(items).reduce((sum, item) => sum + (item.quantity || 0), 0)

/**
 * The line's size ("M"), or null for a line without one (the fit kit). The
 * variant's "Size" option when the cart returns it; otherwise its title,
 * when that title is a size the store knows (the store API doesn't return
 * a line's variant options).
 */
export const lineSize = (item: LineLike): string | null => {
  const fromOptions = item.variant?.options?.find((o) =>
    isSizeOption(o.option?.title)
  )?.value
  if (fromOptions) {
    return fromOptions
  }
  const values = item.variant_option_values as Record<string, unknown> | null | undefined
  const fromValues = values
    ? Object.entries(values).find(([title]) => isSizeOption(title))?.[1]
    : undefined
  if (typeof fromValues === "string" && fromValues) {
    return fromValues
  }
  const title = item.variant_title?.trim()
  return title && (isYouthSize(title) || isAdultSize(title)) ? title : null
}

/** The line is the fit kit (a refundable deposit, not counted for the minimum). */
export const isFitKitLine = (item: LineLike): boolean =>
  productKind(item.product) === "fit_kit"

/** Newest first, as the starter did. A copy: the cart's array is left alone. */
export const newestFirst = <T extends { created_at?: string | Date | null }>(
  items: T[] | null | undefined
): T[] =>
  [...(items ?? [])].sort((a, b) =>
    String(a.created_at ?? "") > String(b.created_at ?? "") ? -1 : 1
  )

export type DeliveryRow =
  /** The option has been chosen: its name and amount. */
  | { kind: "amount"; label: string; amount: number }
  /** The duty-paid export option: its name and "Included", never "GBP 0.00". */
  | { kind: "included"; label: string }
  /** Pakistan before checkout: the option's name and "Added at checkout". */
  | { kind: "at_checkout"; label: string }

/** A shipping option as `GET /store/shipping-options?cart_id=` returns it. */
export type ShippingOptionLike = {
  id?: string | null
  name?: string | null
  data?: Record<string, unknown> | null
}

/** A shipping method already on the cart (`cart.shipping_methods[]`). */
export type ShippingMethodLike = {
  name?: string | null
  shipping_option_id?: string | null
}

/** The option is the export markets' single duty-paid line (contract section 3). */
const isDutyPaid = (option: ShippingOptionLike | null | undefined): boolean =>
  option?.data?.ddp === true

/**
 * The summary's delivery row (05, 4.4), or null when there is nothing true
 * to say (no option known yet). The name is always the backend's: "Delivery
 * in Pakistan" or "Shipping & duties included".
 *
 * Only the shipping option carries the duty-paid marker (`data.ddp: true`,
 * contract section 3); the method on the cart has its own `data`, which is
 * empty. So a chosen method is duty-paid when the option it was made from,
 * matched by `shipping_option_id`, is.
 */
export const deliveryRow = ({
  shippingMethods,
  shippingSubtotal,
  shippingOptions,
}: {
  shippingMethods?: ShippingMethodLike[] | null
  shippingSubtotal?: number | null
  shippingOptions?: ShippingOptionLike[] | null
}): DeliveryRow | null => {
  const chosen = shippingMethods?.find((m) => !!m.name)
  if (chosen?.name) {
    const from = chosen.shipping_option_id
      ? shippingOptions?.find((o) => !!o.id && o.id === chosen.shipping_option_id)
      : undefined
    if (isDutyPaid(from)) {
      return { kind: "included", label: chosen.name }
    }
    return { kind: "amount", label: chosen.name, amount: shippingSubtotal ?? 0 }
  }
  const option = shippingOptions?.find((o) => !!o.name)
  if (!option?.name) {
    return null
  }
  if (isDutyPaid(option)) {
    return { kind: "included", label: option.name }
  }
  return { kind: "at_checkout", label: option.name }
}

/** "Total before delivery" while the delivery amount isn't in the total yet. */
export const totalIsBeforeDelivery = (row: DeliveryRow | null): boolean =>
  row?.kind === "at_checkout"

/** Whether the cart's prices carry the "Tax not final" note. */
export const cartShowsTaxNote = (
  cart: { region?: Pick<HttpTypes.StoreRegion, "metadata"> | null }
): boolean => showsTaxNote(cart.region)

/**
 * Where "Go to checkout" leads (05, 6.1): step 1, contact and address,
 * until the cart has an email, a delivery address and its delivery method;
 * then step 2, delivery and payment. The checkout opens step 1 itself when
 * the address it holds isn't complete.
 */
export const checkoutHref = (
  cart: Pick<HttpTypes.StoreCart, "email" | "shipping_address" | "shipping_methods">
): string =>
  cart.shipping_address?.address_1 && cart.email && cart.shipping_methods?.length
    ? "/checkout?step=payment"
    : "/checkout?step=address"

/** Export regions see the minimum and the duty-paid line; Pakistan does not. */
export const isExportRegion = (countryCode: string | undefined): boolean =>
  !!countryCode && !isPakistan(countryCode)

/** One cart line as the cart page shows it (05, 4.3). */
export type CartLineView = {
  id: string
  variantId: string | null
  title: string
  productHandle: string | null
  thumbnail: string | null
  size: string | null
  quantity: number
  /** Formatted: "PKR 3,500". */
  unitPrice: string
  /** Formatted: the line's total. */
  total: string
  fitKit: boolean
  /** The stepper's maximum: 999, or the stock when the variant manages it. */
  maxQuantity: number
}

export const cartLineView = (
  item: HttpTypes.StoreCartLineItem,
  currencyCode: string,
  maxQuantity: number
): CartLineView => ({
  id: item.id,
  variantId: item.variant_id ?? null,
  title: item.product_title || item.title,
  productHandle: item.product_handle ?? null,
  thumbnail: item.thumbnail ?? null,
  size: lineSize(item),
  quantity: item.quantity,
  unitPrice: money(item.unit_price, currencyCode),
  total: money(item.total ?? amountFor(item.unit_price, item.quantity), currencyCode),
  fitKit: isFitKitLine(item),
  maxQuantity,
})

/** An amount in the cart's currency, as every page shows it. */
export const money = (amount: number | null | undefined, currencyCode: string): string =>
  convertToLocale({ amount: amount ?? 0, currency_code: currencyCode })

/** The amount for `quantity` pieces at the line's unit price. */
export const amountFor = (unitPrice: number, quantity: number): number =>
  // Prices are in major units with at most 2 decimals; avoid 0.1 + 0.2 drift.
  Math.round(unitPrice * quantity * 100) / 100
