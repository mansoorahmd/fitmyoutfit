/**
 * The roster proof of a team order, as plain rules: whether a list may go into a proof, what a
 * signature request must hold, the address a signature records, and the shape of a proof in an API
 * answer. No Medusa imports. The snapshot and its hash are in @fitmyoutfit/team-rules.
 */
import { isIP } from "node:net"
import { cleanText, type ProofSnapshot } from "@fitmyoutfit/team-rules"
import { isScheduleState, type ScheduleState } from "./team-order-schedule"
import type { ApiLine, ApiSummary } from "./team-order"
import type { ProofStatus } from "./team-order-status"

export const MAX_SIGNED_NAME_LENGTH = 100

/** The team order's data a proof freezes, as stored. */
export type SnapshotSource = {
  design_version_id: string
  product_id: string
  region_id: string
  team_name: string
  prints_name: boolean
  prints_number: boolean
}

/** The snapshot of a team order and its lines (in list order): what the organizer signs. */
export function snapshotOf(order: SnapshotSource, lines: readonly ApiLine[]): ProofSnapshot {
  return {
    design_version_id: order.design_version_id,
    product_id: order.product_id,
    region_id: order.region_id,
    team_name: order.team_name,
    prints: { name: order.prints_name, number: order.prints_number },
    lines: lines.map((l) => ({
      name: l.name,
      number: l.number,
      size: l.size,
      count: l.count,
      no_name: l.no_name,
      no_number: l.no_number,
    })),
  }
}

export type NotReady =
  | { code: "roster_empty"; extra: Record<string, never> }
  | { code: "roster_has_problems"; extra: { problems: number; indexes_to_fix: number[] } }
  | { code: "roster_below_minimum"; extra: { required: number; missing: number } }

/**
 * Why a list cannot go into a proof, or null when it can: an empty list, a list with a problem
 * (any line, or the whole list), or fewer garments than the region's minimum. The first reason in
 * that order is the one reported; `summary.ready_for_proof` is true exactly when this is null.
 */
export function whyNotReady(summary: ApiSummary, problemCount: number): NotReady | null {
  if (summary.players === 0) return { code: "roster_empty", extra: {} }
  if (problemCount > 0) {
    return { code: "roster_has_problems", extra: { problems: problemCount, indexes_to_fix: summary.indexes_to_fix } }
  }
  if (summary.minimum && !summary.minimum.met) {
    return { code: "roster_below_minimum", extra: { required: summary.minimum.required, missing: summary.minimum.missing } }
  }
  return null
}

/** The name as typed, cleaned like other text: 1 to 100 characters, no control characters; else null. */
export function readSignedName(input: unknown): string | null {
  if (typeof input !== "string" || /\p{Cc}/u.test(input)) return null
  const name = cleanText(input)
  if (name === "" || [...name].length > MAX_SIGNED_NAME_LENGTH) return null
  return name
}

export type SignRequest = {
  proofHash: string
  signedName: string
  scheduleState: ScheduleState
}

export type SignRequestError =
  | "proof_hash_required"
  | "signed_name_required"
  | "confirmation_required"
  | "schedule_state_required"

/**
 * The body of a signature request: `{ proof_hash, signed_name, confirmed: true, schedule_state }`.
 * The hash is the one the organizer looked at; the name is as typed; `confirmed` must be the
 * boolean `true` (the box they ticked); `schedule_state` is the one they were shown.
 */
export function readSignRequest(body: Record<string, unknown>): { ok: true; value: SignRequest } | { ok: false; code: SignRequestError } {
  const hash = typeof body.proof_hash === "string" ? body.proof_hash.trim().toLowerCase() : ""
  if (!/^[0-9a-f]{64}$/u.test(hash)) return { ok: false, code: "proof_hash_required" }
  const name = readSignedName(body.signed_name)
  if (name === null) return { ok: false, code: "signed_name_required" }
  if (body.confirmed !== true) return { ok: false, code: "confirmation_required" }
  if (!isScheduleState(body.schedule_state)) return { ok: false, code: "schedule_state_required" }
  return { ok: true, value: { proofHash: hash, signedName: name, scheduleState: body.schedule_state } }
}

/**
 * The address of the person who signed, as the backend sees it. `trustedHops` is how many proxies
 * of ours stand between the internet and the backend (0 when none, 1 behind one load balancer).
 * - With 0 hops the address is the socket's: nothing a client sends is believed.
 * - With N hops the address is the N-th entry from the RIGHT of `X-Forwarded-For`: each of our
 *   proxies appends the address it received the connection from, so the entries to the right are
 *   written by us, and the entries to the left (including the first) are whatever the client sent
 *   and are never trusted. A header with fewer than N entries means the setting is wrong; then the
 *   socket's address is used.
 * An address that is not a valid IPv4 or IPv6 text is dropped (null). IPv4 written as IPv6
 * (`::ffff:1.2.3.4`) is stored as IPv4. The address is personal data: it is kept on the signed
 * proof only, never sent in an answer and never logged.
 */
export function clientIp(input: {
  forwardedFor: string | readonly string[] | undefined
  socketAddress: string | undefined
  trustedHops: number
}): string | null {
  const clean = (value: string | undefined): string | null => {
    if (!value) return null
    let ip = value.trim()
    if (ip.toLowerCase().startsWith("::ffff:") && isIP(ip.slice(7)) === 4) ip = ip.slice(7)
    return ip.length <= 64 && isIP(ip) !== 0 ? ip : null
  }
  const { trustedHops } = input
  if (Number.isInteger(trustedHops) && trustedHops > 0) {
    const header = Array.isArray(input.forwardedFor) ? input.forwardedFor.join(",") : (input.forwardedFor as string | undefined)
    const entries = (header ?? "").split(",").map((e) => e.trim()).filter((e) => e !== "")
    if (entries.length >= trustedHops) {
      return clean(entries[entries.length - trustedHops])
    }
  }
  return clean(input.socketAddress)
}

/** `TRUSTED_PROXY_HOPS` as a whole number from 0 to 10; anything else is 0 (the socket's address). */
export function readTrustedProxyHops(value: string | undefined): number {
  if (value === undefined || !/^\d{1,2}$/u.test(value.trim())) return 0
  const hops = Number(value.trim())
  return hops <= 10 ? hops : 0
}

/** A stored proof, as the module returns it. */
export type StoredProof = {
  id: string
  team_order_id: string
  proof_number: number
  status: ProofStatus
  design_version_id: string
  list_version: number
  snapshot_text: string
  snapshot_hash: string
  signed_name: string | null
  signed_at: Date | string | null
  schedule_state: string | null
  need_by_date: string | null
  rush: boolean | null
  promised_delivery_date: string | null
  created_at: Date | string
  closed_at: Date | string | null
}

export type ApiProof = {
  id: string
  team_order_id: string
  number: number
  status: ProofStatus
  hash: string
  design_version_id: string
  list_version: number
  created_at: Date | string
  /** When it was withdrawn or replaced. */
  closed_at: Date | string | null
  signed_name: string | null
  signed_at: Date | string | null
  /** The schedule as it was when the proof was signed. */
  schedule_state: string | null
  need_by_date: string | null
  rush: boolean | null
  promised_delivery_date: string | null
}

/** A proof for an answer: never the signer's address (it is not even read into this shape). */
export function proofToApi(proof: StoredProof): ApiProof {
  return {
    id: proof.id,
    team_order_id: proof.team_order_id,
    number: proof.proof_number,
    status: proof.status,
    hash: proof.snapshot_hash,
    design_version_id: proof.design_version_id,
    list_version: proof.list_version,
    created_at: proof.created_at,
    closed_at: proof.closed_at ?? null,
    signed_name: proof.signed_name ?? null,
    signed_at: proof.signed_at ?? null,
    schedule_state: proof.schedule_state ?? null,
    need_by_date: proof.need_by_date ?? null,
    rush: proof.rush ?? null,
    promised_delivery_date: proof.promised_delivery_date ?? null,
  }
}

/** A proof with its snapshot: the object parsed from the stored text, and the text itself. */
export function proofWithSnapshot(proof: StoredProof): ApiProof & { snapshot: unknown; snapshot_text: string } {
  return { ...proofToApi(proof), snapshot: JSON.parse(proof.snapshot_text) as unknown, snapshot_text: proof.snapshot_text }
}

/** The proof a team order currently holds (`sent` or `signed`), if any. */
export function currentProofOf(proofs: readonly StoredProof[]): StoredProof | null {
  return proofs.find((p) => p.status === "sent" || p.status === "signed") ?? null
}
