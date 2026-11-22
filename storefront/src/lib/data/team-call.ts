import "server-only"

import { getAuthHeaders } from "./cookies"
import { failureFrom } from "@lib/team-order/refusal"
import type { Outcome } from "@lib/team-order/types"

// The one low-level call of the team-order and design routes (contract
// docs/contracts/m2-team-orders.md). Medusa's JS SDK keeps only the message
// of a refusal, and the contract's refusals are told apart by `code` (and
// carry `current_version`, `status`, `today`), so these routes are called
// with fetch directly: the same address, the same publishable key, the
// customer's token from the cookie. The token never leaves the server. A
// player's name is never logged here: nothing is logged.

const BACKEND = process.env.MEDUSA_BACKEND_URL ?? "http://localhost:9000"
const TIME_LIMIT_MS = 20_000

export type TeamCall<T> = {
  method: "GET" | "POST" | "PUT" | "DELETE"
  path: string
  body?: unknown
  /** Reads the answer's JSON; null means the storefront cannot read it. */
  read: (json: unknown) => T | null
}

/** Never throws: the answer read by `read`, or a failure that says why not. */
export async function teamCall<T>({ method, path, body, read }: TeamCall<T>): Promise<Outcome<T>> {
  let status: number | undefined
  let json: unknown = null
  try {
    const response = await fetch(`${BACKEND}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        "x-publishable-api-key": process.env.NEXT_PUBLIC_MEDUSA_PUBLISHABLE_KEY ?? "",
        ...(await getAuthHeaders()),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: "no-store",
      signal: AbortSignal.timeout(TIME_LIMIT_MS),
    })
    status = response.status
    json = await response.json().catch(() => null)
  } catch {
    return { ok: false, failure: { kind: "unavailable" } }
  }
  if (status >= 200 && status < 300) {
    const value = read(json)
    return value === null ? { ok: false, failure: { kind: "unavailable" } } : { ok: true, value }
  }
  return { ok: false, failure: failureFrom(status, json) }
}
