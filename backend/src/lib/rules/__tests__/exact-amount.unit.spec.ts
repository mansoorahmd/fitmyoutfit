import {
  add,
  compare,
  div,
  exact,
  mul,
  readExact,
  roundHalfUp,
  sub,
  sum,
  toDecimalString,
  toFixedString,
  toNumber,
} from "../exact-amount"

const text = (value: unknown) => toDecimalString(exact(value))

describe("readExact", () => {
  it("reads numbers, decimal strings, exponents and Medusa's big-number objects exactly", () => {
    expect(text(2000)).toBe("2000")
    expect(text("333.5")).toBe("333.5")
    expect(text("1124.995")).toBe("1124.995")
    expect(text("-0.01")).toBe("-0.01")
    expect(text(0.1)).toBe("0.1")
    expect(text(1e-7)).toBe("0.0000001")
    expect(text("1.5e3")).toBe("1500")
    expect(text({ value: "44.00", precision: 20 })).toBe("44")
    expect(text(".5")).toBe("0.5")
  })

  it("gives null for anything that is not a finite amount", () => {
    for (const value of [NaN, Infinity, "", "abc", "1.2.3", "--1", null, undefined, {}, { value: "x" }, [], true]) {
      expect(readExact(value)).toBeNull()
    }
    expect(() => exact("abc", "unit price")).toThrow('Expected a finite unit price, got "abc"')
  })
})

describe("arithmetic", () => {
  it("is exact where floating point is not", () => {
    expect(0.1 + 0.2).not.toBe(0.3)
    expect(text(add(exact(0.1), exact(0.2)))).toBe("0.3")
    expect(text(sub(exact("1124.995"), exact("333.5")))).toBe("791.495")
    expect(text(mul(exact("1.005"), exact(1000)))).toBe("1005")
    expect(text(sum([exact("0.01"), exact("0.01"), exact("0.01")]))).toBe("0.03")
    expect(text(div(exact(1), exact(8)))).toBe("0.125")
  })

  it("compares exactly", () => {
    expect(compare(exact("0.3"), add(exact(0.1), exact(0.2)))).toBe(0)
    expect(compare(exact("2.0649999"), exact("2.065"))).toBe(-1)
    expect(compare(exact(3), exact("2.999"))).toBe(1)
  })
})

describe("roundHalfUp", () => {
  it("rounds a half up and anything below it down, exactly", () => {
    expect(toFixedString(roundHalfUp(exact("2.065"), 2), 2)).toBe("2.07")
    expect(toFixedString(roundHalfUp(exact("2.0649999999"), 2), 2)).toBe("2.06")
    expect(toFixedString(roundHalfUp(exact("399.5"), 0), 0)).toBe("400")
    expect(toFixedString(roundHalfUp(exact("399.4999"), 0), 0)).toBe("399")
    expect(toFixedString(roundHalfUp(exact("-0.5"), 0), 0)).toBe("-1")
    // 1.005 is 1.00499999999999989... as a binary number: rounding the number would give 1.00.
    expect(Math.round(1.005 * 100) / 100).toBe(1)
    expect(toFixedString(roundHalfUp(exact(1.005), 2), 2)).toBe("1.01")
  })

  it("refuses a negative or fractional number of digits", () => {
    expect(() => roundHalfUp(exact(1), -1)).toThrow()
    expect(() => roundHalfUp(exact(1), 1.5)).toThrow()
  })
})

describe("output", () => {
  it("writes fixed and shortest decimal forms, and numbers for JSON", () => {
    expect(toFixedString(exact(44), 2)).toBe("44.00")
    expect(toFixedString(exact("0.07"), 2)).toBe("0.07")
    expect(toFixedString(exact("-1.5"), 1)).toBe("-1.5")
    expect(() => toFixedString(exact("0.005"), 2)).toThrow("round it first")
    expect(() => toDecimalString(div(exact(1), exact(3)))).toThrow("No finite decimal form")
    expect(toNumber(exact("44.00"))).toBe(44)
    expect(toNumber(exact("2.07"))).toBe(2.07)
    expect(toNumber(exact(400))).toBe(400)
  })
})
