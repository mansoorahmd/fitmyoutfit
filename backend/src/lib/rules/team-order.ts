/**
 * Team orders, part one: plain rules around the roster package. No Medusa imports.
 *
 * The roster rules themselves (the checks, the summary, the clean-up) are in
 * @fitmyoutfit/team-rules; this file reads the pieces a team order is made of (its name, its
 * need-by date, the product's sizes) and shapes the answer a store route sends.
 */
import {
  analyzeRoster,
  type RosterLimits,
  type RosterLine,
  type RosterNote,
  type RosterProblem,
  type RosterSummary,
} from "@fitmyoutfit/team-rules"

export const MAX_TEAM_NAME_LENGTH = 100

/** The team name: trimmed text of 1 to 100 characters, no control characters; null if not. */
export function readTeamName(input: unknown): string | null {
  if (typeof input !== "string") return null
  const name = input.normalize("NFC").replace(/\s+/gu, " ").trim()
  if (name === "" || [...name].length > MAX_TEAM_NAME_LENGTH || /\p{Cc}/u.test(name)) return null
  return name
}

/** A calendar date `YYYY-MM-DD` that exists; `{ value: null }` for an absent date. */
export function readNeedByDate(input: unknown): { ok: true; value: string | null } | { ok: false } {
  if (input === undefined || input === null) return { ok: true, value: null }
  if (typeof input !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(input)) return { ok: false }
  const date = new Date(`${input}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== input) return { ok: false }
  return { ok: true, value: input }
}

type OptionLike = {
  title?: string | null
  values?: ({ value?: string | null; rank?: number | null } | null)[] | null
}

/**
 * The product's sizes, in the product's order: the values of its option titled "Size" (any case),
 * by rank (the seed stores the display order as ranks), then as listed. A product without that
 * option has no sizes.
 */
export function sizesFromOptions(options: readonly (OptionLike | null)[] | null | undefined): string[] {
  const option = (options ?? []).find((o) => o?.title?.trim().toLowerCase() === "size")
  const values = (option?.values ?? []).flatMap((v, position) =>
    v && typeof v.value === "string" && v.value !== "" ? [{ value: v.value, rank: v.rank ?? null, position }] : []
  )
  values.sort((a, b) => (a.rank ?? a.position) - (b.rank ?? b.position) || a.position - b.position)
  return [...new Set(values.map((v) => v.value))]
}

/** A stored roster entry, as the module returns it. */
export type StoredEntry = {
  id: string
  line_id: string
  position: number
  name: string
  number: string
  size: string
  count: number
  no_name: boolean
  no_number: boolean
}

/** A stored entry as a line for the rules, in the order of `position`. */
export function entriesToLines(entries: readonly StoredEntry[]): RosterLine[] {
  return [...entries]
    .sort((a, b) => a.position - b.position)
    .map((e) => ({
      id: e.line_id,
      name: e.name,
      number: e.number,
      size: e.size,
      count: e.count,
      noName: e.no_name,
      noNumber: e.no_number,
    }))
}

// ---------------------------------------------------------------------------------------------
// The shapes of the answer (snake_case, as Medusa's API)

export type ApiLine = {
  id: string
  name: string
  number: string
  size: string
  count: number
  no_name: boolean
  no_number: boolean
}

export type ApiProblem = {
  code: RosterProblem["code"]
  /** Position of the line in the list, from 0; -1 for a problem of the whole list. */
  index: number
  line_id: string | null
  field: RosterProblem["field"]
  detail: Record<string, unknown> | null
}

export type ApiNote = { code: RosterNote["code"]; index: number; line_id: string | null }

export type ApiSummary = {
  players: number
  pieces: number
  by_size: { size: string; pieces: number }[]
  other_sizes: { size: string; pieces: number }[]
  lines_without_size: number
  pieces_without_size: number
  ready_lines: number
  lines_to_fix: number
  indexes_to_fix: number[]
  minimum: { required: number; missing: number; met: boolean } | null
  ready_for_proof: boolean
}

export type RosterView = {
  lines: ApiLine[]
  problems: ApiProblem[]
  notes: ApiNote[]
  summary: ApiSummary
}

export function lineToApi(line: RosterLine): ApiLine {
  return {
    id: line.id ?? "",
    name: line.name,
    number: line.number,
    size: line.size,
    count: line.count,
    no_name: line.noName,
    no_number: line.noNumber,
  }
}

function problemToApi(problem: RosterProblem): ApiProblem {
  const { detail } = problem
  return {
    code: problem.code,
    index: problem.index,
    line_id: problem.lineId ?? null,
    field: problem.field,
    detail: detail
      ? Object.fromEntries(
          Object.entries(detail).map(([key, value]) => [key === "hasDigit" ? "has_digit" : key, value])
        )
      : null,
  }
}

function summaryToApi(s: RosterSummary): ApiSummary {
  return {
    players: s.players,
    pieces: s.pieces,
    by_size: s.bySize,
    other_sizes: s.otherSizes,
    lines_without_size: s.linesWithoutSize,
    pieces_without_size: s.piecesWithoutSize,
    ready_lines: s.readyLines,
    lines_to_fix: s.linesToFix,
    indexes_to_fix: s.indexesToFix,
    minimum: s.minimum,
    ready_for_proof: s.readyForProof,
  }
}

/** The checks' result for every line and the summary with the region's minimum, in the API's shape. */
export function buildRosterView(input: {
  lines: readonly RosterLine[]
  prints: { name: boolean; number: boolean }
  sizes: readonly string[]
  limits?: Partial<RosterLimits>
  minimum: number | null
}): RosterView {
  const analysis = analyzeRoster(
    input.lines,
    { prints: input.prints, sizes: input.sizes, limits: input.limits },
    { minimum: input.minimum }
  )
  return {
    lines: input.lines.map(lineToApi),
    problems: analysis.problems.map(problemToApi),
    notes: analysis.notes.map((n) => ({ code: n.code, index: n.index, line_id: n.lineId ?? null })),
    summary: summaryToApi(analysis.summary),
  }
}
