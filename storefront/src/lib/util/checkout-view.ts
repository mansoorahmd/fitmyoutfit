// Everything the checkout page shows (docs/design/05-m1-pages.md, section
// 6), worked out on the server from the cart, the backend's rules (null
// when they didn't load), the region's shipping options and payment
// providers, and the customer. Plain data in and out.

import { HttpTypes } from "@medusajs/types"

import {
  AddressFormValues,
  AddressLike,
  CountryChoice,
  addressLines,
  addressStepDone,
  initialAddressValues,
  savedAddressesInRegion,
  withSavedAddress,
} from "./checkout-address"
import { PaymentChoiceView, paymentChoice, sessionProviderId } from "./checkout-payment"
import { CheckoutRules, MinimumView, minimumView, promisedDate } from "./checkout-rules"
import {
  DeliveryRow,
  ShippingMethodLike,
  ShippingOptionLike,
  cartShowsTaxNote,
  deliveryRow,
  lineSize,
  money,
  newestFirst,
  pieceCount,
} from "./cart-view"

export type CheckoutStep = "address" | "payment"

/**
 * The open step: "payment" only when the URL asks for it and step 1 is
 * done; otherwise "address". A link to step 2 with step 1 unfinished opens
 * step 1.
 */
export const openStep = (param: string | null | undefined, addressDone: boolean): CheckoutStep =>
  param === "payment" && addressDone ? "payment" : "address"

/** One line in the order summary and the order check (05, 6.3 and 6.5 c). */
export type SummaryLineView = {
  id: string
  title: string
  size: string | null
  quantity: number
  /** Formatted. */
  total: string
  thumbnail: string | null
}

export const summaryLines = (
  items: HttpTypes.StoreCartLineItem[] | null | undefined,
  currencyCode: string
): SummaryLineView[] =>
  newestFirst(items).map((item) => ({
    id: item.id,
    title: item.product_title || item.title,
    size: lineSize(item),
    quantity: item.quantity,
    total: money(item.total ?? item.unit_price * item.quantity, currencyCode),
    thumbnail: item.thumbnail ?? null,
  }))

/** Over 6 lines, the order check shows the first 5 and "Show all 9" (05, 6.5 c). */
export const linesShownFirst = (count: number): number => (count > 6 ? 5 : count)

export type SavedAddressView = {
  id: string
  lines: string[]
  /** The address as saved, put into the form when it is chosen. */
  address: AddressLike
}

export type AddressSummaryView = {
  email: string
  phone: string | null
  lines: string[]
  /** False when the billing address differs: it is listed too. */
  billingSame: boolean
  billingLines: string[]
}

export type CheckoutView = {
  cartId: string
  countryCode: string
  currencyCode: string
  lines: SummaryLineView[]
  pieces: number
  /** The summary rows, as the cart's CartSummary takes them. */
  summary: {
    pieces: number
    itemSubtotal: string
    total: string
    delivery: DeliveryRow | null
    deliveryAmount?: string
    showTaxNote: boolean
    deliveryDate: string | null
    rulesFailed: boolean
  }
  /** The cart's total, in whole units, and formatted. */
  totalAmount: number
  address: {
    initial: AddressFormValues
    countries: CountryChoice[]
    saved: SavedAddressView[]
    /** The saved address the form starts with (the default), or null for a new one. */
    savedSelected: string | null
    signedIn: boolean
    done: boolean
    summary: AddressSummaryView | null
  }
  /** The cart has its delivery method (otherwise step 2 shows W-K14). */
  deliveryReady: boolean
  payment: PaymentChoiceView & { sessionProviderId: string | null }
  /** The minimum, only when it shows (export regions with garments). */
  minimum: MinimumView | null
  /** The minimum isn't met: the alert at the top and "Place order" inactive (05, 5.4). */
  minimumBlocks: boolean
}

type CustomerLike = {
  email?: string | null
  addresses?: (HttpTypes.StoreCustomerAddress & { is_default_shipping?: boolean | null })[] | null
} | null

export const checkoutView = ({
  cart,
  rules,
  shippingOptions,
  providerIds,
  customer,
  countryCode,
}: {
  cart: HttpTypes.StoreCart
  rules: CheckoutRules | null
  shippingOptions: ShippingOptionLike[] | null
  /** Null when the providers didn't load: no option is offered. */
  providerIds: string[] | null
  customer: CustomerLike
  countryCode: string
}): CheckoutView => {
  const currency = cart.currency_code
  const countries: CountryChoice[] = (cart.region?.countries ?? [])
    .filter((c) => !!c.iso_2)
    .map((c) => ({
      code: c.iso_2!.toLowerCase(),
      name: c.display_name || c.name || c.iso_2!.toUpperCase(),
    }))
  const countryCodes = countries.map((c) => c.code)
  const countryName = (code: string | null | undefined) =>
    countries.find((c) => c.code === code?.toLowerCase())?.name ?? null

  const delivery = deliveryRow({
    shippingMethods: cart.shipping_methods as ShippingMethodLike[] | null | undefined,
    shippingSubtotal: cart.shipping_subtotal,
    shippingOptions,
  })
  const deliveryReady = (cart.shipping_methods?.length ?? 0) > 0
  const minimum = rules ? minimumView(rules) : null
  const done = addressStepDone(cart, countryCodes)
  const fromCart = initialAddressValues({
    cart,
    customerEmail: customer?.email,
    countryCodes,
  })

  const saved = savedAddressesInRegion(customer?.addresses, countryCodes)
  const savedViews = saved.map((a) => ({
    id: a.id,
    lines: addressLines(a, countryName(a.country_code)),
    address: {
      first_name: a.first_name,
      last_name: a.last_name,
      company: a.company,
      country_code: a.country_code,
      address_1: a.address_1,
      address_2: a.address_2,
      city: a.city,
      province: a.province,
      postal_code: a.postal_code,
      phone: a.phone,
    },
  }))
  // A cart that already has an address keeps it in the form; otherwise
  // the default saved address is chosen first (05, 6.4).
  const savedSelected = !cart.shipping_address?.address_1 && saved[0] ? saved[0].id : null
  const initial = savedSelected ? withSavedAddress(fromCart, saved[0]) : fromCart
  const pieces = pieceCount(cart.items)

  return {
    cartId: cart.id,
    countryCode,
    currencyCode: currency,
    lines: summaryLines(cart.items, currency),
    pieces,
    summary: {
      pieces,
      itemSubtotal: money(cart.item_subtotal, currency),
      total: money(cart.total, currency),
      delivery,
      deliveryAmount: delivery?.kind === "amount" ? money(delivery.amount, currency) : undefined,
      showTaxNote: cartShowsTaxNote(cart),
      deliveryDate: promisedDate(rules),
      rulesFailed: rules === null,
    },
    totalAmount: cart.total ?? 0,
    address: {
      initial,
      countries,
      saved: savedViews,
      savedSelected,
      signedIn: !!customer,
      done,
      summary: done
        ? {
            email: cart.email ?? "",
            phone: cart.shipping_address?.phone ?? null,
            lines: addressLines(cart.shipping_address, countryName(cart.shipping_address?.country_code)),
            billingSame: initial.billingSame,
            billingLines: initial.billingSame
              ? []
              : addressLines(cart.billing_address, countryName(cart.billing_address?.country_code)),
          }
        : null,
    },
    deliveryReady,
    payment: {
      ...paymentChoice({ providerIds: providerIds ?? [], rules }),
      sessionProviderId: sessionProviderId(cart),
    },
    minimum,
    minimumBlocks: !!minimum && !minimum.reached,
  }
}

/**
 * Whether a cart belongs to another region than the URL's (05, 4.6 has no
 * answer; the brief: move it to the URL's region). False when either is
 * unknown, so nothing moves on a guess.
 */
export const cartInOtherRegion = (
  cart: { region_id?: string | null } | null | undefined,
  urlRegionId: string | null | undefined
): boolean => !!cart?.region_id && !!urlRegionId && cart.region_id !== urlRegionId
