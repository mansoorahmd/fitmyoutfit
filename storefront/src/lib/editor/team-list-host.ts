// What the store gives the editor's team list (docs/design/08-team-list.md, 12.3; the editor's
// `teamList` prop): the product's sizes, the garment's noun, the region's minimum with its name,
// and the limits. Plain functions; the designer page and the designer component call them.

import type { TeamListHost, TeamListMinimum, TeamListNoun, TeamListSize } from "@fitmyoutfit/editor"
import type { RosterLimits } from "@fitmyoutfit/team-rules"

import { ADULT_SIZES, YOUTH_SIZES, groupOptionValues, isSizeOption } from "@lib/util/sizes"

type OptionLike = { title?: string | null; values?: { value?: string | null }[] | null }

/**
 * The product's sizes for the list's size field: the values of its "Size" option, youth first then
 * adult as the store shows them, any other size last. `undefined` when the product has no Size
 * option (the editor then uses its own usual sizes; the server will say every size is unknown,
 * which is the truth for such a product).
 */
export function teamListSizes(options: readonly OptionLike[] | null | undefined): TeamListSize[] | undefined {
  const option = (options ?? []).find((o) => isSizeOption(o.title))
  const values = (option?.values ?? []).map((v) => v.value).filter((v): v is string => typeof v === "string" && v.trim() !== "")
  if (values.length === 0) return undefined
  return groupOptionValues("Size", values).flatMap((group) =>
    group.values.map(
      (code): TeamListSize => ({
        code,
        group: (YOUTH_SIZES as readonly string[]).includes(code.toUpperCase())
          ? "youth"
          : (ADULT_SIZES as readonly string[]).includes(code.toUpperCase())
            ? "adult"
            : undefined,
      })
    )
  )
}

/** "jersey" and "jerseys" from the garment's short name ("Jersey", "T-shirt"). */
export function teamNoun(shortName: string): TeamListNoun {
  const one = shortName.trim().toLowerCase() || "shirt"
  return { one, many: `${one}s` }
}

/** The region's name as a sentence wants it: "the UK" for the United Kingdom, and so on; the region's own name otherwise. */
export function regionPhrase(region: { name?: string | null; countries?: { iso_2?: string | null }[] | null } | null | undefined): string {
  const codes = (region?.countries ?? []).map((c) => (c.iso_2 ?? "").toLowerCase())
  if (codes.includes("gb")) return "the UK"
  if (codes.includes("ae")) return "the UAE"
  if (codes.includes("us")) return "the US"
  return region?.name?.trim() || "this region"
}

/** The minimum for the note under the summary: only when the region needs more than one piece (Pakistan has none to show). */
export function listMinimum(required: number | null | undefined, regionName: string): TeamListMinimum | null {
  return typeof required === "number" && Number.isInteger(required) && required > 1 ? { pieces: required, region: regionName } : null
}

/** The server's limits as the editor's. Before an order exists there are none: the editor's defaults (the same numbers). */
export function listLimits(limits: Partial<RosterLimits> | undefined): TeamListHost["limits"] {
  return limits && Object.keys(limits).length > 0 ? { ...limits } : undefined
}
