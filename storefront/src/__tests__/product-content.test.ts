import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

import { productContent } from "@content/product"

const src = path.resolve(__dirname, "..")
const read = (file: string) => fs.readFileSync(path.join(src, file), "utf8")

/** The source without its comments, which may quote the wording they explain. */
const code = (file: string) =>
  read(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\s)\/\/.*$/gm, "$1")

// The product page's components lay wording out; they never hold it.
const COMPONENTS = [
  "modules/products/components/image-gallery/index.tsx",
  "modules/products/components/product-actions/index.tsx",
  "modules/products/components/product-actions/option-select.tsx",
  "modules/products/components/product-actions/sticky-buy-bar.tsx",
  "modules/products/components/product-breadcrumb/index.tsx",
  "modules/products/components/product-details/index.tsx",
  "modules/products/components/product-facts/index.tsx",
  "modules/products/components/product-price/index.tsx",
  "modules/products/templates/index.tsx",
]

describe("product page wording", () => {
  it("is marked as draft wording", () => {
    expect(read("content/product.ts").startsWith("// DRAFT WORDING.")).toBe(true)
  })

  it("states the decided promises exactly, and nothing more", () => {
    expect(
      productContent.facts.map(({ title, text, showIn, link }) => ({
        title,
        text,
        showIn,
        link,
      }))
    ).toEqual([
      {
        title: "Delivered in 15 days",
        text: "From the day you approve your proof. 10 days with paid rush.",
        showIn: "all",
        link: undefined,
      },
      {
        title: "Free replacement",
        text: "Within 7 days, if the mistake is ours.",
        showIn: "all",
        link: undefined,
      },
      {
        title: "Shipping and duties included",
        text: "One box to the organizer, every jersey bagged and labelled.",
        showIn: "export",
        link: undefined,
      },
      {
        title: "Not sure of sizes?",
        text: "Order a fit kit and try the sizes on first. The deposit is refundable.",
        showIn: "all",
        link: { label: "See the fit kit", href: "/products/fit-kit" },
      },
    ])
  })

  it("has the price, size and gallery words the brief sets", () => {
    expect(productContent.price.taxNote).toBe("Tax not final")
    expect(productContent.price.perPiece).toBe("per piece")
    expect(productContent.price.exportNote).toBe("Shipping and duties included")
    expect(productContent.size.error).toBe("Choose a size")
    expect(productContent.gallery.noPhoto).toBe("Photo coming soon")
    expect(productContent.details.description).toBe("Description")
    expect(productContent.details.fabric).toBe("Fabric and decoration")
  })

  it("is not written into the components", () => {
    const phrases = [
      ...productContent.facts.flatMap((f) => [f.title, f.text]),
      productContent.price.taxNote,
      productContent.size.error,
      productContent.gallery.noPhoto,
      productContent.details.fabric,
      productContent.button.adding,
      "Shipping & Returns",
    ]
    for (const file of COMPONENTS) {
      const source = code(file)
      for (const phrase of phrases) {
        expect(source, `${file} contains "${phrase}"`).not.toContain(phrase)
      }
    }
  }, 30_000)
})
