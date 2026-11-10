import { describe, expect, it } from "vitest"

import { homeContent } from "@content/home"
import { forRegion, isPakistan, showsInRegion } from "@lib/util/home-regions"

const titles = (countryCode: string) =>
  forRegion(homeContent.promises, countryCode).map((item) => item.title)

const questions = (countryCode: string) =>
  forRegion(homeContent.questions.items, countryCode).map((item) => item.question)

describe("which region sees what", () => {
  it("treats only Pakistan as the home market, in any letter case", () => {
    expect(isPakistan("pk")).toBe(true)
    expect(isPakistan("PK")).toBe(true)
    for (const code of ["gb", "ae", "us", "", undefined]) {
      expect(isPakistan(code)).toBe(false)
    }
  })

  it("shows 'all' items everywhere and scoped items in their region only", () => {
    expect(showsInRegion("all", "pk")).toBe(true)
    expect(showsInRegion("all", "us")).toBe(true)
    expect(showsInRegion("pakistan", "pk")).toBe(true)
    expect(showsInRegion("pakistan", "gb")).toBe(false)
    expect(showsInRegion("export", "pk")).toBe(false)
    expect(showsInRegion("export", "ae")).toBe(true)
  })

  it("gives Pakistan four promises, the fourth on payment", () => {
    expect(titles("pk")).toEqual([
      "Delivered in 15 days",
      "Free design help",
      "Free replacement",
      "Pay your way",
    ])
  })

  it.each(["gb", "ae", "us"])(
    "gives %s four promises, the fourth on shipping and duties",
    (code) => {
      expect(titles(code)).toEqual([
        "Delivered in 15 days",
        "Free design help",
        "Free replacement",
        "Shipping and duties included",
      ])
    }
  )

  it("leaves the shipping and duties question out in Pakistan only", () => {
    expect(questions("pk")).toEqual([
      "How long does delivery take?",
      "Do players have to pay?",
      "Can names be in Arabic or Urdu?",
      "What if something is wrong with our order?",
    ])
    expect(questions("gb")).toEqual([
      ...questions("pk"),
      "Who pays shipping and duties?",
    ])
  })

  it("keeps the items' order and does not change the source list", () => {
    const before = homeContent.promises.length
    forRegion(homeContent.promises, "pk")
    expect(homeContent.promises).toHaveLength(before)
  })
})
