import fs from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

import { contrastRatio, parseRgbTriplet } from "@lib/util/contrast"

// The alert backgrounds (docs/design/05-m1-pages.md, 2.1) must keep their
// text readable: WCAG AA, 4.5:1 for normal text.
const css = fs.readFileSync(
  path.resolve(__dirname, "..", "styles", "globals.css"),
  "utf8"
)
const token = (name: string) => {
  const match = css.match(new RegExp(`--c-${name}:\\s*([0-9 ]+);`))
  if (!match) throw new Error(`no --c-${name}`)
  return parseRgbTriplet(match[1])
}

describe("alert surface tokens", () => {
  it.each([
    ["error", "error-surface", 6.0],
    ["ink", "error-surface", 16.0],
    // the specification rounds this one to 5.0; it is 4.96, still above AA
    ["success", "success-surface", 4.9],
    ["ink", "success-surface", 16.0],
    ["ink-muted", "surface-alt", 6.5],
    ["error", "surface-alt", 5.9],
  ])("%s on %s is at least %d:1", (text, background, min) => {
    expect(contrastRatio(token(text), token(background))).toBeGreaterThanOrEqual(
      min
    )
  })

  it("border-strong on surface-alt passes the 3:1 for outlines", () => {
    expect(
      contrastRatio(token("border-strong"), token("surface-alt"))
    ).toBeGreaterThanOrEqual(3)
  })
})
