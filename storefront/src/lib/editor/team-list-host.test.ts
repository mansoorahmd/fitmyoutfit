import { describe, expect, it } from "vitest"

import { listLimits, listMinimum, regionPhrase, teamListSizes, teamNoun } from "./team-list-host"

const option = (...values: string[]) => ({ title: "Size", values: values.map((value) => ({ value })) })

describe("the product's sizes for the list", () => {
  it("takes the Size option's values, youth then adult, in the store's order", () => {
    const sizes = teamListSizes([{ title: "Colour", values: [{ value: "Red" }] }, option("XL", "YM", "S", "YS", "2XL", "M")])
    expect(sizes?.map((s) => s.code)).toEqual(["YS", "YM", "S", "M", "XL", "2XL"])
    expect(sizes?.map((s) => s.group)).toEqual(["youth", "youth", "adult", "adult", "adult", "adult"])
  })

  it("keeps a size that is neither, last and without a group", () => {
    const sizes = teamListSizes([option("M", "ONE SIZE")])
    expect(sizes?.map((s) => s.code)).toEqual(["M", "ONE SIZE"])
    expect(sizes?.[1].group).toBeUndefined()
  })

  it("is undefined when there is no Size option, so the editor uses its own", () => {
    expect(teamListSizes([])).toBeUndefined()
    expect(teamListSizes(null)).toBeUndefined()
    expect(teamListSizes([{ title: "Size", values: [] }])).toBeUndefined()
  })
})

describe("the noun, the region and the limits", () => {
  it("makes the noun from the short name", () => {
    expect(teamNoun("Jersey")).toEqual({ one: "jersey", many: "jerseys" })
    expect(teamNoun("T-shirt")).toEqual({ one: "t-shirt", many: "t-shirts" })
    expect(teamNoun(" ")).toEqual({ one: "shirt", many: "shirts" })
  })

  it("says the region as a sentence wants it", () => {
    expect(regionPhrase({ name: "United Kingdom", countries: [{ iso_2: "gb" }] })).toBe("the UK")
    expect(regionPhrase({ name: "United Arab Emirates", countries: [{ iso_2: "ae" }] })).toBe("the UAE")
    expect(regionPhrase({ name: "United States", countries: [{ iso_2: "us" }] })).toBe("the US")
    expect(regionPhrase({ name: "Pakistan", countries: [{ iso_2: "pk" }] })).toBe("Pakistan")
    expect(regionPhrase(null)).toBe("this region")
  })

  it("gives a minimum only when it is more than one piece", () => {
    expect(listMinimum(10, "the UK")).toEqual({ pieces: 10, region: "the UK" })
    expect(listMinimum(1, "Pakistan")).toBeNull()
    expect(listMinimum(null, "x")).toBeNull()
  })

  it("gives the editor only the limits the server sent", () => {
    expect(listLimits({ maxLines: 80 })).toEqual({ maxLines: 80 })
    expect(listLimits({})).toBeUndefined()
    expect(listLimits(undefined)).toBeUndefined()
  })
})
