import { COD_LIMIT_CURRENCY_CODE, readCodMaxTotal } from "../cod-max-total"
import { readDeliveryDays } from "../delivery-days"
import { readMinGarmentQuantity } from "../min-garment-quantity"
import { readNumberSetting } from "../read-number-setting"

describe("readNumberSetting", () => {
  const rule = { key: "x", where: "the store's metadata", min: 0, max: 10 }

  it("reads a number, or a number written as a string", () => {
    expect(readNumberSetting({ x: 4 }, rule)).toEqual({ ok: true, value: 4 })
    expect(readNumberSetting({ x: " 4.5 " }, rule)).toEqual({ ok: true, value: 4.5 })
  })

  it("reports missing, blank, non-numeric and out-of-range values readably", () => {
    expect(readNumberSetting({}, rule)).toEqual({
      ok: false,
      error: "x is not set. Add it to the store's metadata (a number from 0 to 10).",
    })
    expect(readNumberSetting(null, rule).ok).toBe(false)
    expect(readNumberSetting({ x: " " }, rule).ok).toBe(false)
    expect(readNumberSetting({ x: "ten" }, rule)).toEqual({
      ok: false,
      error: 'x in the store\'s metadata must be a number from 0 to 10, got "ten".',
    })
    expect(readNumberSetting({ x: true }, rule).ok).toBe(false)
    expect(readNumberSetting({ x: Infinity }, rule).ok).toBe(false)
    expect(readNumberSetting({ x: -1 }, rule)).toEqual({
      ok: false,
      error: "x in the store's metadata must not be below 0, got -1.",
    })
    expect(readNumberSetting({ x: 11 }, rule)).toEqual({
      ok: false,
      error: "x in the store's metadata must not be above 10, got 11.",
    })
  })

  it("refuses a fraction where a whole number is needed", () => {
    expect(readNumberSetting({ x: 2.5 }, { ...rule, integer: true })).toEqual({
      ok: false,
      error: "x in the store's metadata must be a whole number, got 2.5.",
    })
  })
})

describe("readCodMaxTotal", () => {
  it("reads the limit in PKR, 0 or more", () => {
    expect(COD_LIMIT_CURRENCY_CODE).toBe("pkr")
    expect(readCodMaxTotal({ cod_max_total: 20000 })).toEqual({ ok: true, value: 20000 })
    expect(readCodMaxTotal({ cod_max_total: "0" })).toEqual({ ok: true, value: 0 })
  })

  it("reports a missing or negative limit, naming the key", () => {
    const missing = readCodMaxTotal({ rush_percentage: 20 })
    expect(missing).toEqual({
      ok: false,
      error: "cod_max_total is not set. Add it to the store's metadata (a number, 0 or more).",
    })
    expect(readCodMaxTotal({ cod_max_total: -5 }).ok).toBe(false)
  })
})

describe("readDeliveryDays", () => {
  it("reads both day counts", () => {
    expect(readDeliveryDays({ delivery_days_standard: 15, delivery_days_rush: "10" })).toEqual({
      ok: true,
      value: { standard: 15, rush: 10 },
    })
  })

  it("reports every problem at once", () => {
    const result = readDeliveryDays({ delivery_days_rush: 0 })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("delivery_days_standard is not set")
      expect(result.error).toContain("delivery_days_rush in the store's metadata must not be below 1")
    }
  })
})

describe("readMinGarmentQuantity", () => {
  it("reads a whole number, 1 or more, from the region's metadata", () => {
    expect(readMinGarmentQuantity({ tax_final: false, min_garment_quantity: 10 })).toEqual({
      ok: true,
      value: 10,
    })
    expect(readMinGarmentQuantity({ min_garment_quantity: "1" }, "Pakistan")).toEqual({
      ok: true,
      value: 1,
    })
  })

  it("names the region in the error", () => {
    expect(readMinGarmentQuantity({}, "United Kingdom")).toEqual({
      ok: false,
      error:
        'min_garment_quantity is not set. Add it to the metadata of the region "United Kingdom" (a whole number, 1 or more).',
    })
    expect(readMinGarmentQuantity({ min_garment_quantity: 0 }).ok).toBe(false)
    expect(readMinGarmentQuantity({ min_garment_quantity: 9.5 }).ok).toBe(false)
  })
})
