import { describe, expect, it } from "vitest"

import { parseCheckoutRules } from "@lib/util/checkout-rules"
import {
  cartInOtherRegion,
  checkoutView,
  linesShownFirst,
  openStep,
} from "@lib/util/checkout-view"
import {
  orderConfirmationView,
  orderDeliveryRow,
  orderPaymentKind,
  parseOrderPromise,
  placedOnDate,
} from "@lib/util/order-confirmation"

import {
  checkoutCartGb,
  checkoutCartPk,
  optionGb,
  optionPk,
  orderGb,
  orderPk,
  orderPromisePk,
  providersGb,
  providersPk,
  rulesGb10,
  rulesGb9,
  rulesPkAvailable,
} from "./fixtures/m1-checkout"

const plain = (s: string | null | undefined) => s?.replace(/\s/g, " ")

const pk = (over: Partial<Parameters<typeof checkoutView>[0]> = {}) =>
  checkoutView({
    cart: checkoutCartPk(),
    rules: parseCheckoutRules(rulesPkAvailable),
    shippingOptions: [optionPk],
    providerIds: providersPk,
    customer: null,
    countryCode: "pk",
    ...over,
  })

const gb = (over: Partial<Parameters<typeof checkoutView>[0]> = {}) =>
  checkoutView({
    cart: checkoutCartGb(),
    rules: parseCheckoutRules(rulesGb10),
    shippingOptions: [optionGb],
    providerIds: providersGb,
    customer: null,
    countryCode: "gb",
    ...over,
  })

describe("openStep", () => {
  it("opens step 2 only when asked and step 1 is done", () => {
    expect(openStep("payment", true)).toBe("payment")
    expect(openStep("payment", false)).toBe("address")
    expect(openStep("address", true)).toBe("address")
    expect(openStep(null, true)).toBe("address")
    expect(openStep("delivery", true)).toBe("address")
  })
})

describe("checkoutView", () => {
  it("Pakistan: the delivery line with its amount, the total with it, the date, both payments", () => {
    const view = pk()
    expect(view.summary.delivery).toEqual({ kind: "amount", label: "Delivery in Pakistan", amount: 250 })
    expect(plain(view.summary.deliveryAmount)).toBe("PKR 250")
    expect(plain(view.summary.total)).toBe("PKR 2,250")
    expect(view.summary.deliveryDate).toBe("2026-11-27")
    expect(view.summary.showTaxNote).toBe(true)
    expect(view.payment.options.map((o) => o.kind)).toEqual(["test", "cod"])
    expect(view.payment.sessionProviderId).toBe("pp_cod_cod")
    expect(view.address.done).toBe(true)
    expect(view.address.summary?.lines).toEqual(["محمد علی", "House 1, Street 2", "Block C", "Lahore", "Punjab", "Pakistan"])
    expect(view.deliveryReady).toBe(true)
    expect(view.minimum).toBeNull()
    expect(view.minimumBlocks).toBe(false)
  })

  it("United Kingdom: the duty-paid line is 'Included', no cash on delivery", () => {
    const view = gb()
    expect(view.summary.delivery).toEqual({ kind: "included", label: "Shipping & duties included" })
    expect(view.summary.deliveryAmount).toBeUndefined()
    expect(view.payment.options.map((o) => o.kind)).toEqual(["test"])
    expect(view.minimum?.reached).toBe(true)
    expect(view.minimumBlocks).toBe(false)
  })

  it("United Kingdom below the minimum: it blocks", () => {
    const view = gb({ rules: parseCheckoutRules(rulesGb9) })
    expect(view.minimumBlocks).toBe(true)
    expect(view.minimum).toMatchObject({ required: 10, counted: 9, missing: 1 })
  })

  it("rules failed: no date, no minimum, and the cart still works", () => {
    const view = gb({ rules: null })
    expect(view.summary.rulesFailed).toBe(true)
    expect(view.summary.deliveryDate).toBeNull()
    expect(view.minimumBlocks).toBe(false)
  })

  it("no delivery method on the cart: not ready (step 2 shows W-K14)", () => {
    expect(pk({ cart: checkoutCartPk({ shipping_methods: [] }) }).deliveryReady).toBe(false)
  })

  it("offers a signed-in customer's default saved address first, and fills the form with it", () => {
    const customer = {
      email: "member@example.com",
      addresses: [
        { id: "a1", country_code: "pk", first_name: "Ali", address_1: "1 Mall Road", city: "Lahore", province: "pk-pb", phone: "0300 1111111", is_default_shipping: false },
        { id: "a2", country_code: "pk", first_name: "Ali", address_1: "2 Canal Road", city: "Lahore", province: "pk-pb", phone: "0300 2222222", is_default_shipping: true },
        { id: "a3", country_code: "gb", first_name: "Ali", address_1: "1 High Street", city: "London", is_default_shipping: false },
      ],
    } as any
    const view = pk({
      cart: checkoutCartPk({ email: null, shipping_address: null, billing_address: null, shipping_methods: [] }),
      customer,
    })
    expect(view.address.signedIn).toBe(true)
    expect(view.address.saved.map((a) => a.id)).toEqual(["a2", "a1"])
    expect(view.address.savedSelected).toBe("a2")
    expect(view.address.initial.shipping.address_1).toBe("2 Canal Road")
    expect(view.address.initial.phone).toBe("0300 2222222")
    expect(view.address.initial.email).toBe("member@example.com")
  })

  it("lists the lines with size, quantity and amount", () => {
    expect(gb().lines.map((l) => ({ ...l, total: plain(l.total) }))).toEqual([
      { id: "cali_gb", title: "Jersey", size: "M", quantity: 10, total: "GBP 220.00", thumbnail: null },
    ])
  })
})

describe("linesShownFirst", () => {
  it("shows all up to 6, else the first 5", () => {
    expect(linesShownFirst(6)).toBe(6)
    expect(linesShownFirst(7)).toBe(5)
    expect(linesShownFirst(9)).toBe(5)
  })
})

describe("cartInOtherRegion", () => {
  it("only when both are known and differ", () => {
    expect(cartInOtherRegion({ region_id: "reg_gb" }, "reg_pk")).toBe(true)
    expect(cartInOtherRegion({ region_id: "reg_pk" }, "reg_pk")).toBe(false)
    expect(cartInOtherRegion({ region_id: "reg_pk" }, undefined)).toBe(false)
    expect(cartInOtherRegion(null, "reg_pk")).toBe(false)
  })
})

describe("the order confirmation's data (05, 7)", () => {
  it("reads the promised date from the backend's route, and nothing from a null or broken answer", () => {
    expect(parseOrderPromise(orderPromisePk)).toEqual({
      date: "2026-11-27",
      days: 15,
      based_on: "2026-11-12",
      applies: "standard",
    })
    expect(parseOrderPromise({ delivery_promise: null })).toBeNull()
    expect(parseOrderPromise({ delivery_promise: { date: "27/11/2026" } })).toBeNull()
    expect(parseOrderPromise(null)).toBeNull()
  })

  it("gives the day it was placed in Lahore's time zone", () => {
    // 19:03 UTC on 11 Nov is past midnight on 12 Nov in Lahore
    expect(placedOnDate("2026-11-11T19:03:36.246Z")).toBe("12 November 2026")
    expect(placedOnDate("2026-11-11T10:00:00.000Z")).toBe("11 November 2026")
    expect(placedOnDate(null)).toBeNull()
  })

  it("tells the payment method from the payments", () => {
    expect(orderPaymentKind(orderPk.payment_collections)).toBe("cod")
    expect(orderPaymentKind(orderGb.payment_collections)).toBe("test")
    expect(orderPaymentKind([])).toBe("other")
  })

  it("delivery: the amount in Pakistan, 'Included' for the duty-paid export line", () => {
    expect(
      orderDeliveryRow({ methods: orderPk.shipping_methods, shippingTotal: 250, currencyCode: "pkr", countryCode: "pk" })
    ).toMatchObject({ kind: "amount", label: "Delivery in Pakistan" })
    expect(
      orderDeliveryRow({ methods: orderGb.shipping_methods, shippingTotal: 0, currencyCode: "gbp", countryCode: "gb" })
    ).toEqual({ kind: "included", label: "Shipping & duties included" })
  })

  it("builds the page's view for Pakistan, cash on delivery", () => {
    const view = orderConfirmationView({ order: orderPk, promise: parseOrderPromise(orderPromisePk), countryName: "Pakistan" })
    expect(view.orderNumber).toBe("#1")
    expect(view.firstName).toBe("محمد علی")
    expect(view.deliveryDate).toBe("2026-11-27")
    expect(view.payment).toBe("cod")
    expect(plain(view.total)).toBe("PKR 2,250")
    expect(plain(view.itemSubtotal)).toBe("PKR 2,000")
    expect(view.addressLines).toEqual(["محمد علی", "House 1, Street 2", "Block C", "Lahore", "Punjab", "Pakistan"])
    expect(view.phone).toBe("0300 1234567")
  })

  it("leaves the date out when the order kept none", () => {
    expect(orderConfirmationView({ order: orderGb, promise: null }).deliveryDate).toBeNull()
  })
})
