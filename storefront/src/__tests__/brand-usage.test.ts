import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const src = path.resolve(__dirname, "..")

const filesUnder = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === "__tests__" ? [] : filesUnder(full)
    return /\.(tsx?|jsx?)$/.test(entry.name) ? [full] : []
  })

const relative = (file: string) => path.relative(src, file).split(path.sep).join("/")

describe("brand colour usage", () => {
  it("uses the brand red (primary) only in the Button's styles", () => {
    const allowed = ["modules/common/components/button/button-styles.ts"]
    const offenders = filesUnder(src)
      .filter((file) => /brand-primary/.test(fs.readFileSync(file, "utf8")))
      .map(relative)
      .filter((file) => !allowed.includes(file))

    expect(offenders).toEqual([])
  }, 30_000) // reads every source file; slow on a busy disk

  it("has no raw hex colours in the components restyled for the brand", () => {
    const restyled = [
      "modules/common/components/button",
      "modules/common/components/not-found",
      "modules/home/components/hero",
      "modules/layout/components/cart-link",
      "modules/layout/components/region-list",
      "modules/layout/components/region-selector",
      "modules/layout/components/side-menu",
      "modules/layout/templates/nav",
      "modules/products/components/product-actions",
      // S0-15: home page sections, product card and grid, listing, footer
      "modules/home",
      "modules/products/components/product-preview",
      "modules/products/components/product-grid",
      "modules/products/components/related-products",
      "modules/skeletons/components/skeleton-product-preview",
      "modules/skeletons/templates/skeleton-product-grid",
      "modules/skeletons/templates/skeleton-related-products",
      "modules/store/components/empty-products",
      "modules/store/templates",
      "modules/layout/templates/footer",
      "modules/common/icons/garment-outline.tsx",
      "content",
      // S0-16: the product page
      "modules/products/components/image-gallery",
      "modules/products/components/product-breadcrumb",
      "modules/products/components/product-details",
      "modules/products/components/product-facts",
      "modules/products/components/product-price",
      "modules/products/templates",
    ]
    const offenders = restyled
      .flatMap((entry) => {
        const full = path.join(src, entry)
        return fs.statSync(full).isDirectory() ? filesUnder(full) : [full]
      })
      .filter((file) => /#[0-9a-fA-F]{3,8}\b/.test(fs.readFileSync(file, "utf8")))
      .map(relative)

    expect(offenders).toEqual([])
  }, 30_000)

  it("uses no starter breakpoints (small:, medium:) in the restyled header and menu", () => {
    const files = [
      "modules/layout/templates/nav/index.tsx",
      "modules/layout/components/side-menu/index.tsx",
      "modules/layout/components/region-selector/index.tsx",
      "modules/home/components/hero/index.tsx",
      "modules/products/components/product-actions/option-select.tsx",
      // S0-15
      "modules/home/components/promise-strip/index.tsx",
      "modules/home/components/featured-products/product-rail/index.tsx",
      "modules/home/components/how-it-works/index.tsx",
      "modules/home/components/roster-proof/index.tsx",
      "modules/home/components/sizing/index.tsx",
      "modules/home/components/questions/index.tsx",
      "modules/products/components/product-preview/index.tsx",
      "modules/products/components/product-grid/grid.ts",
      "modules/products/components/related-products/index.tsx",
      "modules/skeletons/components/skeleton-product-preview/index.tsx",
      "modules/skeletons/templates/skeleton-product-grid/index.tsx",
      "modules/skeletons/templates/skeleton-related-products/index.tsx",
      "modules/store/components/empty-products/index.tsx",
      "modules/store/templates/index.tsx",
      "modules/store/templates/paginated-products.tsx",
      "modules/layout/templates/footer/index.tsx",
      // S0-16
      "modules/products/components/image-gallery/index.tsx",
      "modules/products/components/product-actions/index.tsx",
      "modules/products/components/product-actions/sticky-buy-bar.tsx",
      "modules/products/components/product-breadcrumb/index.tsx",
      "modules/products/components/product-details/index.tsx",
      "modules/products/components/product-facts/index.tsx",
      "modules/products/components/product-price/index.tsx",
      "modules/products/templates/index.tsx",
      "modules/products/templates/layout.ts",
      "modules/products/templates/product-info/index.tsx",
    ]
    for (const file of files) {
      expect(fs.readFileSync(path.join(src, file), "utf8")).not.toMatch(
        /\b(small|medium|large):/
      )
    }
  })
})
