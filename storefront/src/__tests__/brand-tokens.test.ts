import fs from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { describe, expect, it } from "vitest"

const require = createRequire(import.meta.url)
const storefrontDir = path.resolve(__dirname, "..", "..")
const config = require(path.join(storefrontDir, "tailwind.config.js"))
const css = fs.readFileSync(
  path.join(storefrontDir, "src", "styles", "globals.css"),
  "utf8"
)

// Direction A, "Matchday": the token table in docs/design/03-direction.md,
// plus the two "text on" colours the table names in its contrast column.
const MATCHDAY: Record<string, string> = {
  bg: "#FFFFFF",
  surface: "#FFFFFF",
  "surface-alt": "#F3F5F9",
  ink: "#0B1530",
  "ink-muted": "#4A5568",
  inverse: "#0B1530",
  "on-inverse": "#FFFFFF",
  "on-inverse-muted": "#B8C2D6",
  primary: "#C8102E",
  "primary-hover": "#A50D26",
  "on-primary": "#FFFFFF",
  accent: "#D8FF3E",
  border: "#C9D1DE",
  "border-strong": "#6B7689",
  success: "#0F7A3D",
  error: "#B42318",
  focus: "#2563EB",
}

const cssVar = (name: string) => {
  const match = css.match(new RegExp(`--${name}:\\s*([^;]+);`))
  return match?.[1].trim()
}

const tripletToHex = (triplet: string) =>
  "#" +
  triplet
    .split(/\s+/)
    .map((n) => Number(n).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()

describe("brand colour tokens", () => {
  const brand = config.theme.extend.colors.brand as Record<string, string>

  it("maps every token as colors.brand.* through its CSS variable with alpha", () => {
    expect(Object.keys(brand).sort()).toEqual(Object.keys(MATCHDAY).sort())
    for (const token of Object.keys(MATCHDAY)) {
      expect(brand[token]).toBe(`rgb(var(--c-${token}) / <alpha-value>)`)
    }
  })

  it("sets each CSS variable to direction A's value", () => {
    for (const [token, hex] of Object.entries(MATCHDAY)) {
      const value = cssVar(`c-${token}`)
      expect(value, `--c-${token}`).toBeDefined()
      expect(tripletToHex(value!)).toBe(hex)
    }
  })
})

describe("other brand tokens", () => {
  it("defines the radii as variables and maps them", () => {
    expect(cssVar("radius-control")).toBe("4px")
    expect(cssVar("radius-card")).toBe("8px")
    expect(cssVar("radius-sheet")).toBe("16px")
    const radius = config.theme.extend.borderRadius
    expect(radius.control).toBe("var(--radius-control)")
    expect(radius.card).toBe("var(--radius-card)")
    expect(radius.sheet).toBe("var(--radius-sheet)")
  })

  it("puts Noto Sans Arabic's real face before any Arial fallback", () => {
    const { sans, heading } = config.theme.extend.fontFamily
    expect(sans.slice(0, 4)).toEqual([
      "var(--font-body-face)",
      "var(--font-arabic-face)",
      "var(--font-body)",
      "var(--font-arabic)",
    ])
    expect(heading.slice(0, 4)).toEqual([
      "var(--font-heading-face)",
      "var(--font-arabic-face)",
      "var(--font-heading)",
      "var(--font-arabic)",
    ])
  })

  it("has a 2 px focus ring with a 2 px offset", () => {
    expect(css).toMatch(
      /:focus-visible\s*{\s*outline:\s*2px solid rgb\(var\(--c-focus\)\);\s*outline-offset:\s*2px;/
    )
  })

  it("defines the type scale, with headings in capitals", () => {
    for (const name of [
      "display",
      "h1",
      "h2",
      "h3",
      "body-lg",
      "body",
      "small",
      "caption",
    ]) {
      expect(css).toContain(`.type-${name} {`)
    }
    expect(css).toMatch(/\.type-h3\s*{\s*@apply font-heading uppercase;/)
  })

  it("keeps the content width at 1200 px plus gutters", () => {
    expect(config.theme.extend.maxWidth.content).toBe("1200px")
    expect(css).toContain("@apply w-full mx-auto px-4 md:px-6 xl:px-8;")
  })
})
