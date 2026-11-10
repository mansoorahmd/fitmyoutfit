import fs from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { fireEvent, render, screen } from "@testing-library/react"
import postcss from "postcss"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({
  useParams: () => ({ countryCode: "pk" }),
}))

import { Button } from "@modules/common/components/button"
import OptionSelect from "@modules/products/components/product-actions/option-select"

// The size chip once showed no focus ring although its classes looked right:
// clx (tailwind-merge 3) silently dropped `peer-focus-visible:outline` beside
// `peer-focus-visible:outline-2`, so the outline had a width and a colour but
// no style. These tests compile the classes a component really renders with
// the store's Tailwind config and check the CSS a browser would get.

const require = createRequire(import.meta.url)
const storefrontDir = path.resolve(__dirname, "..", "..")
const tailwindcss = require("tailwindcss")
const config = require(path.join(storefrontDir, "tailwind.config.js"))

/** The declarations Tailwind generates for `className`, per selector. */
const compile = async (className: string) => {
  const result = await postcss([
    tailwindcss({ ...config, content: [{ raw: `<i class="${className}"></i>` }] }),
  ]).process("@tailwind utilities;", { from: undefined })

  const rules: { selector: string; decls: Record<string, string> }[] = []
  result.root.walkRules((rule) => {
    const decls: Record<string, string> = {}
    rule.walkDecls((d) => {
      decls[d.prop] = d.value
    })
    rules.push({ selector: rule.selector, decls })
  })
  return rules
}

/** Merges every declaration whose selector contains `state`. */
const declsFor = (
  rules: Awaited<ReturnType<typeof compile>>,
  state: string
) =>
  rules
    .filter((r) => r.selector.includes(state))
    .reduce<Record<string, string>>((all, r) => ({ ...all, ...r.decls }), {})

const SIZES = ["YS", "M", "L"]
const sizeOption = {
  id: "opt_size",
  title: "Size",
  values: SIZES.map((value) => ({ id: `v_${value}`, value })),
} as any

const Sizes = () => {
  const [current, setCurrent] = useState<string | undefined>()
  return (
    <OptionSelect
      option={sizeOption}
      title="Size"
      current={current}
      disabled={false}
      updateOption={(_, v) => setCurrent(v)}
    />
  )
}

describe("focus ring", () => {
  it("the size chip gets a solid 2 px focus-colour outline while its radio has keyboard focus", async () => {
    render(<Sizes />)
    const chip = screen.getByRole("radio", { name: "M" })
      .nextElementSibling as HTMLElement

    const ring = declsFor(await compile(chip.className), ".peer:focus-visible ~")

    expect(ring["outline-style"]).toBe("solid")
    expect(ring["outline-width"]).toBe("2px")
    expect(ring["outline-offset"]).toBe("2px")
    expect(ring["outline-color"]).toBe("rgb(var(--c-focus) / 1)")
  })

  it("the chip keeps its ring once chosen, and focus stays on the chosen radio", async () => {
    render(<Sizes />)
    const medium = screen.getByRole("radio", { name: "M" })
    medium.focus()
    fireEvent.click(medium)

    expect(medium).toBeChecked()
    expect(document.activeElement).toBe(medium)
    const ring = declsFor(
      await compile((medium.nextElementSibling as HTMLElement).className),
      ".peer:focus-visible ~"
    )
    expect(ring["outline-style"]).toBe("solid")
  })

  it("every Button variant gets a solid 2 px focus-colour outline", async () => {
    for (const variant of ["primary", "secondary", "text"] as const) {
      const { unmount } = render(<Button variant={variant}>Go</Button>)
      const button = screen.getByRole("button", { name: "Go" })

      const ring = declsFor(await compile(button.className), ":focus-visible")

      expect(ring["outline-style"], variant).toBe("solid")
      expect(ring["outline-width"], variant).toBe("2px")
      expect(ring["outline-color"], variant).toBe("rgb(var(--c-focus) / 1)")
      unmount()
    }
  })

  it("no restyled component writes a bare `outline` class, which clx would drop", () => {
    const files = [
      "modules/common/components/button/button-styles.ts",
      "modules/products/components/product-actions/option-select.tsx",
      "modules/layout/templates/nav/index.tsx",
      "modules/layout/components/side-menu/index.tsx",
      "modules/layout/components/region-selector/index.tsx",
      "modules/layout/components/region-list/index.tsx",
      "modules/layout/components/cart-link/index.tsx",
      "modules/home/components/hero/index.tsx",
      "modules/common/components/not-found/index.tsx",
    ]
    for (const file of files) {
      const source = fs.readFileSync(path.join(storefrontDir, "src", file), "utf8")
      // class names in string literals, not words in comments
      const classes = Array.from(source.matchAll(/"([^"\n]*)"/g)).flatMap(
        (m) => m[1].split(/\s+/)
      )
      expect(
        classes.filter((c) => c === "outline" || c.endsWith(":outline")),
        file
      ).toEqual([])
    }
  })
})
