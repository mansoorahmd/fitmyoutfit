/**
 * Saved designs: what a design version may hold, and what the design prints. Plain TypeScript, no
 * Medusa imports.
 *
 * A version stores the design JSON exactly as the editor produced it. The server checks only that
 * it is a JSON object with a whole-number `schemaVersion` and is not too large; checking it
 * against the editor's full schema is a later task (the editor's validateDesign needs the product
 * definition and the font catalog, which the backend does not have yet).
 */

import { scanJson } from "./odd-input"

/** The largest design JSON stored in one version, in bytes of its JSON text. */
export const MAX_DESIGN_BYTES = 1_000_000

/** The deepest nesting of arrays and objects in a design JSON (the editor's sample designs are 5 levels deep). */
export const MAX_DESIGN_DEPTH = 64

/** The longest name of a design, in characters. */
export const MAX_DESIGN_NAME_LENGTH = 100

export type DesignJsonCheck =
  | { ok: true; schemaVersion: number }
  | {
      ok: false
      code:
        | "design_not_an_object"
        | "design_schema_version"
        | "design_too_deep"
        | "design_contains_null_character"
        | "design_too_large"
      message: string
    }

/** True when `input` is a plain JSON object (not null, not an array). */
export function isJsonObject(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input)
}

export function checkDesignJson(
  input: unknown,
  maxBytes: number = MAX_DESIGN_BYTES,
  maxDepth: number = MAX_DESIGN_DEPTH
): DesignJsonCheck {
  if (!isJsonObject(input)) {
    return { ok: false, code: "design_not_an_object", message: "`design` must be a JSON object." }
  }
  const { schemaVersion } = input
  if (typeof schemaVersion !== "number" || !Number.isInteger(schemaVersion) || schemaVersion < 1) {
    return {
      ok: false,
      code: "design_schema_version",
      message: "`design.schemaVersion` must be a whole number of 1 or more.",
    }
  }
  // Before the size is worked out: JSON.stringify of a value nested tens of thousands of levels deep
  // overflows the stack, and PostgreSQL cannot store a NUL character in jsonb.
  const scan = scanJson(input, { maxDepth })
  if (scan.tooDeep) {
    return { ok: false, code: "design_too_deep", message: `\`design\` is nested more than ${maxDepth} levels deep.` }
  }
  if (scan.hasNull) {
    return {
      ok: false,
      code: "design_contains_null_character",
      message: "`design` holds a NUL character (\\u0000) in a text or a key, which cannot be stored.",
    }
  }
  const bytes = Buffer.byteLength(JSON.stringify(input), "utf8")
  if (bytes > maxBytes) {
    return {
      ok: false,
      code: "design_too_large",
      message: `\`design\` is ${bytes} bytes as JSON; the most stored is ${maxBytes}.`,
    }
  }
  return { ok: true, schemaVersion }
}

/** The name of a design: trimmed text of 1 to 100 characters, no control characters; null if not. */
export function readDesignName(input: unknown): string | null {
  if (typeof input !== "string" || /\p{Cc}/u.test(input)) return null
  const name = input.normalize("NFC").replace(/\s+/gu, " ").trim()
  if (name === "" || [...name].length > MAX_DESIGN_NAME_LENGTH) return null
  return name
}

/** What a design prints for each player: a name layer, a number layer (the editor's item roles). */
export function printedFieldsOf(design: unknown): { name: boolean; number: boolean } {
  const layers = isJsonObject(design) && Array.isArray(design.layers) ? design.layers : []
  const roles = new Set<unknown>(layers.map((layer) => (isJsonObject(layer) ? layer.role : undefined)))
  return { name: roles.has("player-name"), number: roles.has("player-number") }
}
