// What the editor tells the designer when it opened a saved team list and could not keep all of it
// (`teamList.onReadNotes`; the editor's reader keeps every line it can): turned into the sentences the organizer reads,
// with the line's place counted from 1 as the list shows it. Plain functions, tested on their own (read-notes.test.ts).

import type { SavedListReadNote } from "@fitmyoutfit/editor"

import { teamOrderContent } from "@content/team-order"

export type ReadNotesMessage = {
  title: string
  /** One sentence for each thing that was cut, reset or left out, then the one that says what was kept. */
  sentences: string[]
  /** The list could not be opened at all: it is read-only, nothing of it is kept here. */
  unusable: boolean
}

const fill = (text: string, values: Record<string, string>): string => text.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "")
const capital = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1)

/** "line 3", "lines 3, 5 and 9", "lines 3, 5, 9, 12, 14 and 7 more": places as the list counts them (from 1). */
export function linesPhrase(indices: readonly number[]): string {
  const places = Array.from(new Set(indices)).sort((a, b) => a - b).map((i) => i + 1)
  if (places.length === 1) return `line ${places[0]}`
  if (places.length <= 5) return `lines ${places.slice(0, -1).join(", ")} and ${places[places.length - 1]}`
  return `lines ${places.slice(0, 5).join(", ")}${fill(teamOrderContent.designer.readNotes.more, { count: String(places.length - 5) })}`
}

function group<T>(items: readonly T[], keyOf: (item: T) => string): T[][] {
  const out = new Map<string, T[]>()
  for (const item of items) out.set(keyOf(item), [...(out.get(keyOf(item)) ?? []), item])
  return Array.from(out.values())
}

/**
 * The message for the editor's notes, or null when there are none. `kept` says where the list is saved: for a team
 * order the saved copy stays as it was until the organizer changes the list (the editor hands the list over only when
 * it changes), on this device the list is simply as it is shown.
 */
export function readNotesMessage(notes: readonly SavedListReadNote[], kept: "order" | "device"): ReadNotesMessage | null {
  const w = teamOrderContent.designer.readNotes
  if (notes.length === 0) return null
  if (notes.some((n) => n.code === "not-usable")) return { title: w.title, sentences: [w.unusable], unusable: true }

  const sentences: string[] = []
  const cut = notes.filter((n): n is Extract<SavedListReadNote, { code: "field-cut" }> => n.code === "field-cut")
  for (const same of group(cut, (n) => `${n.field}/${n.max}`)) {
    sentences.push(capital(fill(w.cut, { lines: linesPhrase(same.map((n) => n.index)), field: w.fields[same[0]!.field] ?? same[0]!.field, max: String(same[0]!.max) })))
  }
  const reset = notes.filter((n): n is Extract<SavedListReadNote, { code: "field-reset" }> => n.code === "field-reset")
  for (const same of group(reset, (n) => n.field)) {
    sentences.push(capital(fill(w.reset, { lines: linesPhrase(same.map((n) => n.index)), field: w.fields[same[0]!.field] ?? same[0]!.field })))
  }
  const left = notes.filter((n): n is Extract<SavedListReadNote, { code: "line-left-out" }> => n.code === "line-left-out")
  for (const reason of ["not-an-object", "over-the-limit"] as const) {
    const same = left.filter((n) => n.reason === reason)
    if (same.length === 0) continue
    const lines = linesPhrase(same.map((n) => n.index))
    const was = same.length === 1 ? "was" : "were"
    sentences.push(capital(fill(reason === "not-an-object" ? w.leftOutBroken : w.leftOutLimit, { lines, was })))
  }
  if (sentences.length === 0) return null
  sentences.push(kept === "order" ? w.keptOrder : w.keptDevice)
  return { title: w.title, sentences, unusable: false }
}
