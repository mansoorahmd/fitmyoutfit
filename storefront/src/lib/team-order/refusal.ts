// How an answer of the backend's team-order and design routes becomes what the
// storefront acts on (docs/contracts/m2-team-orders.md, section 0: one refusal
// shape, `{ type, code, message, ...extra }`; Medusa's own 401 has no code).
// The backend's `message` is for developers: it is dropped here and never
// shown. Pure, so every code it can meet is tested (refusal.test.ts).

import type { Failure } from "./types"

type Raw = Record<string, unknown>

const isRaw = (value: unknown): value is Raw => typeof value === "object" && value !== null && !Array.isArray(value)

/** The refusal's fields besides `type`, `code` and `message`: `status`, `current_version`, `today`, `problems`... */
const extrasOf = (body: Raw): Record<string, unknown> | undefined => {
  const rest = Object.fromEntries(Object.entries(body).filter(([k]) => k !== "type" && k !== "code" && k !== "message"))
  return Object.keys(rest).length > 0 ? rest : undefined
}

/**
 * The failure for a status and a body. `status` is undefined when nothing came back (no connection, or
 * the time limit ran out): the same as a 5xx, the backend could not be reached.
 */
export function failureFrom(status: number | undefined, body: unknown): Failure {
  if (typeof status !== "number" || status >= 500 || status < 400) return { kind: "unavailable" }
  if (status === 401) return { kind: "signed_out" }
  const raw = isRaw(body) ? body : {}
  const code = typeof raw.code === "string" ? raw.code : undefined
  if (status === 404) return { kind: "not_found" }
  if (status === 409 && code === "roster_version_stale") {
    const current = raw.current_version
    if (typeof current === "number" && Number.isSafeInteger(current) && current >= 1) {
      return { kind: "stale", currentVersion: current }
    }
    return { kind: "unavailable" }
  }
  const extra = extrasOf(raw)
  return { kind: "refused", status, code: code ?? "unknown", ...(extra ? { extra } : {}) }
}
