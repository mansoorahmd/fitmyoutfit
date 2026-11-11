// Everything the order confirmation shows (docs/design/05-m1-pages.md,
// section 7), from the order and the date promised when it was placed
// (GET /store/orders/:id/delivery-promise, contract 8.1). Plain data in
// and out.
//
// Decision 008: no "Tax not final" here; the total is what the customer
// pays.

import { HttpTypes } from "@medusajs/types"

import { addressLines } from "./checkout-address"
import { COD_PROVIDER_ID, TEST_PROVIDER_ID } from "./checkout-payment"
import { SummaryLineView, summaryLines } from "./checkout-view"
import { isExportRegion, money, pieceCount } from "./cart-view"

export type OrderPromise = {
  date: string
  days: number
  based_on: string
  applies: "standard" | "rush"
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** The route's answer, or null when there is no promise or it can't be read. */
export const parseOrderPromise = (json: unknown): OrderPromise | null => {
  const promise = (json as { delivery_promise?: unknown } | null)?.delivery_promise as
    | Record<string, unknown>
    | null
    | undefined
  if (!promise || typeof promise !== "object") {
    return null
  }
  if (typeof promise.date !== "string" || !ISO_DATE.test(promise.date)) {
    return null
  }
  return {
    date: promise.date,
    days: typeof promise.days === "number" ? promise.days : 0,
    based_on: typeof promise.based_on === "string" ? promise.based_on : "",
    applies: promise.applies === "rush" ? "rush" : "standard",
  }
}

const PLACED_ON = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Karachi",
})

/**
 * "11 November 2026": the day the order was placed, in Lahore's time zone,
 * the same clock the delivery promise counts from (contract section 5), so
 * the two never disagree about the day.
 */
export const placedOnDate = (createdAt: string | Date | null | undefined): string | null => {
  if (!createdAt) return null
  const date = new Date(createdAt)
  return Number.isNaN(date.getTime()) ? null : PLACED_ON.format(date)
}

export type OrderPaymentKind = "cod" | "test" | "other"

type PaymentCollectionLike = {
  payments?: { provider_id?: string | null }[] | null
  payment_sessions?: { provider_id?: string | null }[] | null
}

/** How the order is paid: cash on delivery, the placeholder, or something else. */
export const orderPaymentKind = (
  collections: PaymentCollectionLike[] | null | undefined
): OrderPaymentKind => {
  const ids = (collections ?? []).flatMap((c) => [
    ...(c.payments ?? []).map((p) => p.provider_id),
    ...(c.payment_sessions ?? []).map((s) => s.provider_id),
  ])
  if (ids.includes(COD_PROVIDER_ID)) return "cod"
  if (ids.includes(TEST_PROVIDER_ID)) return "test"
  return "other"
}

export type OrderDeliveryRow =
  | { kind: "amount"; label: string; amount: string }
  /** The duty-paid export line: "Included", never "GBP 0.00". */
  | { kind: "included"; label: string }

/**
 * The order's delivery line. The order's delivery method carries no
 * duty-paid marker (its `data` is empty, like the cart's), and the store
 * API can't list shipping options without a cart. So on the order, a
 * delivery line of 0 outside Pakistan is the duty-paid line: "Included"
 * (contract section 3: the export regions' one option is duty-paid at 0).
 */
export const orderDeliveryRow = ({
  methods,
  shippingTotal,
  currencyCode,
  countryCode,
}: {
  methods: { name?: string | null; amount?: number | null }[] | null | undefined
  shippingTotal: number | null | undefined
  currencyCode: string
  countryCode: string | null | undefined
}): OrderDeliveryRow | null => {
  const method = methods?.find((m) => !!m.name)
  if (!method?.name) {
    return null
  }
  const amount = shippingTotal ?? method.amount ?? 0
  if (amount === 0 && isExportRegion(countryCode ?? undefined)) {
    return { kind: "included", label: method.name }
  }
  return { kind: "amount", label: method.name, amount: money(amount, currencyCode) }
}

export type OrderConfirmationView = {
  orderId: string
  /** "#1042", or null without a display number. */
  orderNumber: string | null
  firstName: string | null
  placedOn: string | null
  email: string | null
  /** "YYYY-MM-DD" promised at placing, or null: the date is left out. */
  deliveryDate: string | null
  payment: OrderPaymentKind
  lines: SummaryLineView[]
  pieces: number
  itemSubtotal: string
  delivery: OrderDeliveryRow | null
  total: string
  addressLines: string[]
  phone: string | null
}

export const orderConfirmationView = ({
  order,
  promise,
  countryName,
}: {
  order: HttpTypes.StoreOrder
  promise: OrderPromise | null
  /** The country's name for the address block, when known. */
  countryName?: string | null
}): OrderConfirmationView => {
  const currency = order.currency_code
  const address = order.shipping_address
  const items = (order.items ?? []) as unknown as HttpTypes.StoreCartLineItem[]

  return {
    orderId: order.id,
    orderNumber: order.display_id ? `#${order.display_id}` : null,
    firstName: address?.first_name?.trim() || null,
    placedOn: placedOnDate(order.created_at),
    email: order.email ?? null,
    deliveryDate: promise?.date ?? null,
    payment: orderPaymentKind(order.payment_collections as PaymentCollectionLike[] | undefined),
    lines: summaryLines(items, currency),
    pieces: pieceCount(items),
    itemSubtotal: money(order.item_subtotal, currency),
    delivery: orderDeliveryRow({
      methods: order.shipping_methods,
      shippingTotal: order.shipping_subtotal,
      currencyCode: currency,
      countryCode: address?.country_code,
    }),
    total: money(order.total, currency),
    addressLines: addressLines(address, countryName),
    phone: address?.phone?.trim() || null,
  }
}
