import { describe, expect, it } from "vitest"

import { optionSummaryLabel } from "@lib/util/option-summary"

const size = { id: "opt_size", title: "Size" } as any
const colour = { id: "opt_colour", title: "Colour" } as any

describe("optionSummaryLabel", () => {
  it("asks for a size until one is chosen", () => {
    expect(optionSummaryLabel([size], {})).toBe("Choose size")
    expect(optionSummaryLabel([size], { opt_size: "M" })).toBe("Size: M")
  })

  it("lists the values once every option is chosen", () => {
    expect(optionSummaryLabel([size, colour], { opt_size: "M" })).toBe(
      "Choose options"
    )
    expect(
      optionSummaryLabel([size, colour], { opt_size: "M", opt_colour: "Navy" })
    ).toBe("M / Navy")
  })

  it("copes with no options", () => {
    expect(optionSummaryLabel(undefined, {})).toBe("Choose options")
  })
})
