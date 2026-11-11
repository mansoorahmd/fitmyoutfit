import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { replace, addToCartAndConfirm } = vi.hoisted(() => ({
  replace: vi.fn(),
  addToCartAndConfirm: vi.fn(),
}))

vi.mock("@lib/data/cart", () => ({ addToCartAndConfirm }))
vi.mock("next/navigation", () => ({
  useParams: () => ({ countryCode: "pk" }),
  usePathname: () => "/pk/products/jersey",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace }),
}))

import ProductActions from "@modules/products/components/product-actions"

const region = { id: "reg_pk", currency_code: "pkr", metadata: { tax_final: false } } as any

const sizeOption = {
  id: "opt_size",
  title: "Size",
  values: ["S", "M", "L"].map((value) => ({ id: `v_${value}`, value })),
}

const sizeVariant = (size: string, over: Record<string, unknown> = {}) => ({
  id: `var_${size}`,
  title: size,
  manage_inventory: false,
  allow_backorder: false,
  options: [{ option_id: "opt_size", value: size }],
  calculated_price: {
    calculated_amount: 3500,
    original_amount: 3500,
    currency_code: "pkr",
    calculated_price: { price_list_type: null },
  },
  ...over,
})

const jersey = (over: Record<string, unknown> = {}) =>
  ({
    id: "prod_jersey",
    handle: "jersey",
    title: "Jersey",
    metadata: { kind: "garment" },
    options: [sizeOption],
    variants: ["S", "M", "L"].map((s) => sizeVariant(s, over)),
  }) as any

const mainButton = () => screen.getByTestId("add-product-button")
const barButton = () => screen.getByTestId("mobile-cart-button")
const sizeGroup = () => screen.getByRole("radiogroup", { name: "Size" })

beforeEach(() => {
  replace.mockClear()
  addToCartAndConfirm.mockReset()
  addToCartAndConfirm.mockResolvedValue({ ok: true, added: null })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("product actions", () => {
  it("shows an active red Add to cart before a size is chosen, never a disabled one", () => {
    render(<ProductActions product={jersey()} region={region} />)

    for (const button of [mainButton(), barButton()]) {
      expect(button).toHaveTextContent("Add to cart")
      expect(button).not.toHaveAttribute("aria-disabled")
    }
    expect(mainButton()).toHaveClass("bg-brand-primary", "w-full")
    expect(screen.queryByText("Select a size")).not.toBeInTheDocument()
    expect(screen.queryByText("Out of stock")).not.toBeInTheDocument()
    expect(screen.queryByTestId("option-error")).toBeNull()
  })

  it("pressing Add to cart with no size shows 'Choose a size' and moves focus to the sizes", () => {
    render(<ProductActions product={jersey()} region={region} />)

    fireEvent.click(mainButton())

    expect(addToCartAndConfirm).not.toHaveBeenCalled()
    const error = screen.getByTestId("option-error")
    expect(error).toHaveTextContent("Choose a size")
    expect(error).toHaveClass("text-brand-error")
    // an icon as well as the colour
    expect(error.querySelector("svg")).not.toBeNull()
    expect(sizeGroup()).toHaveFocus()
    expect(sizeGroup()).toHaveAttribute("aria-invalid", "true")
    expect(sizeGroup()).toHaveAccessibleDescription("Choose a size")
  })

  it("the message goes once a size is chosen, and the label row reads 'Size: M'", () => {
    render(<ProductActions product={jersey()} region={region} />)

    expect(screen.getByTestId("option-label")).toHaveTextContent(/^Size$/)
    fireEvent.click(mainButton())
    fireEvent.click(screen.getByRole("radio", { name: "M" }))

    expect(screen.queryByTestId("option-error")).toBeNull()
    expect(screen.getByTestId("option-label")).toHaveTextContent("Size: M")
  })

  it("with a size chosen, adds that size to the cart", async () => {
    render(<ProductActions product={jersey()} region={region} />)

    fireEvent.click(screen.getByRole("radio", { name: "M" }))
    await act(async () => {
      fireEvent.click(mainButton())
    })

    expect(addToCartAndConfirm).toHaveBeenCalledTimes(1)
    expect(addToCartAndConfirm).toHaveBeenCalledWith({
      variantId: "var_M",
      quantity: 1,
      countryCode: "pk",
    })
  })

  it("the sticky bar's button adds the chosen size too", async () => {
    render(<ProductActions product={jersey()} region={region} />)

    fireEvent.click(screen.getByRole("radio", { name: "L" }))
    await act(async () => {
      fireEvent.click(barButton())
    })

    expect(addToCartAndConfirm).toHaveBeenCalledWith({
      variantId: "var_L",
      quantity: 1,
      countryCode: "pk",
    })
  })

  it("the sticky bar's button with no size scrolls to the sizes and shows the same message", () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    render(<ProductActions product={jersey()} region={region} />)

    // the size group is far above the screen, as when the bar is showing
    const group = sizeGroup()
    vi.spyOn(group, "getBoundingClientRect").mockReturnValue({
      top: -900,
      bottom: -700,
    } as DOMRect)

    fireEvent.click(barButton())

    expect(addToCartAndConfirm).not.toHaveBeenCalled()
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView.mock.calls[0][0]).toMatchObject({ block: "center" })
    expect(screen.getByTestId("option-error")).toHaveTextContent("Choose a size")
    expect(group).toHaveFocus()
  })

  it("the main button does not scroll the page when the sizes are already on screen", () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    render(<ProductActions product={jersey()} region={region} />)

    fireEvent.click(mainButton())

    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it("the sticky bar shows the price, then the size and the price", () => {
    render(<ProductActions product={jersey()} region={region} />)
    const summary = () => screen.getByTestId("mobile-summary").textContent

    expect(summary()).toMatch(/^PKR\s3,500$/)
    fireEvent.click(screen.getByRole("radio", { name: "M" }))
    expect(summary()).toMatch(/^M · PKR\s3,500$/)
  })

  it("shows the price block: price, per piece and the tax note", () => {
    render(<ProductActions product={jersey()} region={region} />)

    const block = screen.getByTestId("price-block")
    expect(within(block).getByTestId("product-price").textContent).toMatch(/^PKR\s3,500$/)
    expect(block).toHaveTextContent("per piece")
    expect(within(block).getByTestId("tax-note")).toHaveTextContent("Tax not final")
    // Pakistan is not an export region
    expect(within(block).queryByTestId("export-note")).toBeNull()
  })

  it("records the chosen size in the URL without scrolling the page", () => {
    render(<ProductActions product={jersey()} region={region} />)

    fireEvent.click(screen.getByRole("radio", { name: "M" }))

    expect(replace).toHaveBeenCalledWith("/pk/products/jersey?v_id=var_M", {
      scroll: false,
    })
    for (const call of replace.mock.calls) {
      expect(call[1]).toEqual({ scroll: false })
    }
  })

  it("has a quantity stepper beside the main button, starting at 1, that sets how many to add", async () => {
    render(<ProductActions product={jersey()} region={region} />)

    const field = screen.getByTestId("quantity-input")
    expect(field).toHaveValue("1")
    expect(field).toHaveAttribute("inputmode", "numeric")
    expect(screen.getByTestId("quantity-decrease")).toHaveAttribute("aria-disabled", "true")

    fireEvent.click(screen.getByRole("radio", { name: "M" }))
    expect(field).toHaveAccessibleName("Quantity, Jersey, size M")
    fireEvent.click(screen.getByTestId("quantity-increase"))
    fireEvent.click(screen.getByTestId("quantity-increase"))
    fireEvent.click(screen.getByTestId("quantity-increase"))
    expect(field).toHaveValue("4")

    await act(async () => {
      fireEvent.click(mainButton())
    })
    expect(addToCartAndConfirm).toHaveBeenCalledWith({
      variantId: "var_M",
      quantity: 4,
      countryCode: "pk",
    })
  })

  it("the sticky bar adds the quantity above 1: 'M × 4 · PKR 14,000'", () => {
    render(<ProductActions product={jersey()} region={region} />)
    const summary = () =>
      screen.getByTestId("mobile-summary").textContent?.replace(/\s/g, " ")

    fireEvent.click(screen.getByRole("radio", { name: "M" }))
    fireEvent.change(screen.getByTestId("quantity-input"), { target: { value: "4" } })
    expect(summary()).toBe("M × 4 · PKR 14,000")
  })

  it("single-variant product shows Add to cart, no sizes, and adds at once", async () => {
    const fitKit = {
      id: "prod_kit",
      handle: "fit-kit",
      title: "Fit kit",
      metadata: { kind: "fit_kit" },
      options: [
        { id: "opt_kit", title: "Kit", values: [{ id: "v_k", value: "Default" }] },
      ],
      variants: [
        {
          id: "var_kit",
          manage_inventory: false,
          options: [{ option_id: "opt_kit", value: "Default" }],
        },
      ],
    } as any

    render(<ProductActions product={fitKit} region={region} />)

    expect(screen.queryByRole("radiogroup")).toBeNull()
    expect(mainButton()).toHaveTextContent("Add to cart")
    expect(mainButton()).not.toHaveAttribute("aria-disabled")
    expect(barButton()).not.toHaveAttribute("aria-disabled")
    await act(async () => {
      fireEvent.click(mainButton())
    })
    expect(addToCartAndConfirm).toHaveBeenCalledWith({
      variantId: "var_kit",
      quantity: 1,
      countryCode: "pk",
    })
  })

  it("managed inventory with zero stock shows Out of stock after selection", () => {
    render(
      <ProductActions
        product={jersey({ manage_inventory: true, inventory_quantity: 0 })}
        region={region}
      />
    )

    expect(mainButton()).toHaveTextContent("Add to cart")

    // out of stock, so the chip is marked unavailable but can still be chosen
    const large = screen.getByRole("radio", { name: "L, unavailable" })
    fireEvent.click(large)
    expect(large).toBeChecked()

    expect(mainButton()).toHaveTextContent("Out of stock")
    expect(mainButton()).toHaveAttribute("aria-disabled", "true")
    expect(barButton()).toHaveTextContent("Out of stock")
    expect(barButton()).toHaveAttribute("aria-disabled", "true")
    fireEvent.click(mainButton())
    expect(addToCartAndConfirm).not.toHaveBeenCalled()
  })
})
