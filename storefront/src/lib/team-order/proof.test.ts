import { upperLatin as editorUpperLatin } from "@fitmyoutfit/editor"
import { hashSnapshot } from "@fitmyoutfit/team-rules"
import { describe, expect, it } from "vitest"

import { apiProof, apiSnapshot } from "./fixtures"
import { parseProofAnswer, proofFromApi } from "./map"
import {
  buildProofDocument,
  measurementHeading,
  measurementOf,
  nameAsPrinted,
  nameLetterCase,
  proofGate,
  proofRow,
  proofTotals,
  signatureLine,
  snapshotMatchesHash,
  upperLatin,
} from "./proof"
import type { ProofLine } from "./types"
import { parseSizeChart } from "@lib/util/size-chart"

const chart = parseSizeChart({
  size_chart: {
    unit: "cm",
    draft: true,
    columns: [
      { key: "chest", label: "Chest width" },
      { key: "length", label: "Body length" },
    ],
    rows: [
      { size: "M", values: { chest: 54, length: 72 } },
      { size: "L", values: { chest: 57, length: null } },
      { size: "XL", values: { chest: null, length: null } },
    ],
  },
})
const line = (over: Partial<ProofLine> = {}): ProofLine => ({ name: "Bilal", number: "7", size: "M", count: 1, noName: false, noNumber: false, ...over })
const opts = { prints: { name: true, number: true }, letterCase: "upper" as const, chart }

describe("the name as it will be printed", () => {
  it("puts Latin letters in capitals and leaves Arabic-script names, digits and marks as they are", () => {
    expect(nameAsPrinted("Ali Raza", "upper")).toBe("ALI RAZA")
    expect(nameAsPrinted("محمد علی", "upper")).toBe("محمد علی")
    expect(nameAsPrinted("عبدالله الهاشمي", "upper")).toBe("عبدالله الهاشمي")
    expect(nameAsPrinted("José O'Neil-Smith", "upper")).toBe("JOSÉ O'NEIL-SMITH")
    expect(nameAsPrinted("Ali Raza", "as-typed")).toBe("Ali Raza")
  })
  it("agrees with the editor's own rule", () => {
    for (const text of ["Ali Raza", "محمد علی", "Éric Ünal", "ʻOkalani 7", "ß straße", "Ali علي"]) expect(upperLatin(text)).toBe(editorUpperLatin(text))
  })
  it("reads the design's letter case: capitals unless a player-name item says as-typed", () => {
    expect(nameLetterCase(null)).toBe("upper")
    expect(nameLetterCase({ layers: [{ kind: "text", role: "player-name" }] })).toBe("upper")
    expect(nameLetterCase({ layers: [{ kind: "text", role: "player-name", letterCase: "as-typed" }] })).toBe("as-typed")
    expect(nameLetterCase({ layers: [{ kind: "text", role: "team-name", letterCase: "as-typed" }] })).toBe("upper")
  })
})

describe("the garment measurement of a size", () => {
  it("is the chart's row for the size, in the chart's unit as stored, any case", () => {
    expect(measurementOf("M", chart)).toBe("54 × 72")
    expect(measurementOf("m", chart)).toBe("54 × 72")
    expect(measurementOf("L", chart)).toBe("57 × –")
  })
  it("is nothing without a chart, a row, or any value", () => {
    expect(measurementOf("M", null)).toBeNull()
    expect(measurementOf("3XL", chart)).toBeNull()
    expect(measurementOf("XL", chart)).toBeNull()
  })
  it("names the columns and marks the draft chart", () => {
    expect(measurementHeading(chart)).toEqual({ labels: "Chest width × Body length", unit: "cm", draft: true })
    expect(measurementHeading(null)).toBeNull()
  })
})

describe("a row", () => {
  it("is the line as frozen: position, name as printed, number, size, count, measurement", () => {
    expect(proofRow(line({ name: "Bilal", count: 2 }), 2, opts)).toMatchObject({ position: 3, name: "BILAL", number: "7", size: "M", count: 2, measurement: "54 × 72", spare: false })
  })
  it("keeps Arabic and Urdu names and digits exactly", () => {
    expect(proofRow(line({ name: "محمد علی", number: "٧" }), 0, opts)).toMatchObject({ name: "محمد علی", number: "٧", nameIsWords: false })
  })
  it("says a spare shirt, no name and no number plainly", () => {
    expect(proofRow(line({ name: "", number: "", noName: true, noNumber: true }), 0, opts)).toMatchObject({ name: "Spare shirt", number: "No number", spare: true, nameIsWords: true, numberIsWords: true })
    expect(proofRow(line({ name: "", noName: true }), 0, opts)).toMatchObject({ name: "No name", number: "7", spare: false })
    expect(proofRow(line({ number: "", noNumber: true }), 0, opts)).toMatchObject({ number: "No number" })
  })
  it("has no name or number where the design prints none", () => {
    expect(proofRow(line(), 0, { ...opts, prints: { name: false, number: true } }).name).toBeNull()
    expect(proofRow(line(), 0, { ...opts, prints: { name: true, number: false } }).number).toBeNull()
  })
})

describe("the totals", () => {
  const lines = [line({ size: "M", count: 2 }), line({ size: "S" }), line({ size: "M" }), line({ size: "4XL", count: 3 })]
  it("counts players and pieces, per size in the product's order, other sizes last", () => {
    expect(proofTotals(lines, ["S", "M", "L"])).toEqual({
      players: 4,
      pieces: 7,
      bySize: [
        { size: "S", pieces: 1, other: false },
        { size: "M", pieces: 3, other: false },
        { size: "4XL", pieces: 3, other: true },
      ],
    })
  })
  it("is empty for an empty list", () => expect(proofTotals([], ["S"])).toEqual({ players: 0, pieces: 0, bySize: [] }))
})

describe("the document", () => {
  const detail = parseProofAnswer({ proof: { ...apiProof(), snapshot: apiSnapshot(), snapshot_text: "x" } })!
  it("is built from the snapshot, in its order, with the totals and the foot", () => {
    const doc = buildProofDocument({ proof: detail, productName: "Jersey", sizes: ["M", "L"], chart, letterCase: "upper", needByDate: "2027-01-21" })
    expect(doc.teamName).toBe("Lahore Lions")
    expect(doc.rows.map((r) => r.name)).toEqual(["BILAL", "علی"])
    expect(doc.rows[1]).toMatchObject({ number: "٧", count: 2, measurement: "57 × –" })
    expect(doc.totals).toMatchObject({ players: 2, pieces: 3 })
    expect(doc.needBy).toBe("21 January 2027")
    expect(doc.code).toBe("aaaaaaaaaaaa")
    expect(doc.signature).toBe("Not signed yet.")
  })
  it("says who signed and when, from the backend's record", () => {
    const signed = proofFromApi(apiProof({ status: "signed", signed_name: "محمد علی", signed_at: "2026-11-23T09:30:00.000Z" }))!
    expect(signatureLine(signed)).toContain("Signed by ⁨محمد علی⁩ on 23 November 2026, 14:30")
  })
  it("says an earlier proof is not valid", () => {
    const replaced = proofFromApi(apiProof({ status: "replaced", closed_at: "2026-11-23T09:30:00.000Z", signed_name: "A", signed_at: "2026-11-22T09:30:00.000Z" }))!
    expect(signatureLine(replaced)).toMatch(/^Replaced on 23 November 2026\. This proof is not valid\./)
    expect(signatureLine(proofFromApi(apiProof({ status: "withdrawn", closed_at: "2026-11-23T09:30:00.000Z" }))!)).toMatch(/^Withdrawn on 23 November 2026/)
  })
})

describe("the snapshot is the proof's", () => {
  const raw = apiSnapshot()
  const { text, hash } = hashSnapshot({ design_version_id: "desver_1", product_id: "prod_1", region_id: "reg_uk", team_name: "Lahore Lions", prints: { name: true, number: true }, lines: raw.lines })
  it("matches when the text hashes to the proof's hash", () => {
    expect(snapshotMatchesHash({ hash, snapshotText: text, rawSnapshot: raw })).toBe(true)
  })
  it("does not match a changed snapshot or hash", () => {
    expect(snapshotMatchesHash({ hash: "0".repeat(64), snapshotText: text, rawSnapshot: raw })).toBe(false)
    expect(snapshotMatchesHash({ hash, snapshotText: text, rawSnapshot: apiSnapshot({ team_name: "Other" }) })).toBe(false)
    expect(snapshotMatchesHash({ hash, snapshotText: text, rawSnapshot: null })).toBe(false)
  })
})

describe("when the proof can be made", () => {
  const summary = (over: Record<string, unknown>) => ({ players: 5, pieces: 5, linesToFix: 0, minimum: null, readyForProof: false, ...over }) as never
  it("offers it only when the backend would take it", () => {
    expect(proofGate({ status: "draft", summary: summary({ readyForProof: true }) })).toEqual({ kind: "ready" })
  })
  it("says what is missing otherwise", () => {
    expect(proofGate({ status: "draft", summary: summary({ players: 0 }) })).toMatchObject({ kind: "blocked", reason: "empty" })
    expect(proofGate({ status: "draft", summary: summary({ linesToFix: 1 }) })).toMatchObject({ reason: "fix", sentence: expect.stringContaining("Fix 1 line") })
    expect(proofGate({ status: "draft", summary: summary({ minimum: { required: 10, missing: 5, met: false } }) })).toMatchObject({ reason: "minimum", sentence: expect.stringContaining("5 more needed") })
    expect(proofGate({ status: "draft", summary: summary({}) })).toMatchObject({ reason: "other" })
  })
  it("is not a question for an order that is not a draft", () => {
    expect(proofGate({ status: "proof_sent", summary: summary({ readyForProof: true }) })).toEqual({ kind: "none" })
  })
})
