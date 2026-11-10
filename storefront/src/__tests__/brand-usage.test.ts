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
  })

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
    ]
    const offenders = restyled
      .flatMap((dir) => filesUnder(path.join(src, dir)))
      .filter((file) => /#[0-9a-fA-F]{3,8}\b/.test(fs.readFileSync(file, "utf8")))
      .map(relative)

    expect(offenders).toEqual([])
  })

  it("uses no starter breakpoints (small:, medium:) in the restyled header and menu", () => {
    const files = [
      "modules/layout/templates/nav/index.tsx",
      "modules/layout/components/side-menu/index.tsx",
      "modules/layout/components/region-selector/index.tsx",
      "modules/home/components/hero/index.tsx",
      "modules/products/components/product-actions/option-select.tsx",
    ]
    for (const file of files) {
      expect(fs.readFileSync(path.join(src, file), "utf8")).not.toMatch(
        /\b(small|medium|large):/
      )
    }
  })
})
