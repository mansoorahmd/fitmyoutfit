import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }))

vi.mock("@lib/data/cart", () => ({ addToCart: vi.fn() }))
vi.mock("next/navigation", () => ({
  useParams: () => ({ countryCode: "pk" }),
  usePathname: () => "/pk/products/jersey",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace }),
}))
// Not in view, so the mobile bar is shown alongside the main button
vi.mock("@lib/hooks/use-in-view", () => ({ useIntersection: () => false }))

import ProductActions from "@modules/products/components/product-actions"

const region = { id: "reg_pk", currency_code: "pkr" } as any

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
  ...over,
})

const jersey = (over: Record<string, unknown> = {}) =>
  ({
    id: "prod_jersey",
    title: "Jersey",
    options: [sizeOption],
    variants: ["S", "M", "L"].map((s) => sizeVariant(s, over)),
  }) as any

const mainButton = () => screen.getByTestId("add-product-button")
const mobileButton = () => screen.getByTestId("mobile-cart-button")

describe("product actions", () => {
  it("made-to-order multi-size product: Select a size (disabled), then Add to cart after a size is clicked", () => {
    render(<ProductActions product={jersey()} region={region} />)

    expect(mainButton()).toHaveTextContent("Select a size")
    expect(mainButton()).toBeDisabled()
    expect(mobileButton()).toHaveTextContent("Select a size")
    expect(mobileButton()).toBeDisabled()
    expect(screen.queryByText("Out of stock")).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "M" }))

    expect(mainButton()).toHaveTextContent("Add to cart")
    expect(mainButton()).toBeEnabled()
    expect(mobileButton()).toHaveTextContent("Add to cart")
    expect(mobileButton()).toBeEnabled()
  })

  it("records the chosen size in the URL without scrolling the page", () => {
    replace.mockClear()
    render(<ProductActions product={jersey()} region={region} />)

    fireEvent.click(screen.getByRole("button", { name: "M" }))

    expect(replace).toHaveBeenCalledWith(
      "/pk/products/jersey?v_id=var_M",
      { scroll: false }
    )
    for (const call of replace.mock.calls) {
      expect(call[1]).toEqual({ scroll: false })
    }
  })

  it("single-variant product shows Add to cart immediately", () => {
    const fitKit = {
      id: "prod_kit",
      title: "Fit kit",
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

    expect(mainButton()).toHaveTextContent("Add to cart")
    expect(mainButton()).toBeEnabled()
    expect(mobileButton()).toHaveTextContent("Add to cart")
    expect(mobileButton()).toBeEnabled()
  })

  it("managed inventory with zero stock shows Out of stock after selection", () => {
    render(
      <ProductActions
        product={jersey({ manage_inventory: true, inventory_quantity: 0 })}
        region={region}
      />
    )

    expect(mainButton()).toHaveTextContent("Select a size")

    fireEvent.click(screen.getByRole("button", { name: "L" }))

    expect(mainButton()).toHaveTextContent("Out of stock")
    expect(mainButton()).toBeDisabled()
    expect(mobileButton()).toHaveTextContent("Out of stock")
    expect(mobileButton()).toBeDisabled()
  })
})
