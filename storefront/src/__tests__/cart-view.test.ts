import { describe, expect, it } from "vitest"

import { addedPlacement, addedToCartView, showsSnackbar } from "@lib/util/added-to-cart"
import { cartPageView } from "@lib/util/cart-page"
import {
  amountFor,
  checkoutHref,
  deliveryRow,
  isFitKitLine,
  lineSize,
  newestFirst,
  pieceCount,
  totalIsBeforeDelivery,
} from "@lib/util/cart-view"
import { parseCheckoutRules } from "@lib/util/checkout-rules"
import { productMinimumLine } from "@lib/util/product-minimum"
import {
  clampQuantity,
  commitTypedQuantity,
  maxQuantityFor,
  readTypedQuantity,
  stepperButtons,
} from "@lib/util/quantity"

import {
  cartFixture,
  lineFixture,
  rulesFixture,
  shippingMethodsFixture,
  shippingOptionsFixture,
} from "./fixtures/m1"

const plain = (s: string | undefined | null) => s?.replace(/\s/g, " ")

describe("cart lines", () => {
  it("counts pieces, not lines", () => {
    expect(pieceCount([{ quantity: 4 }, { quantity: 1 }] as any)).toBe(5)
    expect(pieceCount(undefined)).toBe(0)
  })

  it("reads the size from the variant's options, its option values, or a size title", () => {
    expect(
      lineSize(lineFixture({ variant: { options: [{ value: "L", option: { title: "Size" } }] } }))
    ).toBe("L")
    expect(lineSize(lineFixture({ variant_title: "x", variant_option_values: { Size: "YS" } }))).toBe("YS")
    expect(lineSize(lineFixture({ variant_title: "2XL" }))).toBe("2XL")
  })

  it("has no size for a line whose variant is not a size (the fit kit)", () => {
    expect(lineSize(lineFixture({ variant_title: "Default variant" }))).toBeNull()
  })

  it("knows the fit kit by its kind", () => {
    expect(isFitKitLine(lineFixture({ product: { metadata: { kind: "fit_kit" } } }))).toBe(true)
    expect(isFitKitLine(lineFixture())).toBe(false)
  })

  it("puts the newest line first without changing the cart's array", () => {
    const items = [
      { id: "a", created_at: "2026-11-11T09:00:00Z" },
      { id: "b", created_at: "2026-11-11T10:00:00Z" },
    ]
    expect(newestFirst(items).map((i) => i.id)).toEqual(["b", "a"])
    expect(items[0].id).toBe("a")
  })

  it("works out amounts without floating point drift", () => {
    expect(amountFor(0.1, 3)).toBe(0.3)
    expect(amountFor(3500, 4)).toBe(14000)
  })
})

describe("deliveryRow", () => {
  it("is the backend's option name with 'Added at checkout' before one is chosen (Pakistan)", () => {
    const row = deliveryRow({ shippingOptions: [{ name: "Delivery in Pakistan" }] })
    expect(row).toEqual({ kind: "at_checkout", label: "Delivery in Pakistan" })
    expect(totalIsBeforeDelivery(row)).toBe(true)
  })

  it("shows the chosen option's amount (Pakistan, with its method set)", () => {
    const row = deliveryRow({
      shippingMethods: shippingMethodsFixture("pk"),
      shippingSubtotal: 250,
      shippingOptions: shippingOptionsFixture("pk"),
    })
    expect(row).toEqual({ kind: "amount", label: "Delivery in Pakistan", amount: 250 })
    expect(totalIsBeforeDelivery(row)).toBe(false)
  })

  it("shows the duty-paid option as included, never as a zero amount", () => {
    const fromData = deliveryRow({ shippingOptions: shippingOptionsFixture("us") })
    expect(fromData).toEqual({ kind: "included", label: "Shipping & duties included" })
    expect(totalIsBeforeDelivery(fromData)).toBe(false)
  })

  it("knows a chosen duty-paid method by its shipping option, as the real backend sends it", () => {
    // The method has no marker of its own: only its option carries `ddp: true`.
    const methods = shippingMethodsFixture("us")
    expect(methods[0]).not.toHaveProperty("data")
    const row = deliveryRow({
      shippingMethods: methods,
      shippingSubtotal: 0,
      shippingOptions: shippingOptionsFixture("us"),
    })
    expect(row).toEqual({ kind: "included", label: "Shipping & duties included" })
  })

  it("shows a chosen method's amount when its option is not duty-paid or isn't known", () => {
    const methods = shippingMethodsFixture("us")
    expect(
      deliveryRow({ shippingMethods: methods, shippingSubtotal: 0, shippingOptions: null })?.kind
    ).toBe("amount")
    expect(
      deliveryRow({
        shippingMethods: methods,
        shippingSubtotal: 0,
        shippingOptions: shippingOptionsFixture("pk"),
      })?.kind
    ).toBe("amount")
  })

  it("is left out when no option is known", () => {
    expect(deliveryRow({ shippingOptions: [] })).toBeNull()
    expect(deliveryRow({})).toBeNull()
  })
})

describe("checkoutHref", () => {
  it("goes to the address step until the address and email are saved", () => {
    expect(checkoutHref(cartFixture())).toBe("/checkout?step=address")
    expect(
      checkoutHref(cartFixture({ email: "a@b.c", shipping_address: { address_1: "1 St" } }))
    ).toBe("/checkout?step=delivery")
    expect(
      checkoutHref(
        cartFixture({
          email: "a@b.c",
          shipping_address: { address_1: "1 St" },
          shipping_methods: [{ id: "sm" }],
        })
      )
    ).toBe("/checkout?step=payment")
  })
})

describe("cartPageView", () => {
  const view = (over: Partial<Parameters<typeof cartPageView>[0]> = {}) =>
    cartPageView({
      cart: cartFixture(),
      rules: parseCheckoutRules(rulesFixture()),
      shippingOptions: [{ name: "Shipping & duties included", data: { ddp: true } }],
      countryCode: "gb",
      isGuest: true,
      ...over,
    })

  it("formats every amount with the currency code", () => {
    const v = view()
    expect(plain(v.itemSubtotal)).toBe("GBP 88.00")
    expect(plain(v.total)).toBe("GBP 88.00")
    expect(plain(v.lines[0].unitPrice)).toBe("GBP 22.00")
    expect(plain(v.lines[0].total)).toBe("GBP 88.00")
    expect(v.pieces).toBe(4)
  })

  it("takes the date, the minimum and the cash on delivery note from the rules", () => {
    const v = view()
    expect(v.deliveryDate).toBe("2026-11-26")
    expect(v.minimum).toMatchObject({ counted: 4, required: 10, reached: false })
    expect(v.codLimit).toBeNull()
    expect(v.rulesFailed).toBe(false)
    expect(v.exportRegion).toBe(true)
  })

  it("leaves the rules' pieces out when the rules failed (route missing or broken)", () => {
    const v = view({ rules: null })
    expect(v.rulesFailed).toBe(true)
    expect(v.deliveryDate).toBeNull()
    expect(v.minimum).toBeNull()
    expect(v.codLimit).toBeNull()
    // the cart itself still works
    expect(v.lines).toHaveLength(1)
    expect(v.checkoutHref).toBe("/checkout?step=address")
  })

  it("an export cart with the duty-paid method set says Included, not USD 0.00", () => {
    const v = view({
      countryCode: "us",
      cart: cartFixture({ currency_code: "usd", shipping_methods: shippingMethodsFixture("us") }),
      shippingOptions: shippingOptionsFixture("us"),
    })
    expect(v.delivery).toEqual({ kind: "included", label: "Shipping & duties included" })
    expect(v.deliveryAmount).toBeUndefined()
  })

  it("a Pakistan cart with its delivery set shows the amount, in a total that includes it", () => {
    const v = view({
      countryCode: "pk",
      cart: cartFixture({
        currency_code: "pkr",
        items: [lineFixture({ unit_price: 3500, total: 14000 })],
        item_subtotal: 14000,
        shipping_subtotal: 250,
        total: 14250,
        shipping_methods: shippingMethodsFixture("pk"),
      }),
      shippingOptions: shippingOptionsFixture("pk"),
    })
    expect(v.delivery).toEqual({ kind: "amount", label: "Delivery in Pakistan", amount: 250 })
    expect(plain(v.deliveryAmount)).toBe("PKR 250")
    expect(plain(v.total)).toBe("PKR 14,250")
    expect(totalIsBeforeDelivery(v.delivery)).toBe(false)
  })

  it("shows the tax note until the region's tax is final", () => {
    expect(view().showTaxNote).toBe(true)
    expect(
      view({ cart: cartFixture({ region: { metadata: { tax_final: true } } }) }).showTaxNote
    ).toBe(false)
  })

  it("gives the stepper the variant's stock as the maximum when it manages stock", () => {
    const cart = cartFixture({
      items: [
        lineFixture({
          variant: { manage_inventory: true, allow_backorder: false, inventory_quantity: 12 },
        }),
      ],
    })
    expect(view({ cart }).lines[0].maxQuantity).toBe(12)
    expect(view().lines[0].maxQuantity).toBe(999)
  })
})

describe("quantity rules", () => {
  it("reads typed numbers", () => {
    expect(readTypedQuantity("12")).toEqual({ kind: "valid", value: 12 })
    expect(readTypedQuantity("")).toEqual({ kind: "incomplete" })
    for (const text of ["0", "1000", "-1", "2.5", "abc"]) {
      expect(readTypedQuantity(text).kind).toBe("invalid")
    }
  })

  it("makes − inactive at 1 and + inactive at the maximum", () => {
    expect(stepperButtons(1)).toEqual({ canDecrease: false, canIncrease: true })
    expect(stepperButtons(999)).toEqual({ canDecrease: true, canIncrease: false })
    expect(stepperButtons(5, 1, 5).canIncrease).toBe(false)
  })

  it("takes a typed number only when it is valid, else puts back the number from before typing", () => {
    expect(commitTypedQuantity("12", 11)).toEqual({ value: 12, changed: true, rangeError: false })
    expect(commitTypedQuantity("11", 11)).toEqual({ value: 11, changed: false, rangeError: false })
    // "1000" passes through "100" while typing; on leaving, it is refused whole
    expect(commitTypedQuantity("1000", 11)).toEqual({ value: 11, changed: false, rangeError: true })
    for (const text of ["", "0", "-1", "2.5", "abc"]) {
      expect(commitTypedQuantity(text, 11)).toEqual({ value: 11, changed: false, rangeError: true })
    }
    expect(commitTypedQuantity("13", 11, 1, 12).rangeError).toBe(true)
  })

  it("clamps into range", () => {
    expect(clampQuantity(0)).toBe(1)
    expect(clampQuantity(5000)).toBe(999)
    expect(clampQuantity(NaN)).toBe(1)
  })

  it("caps at the stock only when the variant manages it without backorders", () => {
    expect(maxQuantityFor({ manage_inventory: false })).toBe(999)
    expect(maxQuantityFor({ manage_inventory: true, inventory_quantity: 3 })).toBe(3)
    expect(maxQuantityFor({ manage_inventory: true, allow_backorder: true, inventory_quantity: 3 })).toBe(999)
    expect(maxQuantityFor({ manage_inventory: true, inventory_quantity: 0 })).toBe(1)
    expect(maxQuantityFor(undefined)).toBe(999)
  })
})

describe("addedToCartView", () => {
  it("describes what was just added and the whole cart", () => {
    const cart = cartFixture({
      items: [lineFixture({ quantity: 6 }), lineFixture({ id: "b", variant_id: "var_S", quantity: 2 })],
      total: 176,
    })
    const view = addedToCartView({
      cart,
      variantId: "var_M",
      quantity: 4,
      rules: parseCheckoutRules(rulesFixture({ minimum_quantity: { required: 10, counted: 8, ok: false } })),
      key: "k",
    })
    expect(view).toMatchObject({ title: "Jersey", size: "M", quantity: 4, pieces: 8, counted: 8 })
    // the amount is for the 4 just added, not the line's 6
    expect(plain(view?.amount)).toBe("GBP 88.00")
    expect(plain(view?.total)).toBe("GBP 176.00")
    expect(view?.minimum).toMatchObject({ missing: 2 })
  })

  it("has no minimum and no count without rules", () => {
    const view = addedToCartView({ cart: cartFixture(), variantId: "var_M", quantity: 1, rules: null, key: "k" })
    expect(view?.minimum).toBeNull()
    expect(view?.counted).toBeNull()
  })

  it("is null when the cart doesn't hold the variant", () => {
    expect(
      addedToCartView({ cart: cartFixture(), variantId: "var_X", quantity: 1, rules: null, key: "k" })
    ).toBeNull()
  })

  it("goes in the header from 1024 px and inline below; the snackbar only after a sticky bar add", () => {
    expect(addedPlacement(true)).toBe("popover")
    expect(addedPlacement(false)).toBe("inline")
    expect(showsSnackbar("inline", "sticky-bar")).toBe(true)
    expect(showsSnackbar("inline", "main")).toBe(false)
    expect(showsSnackbar("popover", "sticky-bar")).toBe(false)
  })
})

describe("productMinimumLine", () => {
  const garment = { metadata: { kind: "garment" } }
  const gb = { metadata: { min_garment_quantity: 10 } }
  const line = (over: Partial<Parameters<typeof productMinimumLine>[0]> = {}) =>
    productMinimumLine({ show: true, countryCode: "gb", product: garment, region: gb, counted: null, ...over })

  it("shows the region's minimum on garments in export regions", () => {
    expect(line()).toEqual({ required: 10, counted: null })
  })

  it("adds the count when the cart already has garments", () => {
    expect(line({ counted: 4 })).toEqual({ required: 10, counted: 4 })
    expect(line({ counted: 0 })?.counted).toBeNull()
  })

  it("shows nothing behind the switch, in Pakistan, on the fit kit, or without a minimum", () => {
    expect(line({ show: false })).toBeNull()
    expect(line({ countryCode: "pk" })).toBeNull()
    expect(line({ product: { metadata: { kind: "fit_kit" } } })).toBeNull()
    expect(line({ region: { metadata: {} } })).toBeNull()
  })
})
