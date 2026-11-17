// The account's orders (docs/design/05-m1-pages.md, 9.3 and 9.4): the
// status wording, the order card, paging, and one order's page. Plain data
// in and out; the components lay it out.
//
// Only the backend's own fields are read. The list route returns each
// order's `metadata` to its customer, but nothing in it is shown (staff
// keys such as `cod_slip_reference` live there): the promised date comes
// from GET /store/orders/:id/delivery-promise only.
//
// Decision 008: no "Tax not final" on order pages; the total is what the
// customer pays.

import { HttpTypes } from "@medusajs/types"

import { accountContent } from "@content/account"

import { money, pieceCount } from "./cart-view"
import { withoutRush } from "./rush"
import {
  OrderConfirmationView,
  OrderPromise,
  orderConfirmationView,
  placedOnDate,
} from "./order-confirmation"
import { countWords, fill } from "./wording"
import type { LineIconName } from "@modules/home/components/line-icon"

const words = accountContent.orders

export type OrderStatusKind = "cancelled" | "placed" | "on_its_way" | "delivered"

export type OrderStatusView = {
  kind: OrderStatusKind
  label: string
  icon: LineIconName
  /** The words' colour: muted for cancelled, success for delivered, else ink. Never the only sign. */
  tone: "muted" | "ink" | "success"
}

const STATUS: Record<OrderStatusKind, Omit<OrderStatusView, "kind">> = {
  cancelled: { label: words.status.cancelled, icon: "x", tone: "muted" },
  placed: { label: words.status.placed, icon: "package", tone: "ink" },
  on_its_way: { label: words.status.onItsWay, icon: "delivery", tone: "ink" },
  delivered: { label: words.status.delivered, icon: "check", tone: "success" },
}

const ON_ITS_WAY = new Set(["fulfilled", "partially_shipped", "shipped"])
const DELIVERED = new Set(["delivered", "partially_delivered"])

/**
 * The status label (05, 9.3, `OrderStatus`):
 * - `status` canceled: "Cancelled";
 * - fulfilment fulfilled, partially shipped or shipped: "On its way";
 * - delivered or partially delivered: "Delivered";
 * - anything else (not fulfilled, partially fulfilled, or a state the
 *   specification doesn't name): "Order placed". No production stages
 *   are invented before factory status exists (after M4).
 */
export const orderStatus = (order: {
  status?: string | null
  fulfillment_status?: string | null
}): OrderStatusView => {
  const kind: OrderStatusKind =
    order.status === "canceled"
      ? "cancelled"
      : DELIVERED.has(order.fulfillment_status ?? "")
        ? "delivered"
        : ON_ITS_WAY.has(order.fulfillment_status ?? "")
          ? "on_its_way"
          : "placed"
  return { kind, ...STATUS[kind] }
}

/** The date line shows while the order is on its way to the customer: not once delivered or cancelled. */
export const showsDeliveryDate = (status: OrderStatusKind): boolean =>
  status === "placed" || status === "on_its_way"

/** "#1042", or null without a display number. */
export const orderNumber = (displayId: number | string | null | undefined): string | null =>
  displayId === null || displayId === undefined || displayId === "" ? null : `#${displayId}`

/** Thumbnails on a card: at most three, then "+2" (05, 9.3, row 3). */
export const MAX_THUMBNAILS = 3

export type OrderCardView = {
  id: string
  number: string | null
  /** The card link's accessible name: "Order #1042, placed 11 November 2026". */
  linkLabel: string
  /** "Placed on 11 November 2026 · 5 pieces · PKR 21,250". */
  meta: string[]
  status: OrderStatusView
  thumbnails: { src: string; alt: string }[]
  /** Lines not shown as thumbnails: "+2", or 0. */
  moreLines: number
  /** "YYYY-MM-DD", only when one is stored and the order isn't delivered or cancelled. */
  deliveryDate: string | null
}

type OrderLike = Pick<
  HttpTypes.StoreOrder,
  "id" | "display_id" | "created_at" | "total" | "currency_code" | "status"
> & {
  fulfillment_status?: string | null
  items?:
    | {
        thumbnail?: string | null
        quantity: number
        product_title?: string | null
        title?: string | null
        product?: { metadata?: Record<string, unknown> | null } | null
      }[]
    | null
}

/** One order as the order history shows it (05, 9.3). */
export const orderCardView = (order: OrderLike, promise: OrderPromise | null): OrderCardView => {
  const number = orderNumber(order.display_id)
  const placed = placedOnDate(order.created_at)
  const items = order.items ?? []
  // the rush line is a charge, not a garment: no picture of it (contract 9)
  const withPicture = withoutRush(items).filter((item) => !!item.thumbnail)
  const status = orderStatus(order)
  return {
    id: order.id,
    number,
    linkLabel: fill(words.card.linkLabel, { number: number ?? "", date: placed ?? "" }),
    meta: [
      placed ? fill(words.card.placedOn, { date: placed }) : null,
      countWords(pieceCount(items), words.card.pieces),
      money(order.total, order.currency_code),
    ].filter((part): part is string => !!part),
    status,
    thumbnails: withPicture.slice(0, MAX_THUMBNAILS).map((item) => ({
      src: item.thumbnail as string,
      alt: item.product_title || item.title || "",
    })),
    moreLines: Math.max(0, withPicture.length - MAX_THUMBNAILS),
    deliveryDate: promise && showsDeliveryDate(status.kind) ? promise.date : null,
  }
}

/** Orders per step of "Show more orders" (05, 9.3: 10, then more; never infinite scroll). */
export const ORDERS_PER_PAGE = 10
/** The most one page lists, however the URL is edited. */
export const MAX_ORDERS_SHOWN = 200

/**
 * How many orders the page lists, from `?shown=` (10, 20, 30…): a whole
 * multiple of 10 from 10 to MAX_ORDERS_SHOWN; anything else is 10.
 */
export const ordersShown = (param: unknown): number => {
  const value = typeof param === "string" && /^\d{1,4}$/.test(param) ? Number(param) : NaN
  if (!Number.isFinite(value) || value < ORDERS_PER_PAGE) return ORDERS_PER_PAGE
  const whole = Math.floor(value / ORDERS_PER_PAGE) * ORDERS_PER_PAGE
  return Math.min(whole, MAX_ORDERS_SHOWN)
}

/** The next `?shown=` for "Show more orders", or null when every order is listed. */
export const nextShown = (shown: number, count: number): number | null =>
  count > shown && shown < MAX_ORDERS_SHOWN ? Math.min(shown + ORDERS_PER_PAGE, MAX_ORDERS_SHOWN) : null

export type OrderPaymentState =
  /** Cash on delivery, not yet collected: "Pay PKR 21,250 in cash when your order arrives." (W-O6). */
  | "cod_due"
  /** Cash on delivery, collected (staff captured the payment): "Paid in cash on delivery.". */
  | "cod_paid"
  /** The placeholder payment (development). */
  | "test"
  | "other"

type PaymentsLike = {
  payment_status?: string | null
  payment_collections?: { payments?: { captured_at?: string | Date | null }[] | null }[] | null
}

/**
 * Whether the order is paid in full, from what the store API returns: the
 * order's `payment_status` "captured", or every payment captured. Staff
 * recording the cash as collected captures the payment (README, "Cash on
 * delivery collected").
 */
export const isPaid = (order: PaymentsLike): boolean => {
  if (order.payment_status === "captured") return true
  const payments = (order.payment_collections ?? []).flatMap((c) => c.payments ?? [])
  return payments.length > 0 && payments.every((p) => !!p.captured_at)
}

export type AccountOrderView = OrderConfirmationView & {
  status: OrderStatusView
  paymentState: OrderPaymentState
  /** The payment line under the date (05, 9.4, item 4): none for a cancelled order. */
  paymentLine: Exclude<OrderPaymentState, "other"> | null
  /** Null once delivered or cancelled, or when none was stored. */
  deliveryDate: string | null
}

/**
 * One order in the account (05, 9.4): the confirmation's blocks (lines,
 * totals, the delivery line with "Included" for export, the address, the
 * payment method) with the status, and the payment line as the order
 * stands now.
 */
export const accountOrderView = ({
  order,
  promise,
  countryName,
}: {
  order: HttpTypes.StoreOrder
  promise: OrderPromise | null
  countryName?: string | null
}): AccountOrderView => {
  const base = orderConfirmationView({ order, promise, countryName })
  const status = orderStatus(order)
  const paymentState: OrderPaymentState =
    base.payment === "cod"
      ? isPaid(order as PaymentsLike)
        ? "cod_paid"
        : "cod_due"
      : base.payment
  return {
    ...base,
    status,
    paymentState,
    paymentLine: status.kind === "cancelled" || paymentState === "other" ? null : paymentState,
    deliveryDate: showsDeliveryDate(status.kind) ? base.deliveryDate : null,
  }
}
