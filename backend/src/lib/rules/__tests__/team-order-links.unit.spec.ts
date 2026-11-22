import { checkRoster } from "@fitmyoutfit/team-rules"
import {
  hasProofOut,
  isSigned,
  minimumFor,
  readTake,
  takenNumbers,
  whyNoAddOn,
  whyNoReorder,
} from "../team-order-links"
import { TEAM_ORDER_STATUSES } from "../team-order-status"

describe("which orders have signed, and which have a proof out", () => {
  it("approved and later are signed; a proof out starts at proof_sent", () => {
    expect(TEAM_ORDER_STATUSES.map((s) => isSigned(s))).toEqual([false, false, true, true, true, true, true])
    expect(TEAM_ORDER_STATUSES.map((s) => hasProofOut(s))).toEqual([false, true, true, true, true, true, true])
  })
})

describe("whyNoAddOn", () => {
  it("an add-on can be started from a signed order of any later status", () => {
    for (const status of ["approved", "deposit_paid", "in_production", "balance_due", "shipped"] as const) {
      expect(whyNoAddOn({ kind: "order", status })).toBeNull()
    }
    expect(whyNoAddOn({ kind: "reorder", status: "approved" })).toBeNull()
  })

  it("not before the proof is signed", () => {
    for (const status of ["draft", "proof_sent"] as const) {
      expect(whyNoAddOn({ kind: "order", status })?.code).toBe("team_order_not_signed")
    }
  })

  it("an add-on cannot have add-ons, whatever its status", () => {
    expect(whyNoAddOn({ kind: "add_on", status: "approved" })?.code).toBe("add_on_of_add_on")
    expect(whyNoAddOn({ kind: "add_on", status: "draft" })?.code).toBe("add_on_of_add_on")
  })
})

describe("whyNoReorder", () => {
  it("only from a signed order, add-ons included", () => {
    expect(whyNoReorder({ kind: "order", status: "approved" })).toBeNull()
    expect(whyNoReorder({ kind: "add_on", status: "shipped" })).toBeNull()
    expect(whyNoReorder({ kind: "order", status: "proof_sent" })?.code).toBe("team_order_not_signed")
    expect(whyNoReorder({ kind: "order", status: "draft" })?.code).toBe("team_order_not_signed")
  })
})

describe("minimumFor", () => {
  it("an add-on uses its own minimum, everything else the region's", () => {
    const minimums = { region: 10, addOn: 1 }
    expect(minimumFor("add_on", minimums)).toBe(1)
    expect(minimumFor("order", minimums)).toBe(10)
    expect(minimumFor("reorder", minimums)).toBe(10)
  })
})

describe("takenNumbers", () => {
  const line = (name: string, number: string, no_number = false) => ({ name, number, no_number })

  it("takes the printed numbers of every source, with where and who", () => {
    expect(
      takenNumbers([
        { id: "o1", source: "first-order", printsNumber: true, lines: [line("Bilal", "7"), line("Sami", "10")] },
        { id: "o2", source: "add-on", printsNumber: true, lines: [line("", "12")] },
      ])
    ).toEqual([
      { number: "7", source: "first-order", orderId: "o1", name: "Bilal" },
      { number: "10", source: "first-order", orderId: "o1", name: "Sami" },
      { number: "12", source: "add-on", orderId: "o2" },
    ])
  })

  it("a line with no number, or with the no-number flag, takes none; neither does a design with no numbers", () => {
    expect(
      takenNumbers([
        { id: "o1", source: "first-order", printsNumber: true, lines: [line("A", ""), line("B", "9", true)] },
        { id: "o2", source: "add-on", printsNumber: false, lines: [line("C", "5")] },
      ])
    ).toEqual([])
  })

  it("works with the package's check: 7, 07 and Arabic digits are the same number", () => {
    const taken = takenNumbers([
      { id: "o1", source: "first-order", printsNumber: true, lines: [line("Bilal", "٧")] },
      { id: "o2", source: "add-on", printsNumber: true, lines: [line("Sami", "21")] },
    ])
    const settings = { prints: { name: false, number: true }, sizes: ["M"], taken }
    const lines = [
      { name: "", number: "07", size: "M", count: 1, noName: false, noNumber: false },
      { name: "", number: "21", size: "M", count: 1, noName: false, noNumber: false },
      { name: "", number: "8", size: "M", count: 1, noName: false, noNumber: false },
    ]
    expect(checkRoster(lines, settings).problems.map((p) => [p.index, p.code])).toEqual([
      [0, "number-taken-first-order"],
      [1, "number-taken-add-on"],
    ])
  })
})

describe("readTake", () => {
  it("takes every line by default and for all, none for none", () => {
    expect(readTake(undefined, 3)).toEqual({ ok: true, indexes: [0, 1, 2] })
    expect(readTake("all", 2)).toEqual({ ok: true, indexes: [0, 1] })
    expect(readTake("none", 5)).toEqual({ ok: true, indexes: [] })
    expect(readTake("all", 0)).toEqual({ ok: true, indexes: [] })
  })

  it("takes the positions named, once each, in list order", () => {
    expect(readTake([4, 1, 1, 0], 5)).toEqual({ ok: true, indexes: [0, 1, 4] })
    expect(readTake([], 5)).toEqual({ ok: true, indexes: [] })
  })

  it("refuses what is not a choice, and positions outside the list", () => {
    for (const bad of ["some", 3, null, [1.5], ["1"], [true], {}]) {
      expect(readTake(bad, 5)).toMatchObject({ ok: false, code: "take_invalid" })
    }
    expect(readTake([5], 5)).toMatchObject({ ok: false, code: "take_out_of_range" })
    expect(readTake([-1], 5)).toMatchObject({ ok: false, code: "take_out_of_range" })
    expect(readTake([0], 0)).toMatchObject({ ok: false, code: "take_out_of_range" })
  })
})
