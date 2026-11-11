import { describe, expect, it } from "vitest"

import {
  chosenLabel,
  chosenWithQuantity,
  hasScrolledPast,
  showStickyCheckoutBar,
  isFooterVisible,
  isFullyInView,
  showStickyBuyBar,
  stickyBarSummary,
} from "@lib/util/sticky-buy-bar"

// A 390 x 844 phone with the 56 px sticky header.
const HEADER = 56
const VIEWPORT = 844

const at = (top: number, height = 48) => ({ top, bottom: top + height })

describe("when the phone's sticky buy bar shows", () => {
  it("is hidden while the main button is on screen", () => {
    expect(
      showStickyBuyBar({
        mainButton: at(600),
        footerTop: 3000,
        headerBottom: HEADER,
        viewportHeight: VIEWPORT,
      })
    ).toBe(false)
  })

  it("is hidden while the main button is only partly under the header", () => {
    expect(
      showStickyBuyBar({
        mainButton: at(30),
        footerTop: 3000,
        headerBottom: HEADER,
        viewportHeight: VIEWPORT,
      })
    ).toBe(false)
  })

  it("shows once the main button has gone up out of view", () => {
    expect(
      showStickyBuyBar({
        mainButton: at(-200),
        footerTop: 2000,
        headerBottom: HEADER,
        viewportHeight: VIEWPORT,
      })
    ).toBe(true)
    // exactly behind the header counts as out of view
    expect(
      showStickyBuyBar({
        mainButton: at(HEADER - 48),
        footerTop: 2000,
        headerBottom: HEADER,
        viewportHeight: VIEWPORT,
      })
    ).toBe(true)
  })

  it("is hidden before the button is out of view below (page not scrolled yet)", () => {
    // a button further down the page than the first screen is not "passed"
    expect(
      showStickyBuyBar({
        mainButton: at(1200),
        footerTop: 3000,
        headerBottom: HEADER,
        viewportHeight: VIEWPORT,
      })
    ).toBe(false)
  })

  it("hides as soon as any of the footer is on screen", () => {
    expect(
      showStickyBuyBar({
        mainButton: at(-2000),
        footerTop: VIEWPORT - 1,
        headerBottom: HEADER,
        viewportHeight: VIEWPORT,
      })
    ).toBe(false)
    expect(
      showStickyBuyBar({
        mainButton: at(-2000),
        footerTop: VIEWPORT,
        headerBottom: HEADER,
        viewportHeight: VIEWPORT,
      })
    ).toBe(true)
  })

  it("is hidden when there is no main button, and works without a footer", () => {
    expect(
      showStickyBuyBar({
        mainButton: null,
        footerTop: null,
        headerBottom: HEADER,
        viewportHeight: VIEWPORT,
      })
    ).toBe(false)
    expect(
      showStickyBuyBar({
        mainButton: at(-100),
        footerTop: null,
        headerBottom: HEADER,
        viewportHeight: VIEWPORT,
      })
    ).toBe(true)
  })

  it("has small helpers that say the same", () => {
    expect(hasScrolledPast(at(0), HEADER)).toBe(true)
    expect(hasScrolledPast(at(10), HEADER)).toBe(false)
    expect(isFooterVisible(null, VIEWPORT)).toBe(false)
    expect(isFooterVisible(500, VIEWPORT)).toBe(true)
    expect(isFooterVisible(-50, VIEWPORT)).toBe(true)
  })
})

describe("is the size group wholly on screen", () => {
  it("is when it sits between the header and the bottom", () => {
    expect(isFullyInView(at(300, 200), HEADER, VIEWPORT)).toBe(true)
  })

  it("is not when it is under the header or below the screen", () => {
    expect(isFullyInView(at(20, 200), HEADER, VIEWPORT)).toBe(false)
    expect(isFullyInView(at(700, 200), HEADER, VIEWPORT)).toBe(false)
    expect(isFullyInView(at(-900, 200), HEADER, VIEWPORT)).toBe(false)
  })
})

describe("the bar's summary", () => {
  const size = [{ id: "opt_size" }]

  it("reads 'M · PKR 3,500' once a size is chosen", () => {
    const chosen = chosenLabel(size, { opt_size: "M" }, true)
    expect(chosen).toBe("M")
    expect(stickyBarSummary(chosen, "PKR 3,500")).toBe("M · PKR 3,500")
  })

  it("is just the price before a size is chosen", () => {
    const chosen = chosenLabel(size, {}, true)
    expect(chosen).toBeUndefined()
    expect(stickyBarSummary(chosen, "PKR 3,500")).toBe("PKR 3,500")
  })

  it("names no choice for a product with nothing to choose", () => {
    expect(chosenLabel(size, { opt_size: "Default option value" }, false)).toBeUndefined()
    expect(chosenLabel([], {}, true)).toBeUndefined()
    expect(chosenLabel(undefined, {}, true)).toBeUndefined()
  })

  it("joins several options once every one has a value", () => {
    const options = [{ id: "opt_size" }, { id: "opt_colour" }]
    expect(chosenLabel(options, { opt_size: "M" }, true)).toBeUndefined()
    expect(chosenLabel(options, { opt_size: "M", opt_colour: "Navy" }, true)).toBe(
      "M / Navy"
    )
  })

  it("is empty with neither a size nor a price", () => {
    expect(stickyBarSummary(undefined, undefined)).toBe("")
  })
})

describe("the cart's sticky checkout bar", () => {
  const show = (top: number | null, footerTop: number | null = 3000) =>
    showStickyCheckoutBar({
      checkoutButton: top === null ? null : at(top),
      footerTop,
      headerBottom: HEADER,
      viewportHeight: VIEWPORT,
    })

  it("shows while the summary's button is below the screen (a phone with several lines)", () => {
    expect(show(1400)).toBe(true)
  })

  it("hides while the button is wholly on screen", () => {
    expect(show(500)).toBe(false)
  })

  it("shows once the button has gone up under the header", () => {
    expect(show(-200)).toBe(true)
  })

  it("hides while the footer is on screen, and before the button exists", () => {
    expect(show(-200, 600)).toBe(false)
    expect(show(null)).toBe(false)
  })
})

describe("chosenWithQuantity", () => {
  const format = (chosen: string, quantity: number) => `${chosen} × ${quantity}`

  it("adds the quantity above 1 only", () => {
    expect(chosenWithQuantity("M", 4, format)).toBe("M × 4")
    expect(chosenWithQuantity("M", 1, format)).toBe("M")
    expect(chosenWithQuantity(undefined, 4, format)).toBeUndefined()
  })
})
