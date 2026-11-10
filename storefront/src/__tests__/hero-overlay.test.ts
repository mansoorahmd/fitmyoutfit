import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

import { Rgb, blend, contrastRatio, parseRgbTriplet } from "@lib/util/contrast"
import {
  HERO_OVERLAY_TEXT_ALPHA,
  HERO_OVERLAY_TEXT_STOP_PERCENT,
  heroOverlayClasses,
  heroTextMaxWidthClass,
} from "@modules/home/components/hero/overlay"

const css = fs.readFileSync(
  path.resolve(__dirname, "..", "styles", "globals.css"),
  "utf8"
)

/** A brand token's value from globals.css, so the test follows any change of look. */
const token = (name: string): Rgb => {
  const match = css.match(new RegExp(`--c-${name}:\\s*([0-9 ]+);`))
  if (!match) throw new Error(`No token --c-${name}`)
  return parseRgbTriplet(match[1])
}

const WHITE: Rgb = [255, 255, 255]
const BLACK: Rgb = [0, 0, 0]

/** Every alpha the overlay classes use for `bg-…`, `from-…` and `via-…` of the inverse token. */
const alphaOf = (prefix: string) => {
  const match = heroOverlayClasses.match(
    new RegExp(`(?:^|\\s)${prefix}brand-inverse/(\\d+)(?:\\s|$)`)
  )
  if (!match) throw new Error(`No ${prefix} class`)
  return Number(match[1]) / 100
}

describe("contrast helper", () => {
  it("matches the spec's published ratios", () => {
    // 03-direction.md: ink on white 18.0:1, ink-muted on white 7.5:1
    expect(contrastRatio(token("ink"), WHITE)).toBeCloseTo(18.0, 0)
    expect(contrastRatio(token("ink-muted"), WHITE)).toBeCloseTo(7.5, 0)
    expect(contrastRatio(WHITE, BLACK)).toBeCloseTo(21, 5)
  })
})

describe("hero overlay contrast (4.5:1 over any photo)", () => {
  const navy = token("inverse")

  it("is at least the text alpha wherever text can sit", () => {
    // below 1280 px: an even layer; from 1280 px: the left side of the gradient
    expect(alphaOf("bg-")).toBeGreaterThanOrEqual(HERO_OVERLAY_TEXT_ALPHA)
    expect(alphaOf("xl:from-")).toBeGreaterThanOrEqual(HERO_OVERLAY_TEXT_ALPHA)
    expect(alphaOf("xl:via-")).toBeGreaterThanOrEqual(HERO_OVERLAY_TEXT_ALPHA)
    expect(heroOverlayClasses).toContain(`xl:via-${HERO_OVERLAY_TEXT_STOP_PERCENT}%`)
  })

  it.each([
    ["white text (headline, subline, buttons)", "on-inverse"],
    ["muted text on navy", "on-inverse-muted"],
  ])("%s stays above 4.5:1 even over a pure white photo", (_label, name) => {
    const worstBackground = blend(navy, HERO_OVERLAY_TEXT_ALPHA, WHITE)
    expect(contrastRatio(token(name), worstBackground)).toBeGreaterThanOrEqual(4.5)
  })

  it("would fail with a weaker layer, so the check means something", () => {
    const tooWeak = blend(navy, 0.5, WHITE)
    expect(contrastRatio(token("on-inverse-muted"), tooWeak)).toBeLessThan(4.5)
  })

  it("keeps the text block inside the strong part of the gradient from 1280 px", () => {
    const textMax = Number(heroTextMaxWidthClass.match(/\[(\d+)px\]/)![1])
    const contentMax = 1200
    const gutter = 32
    for (let viewport = 1280; viewport <= 2560; viewport += 16) {
      const containerLeft = Math.max(0, (viewport - (contentMax + 2 * gutter)) / 2)
      const textRight = containerLeft + gutter + textMax
      expect((textRight / viewport) * 100).toBeLessThanOrEqual(
        HERO_OVERLAY_TEXT_STOP_PERCENT
      )
    }
  })
})
