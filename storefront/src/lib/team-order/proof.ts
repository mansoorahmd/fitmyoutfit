// What the proof page shows, worked out from the proof's snapshot and nothing else: the rows (the name as it
// will be printed, the number, the size, how many, the garment measurement of that size), the totals, and the
// sentences for a proof that cannot be made. Plain functions with no store, React or network in them, so they
// are tested on their own (proof.test.ts). The page and the later server PDF build the same `ProofDocument`.
//
// Nothing here is read from the live list: the lines are the snapshot's, frozen when the proof was made. The
// only arithmetic is counting those lines (pieces per size, the total); every date, state and number besides
// comes from the backend.

import { canonicalSnapshotText, hashSnapshotText, type ProofSnapshot } from "@fitmyoutfit/team-rules"

import { proofContent } from "@content/proof"
import { formatCalendarDateWithYear } from "@lib/util/calendar-date"
import { placedOnDate } from "@lib/util/order-confirmation"
import { isChosenSize, type SizeChart } from "@lib/util/size-chart"
import { fill } from "@lib/util/wording"

import type { ProofDetail, ProofLine, ProofStatus, ProofView, TeamOrderView } from "./types"

const doc = proofContent.document

// ---- the snapshot is the one the proof stands for

/**
 * Whether the snapshot this page is about to show is the one the proof's code stands for: the canonical text
 * hashes to the proof's hash, and the snapshot object gives the same text. A proof that does not check out is
 * never shown as something to sign.
 */
export function snapshotMatchesHash(proof: Pick<ProofDetail, "hash" | "snapshotText" | "rawSnapshot">): boolean {
  try {
    return (
      hashSnapshotText(proof.snapshotText) === proof.hash &&
      canonicalSnapshotText(proof.rawSnapshot as ProofSnapshot) === proof.snapshotText
    )
  } catch {
    return false
  }
}

// ---- the name as it will be printed -----------------------------------------

// built from a string: the project's TypeScript target is older than the "u" flag, the browsers and Node are not
const LATIN_LETTER = new RegExp("\\p{Script=Latin}", "u")

/**
 * Capitals for the Latin letters of a name; Arabic-script letters, digits, spaces and marks stay as they are. The
 * same rule as the editor's `upperLatin` (design/letter-case.ts), written here because the editor's package
 * pulls React and Three.js on its main entry and this runs on the server; proof.test.ts checks the two agree.
 */
export function upperLatin(text: string): string {
  let out = ""
  for (const ch of Array.from(text)) out += LATIN_LETTER.test(ch) ? ch.toUpperCase() : ch
  return out
}

export type LetterCase = "upper" | "as-typed"

/**
 * Which letter case the design prints names in: capitals, unless a player-name item of the design says
 * "as-typed" (decision 012; the editor's `letterCase`). The design is the JSON saved with the proof's design
 * version; anything that is not a design gives the default, capitals.
 */
export function nameLetterCase(design: unknown): LetterCase {
  const layers = typeof design === "object" && design !== null ? (design as { layers?: unknown }).layers : undefined
  if (!Array.isArray(layers)) return "upper"
  const asTyped = layers.some(
    (l) =>
      typeof l === "object" &&
      l !== null &&
      (l as { kind?: unknown }).kind === "text" &&
      (l as { role?: unknown }).role === "player-name" &&
      (l as { letterCase?: unknown }).letterCase === "as-typed"
  )
  return asTyped ? "as-typed" : "upper"
}

/**
 * The name as it will be printed: Latin letters in capitals (the design's rule), Arabic-script names exactly as
 * they are (they have no capitals), digits, spaces and marks untouched. The stored name is never changed.
 */
export const nameAsPrinted = (name: string, letterCase: LetterCase): string => (letterCase === "upper" ? upperLatin(name) : name)

// ---- the garment measurement of a size ------------------------------------------

export type MeasurementHeading = { labels: string; unit: string; draft: boolean }

/** The chart's column names and unit, for the heading and the note under the table. Null without a chart. */
export function measurementHeading(chart: SizeChart | null): MeasurementHeading | null {
  if (!chart) return null
  return { labels: chart.columns.map((c) => c.label).join(" × "), unit: chart.unit, draft: chart.draft }
}

/**
 * The measurement of a size as the product page's size chart shows it, in the chart's own unit and as stored
 * ("54 × 72"); null when there is no chart, no row for the size, or no value at all in the row. A column with no
 * value shows as a dash.
 */
export function measurementOf(size: string, chart: SizeChart | null): string | null {
  if (!chart) return null
  const row = chart.rows.find((r) => isChosenSize(r.size, size))
  if (!row) return null
  const values = chart.columns.map((c) => row.values[c.key] ?? null)
  if (values.every((v) => v === null)) return null
  return values.map((v) => (v === null ? doc.table.noMeasurement : String(v))).join(" × ")
}

// ---- the rows -------------------------------------------------------------------

export type ProofRow = {
  /** The line's place in the list, from 1. */
  position: number
  /** The name as printed, or the plain words for "no name" / a spare shirt; null when the design prints no names. */
  name: string | null
  /** True when `name` is words of ours ("No name", "Spare shirt"), not a player's name. */
  nameIsWords: boolean
  /** The number as written, or the plain words for "no number"; null when the design prints no numbers. */
  number: string | null
  numberIsWords: boolean
  size: string
  count: number
  /** The garment measurement of the size, or null. */
  measurement: string | null
  spare: boolean
}

/** One line of the snapshot as a row. A spare shirt is a line with neither a name nor a number on purpose. */
export function proofRow(
  line: ProofLine,
  index: number,
  options: { prints: { name: boolean; number: boolean }; letterCase: LetterCase; chart: SizeChart | null }
): ProofRow {
  const spare = line.noName && line.noNumber
  const t = doc.table
  const name = !options.prints.name
    ? null
    : spare
      ? t.spare
      : line.noName
        ? t.noName
        : nameAsPrinted(line.name, options.letterCase)
  const number = !options.prints.number ? null : line.noNumber ? t.noNumber : line.number
  return {
    position: index + 1,
    name,
    nameIsWords: options.prints.name && (spare || line.noName),
    number,
    numberIsWords: options.prints.number && line.noNumber,
    size: line.size,
    count: line.count,
    measurement: measurementOf(line.size, options.chart),
    spare,
  }
}

// ---- the totals -----------------------------------------------------------------

export type ProofTotals = {
  players: number
  pieces: number
  /** Every size of the product that has pieces, in the product's order, then sizes the product does not have. */
  bySize: { size: string; pieces: number; other: boolean }[]
}

/** Counts the snapshot's lines. `sizes` is the product's sizes in its own order (the order read gives them). */
export function proofTotals(lines: readonly ProofLine[], sizes: readonly string[]): ProofTotals {
  const pieces = new Map<string, number>()
  let total = 0
  for (const line of lines) {
    const n = Number.isSafeInteger(line.count) && line.count >= 1 ? line.count : 1
    total += n
    pieces.set(line.size, (pieces.get(line.size) ?? 0) + n)
  }
  const known = sizes.filter((s) => pieces.has(s)).map((size) => ({ size, pieces: pieces.get(size)!, other: false }))
  const other = Array.from(pieces.entries())
    .filter(([size]) => !sizes.includes(size))
    .map(([size, n]) => ({ size, pieces: n, other: true }))
  return { players: lines.length, pieces: total, bySize: [...known, ...other] }
}

// ---- dates ----------------------------------------------------------------------

const SIGNED_AT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Karachi",
})

/** "22 November 2026, 14:05": the backend's moment in Lahore's time zone, the clock the store's days use. Null when not a moment. */
export function momentWords(iso: string | null | undefined): string | null {
  if (!iso) return null
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : SIGNED_AT.format(date).replace(" at ", ", ")
}

/** "22 November 2026" for a moment (the day it was made or closed). */
export const dayOfMoment = (iso: string | null | undefined): string | null => placedOnDate(iso)

// ---- the document ---------------------------------------------------------------

/** Everything the proof's markup needs, as plain data. */
export type ProofDocument = {
  teamName: string
  productName: string
  number: number
  status: ProofStatus
  madeOn: string
  /** The proof's code: the start of its hash. */
  code: string
  needBy: string | null
  showName: boolean
  showNumber: boolean
  rows: ProofRow[]
  totals: ProofTotals
  measurement: MeasurementHeading | null
  /** The signature line at the foot of the page. */
  signature: string
}

/** First-strong isolate around a text: it keeps its direction inside a sentence of another direction. */
export const isolate = (text: string): string => (text ? `⁨${text}⁩` : text)

/** The signature line at the foot of the proof, by the proof's state. */
export function signatureLine(proof: Pick<ProofView, "status" | "signedName" | "signedAt" | "closedAt">): string {
  const s = doc.signature
  const signedDate = momentWords(proof.signedAt) ?? ""
  // the typed name is isolated, so an Urdu or Arabic name inside an English sentence keeps its own direction
  const who = isolate(proof.signedName ?? "")
  const closed = dayOfMoment(proof.closedAt) ?? ""
  switch (proof.status) {
    case "signed":
      return fill(s.signed, { name: who, date: signedDate })
    case "sent":
      return s.notSigned
    case "withdrawn":
      return fill(s.withdrawn, { date: closed })
    case "replaced":
      return proof.signedName
        ? fill(s.replaced, { date: closed, name: who, signedDate })
        : fill(s.replacedUnsigned, { date: closed })
  }
}

/** The proof as the document shows it: built from the proof's snapshot only. */
export function buildProofDocument(input: {
  proof: ProofDetail
  productName: string
  sizes: readonly string[]
  chart: SizeChart | null
  letterCase: LetterCase
  /** The need-by date to print (the proof's own once signed, else the order's now), or null. */
  needByDate: string | null
}): ProofDocument {
  const { proof, chart } = input
  const { snapshot } = proof
  const options = { prints: snapshot.prints, letterCase: input.letterCase, chart }
  return {
    teamName: snapshot.teamName,
    productName: input.productName,
    number: proof.number,
    status: proof.status,
    madeOn: dayOfMoment(proof.createdAt) ?? "",
    code: proof.hash.slice(0, 12),
    needBy: input.needByDate ? (formatCalendarDateWithYear(input.needByDate) ?? input.needByDate) : null,
    showName: snapshot.prints.name,
    showNumber: snapshot.prints.number,
    rows: snapshot.lines.map((line, i) => proofRow(line, i, options)),
    totals: proofTotals(snapshot.lines, input.sizes),
    measurement: measurementHeading(chart),
    signature: signatureLine(proof),
  }
}

// ---- making the proof: when the button is offered, and what is said when it is not -------

export type ProofGate = { kind: "ready" } | { kind: "blocked"; reason: "empty" | "fix" | "minimum" | "other"; sentence: string }

/**
 * Whether the team-order page offers "Make the proof". It does only when the backend would accept it
 * (`summary.readyForProof`, the backend's own word); otherwise the sentence says what is missing, from the
 * backend's numbers: no players, lines to fix, or pieces missing for the region's minimum.
 */
export function proofGate(order: Pick<TeamOrderView, "status" | "summary">): ProofGate | { kind: "none" } {
  if (order.status !== "draft") return { kind: "none" }
  const { summary } = order
  if (summary.readyForProof) return { kind: "ready" }
  const w = proofContent.make.blocked
  if (summary.players === 0) return { kind: "blocked", reason: "empty", sentence: w.empty }
  if (summary.linesToFix > 0) {
    return {
      kind: "blocked",
      reason: "fix",
      sentence: summary.linesToFix === 1 ? w.fixOne : fill(w.fix, { n: summary.linesToFix }),
    }
  }
  if (summary.minimum && !summary.minimum.met) {
    return {
      kind: "blocked",
      reason: "minimum",
      sentence:
        summary.minimum.missing === 1
          ? fill(w.minimumOne, { required: summary.minimum.required })
          : fill(w.minimum, { required: summary.minimum.required, missing: summary.minimum.missing }),
    }
  }
  return { kind: "blocked", reason: "other", sentence: w.other }
}
