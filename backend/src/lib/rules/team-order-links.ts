/**
 * Late joiners and reorders: how a team order links to another, and what each kind needs. Plain
 * TypeScript, no Medusa imports.
 *
 * - An **add-on** is a team order of its own for players who join after the proof was signed. It is
 *   linked to the first order (`linked_order_id`), has the same design version, product and region,
 *   its own team list, proof and signature, and later its own payment. The first order and its signed
 *   proof are never changed by it. An add-on cannot have add-ons. Its minimum is a setting of its own
 *   (`addon_min_garment_quantity` in the region's metadata), because the region's ordinary minimum
 *   would refuse one late player. Its team-list checks also look at the numbers already taken in the
 *   first order's signed list and in the first order's other add-ons that have a proof out or signed.
 * - A **reorder** is a new, full team order made from a past signed one, with the same design version.
 *   Players are taken over from the source's SIGNED list (never from a later draft). The region's
 *   ordinary minimum applies and its numbers are checked within itself only.
 */
import type { TakenNumber } from "@fitmyoutfit/team-rules"
import { TEAM_ORDER_STATUSES, type TeamOrderStatus } from "./team-order-status"

export const TEAM_ORDER_KINDS = ["order", "add_on", "reorder"] as const
export type TeamOrderKind = (typeof TEAM_ORDER_KINDS)[number]

export function isKind(value: unknown): value is TeamOrderKind {
  return typeof value === "string" && (TEAM_ORDER_KINDS as readonly string[]).includes(value)
}

/** True when the status is `approved` or later: the proof was signed. */
export function isSigned(status: TeamOrderStatus): boolean {
  return TEAM_ORDER_STATUSES.indexOf(status) >= TEAM_ORDER_STATUSES.indexOf("approved")
}

/** True when a proof is out or signed (`proof_sent` or later): the order's list is frozen and counts as taken. */
export function hasProofOut(status: TeamOrderStatus): boolean {
  return TEAM_ORDER_STATUSES.indexOf(status) >= TEAM_ORDER_STATUSES.indexOf("proof_sent")
}

export type Source = { kind: TeamOrderKind; status: TeamOrderStatus }

/** Why an add-on cannot be started from this order, or null when it can. */
export function whyNoAddOn(source: Source): { code: "add_on_of_add_on" | "team_order_not_signed"; message: string } | null {
  if (source.kind === "add_on") {
    return { code: "add_on_of_add_on", message: "An add-on cannot have add-ons: start the add-on from the first order." }
  }
  if (!isSigned(source.status)) {
    return {
      code: "team_order_not_signed",
      message: "A late joiner can be added only after the proof is signed (the order is approved or later).",
    }
  }
  return null
}

/** Why a reorder cannot be made from this order, or null when it can. */
export function whyNoReorder(source: Source): { code: "team_order_not_signed"; message: string } | null {
  if (!isSigned(source.status)) {
    return {
      code: "team_order_not_signed",
      message: "A reorder can be made only from an order whose proof was signed (approved or later).",
    }
  }
  return null
}

/** The minimum the order's team list must reach: the add-on's own, or the region's. */
export function minimumFor(kind: TeamOrderKind, minimums: { region: number; addOn: number }): number {
  return kind === "add_on" ? minimums.addOn : minimums.region
}

/** A team list line of a snapshot, as stored in a proof. */
export type SnapshotLineLike = { name: string; number: string; no_number: boolean }

/** An order with the lines of its current proof, as input to `takenNumbers`. */
export type TakenSourceOrder = {
  id: string
  source: "first-order" | "add-on"
  /** What the order's design prints (from its proof's snapshot). */
  printsNumber: boolean
  lines: readonly SnapshotLineLike[]
}

/**
 * The numbers an add-on may not use: the printed numbers of the first order's signed list and of
 * the other add-ons' lists that have a proof out or signed. A line with no number, or with "no
 * number", takes none. The comparison of the numbers themselves ("7" is "07" is "٧") is the
 * package's.
 */
export function takenNumbers(orders: readonly TakenSourceOrder[]): TakenNumber[] {
  const taken: TakenNumber[] = []
  for (const order of orders) {
    if (!order.printsNumber) continue
    for (const line of order.lines) {
      if (line.no_number || line.number === "") continue
      taken.push({
        number: line.number,
        source: order.source,
        orderId: order.id,
        ...(line.name !== "" ? { name: line.name } : {}),
      })
    }
  }
  return taken
}

export type TakeChoice =
  | { ok: true; indexes: number[] }
  | { ok: false; code: "take_invalid" | "take_out_of_range"; message: string }

/**
 * Which lines of the source's signed list a reorder takes over: `"all"` (also when `take` is
 * absent), `"none"`, or a list of positions in the signed list (0 is the first line, as the signed
 * proof's snapshot shows them). Positions are kept in list order, once each.
 */
export function readTake(take: unknown, lineCount: number): TakeChoice {
  if (take === undefined || take === "all") {
    return { ok: true, indexes: Array.from({ length: lineCount }, (_, i) => i) }
  }
  if (take === "none") return { ok: true, indexes: [] }
  if (!Array.isArray(take) || take.some((i) => typeof i !== "number" || !Number.isInteger(i))) {
    return {
      ok: false,
      code: "take_invalid",
      message: '`take` must be "all", "none" or a list of line positions (whole numbers from 0).',
    }
  }
  const wanted = [...new Set(take as number[])]
  if (wanted.some((i) => i < 0 || i >= lineCount)) {
    return {
      ok: false,
      code: "take_out_of_range",
      message: `\`take\` names a position outside the signed list (it has ${lineCount} lines).`,
    }
  }
  return { ok: true, indexes: wanted.sort((a, b) => a - b) }
}
