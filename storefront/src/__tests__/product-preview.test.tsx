import { render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("@lib/data/products", () => ({ listProducts: vi.fn() }))
vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    className,
    "data-testid": testId,
  }: {
    src: string
    alt: string
    className?: string
    "data-testid"?: string
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={className} data-testid={testId} />
  ),
}))

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

import fs from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import postcss from "postcss"

import OptionSelect from "@modules/products/components/product-actions/option-select"
import ProductPreview from "@modules/products/components/product-preview"
import SkeletonProductPreview from "@modules/skeletons/components/skeleton-product-preview"

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
    ["gbp", 22, "GBP 22.00"],
    ["aed", 95, "AED 95.00"],
    ["usd", 28, "USD 28.00"],
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

    expect(screen.getByTestId("price")).toHaveTextContent("USD 20.00")
  })
})

describe("product card look and behaviour", () => {
  const withImages = (thumbnail: string | null, urls: string[]) => ({
    ...productWithPrice("pkr", 3500),
    thumbnail,
    images: urls.map((url, i) => ({ id: `img_${i}`, url })),
  })

  it("shows the price as 'from PKR 3,500 per piece'", async () => {
    render(await ProductPreview({ product: productWithPrice("pkr", 3500), region }))

    expect(
      screen.getByTestId("product-card-price").textContent?.replace(/\s/g, " ")
    ).toBe("from PKR 3,500 per piece")
  })

  it("is one link, with the name as an h3 by default or the level asked for", async () => {
    const { unmount } = render(
      await ProductPreview({ product: productWithPrice("pkr", 3500), region })
    )
    expect(screen.getAllByRole("link")).toHaveLength(1)
    expect(screen.getByRole("heading", { level: 3, name: "Jersey" })).toBeInTheDocument()
    unmount()

    render(
      await ProductPreview({
        product: productWithPrice("pkr", 3500),
        region,
        headingLevel: 2,
      })
    )
    expect(screen.getByRole("heading", { level: 2, name: "Jersey" })).toBeInTheDocument()
  })

  it("shows the whole garment at 4:5 on surface-alt (contain, never cropped)", async () => {
    render(
      await ProductPreview({ product: withImages("front.png", ["front.png"]), region })
    )

    const box = screen.getByTestId("product-card-image")
    expect(box.className.split(/\s+/)).toEqual(
      expect.arrayContaining(["aspect-[4/5]", "bg-brand-surface-alt"])
    )
    const images = box.querySelectorAll("img")
    expect(images).toHaveLength(1)
    expect(images[0].className).toContain("object-contain")
    expect(images[0].className).not.toContain("object-cover")
    // decorative: the heading names the card
    expect(images[0]).toHaveAttribute("alt", "")
  })

  it("swaps to the second image on hover, with a pointer only", async () => {
    render(
      await ProductPreview({
        product: withImages("front.png", ["front.png", "back.png"]),
        region,
      })
    )

    const hover = screen.getByTestId("product-card-hover-image")
    expect(hover).toHaveAttribute("src", "back.png")
    expect(hover.className.split(/\s+/)).toEqual(
      expect.arrayContaining([
        "hidden",
        "opacity-0",
        "[@media(hover:hover)]:block",
        "[@media(hover:hover)]:group-hover:opacity-100",
      ])
    )
  })

  it("has no hover image when there is only one photo", async () => {
    render(await ProductPreview({ product: withImages("front.png", ["front.png"]), region }))

    expect(screen.queryByTestId("product-card-hover-image")).not.toBeInTheDocument()
  })

  it("shows a garment outline when there is no image", async () => {
    render(await ProductPreview({ product: withImages(null, []), region }))

    expect(screen.queryByRole("img")).not.toBeInTheDocument()
    expect(screen.getByTestId("garment-outline")).toBeInTheDocument()
  })

  it("shows no sale badge or struck-through price", async () => {
    const product = productWithPrice("pkr", 3000)
    product.variants[0].calculated_price.original_amount = 3500
    product.variants[0].calculated_price.calculated_price.price_list_type = "sale"
    const { container } = render(await ProductPreview({ product, region }))

    expect(screen.queryByTestId("original-price")).not.toBeInTheDocument()
    expect(container.innerHTML).not.toMatch(/line-through|badge|sale/i)
  })

  it("has a skeleton with the same frame and the 4:5 box", async () => {
    render(<SkeletonProductPreview />)
    const skeleton = screen.getByTestId("product-card-skeleton")
    render(await ProductPreview({ product: productWithPrice("pkr", 3500), region }))
    const card = screen.getByTestId("product-wrapper")

    for (const cls of ["rounded-card", "border", "border-brand-border-strong"]) {
      expect(skeleton.className).toContain(cls)
      expect(card.className).toContain(cls)
    }
    expect(skeleton.firstElementChild?.className).toContain("aspect-[4/5]")
    expect(skeleton).toHaveAttribute("aria-hidden", "true")
  })
})

describe("product card CSS (compiled with the store's Tailwind config)", () => {
  const require = createRequire(import.meta.url)
  const storefrontDir = path.resolve(__dirname, "..", "..")

  it("swaps the image only inside a hover-capable media query", async () => {
    const tailwindcss = require("tailwindcss")
    const config = require(path.join(storefrontDir, "tailwind.config.js"))
    const source = fs.readFileSync(
      path.join(storefrontDir, "src/modules/products/components/product-preview/index.tsx"),
      "utf8"
    )
    const result = await postcss([
      tailwindcss({ ...config, content: [{ raw: source }] }),
    ]).process("@tailwind utilities;", { from: undefined })

    // The rules inside the one @media (hover:hover) block Tailwind emits.
    const css = result.css.replace(/\s+/g, " ")
    const at = css.indexOf("@media(hover:hover)")
    expect(at).toBeGreaterThan(-1)
    const media = css.slice(at)
    expect(media).toContain(String.raw`group-hover\:opacity-100 { opacity: 1 }`)
    expect(media).toContain(".group:hover")
    expect(media).toContain(String.raw`\:block { display: block }`)
    // and outside it the hover image starts hidden
    expect(css.slice(0, at)).toContain(".hidden { display: none }")
  }, 30_000)
})

describe("OptionSelect (size options on the product page)", () => {
  // S0-14: sizes are shown Youth then Adult, each in size order (see
  // lib/util/sizes.ts). For the seeded jersey that is the backend's order.
  it("lists every Size value, Youth then Adult, as radios", () => {
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

    const radios = within(screen.getByTestId("product-options")).getAllByRole(
      "radio"
    )
    expect(radios.map((r) => (r as HTMLInputElement).value)).toEqual(sizes)
  })
})
