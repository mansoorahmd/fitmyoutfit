import { describe, expect, it } from "vitest"

import {
  getAddToCartState,
  getUnavailableOptionValues,
  needsVariantSelection,
} from "@lib/util/add-to-cart-state"

const variant = (over: Record<string, unknown> = {}) =>
  ({ id: "var_m", manage_inventory: false, ...over }) as any

describe("getAddToCartState", () => {
  it("asks for a size when nothing is selected, without looking disabled", () => {
    expect(
      getAddToCartState({
        variant: undefined,
        isValidVariant: false,
        needsSelection: true,
      })
    ).toEqual({ label: "Add to cart", disabled: false, asksForSize: true })
  })

  it("allows a made-to-order variant (inventory not managed)", () => {
    expect(
      getAddToCartState({
        variant: variant({ manage_inventory: false }),
        isValidVariant: true,
        needsSelection: false,
      })
    ).toEqual({ label: "Add to cart", disabled: false, asksForSize: false })
  })

  it("allows a managed variant when backorder is allowed", () => {
    expect(
      getAddToCartState({
        variant: variant({
          manage_inventory: true,
          allow_backorder: true,
          inventory_quantity: 0,
        }),
        isValidVariant: true,
        needsSelection: false,
      })
    ).toEqual({ label: "Add to cart", disabled: false, asksForSize: false })
  })

  it("allows a managed variant with stock above zero", () => {
    expect(
      getAddToCartState({
        variant: variant({ manage_inventory: true, inventory_quantity: 3 }),
        isValidVariant: true,
        needsSelection: false,
      })
    ).toEqual({ label: "Add to cart", disabled: false, asksForSize: false })
  })

  it("says out of stock for a managed variant with zero stock and no backorder", () => {
    for (const inventory_quantity of [0, undefined]) {
      expect(
        getAddToCartState({
          variant: variant({
            manage_inventory: true,
            allow_backorder: false,
            inventory_quantity,
          }),
          isValidVariant: true,
          needsSelection: false,
        })
      ).toEqual({ label: "Out of stock", disabled: true, asksForSize: false })
    }
  })

  it("says out of stock when the selected options match no variant", () => {
    expect(
      getAddToCartState({
        variant: undefined,
        isValidVariant: false,
        needsSelection: false,
      })
    ).toEqual({ label: "Out of stock", disabled: true, asksForSize: false })
  })

  it("does not let a variant through when the selection is flagged invalid", () => {
    expect(
      getAddToCartState({
        variant: variant(),
        isValidVariant: false,
        needsSelection: false,
      })
    ).toEqual({ label: "Out of stock", disabled: true, asksForSize: false })
  })

  it("lets a single-variant product through with no selection needed", () => {
    expect(
      getAddToCartState({
        variant: variant(),
        isValidVariant: true,
        needsSelection: false,
      })
    ).toEqual({ label: "Add to cart", disabled: false, asksForSize: false })
  })
})

describe("needsVariantSelection", () => {
  const sizeOption = { id: "opt_size", title: "Size" } as any
  const colorOption = { id: "opt_color", title: "Color" } as any
  const two = [{ id: "a" }, { id: "b" }] as any

  it("is false for a single-variant product", () => {
    expect(
      needsVariantSelection({ variants: [{ id: "a" }] as any, options: [sizeOption] }, {})
    ).toBe(false)
  })

  it("is true while an option has no value", () => {
    expect(needsVariantSelection({ variants: two, options: [sizeOption] }, {})).toBe(true)
    expect(
      needsVariantSelection(
        { variants: two, options: [sizeOption, colorOption] },
        { opt_size: "M" }
      )
    ).toBe(true)
  })

  it("is false once every option has a value", () => {
    expect(
      needsVariantSelection({ variants: two, options: [sizeOption] }, { opt_size: "M" })
    ).toBe(false)
  })
})

describe("getUnavailableOptionValues", () => {
  const sizeOption = {
    id: "opt_size",
    title: "Size",
    values: ["S", "M", "L"].map((value) => ({ id: `v_${value}`, value })),
  } as any
  const sized = (size: string, over: Record<string, unknown> = {}) =>
    ({
      id: `var_${size}`,
      manage_inventory: false,
      options: [{ option_id: "opt_size", value: size }],
      ...over,
    }) as any

  it("marks nothing when every size is made to order", () => {
    expect(
      getUnavailableOptionValues({
        options: [sizeOption],
        variants: ["S", "M", "L"].map((s) => sized(s)),
      })
    ).toEqual([])
  })

  it("marks a size that is out of stock or has no variant", () => {
    expect(
      getUnavailableOptionValues({
        options: [sizeOption],
        variants: [
          sized("S"),
          sized("M", { manage_inventory: true, inventory_quantity: 0 }),
        ],
      })
    ).toEqual(["M", "L"])
  })

  it("marks nothing when the product has several options", () => {
    expect(
      getUnavailableOptionValues({
        options: [sizeOption, { id: "opt_colour", title: "Colour", values: [] }],
        variants: [],
      } as any)
    ).toEqual([])
  })
})
