import { describe, expect, it } from "vitest"

import {
  ADULT_SIZES,
  YOUTH_SIZES,
  groupOptionValues,
  isAdultSize,
  isSizeOption,
  isYouthSize,
} from "@lib/util/sizes"

// The jersey's sizes in the order the preview backend returns them.
const BACKEND_ORDER = ["YS", "YM", "YL", "YXL", "XS", "S", "M", "L", "XL", "2XL", "3XL"]

describe("youth and adult sizes", () => {
  it("lists the youth and adult sizes from the spec", () => {
    expect(YOUTH_SIZES).toEqual(["YS", "YM", "YL", "YXL"])
    expect(ADULT_SIZES).toEqual(["XS", "S", "M", "L", "XL", "2XL", "3XL"])
  })

  it("tells youth from adult, ignoring case and spaces", () => {
    expect(isYouthSize("YM")).toBe(true)
    expect(isYouthSize(" yxl ")).toBe(true)
    expect(isYouthSize("M")).toBe(false)
    expect(isAdultSize("2xl")).toBe(true)
    expect(isAdultSize("YS")).toBe(false)
  })

  it("recognises the size option by its title", () => {
    expect(isSizeOption("Size")).toBe(true)
    expect(isSizeOption(" size ")).toBe(true)
    expect(isSizeOption("Colour")).toBe(false)
    expect(isSizeOption(undefined)).toBe(false)
  })
})

describe("groupOptionValues", () => {
  it("splits sizes into Youth then Adult", () => {
    expect(groupOptionValues("Size", BACKEND_ORDER)).toEqual([
      { key: "youth", label: "Youth", values: ["YS", "YM", "YL", "YXL"] },
      {
        key: "adult",
        label: "Adult",
        values: ["XS", "S", "M", "L", "XL", "2XL", "3XL"],
      },
    ])
  })

  it("puts sizes in size order whatever order they arrive in", () => {
    const shuffled = ["3XL", "M", "YXL", "XS", "YS", "L", "S", "YL", "XL", "2XL", "YM"]
    const [youth, adult] = groupOptionValues("Size", shuffled)
    expect(youth.values).toEqual(["YS", "YM", "YL", "YXL"])
    expect(adult.values).toEqual(["XS", "S", "M", "L", "XL", "2XL", "3XL"])
  })

  it("leaves out an empty group", () => {
    expect(groupOptionValues("Size", ["S", "M"])).toEqual([
      { key: "adult", label: "Adult", values: ["S", "M"] },
    ])
  })

  it("never hides a size it does not know", () => {
    expect(groupOptionValues("Size", ["M", "4XL"])).toEqual([
      { key: "adult", label: "Adult", values: ["M"] },
      { key: "other", label: "Other sizes", values: ["4XL"] },
    ])
  })

  it("keeps other options in one unlabelled group in the backend's order", () => {
    expect(groupOptionValues("Colour", ["Navy", "Red", "Navy"])).toEqual([
      { key: "all", label: null, values: ["Navy", "Red"] },
    ])
    expect(groupOptionValues("Colour", [])).toEqual([])
  })
})
