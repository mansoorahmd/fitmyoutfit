import { render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

vi.mock("@lib/data/cart", () => ({ addToCart: vi.fn() }))
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useParams: () => ({ countryCode: "pk" }),
  usePathname: () => "/pk/products/jersey",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn() }),
}))
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}))
// The localized link reads the country from the URL; a plain link is enough here.
vi.mock("@modules/common/components/localized-client-link", () => ({
  default: ({ href, children, ...rest }: any) => (
    <a href={`/pk${href}`} {...rest}>
      {children}
    </a>
  ),
}))
// Server components that fetch: replaced by what they would render.
vi.mock("@modules/products/templates/product-actions-wrapper", async () => {
  const { default: ProductActions } = await import(
    "@modules/products/components/product-actions"
  )
  return {
    default: ({ region }: any) => <ProductActions product={jersey} region={region} />,
  }
})
vi.mock("@modules/products/components/related-products", () => ({
  default: () => <section data-testid="related-products">Complete the kit</section>,
}))

import ProductBreadcrumb from "@modules/products/components/product-breadcrumb"
import ProductDetails from "@modules/products/components/product-details"
import ProductFacts from "@modules/products/components/product-facts"
import ProductPrice from "@modules/products/components/product-price"
import ProductTemplate from "@modules/products/templates"
import { productLayout } from "@modules/products/templates/layout"

const price = (amount: number, currency = "pkr") => ({
  calculated_amount: amount,
  original_amount: amount,
  currency_code: currency,
  calculated_price: { price_list_type: null },
})

const jersey = {
  id: "prod_jersey",
  handle: "jersey",
  title: "Jersey",
  description: "Custom team jersey, made to order.",
  material: null,
  collection_id: "pcol_garments",
  tags: [],
  metadata: { kind: "garment" },
  options: [
    {
      id: "opt_size",
      title: "Size",
      values: ["YS", "M", "L"].map((value) => ({ id: `v_${value}`, value })),
    },
  ],
  variants: ["YS", "M", "L"].map((size) => ({
    id: `var_${size}`,
    manage_inventory: false,
    options: [{ option_id: "opt_size", value: size }],
    calculated_price: price(3500),
  })),
} as any

const fitKit = {
  ...jersey,
  id: "prod_fit_kit",
  handle: "fit-kit",
  title: "Fit Kit",
  collection_id: null,
  metadata: { kind: "fit_kit" },
} as any

const regionPk = { id: "reg_pk", currency_code: "pkr", metadata: { tax_final: false } } as any

describe("product page template", () => {
  it("puts the sections in the phone order, with the title as the only h1", () => {
    const { container } = render(
      <ProductTemplate
        product={jersey}
        region={regionPk}
        countryCode="pk"
        images={[{ id: "i1", url: "https://x.test/1.jpg" }] as any}
      />
    )

    const order = [
      "product-breadcrumb",
      "gallery-single",
      "product-title",
      "price-block",
      "product-options",
      "add-product-button",
      "product-facts",
      "product-details",
      "related-products",
    ].map((id) => screen.getByTestId(id))
    for (let i = 1; i < order.length; i++) {
      expect(
        order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy()
    }

    const h1s = container.querySelectorAll("h1")
    expect(h1s).toHaveLength(1)
    expect(h1s[0]).toHaveTextContent("Jersey")
  })

  it("leaves 'Complete the kit' out for a product with nothing related", () => {
    render(
      <ProductTemplate product={fitKit} region={regionPk} countryCode="pk" images={[]} />
    )

    expect(screen.queryByTestId("related-products-container")).toBeNull()
    expect(screen.getByTestId("gallery-placeholder")).toHaveTextContent(
      "Photo coming soon"
    )
  })

  it("on the fit kit: no facts, the buy block runs straight into the Description", () => {
    render(
      <ProductTemplate product={fitKit} region={regionPk} countryCode="pk" images={[]} />
    )

    expect(screen.queryByTestId("product-facts")).toBeNull()
    const column = screen.getByTestId("product-buy-column")
    const children = Array.from(column.children)
    // the buy block (name, price, size, button), then the details: nothing between
    expect(children).toHaveLength(2)
    expect(within(children[0] as HTMLElement).getByTestId("add-product-button")).toBeTruthy()
    expect(children[1]).toContainElement(screen.getByTestId("product-description"))
    expect(screen.getByTestId("product-description")).toHaveTextContent("Description")
  })

  it("has no starter 'Shipping & Returns' and no starter wording anywhere", () => {
    const { container } = render(
      <ProductTemplate product={jersey} region={regionPk} countryCode="pk" images={[]} />
    )

    const text = container.textContent ?? ""
    expect(text).not.toMatch(/Shipping & Returns|Product Information|exchange|return/i)
    expect(text).not.toMatch(/3-5|3 to 5|business days/i)
  })
})

describe("product page layout", () => {
  it("is one column at most 560 px wide and centred below 1024 px", () => {
    for (const part of [productLayout.narrow, productLayout.gallery, productLayout.buy]) {
      expect(part.split(" ")).toEqual(
        expect.arrayContaining(["mx-auto", "w-full", "max-w-[560px]", "lg:max-w-none"])
      )
    }
  })

  it("is two columns from 1024 px: gallery 7/12, buy column 5/12 and sticky under the header", () => {
    expect(productLayout.columns).toContain("lg:grid-cols-12")
    expect(productLayout.gallery.split(" ")).toContain("lg:col-span-7")
    const buy = productLayout.buy.split(" ")
    expect(buy).toEqual(expect.arrayContaining(["lg:col-span-5", "lg:sticky"]))
    // the header is 64 px from 768 and 72 px from 1280; plus 16 px
    expect(buy).toEqual(expect.arrayContaining(["lg:top-20", "xl:top-[88px]"]))
  })

  it("spaces 'Complete the kit' like the home page's sections (48 px, 96 px from 1280)", () => {
    expect(productLayout.related.split(" ")).toEqual(["mt-12", "xl:mt-24"])
    expect(productLayout.page.split(" ")).toEqual(
      expect.arrayContaining(["pb-12", "xl:pb-24"])
    )
  })

  it("uses no starter breakpoint names", () => {
    for (const classes of Object.values(productLayout)) {
      expect(classes).not.toMatch(/\b(small|medium|large):/)
    }
  })
})

describe("breadcrumb", () => {
  it("reads 'Team kit › Jersey' and links the first crumb to the listing", () => {
    render(<ProductBreadcrumb title="Jersey" />)

    const nav = screen.getByRole("navigation", { name: "Breadcrumb" })
    expect(nav).toHaveTextContent("Team kit›Jersey")
    expect(within(nav).getByRole("link", { name: "Team kit" })).toHaveAttribute(
      "href",
      "/pk/store"
    )
    expect(within(nav).getByText("Jersey")).toHaveAttribute("aria-current", "page")
  })
})

describe("price block", () => {
  it("in Pakistan: price in PKR, per piece and 'Tax not final', no export line", () => {
    render(<ProductPrice product={jersey} region={regionPk} countryCode="pk" />)

    const block = screen.getByTestId("price-block")
    expect(screen.getByTestId("product-price").textContent).toMatch(/^PKR\s3,500$/)
    expect(block).toHaveTextContent("per piece")
    expect(screen.getByTestId("tax-note")).toHaveTextContent(/^Tax not final$/)
    expect(screen.queryByTestId("export-note")).toBeNull()
  })

  it("in an export region adds 'Shipping and duties included' and no minimum", () => {
    const gbJersey = {
      ...jersey,
      variants: jersey.variants.map((v: any) => ({
        ...v,
        calculated_price: price(30, "gbp"),
      })),
    }
    render(
      <ProductPrice
        product={gbJersey}
        region={{ metadata: { tax_final: false } }}
        countryCode="gb"
      />
    )

    expect(
      screen.getByTestId("product-price").textContent?.replace(/\s/g, " ")
    ).toBe("GBP 30.00")
    expect(screen.getByTestId("export-note")).toHaveTextContent(
      /^Shipping and duties included$/
    )
    expect(screen.getByTestId("price-block")).not.toHaveTextContent(/minimum|min\./i)
  })

  it("does not say 'per piece' for the fit kit", () => {
    render(<ProductPrice product={fitKit} region={regionPk} countryCode="pk" />)

    expect(screen.getByTestId("price-block")).not.toHaveTextContent("per piece")
  })

  it("shows a grey bar of the price's size while there is no price", () => {
    render(
      <ProductPrice
        product={{ ...jersey, variants: [] }}
        region={regionPk}
        countryCode="pk"
      />
    )

    expect(screen.getByTestId("price-skeleton")).toHaveClass("bg-brand-surface-alt")
  })
})

describe("facts boxes", () => {
  const facts = () =>
    screen.getAllByTestId("product-fact").map((li) => ({
      title: li.querySelector("p")?.textContent,
      text: li.querySelectorAll("p")[1]?.textContent,
    }))

  it("in Pakistan: delivery, replacement and the fit kit, in the decided words", () => {
    render(<ProductFacts product={jersey} countryCode="pk" />)

    expect(facts()).toEqual([
      {
        title: "Delivered in 15 days",
        text: "From the day you approve your proof. 10 days with paid rush.",
      },
      { title: "Free replacement", text: "Within 7 days, if the mistake is ours." },
      {
        title: "Not sure of sizes?",
        text: "Order a fit kit and try the sizes on first. The deposit is refundable.",
      },
    ])
    expect(screen.getByRole("link", { name: "See the fit kit" })).toHaveAttribute(
      "href",
      "/pk/products/fit-kit"
    )
    // every box has a decorative line icon
    for (const li of screen.getAllByTestId("product-fact")) {
      expect(li.querySelector("svg[aria-hidden=true]")).not.toBeNull()
    }
  })

  it("in an export region adds the shipping box", () => {
    render(<ProductFacts product={jersey} countryCode="gb" />)

    expect(facts()[2]).toEqual({
      title: "Shipping and duties included",
      text: "One box to the organizer, every jersey bagged and labelled.",
    })
    expect(facts()).toHaveLength(4)
  })

  it("renders nothing on the fit kit, the rush add-on or a product with no kind", () => {
    for (const product of [
      fitKit,
      { ...jersey, metadata: { kind: "rush_add_on" } },
      { ...jersey, metadata: null },
    ]) {
      for (const countryCode of ["pk", "gb"]) {
        const { container, unmount } = render(
          <ProductFacts product={product} countryCode={countryCode} />
        )
        expect(container).toBeEmptyDOMElement()
        unmount()
      }
    }
  })
})

describe("details", () => {
  it("shows the description as a native details element", () => {
    render(<ProductDetails product={jersey} />)

    const description = screen.getByTestId("product-description")
    expect(description.tagName).toBe("DETAILS")
    expect(within(description).getByText("Description").tagName).toBe("SUMMARY")
    expect(description).toHaveTextContent("Custom team jersey, made to order.")
    // no material: no "Fabric and decoration"
    expect(screen.queryByTestId("product-fabric")).toBeNull()
  })

  it("shows 'Fabric and decoration' with only the rows that have data", () => {
    render(<ProductDetails product={{ ...jersey, material: "Polyester mesh" }} />)

    const fabric = screen.getByTestId("product-fabric")
    expect(fabric).toHaveTextContent("Fabric and decoration")
    expect(within(fabric).getAllByRole("term")).toHaveLength(1)
    expect(fabric).toHaveTextContent("Polyester mesh")
    expect(fabric).not.toHaveTextContent(/^-$|\s-\s/)
  })

  it("renders nothing at all with no description and no fabric data", () => {
    const { container } = render(
      <ProductDetails product={{ ...jersey, description: "", material: "-" }} />
    )

    expect(container).toBeEmptyDOMElement()
  })
})
