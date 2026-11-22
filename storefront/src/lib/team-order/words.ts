// Turns the backend's codes and numbers into the sentences of src/content/team-order.ts. No
// sentence is written here; this only picks one and fills its braces with what the backend
// said. Plain functions.

import type { RosterNote, RosterProblem } from "@fitmyoutfit/team-rules"

import { teamOrderContent } from "@content/team-order"
import { formatCalendarDateWithYear } from "@lib/util/calendar-date"
import { fill } from "@lib/util/wording"

import type { Failure, ScheduleView, TeamOrderStatus, TeamOrderView } from "./types"

const words = teamOrderContent

/** A calendar day from the backend ("2026-12-20") as "20 December 2026"; the text itself when it is not a day. */
export const dayWords = (isoDate: string): string => formatCalendarDateWithYear(isoDate) ?? isoDate

export const statusWords = (status: TeamOrderStatus) => words.status[status]

/** Whether the team list and the design can still be changed (contract: only a draft). */
export const isDraft = (status: TeamOrderStatus): boolean => status === "draft"

/** The names of the other lines that share a number, for "Same number as Bilal and Sami". */
const namesOf = (problem: RosterProblem): string => {
  const names = (problem.detail?.others ?? []).map((o) => (o.name.trim() ? o.name.trim() : `line ${o.index + 1}`))
  if (names.length === 0) return ""
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
}

/** One problem as a sentence. A code this storefront has no sentence for gets the general one: never nothing. */
export function problemSentence(problem: RosterProblem): string {
  const d = problem.detail ?? {}
  const table = words.problems
  const template = table[problem.code] ?? table.fallback
  if (problem.code === "number-duplicate" && namesOf(problem) === "") return table["number-duplicate-unnamed"]
  return fill(template, {
    others: namesOf(problem),
    characters: (d.characters ?? []).join(" "),
    length: d.length ?? "",
    max: d.max ?? "",
    min: d.min ?? "",
    size: d.size ?? "",
    lines: d.lines ?? "",
    count: d.count ?? "",
  })
}

export const noteSentence = (note: RosterNote): string => words.notes[note.code] ?? ""

/** "Line 3" or "Line 3 · Bilal": the line's place from 1, and its name when it has one. */
export function lineLabel(index: number, name: string | undefined): { text: string; name: string | null } {
  const n = index + 1
  const trimmed = (name ?? "").trim()
  return trimmed
    ? { text: fill(words.order.list.lineNamed, { n, name: trimmed }), name: trimmed }
    : { text: fill(words.order.list.line, { n }), name: null }
}

export type ProblemRow = { index: number; label: string; name: string | null; sentences: string[] }

/** The lines with a failed check, in list order: which line (its place, and its name) and what is wrong, in sentences. */
export function problemRows(view: Pick<TeamOrderView, "lines" | "problems">): ProblemRow[] {
  const byLine = new Map<number, RosterProblem[]>()
  for (const p of view.problems) {
    if (p.index < 0) continue
    byLine.set(p.index, [...(byLine.get(p.index) ?? []), p])
  }
  return Array.from(byLine.entries())
    .sort(([a], [b]) => a - b)
    .map(([index, problems]) => {
      const label = lineLabel(index, view.lines[index]?.name)
      return { index, label: label.text, name: label.name, sentences: problems.map(problemSentence) }
    })
}

/** The problems of the whole list (index -1), such as a list that is too long. */
export const listProblemSentences = (view: Pick<TeamOrderView, "problems">): string[] =>
  view.problems.filter((p) => p.index < 0).map(problemSentence)

/** "22 players" and "24 pieces". */
export const playersWords = (n: number): string =>
  n === 1 ? words.list.card.playersOne : fill(words.list.card.players, { players: n })
export const piecesWords = (n: number): string =>
  n === 1 ? words.list.card.piecesOne : fill(words.list.card.pieces, { pieces: n })

/** What the backend's schedule says, in a sentence; null with no need-by date. Nothing here is computed: the days are the backend's. */
export function scheduleSentence(schedule: ScheduleView): { state: ScheduleView["state"]; text: string } | null {
  const n = words.order.needBy
  switch (schedule.state) {
    case "none":
      return null
    case "ok":
      return schedule.latestSignStandard
        ? { state: "ok", text: fill(n.ok, { latest: dayWords(schedule.latestSignStandard) }) }
        : null
    case "needs_rush":
      return schedule.latestSignRush
        ? { state: "needs_rush", text: fill(n.needsRush, { latest: dayWords(schedule.latestSignRush) }) }
        : { state: "needs_rush", text: n.cannotBeMetNoDay }
    case "cannot_be_met":
      return {
        state: "cannot_be_met",
        text: schedule.latestSignRush ? fill(n.cannotBeMet, { latest: dayWords(schedule.latestSignRush) }) : n.cannotBeMetNoDay,
      }
  }
}

/** What a failure says to the customer: from the backend's machine code, never its message. */
export function failureSentence(failure: Failure): string {
  const r = words.refusals
  switch (failure.kind) {
    case "signed_out":
      return r.signedOut
    case "unavailable":
      return r.unavailable
    case "not_found":
      return words.order.notFound.text
    case "stale":
      return words.designer.conflict.text
    case "refused": {
      const template = r[failure.code] ?? r.fallback
      const today = typeof failure.extra?.today === "string" ? dayWords(failure.extra.today) : ""
      return fill(template, { today })
    }
  }
}

