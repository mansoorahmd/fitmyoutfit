import { describe, expect, it, vi } from "vitest"

// next/font/google only runs inside the Next.js compiler. Record the options
// each loader is called with instead.
const calls = vi.hoisted(() => [] as { family: string; options: any }[])

vi.mock("next/font/google", () => {
  const loader = (family: string) => (options: any) => {
    calls.push({ family, options })
    return { variable: `var-${options.variable}`, className: family }
  }
  return {
    Barlow_Condensed: loader("Barlow Condensed"),
    Inter: loader("Inter"),
    Noto_Sans_Arabic: loader("Noto Sans Arabic"),
  }
})

import { fontVariables } from "@lib/fonts"

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
  })

  it("turns off the Arial fallback so Arabic letters reach Noto Sans Arabic", () => {
    for (const { options } of calls) {
      expect(options.adjustFontFallback).toBe(false)
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
})
