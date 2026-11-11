import fs from "node:fs"
import path from "node:path"
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({ useParams: () => ({ countryCode: "pk" }) }))

import { cartContent } from "@content/cart"
import { checkoutContent } from "@content/checkout"
import { orderContent } from "@content/order"
import { productContent } from "@content/product"
import CartLink, { cartLinkLabel } from "@modules/layout/components/cart-link"

const src = path.resolve(__dirname, "..")
const read = (file: string) => fs.readFileSync(path.join(src, file), "utf8")
const code = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "$1")

/** Every string in a content object, deeply. */
const strings = (value: unknown): string[] =>
  typeof value === "string"
    ? [value]
    : value && typeof value === "object"
      ? Object.values(value).flatMap(strings)
      : []

// The M1 components lay wording out; they never hold it.
const COMPONENTS = [
  "modules/cart/components/added-to-cart/index.tsx",
  "modules/cart/components/added-to-cart/snackbar.tsx",
  "modules/cart/components/cart-line/index.tsx",
  "modules/cart/components/cart-summary/index.tsx",
  "modules/cart/components/checkout-action/index.tsx",
  "modules/cart/components/empty-cart-message/index.tsx",
  "modules/cart/components/minimum-progress/index.tsx",
  "modules/cart/components/sticky-checkout-bar/index.tsx",
  "modules/cart/components/undo-toast/index.tsx",
  "modules/cart/components/undo-toast/provider.tsx",
  "modules/cart/templates/cart-view.tsx",
  "modules/common/components/delivery-date-line/index.tsx",
  "modules/common/components/quantity-stepper/index.tsx",
  "modules/common/components/sheet/index.tsx",
  "modules/layout/components/cart-link/index.tsx",
  "modules/layout/components/cart-panel/index.tsx",
  "modules/products/components/size-chart/index.tsx",
  "modules/products/components/size-chart/size-chart-table.tsx",
  "modules/products/components/size-chart/unit-switch.tsx",
  // S1-4: the checkout and the order confirmation
  "app/[countryCode]/(checkout)/layout.tsx",
  "app/[countryCode]/(checkout)/checkout/page.tsx",
  "app/[countryCode]/(main)/order/[id]/confirmed/page.tsx",
  "app/[countryCode]/(main)/order/[id]/confirmed/not-found.tsx",
  "modules/cart/components/move-cart-to-region/index.tsx",
  "modules/checkout/components/address-step/index.tsx",
  "modules/checkout/components/address-summary/index.tsx",
  "modules/checkout/components/delivery-block/index.tsx",
  "modules/checkout/components/order-check/index.tsx",
  "modules/checkout/components/order-summary/index.tsx",
  "modules/checkout/components/payment-choice/index.tsx",
  "modules/checkout/components/payment-step/index.tsx",
  "modules/checkout/components/summary-lines/index.tsx",
  "modules/checkout/templates/checkout-page/index.tsx",
  "modules/checkout/templates/checkout-skeleton/index.tsx",
  "modules/common/components/check-field/index.tsx",
  "modules/common/components/radio-card/index.tsx",
  "modules/common/components/text-field/index.tsx",
  "modules/order/templates/order-completed-template.tsx",
]

describe("M1 wording", () => {
  it("is marked as draft wording", () => {
    for (const file of ["content/cart.ts", "content/checkout.ts", "content/errors.ts", "content/order.ts"]) {
      expect(read(file).startsWith("// DRAFT WORDING."), file).toBe(true)
    }
  })

  it("uses the specification's draft sentences as written", () => {
    expect(cartContent.minimum.missing).toBe(
      "Add {missing} more to check out. Mix any sizes and garments."
    )
    expect(cartContent.summary.rulesFailed).toBe(
      "Some details couldn't load. Refresh the page to try again."
    )
    expect(cartContent.added.title).toBe("Added to your cart")
    expect(checkoutContent.delivery.deliveredBy).toBe("Delivered by {date}")
    expect(productContent.minimum.line).toBe(
      "Minimum order: {n} garment pieces. Mix sizes and garments."
    )
    expect(productContent.sizeChart.draftText).toBe(
      "These measurements may change before production. We'll update this chart when they're final."
    )
  })

  it("writes no number into a promise: minimums, limits and dates are placeholders", () => {
    for (const text of [
      ...strings(cartContent.minimum),
      ...strings(checkoutContent.delivery),
      cartContent.summary.codOverLimit,
      productContent.minimum.line,
    ]) {
      expect(text, text).not.toMatch(/\d/)
    }
  })

  it("keeps the minimum line on the product page off outside development", () => {
    expect(productContent.minimum.show).toBe(false) // vitest runs as "test"
    expect(read("content/product.ts")).toContain(
      'show: process.env.NODE_ENV === "development"'
    )
  })

  it("is not written into the components", () => {
    const sentences = [
      ...strings(cartContent),
      ...strings(checkoutContent),
      ...strings(orderContent),
      ...strings(productContent.sizeChart),
    ].filter((s) => s.length > 6 && !s.startsWith("/"))
    for (const file of COMPONENTS) {
      const source = code(file)
      for (const sentence of sentences) {
        expect(source.includes(`"${sentence}"`) || source.includes(`>${sentence}<`), `${file}: ${sentence}`).toBe(false)
      }
    }
  }, 30_000) // reads source files; slow on a busy disk
})

describe("the header's cart link", () => {
  it("names the count and hides the badge at 0", () => {
    expect(cartLinkLabel(0)).toBe("Cart, empty")
    expect(cartLinkLabel(1)).toBe("Cart, 1 item")
    expect(cartLinkLabel(5)).toBe("Cart, 5 items")

    const { unmount } = render(<CartLink count={0} />)
    expect(screen.getByRole("link", { name: "Cart, empty" })).toHaveAttribute("href", "/pk/cart")
    expect(screen.queryByTestId("nav-cart-count")).toBeNull()
    unmount()

    render(<CartLink count={5} />)
    expect(screen.getByTestId("nav-cart-count")).toHaveTextContent("5")
  })
})
