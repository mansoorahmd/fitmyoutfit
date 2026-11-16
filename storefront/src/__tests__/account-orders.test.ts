import { describe, expect, it } from "vitest"

import {
  MAX_ORDERS_SHOWN,
  accountOrderView,
  isPaid,
  nextShown,
  orderCardView,
  orderNumber,
  orderStatus,
  ordersShown,
} from "@lib/util/account-orders"
import { parseOrderPromise } from "@lib/util/order-confirmation"

import {
  orderGbAccount,
  orderListDefaultMetadata,
  orderListPk,
  orderPkCollected,
  orderPkDue,
  promisePk,
} from "./fixtures/account"

const promise = parseOrderPromise(promisePk)
/** Amounts use a no-break space between the code and the number. */
const plain = (s: string) => s.replace(/\s/g, " ")

describe("orderStatus (05, 9.3, OrderStatus)", () => {
  it("maps Medusa's states to the four labels, each with an icon", () => {
    const cases: [Record<string, string>, string, string][] = [
      [{ status: "canceled", fulfillment_status: "not_fulfilled" }, "Cancelled", "x"],
      [{ status: "canceled", fulfillment_status: "delivered" }, "Cancelled", "x"],
      [{ status: "pending", fulfillment_status: "not_fulfilled" }, "Order placed", "package"],
      [{ status: "pending", fulfillment_status: "partially_fulfilled" }, "Order placed", "package"],
      [{ status: "pending", fulfillment_status: "fulfilled" }, "On its way", "delivery"],
      [{ status: "pending", fulfillment_status: "partially_shipped" }, "On its way", "delivery"],
      [{ status: "completed", fulfillment_status: "shipped" }, "On its way", "delivery"],
      [{ status: "completed", fulfillment_status: "delivered" }, "Delivered", "check"],
      [{ status: "completed", fulfillment_status: "partially_delivered" }, "Delivered", "check"],
      [{ status: "pending", fulfillment_status: "something_new" }, "Order placed", "package"],
    ]
    for (const [order, label, icon] of cases) {
      const s = orderStatus(order)
      expect([s.label, s.icon], JSON.stringify(order)).toEqual([label, icon])
    }
  })

  it("never relies on colour alone: every status has words and an icon", () => {
    for (const fulfillment_status of ["not_fulfilled", "shipped", "delivered"]) {
      const s = orderStatus({ status: "pending", fulfillment_status })
      expect(s.label.length).toBeGreaterThan(0)
      expect(s.icon).toBeTruthy()
    }
  })
})

describe("orderCardView (05, 9.3), from the real list answer", () => {
  const card = orderCardView(orderListPk.orders[0], promise)

  it("has the number, the accessible name, and date · pieces · total with the currency code", () => {
    expect(card.number).toBe("#1")
    expect(card.linkLabel).toBe("Order #1, placed 12 November 2026")
    expect(card.meta.map(plain)).toEqual(["Placed on 12 November 2026", "1 piece", "PKR 2,250"])
    expect(card.status.label).toBe("Order placed")
  })

  it("shows up to 3 thumbnails, then the count of the rest", () => {
    expect(card.thumbnails).toHaveLength(1)
    expect(card.moreLines).toBe(0)
    const many = { ...orderListPk.orders[0], items: Array.from({ length: 5 }, (_, i) => ({ ...orderListPk.orders[0].items[0], id: `l${i}` })) }
    const view = orderCardView(many, null)
    expect(view.thumbnails).toHaveLength(3)
    expect(view.moreLines).toBe(2)
    expect(view.meta[1]).toBe("5 pieces")
  })

  it("shows the promised date only from the promise route, and only while not delivered", () => {
    expect(card.deliveryDate).toBe("2026-11-27")
    expect(orderCardView(orderListPk.orders[0], null).deliveryDate).toBeNull()
    expect(orderCardView({ ...orderListPk.orders[0], fulfillment_status: "delivered" }, promise).deliveryDate).toBeNull()
    expect(orderCardView({ ...orderListPk.orders[0], status: "canceled" }, promise).deliveryDate).toBeNull()
  })

  it("never reads the order's metadata, even when the list returns it", () => {
    const withMetadata = {
      ...orderListPk.orders[0],
      metadata: { ...orderListDefaultMetadata, cod_slip_reference: "TCS-12345", cod_collected_by: "user_1" },
    }
    const view = orderCardView(withMetadata, null)
    expect(view.deliveryDate).toBeNull()
    expect(JSON.stringify(view)).not.toMatch(/TCS-12345|user_1|cod_/)
  })
})

describe("paging (05, 9.3: 10, then Show more orders)", () => {
  it("reads ?shown= as a multiple of 10 between 10 and the most", () => {
    expect(ordersShown(undefined)).toBe(10)
    expect(ordersShown("")).toBe(10)
    expect(ordersShown("20")).toBe(20)
    expect(ordersShown("25")).toBe(20)
    expect(ordersShown("5")).toBe(10)
    expect(ordersShown("-10")).toBe(10)
    expect(ordersShown("abc")).toBe(10)
    expect(ordersShown("99999")).toBe(10)
    expect(ordersShown("5000")).toBe(MAX_ORDERS_SHOWN)
  })

  it("offers more only while there are more", () => {
    expect(nextShown(10, 3)).toBeNull()
    expect(nextShown(10, 10)).toBeNull()
    expect(nextShown(10, 11)).toBe(20)
    expect(nextShown(20, 45)).toBe(30)
    expect(nextShown(MAX_ORDERS_SHOWN, 500)).toBeNull()
  })
})

describe("accountOrderView (05, 9.4)", () => {
  it("cash on delivery, not yet collected: the amount to pay on delivery", () => {
    const view = accountOrderView({ order: orderPkDue, promise, countryName: "Pakistan" })
    expect(view.paymentState).toBe("cod_due")
    expect(view.paymentLine).toBe("cod_due")
    expect(plain(view.total)).toBe("PKR 2,250")
    expect(view.deliveryDate).toBe("2026-11-27")
    expect(view.delivery && "amount" in view.delivery && plain(view.delivery.amount)).toBe("PKR 250")
  })

  it("cash on delivery, collected (the store API says captured): paid", () => {
    expect(isPaid(orderPkCollected)).toBe(true)
    expect(isPaid(orderPkDue)).toBe(false)
    // the order's own status is enough, even without the payments
    expect(isPaid({ payment_status: "captured" })).toBe(true)
    expect(isPaid({ payment_status: "authorized", payment_collections: [{ payments: [{ captured_at: "2026-11-11" }] }] })).toBe(true)
    expect(isPaid({ payment_status: "authorized", payment_collections: [] })).toBe(false)
    expect(accountOrderView({ order: orderPkCollected, promise }).paymentLine).toBe("cod_paid")
  })

  it("export: GBP and the duty-paid line as Included", () => {
    const view = accountOrderView({ order: orderGbAccount, promise, countryName: "United Kingdom" })
    expect(plain(view.total)).toBe("GBP 220.00")
    expect(view.delivery).toEqual({ kind: "included", label: "Shipping & duties included" })
    expect(view.paymentLine).toBe("test")
    expect(view.pieces).toBe(10)
  })

  it("no date line without a stored promise, once delivered, or when cancelled; no pay line when cancelled", () => {
    expect(accountOrderView({ order: orderPkDue, promise: null }).deliveryDate).toBeNull()
    expect(accountOrderView({ order: { ...orderPkDue, fulfillment_status: "delivered" }, promise }).deliveryDate).toBeNull()
    const cancelled = accountOrderView({ order: { ...orderPkDue, status: "canceled" }, promise })
    expect(cancelled.deliveryDate).toBeNull()
    expect(cancelled.paymentLine).toBeNull()
    expect(cancelled.status.label).toBe("Cancelled")
  })

  it("numbers orders as #1042", () => {
    expect(orderNumber(1042)).toBe("#1042")
    expect(orderNumber(null)).toBeNull()
  })
})
