import { render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("@lib/data/products", () => ({ listProducts: vi.fn() }))

vi.mock("@modules/common/components/localized-client-link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string
    children?: React.ReactNode
  }) => (
    <a href={`/pk${href}`} {...props}>
      {children}
    </a>
  ),
}))

import OptionSelect from "@modules/products/components/product-actions/option-select"
import ProductPreview from "@modules/products/components/product-preview"

const region = { id: "reg_pk", currency_code: "pkr" } as any

function productWithPrice(currency_code: string, amount: number) {
  return {
    id: "prod_jersey",
    title: "Jersey",
    handle: "jersey",
    thumbnail: null,
    images: [],
    variants: [
      {
        id: "var_m",
        calculated_price: {
          calculated_amount: amount,
          original_amount: amount,
          currency_code,
          calculated_price: { price_list_type: null },
        },
      },
    ],
  } as any
}

describe("ProductPreview (product card)", () => {
  it("renders the title and the region price from the backend's calculated price", async () => {
    render(
      await ProductPreview({
        product: productWithPrice("pkr", 3500),
        region,
      })
    )

    expect(screen.getByTestId("product-title")).toHaveTextContent("Jersey")
    expect(screen.getByTestId("price").textContent?.replace(/\s/g, " ")).toBe(
      "PKR 3,500"
    )
    expect(screen.getByRole("link")).toHaveAttribute(
      "href",
      "/pk/products/jersey"
    )
  })

  it.each([
    ["gbp", 22, "£22.00"],
    ["aed", 95, "AED 95.00"],
    ["usd", 28, "$28.00"],
  ])("shows %s prices in that currency", async (currency, amount, expected) => {
    render(
      await ProductPreview({
        product: productWithPrice(currency, amount),
        region,
      })
    )

    expect(screen.getByTestId("price").textContent?.replace(/\s/g, " ")).toBe(
      expected
    )
  })

  it("shows the lowest variant price on the card", async () => {
    const product = productWithPrice("usd", 28)
    product.variants.push({
      id: "var_xl",
      calculated_price: {
        calculated_amount: 20,
        original_amount: 20,
        currency_code: "usd",
        calculated_price: { price_list_type: null },
      },
    })

    render(await ProductPreview({ product, region }))

    expect(screen.getByTestId("price")).toHaveTextContent("$20.00")
  })
})

describe("OptionSelect (size options on the product page)", () => {
  it("lists the Size values in the order the backend returned them", () => {
    const sizes = [
      "YS",
      "YM",
      "YL",
      "YXL",
      "XS",
      "S",
      "M",
      "L",
      "XL",
      "2XL",
      "3XL",
    ]
    const option = {
      id: "opt_size",
      title: "Size",
      values: sizes.map((value, i) => ({ id: `v${i}`, value })),
    } as any

    render(
      <OptionSelect
        option={option}
        current={undefined}
        updateOption={() => {}}
        title="Size"
        disabled={false}
        data-testid="product-options"
      />
    )

    const buttons = within(screen.getByTestId("product-options")).getAllByRole(
      "button"
    )
    expect(buttons.map((b) => b.textContent)).toEqual(sizes)
  })
})
