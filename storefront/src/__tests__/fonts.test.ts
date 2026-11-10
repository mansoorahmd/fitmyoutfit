import { describe, expect, it, vi } from "vitest"

// next/font/google only runs inside the Next.js compiler. Record the options
// each loader is called with, and answer the way next/font does: the real
// family first, then its metric-matched fallback.
const calls = vi.hoisted(() => [] as { family: string; options: any }[])

vi.mock("next/font/google", () => {
  const loader = (family: string) => (options: any) => {
    calls.push({ family, options })
    return {
      variable: `var-${options.variable}`,
      className: family,
      style: { fontFamily: `'__${family}_x', '__${family} Fallback_x'` },
    }
  }
  return {
    Barlow_Condensed: loader("Barlow Condensed"),
    Inter: loader("Inter"),
    Noto_Sans_Arabic: loader("Noto Sans Arabic"),
  }
})

import { fontFaceStyle, fontVariables } from "@lib/fonts"
import { fontFaceVariables, primaryFamily } from "@lib/util/font-stack"

const optionsFor = (family: string) =>
  calls.find((c) => c.family === family)?.options

describe("brand fonts", () => {
  it("loads Barlow Condensed 700 and 800 for headings", () => {
    const options = optionsFor("Barlow Condensed")
    expect(options.weight).toEqual(["700", "800"])
    expect(options.variable).toBe("--font-heading")
  })

  it("loads Inter for body text and Noto Sans Arabic for Arabic script", () => {
    expect(optionsFor("Inter").variable).toBe("--font-body")
    expect(optionsFor("Noto Sans Arabic").variable).toBe("--font-arabic")
    expect(optionsFor("Noto Sans Arabic").subsets).toContain("arabic")
    for (const { options } of calls) {
      expect(options.display).toBe("swap")
    }
  })

  it("exposes all three variables for the html element", () => {
    expect(fontVariables.split(" ")).toEqual([
      "var---font-heading",
      "var---font-body",
      "var---font-arabic",
    ])
  })

  it("exposes the real faces alone, without the Arial fallbacks", () => {
    expect(fontFaceStyle).toEqual({
      "--font-heading-face": "'__Barlow Condensed_x'",
      "--font-body-face": "'__Inter_x'",
      "--font-arabic-face": "'__Noto Sans Arabic_x'",
    })
  })
})

describe("font stack helpers", () => {
  it("takes the first family of a list", () => {
    expect(primaryFamily("'Inter', 'Inter Fallback'")).toBe("'Inter'")
    expect(primaryFamily("Inter")).toBe("Inter")
    expect(primaryFamily("")).toBe("")
  })

  it("builds the three face variables", () => {
    expect(
      fontFaceVariables({ heading: "A, B", body: "C, D", arabic: "E, F" })
    ).toEqual({
      "--font-heading-face": "A",
      "--font-body-face": "C",
      "--font-arabic-face": "E",
    })
  })
})
