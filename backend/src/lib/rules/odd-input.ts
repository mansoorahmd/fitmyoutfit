/**
 * Input no honest client sends and the database cannot hold, found before it reaches a query: a
 * NUL character in a text (PostgreSQL cannot store one in a text or in jsonb), a JSON nested too
 * deep, and an address whose percent-escape cannot be decoded. Plain TypeScript, no Medusa imports.
 */

export type JsonScan = { tooDeep: boolean; hasNull: boolean }

/**
 * Walks a parsed JSON value once, without recursion (a value nested 50,000 levels deep must not
 * overflow the stack), and reports whether any string or key holds a NUL character and whether the
 * nesting is deeper than `maxDepth` (the value itself is level 1; an array or object one level
 * deeper than its parent). With a depth over the limit the walk stops, and `hasNull` covers only
 * what it saw. `skipTopLevelKeys` leaves those keys of the root object alone (a part that has a
 * check of its own).
 */
export function scanJson(root: unknown, options: { maxDepth?: number; skipTopLevelKeys?: readonly string[] } = {}): JsonScan {
  const maxDepth = options.maxDepth ?? Number.POSITIVE_INFINITY
  const skip = new Set(options.skipTopLevelKeys ?? [])
  const stack: [unknown, number][] = [[root, 1]]
  let hasNull = false
  while (stack.length > 0) {
    const [value, depth] = stack.pop() as [unknown, number]
    if (typeof value === "string") {
      if (value.includes("\u0000")) hasNull = true
      continue
    }
    if (typeof value !== "object" || value === null) continue
    if (depth > maxDepth) return { tooDeep: true, hasNull }
    if (Array.isArray(value)) {
      for (const item of value) stack.push([item, depth + 1])
      continue
    }
    for (const [key, item] of Object.entries(value)) {
      if (depth === 1 && skip.has(key)) continue
      if (key.includes("\u0000")) hasNull = true
      stack.push([item, depth + 1])
    }
  }
  return { tooDeep: false, hasNull }
}

/** True when any value of the route's parameters (already decoded) holds a NUL character. */
export function hasNullInParams(params: Record<string, unknown> | undefined): boolean {
  return Object.values(params ?? {}).some((value) => typeof value === "string" && value.includes("\u0000"))
}

/**
 * True for the error Express raises when a path parameter has a percent-escape that cannot be
 * decoded (`teamord_%`, `%E0%A4%A`): a URIError with status 400 and "Failed to decode param".
 */
export function isPathDecodeError(error: unknown): boolean {
  const e = error as { message?: unknown; status?: unknown; statusCode?: unknown } | null
  return (
    typeof e === "object" &&
    e !== null &&
    typeof e.message === "string" &&
    e.message.startsWith("Failed to decode param") &&
    (e.status === 400 || e.statusCode === 400)
  )
}
