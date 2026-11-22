/**
 * What the team-order admin pages show and how: the shapes of the admin routes' answers
 * (/admin/team-orders, contract docs/contracts/m2-team-orders.md, section "Admin routes") and the
 * plain functions that turn them into words, colours and dates. No React here, so it is unit-tested
 * (src/admin/__tests__/team-orders.unit.spec.ts). Every decision (which button, which refusal, the
 * schedule state) is the backend's; this only names it.
 */

export type Status =
  | "draft"
  | "proof_sent"
  | "approved"
  | "deposit_paid"
  | "in_production"
  | "balance_due"
  | "shipped"

export const STATUSES: readonly Status[] = [
  "draft",
  "proof_sent",
  "approved",
  "deposit_paid",
  "in_production",
  "balance_due",
  "shipped",
]

export type Person = { id: string; name: string; email: string | null }

export type ProofSummary = {
  id: string
  number: number
  status: "sent" | "signed" | "withdrawn" | "replaced"
  hash: string
  schedule_state: string | null
}

export type ListEntry = {
  id: string
  team_name: string
  status: Status
  kind: "order" | "add_on" | "reorder"
  linked_order_id: string | null
  need_by_date: string | null
  players: number
  pieces: number
  created_at: string
  organizer: Person
  region: { id: string; name: string }
  current_proof: ProofSummary | null
  schedule: { state: string; need_by_date: string | null; days_left_standard: number | null; days_left_rush: number | null }
}

export type ListAnswer = { team_orders: ListEntry[]; count: number; limit: number; offset: number }

export type Line = { id: string; name: string; number: string; size: string; count: number; no_name: boolean; no_number: boolean }

export type Action = { id: string; to: Status; label: string; confirm: string; by_hand: boolean }

export type Detail = {
  team_order: {
    id: string
    team_name: string
    status: Status
    kind: ListEntry["kind"]
    linked_order_id: string | null
    need_by_date: string | null
    rush_requested: boolean
    prints: { name: boolean; number: boolean }
    list_version: number
    created_at: string
    updated_at: string
  }
  organizer: Person
  region: { id: string; name: string }
  product: { id: string; title: string }
  design_version: { id: string; design_id: string; design_name: string; version: number | null }
  roster: {
    lines: Line[]
    problems: { code: string; index: number }[]
    summary: {
      players: number
      pieces: number
      by_size: { size: string; pieces: number }[]
      other_sizes: { size: string; pieces: number }[]
      lines_without_size: number
      minimum: { required: number; missing: number; met: boolean } | null
    }
  }
  schedule: { state: string; need_by_date: string | null; today: string; latest_sign_standard: string | null; latest_sign_rush: string | null }
  links: {
    kind: string
    source: { id: string; team_name: string; status: Status; kind: string } | null
    add_ons: { count: number; items: { id: string; status: Status; players: number; pieces: number }[] }
    reorders: { count: number; items: { id: string; status: Status; players: number; pieces: number }[] }
  }
  proofs: (ProofSummary & {
    created_at: string
    closed_at: string | null
    signed_name: string | null
    signed_at: string | null
    signed_by: Person | null
    signed_ip: string | null
    promised_delivery_date: string | null
    rush: boolean | null
    need_by_date: string | null
    snapshot: { lines: Omit<Line, "id">[]; team_name: string; prints: { name: boolean; number: boolean } }
  })[]
  steps: {
    id: string
    step_name: string
    from: Status
    to: Status
    actor: "organizer" | "admin" | "system"
    actor_label: string
    actor_person: Person | null
    by_hand: boolean
    created_at: string
  }[]
  emails: { kind: string; status: string; attempts: number; sent_at: string | null; created_at: string }[]
  actions: Action[]
}

export type BadgeColor = "green" | "orange" | "red" | "grey" | "blue" | "purple"

const STATUS_LABELS: Record<Status, string> = {
  draft: "Draft",
  proof_sent: "Proof sent",
  approved: "Approved",
  deposit_paid: "Deposit paid",
  in_production: "In production",
  balance_due: "Balance due",
  shipped: "Shipped",
}

const STATUS_COLORS: Record<Status, BadgeColor> = {
  draft: "grey",
  proof_sent: "blue",
  approved: "purple",
  deposit_paid: "orange",
  in_production: "orange",
  balance_due: "red",
  shipped: "green",
}

export const statusLabel = (status: string): string => STATUS_LABELS[status as Status] ?? status
export const statusColor = (status: string): BadgeColor => STATUS_COLORS[status as Status] ?? "grey"

export const kindLabel = (kind: string): string => (kind === "add_on" ? "Add-on" : kind === "reorder" ? "Reorder" : "")

const PROOF_LABELS: Record<string, string> = { sent: "Sent", signed: "Signed", withdrawn: "Withdrawn", replaced: "Replaced" }
const PROOF_COLORS: Record<string, BadgeColor> = { sent: "blue", signed: "green", withdrawn: "grey", replaced: "grey" }
export const proofStatusLabel = (status: string): string => PROOF_LABELS[status] ?? status
export const proofStatusColor = (status: string): BadgeColor => PROOF_COLORS[status] ?? "grey"

const SCHEDULE_LABELS: Record<string, string> = {
  none: "No date",
  ok: "On time",
  needs_rush: "Needs rush",
  cannot_be_met: "Cannot be met",
}
const SCHEDULE_COLORS: Record<string, BadgeColor> = { none: "grey", ok: "green", needs_rush: "orange", cannot_be_met: "red" }
export const scheduleLabel = (state: string): string => SCHEDULE_LABELS[state] ?? state
export const scheduleColor = (state: string): BadgeColor => SCHEDULE_COLORS[state] ?? "grey"

/** `2026-12-03` as `3 Dec 2026`; text that is not a calendar day is returned as it is; null is a dash. */
export function formatDay(day: string | null | undefined): string {
  if (!day) return "-"
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(day)
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  const month = match ? months[Number(match[2]) - 1] : undefined
  return match && month ? `${Number(match[3])} ${month} ${match[1]}` : day
}

/** An ISO time as `3 Dec 2026, 14:05` in the browser's zone; the text as it is when it is not a time; a dash for none. */
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "-"
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })
}

/** The organizer as "Name (email)", or whichever part there is. */
export function personText(person: Person | null | undefined): string {
  if (!person) return "-"
  const name = person.name.trim()
  if (name && person.email) return `${name} (${person.email})`
  return name || person.email || person.id
}

/** "12 players, 14 pieces". */
export function playersText(players: number, pieces: number): string {
  const p = `${players} ${players === 1 ? "player" : "players"}`
  return pieces === players ? p : `${p}, ${pieces} ${pieces === 1 ? "piece" : "pieces"}`
}

/** The summary per size as "S 3, M 5, L 4"; sizes with no pieces are left out; "-" when there are none. */
export function sizesText(bySize: { size: string; pieces: number }[], other: { size: string; pieces: number }[] = []): string {
  const parts = [...bySize, ...other].filter((s) => s.pieces > 0).map((s) => `${s.size} ${s.pieces}`)
  return parts.length > 0 ? parts.join(", ") : "-"
}

/** The latest day to sign, in words: "3 days left", "today", "2 days past". Null when there is none. */
export function daysLeftText(days: number | null | undefined): string | null {
  if (days === null || days === undefined) return null
  if (days === 0) return "last day to sign is today"
  if (days > 0) return `${days} ${days === 1 ? "day" : "days"} left to sign`
  return `${-days} ${days === -1 ? "day" : "days"} past the latest day to sign`
}

/** The page of a list as "1-20 of 53"; "0" when empty. */
export function rangeText(offset: number, shown: number, count: number): string {
  if (count === 0 || shown === 0) return "0"
  return `${offset + 1}-${offset + shown} of ${count}`
}

/** A short form of a 64-character hash for a table; the full hash goes in the title. */
export function shortHash(hash: string): string {
  return hash.length > 16 ? `${hash.slice(0, 8)}...${hash.slice(-8)}` : hash
}

/** What a record of a step says: "Draft to proof sent", and for the balance note, its own words. */
export function stepText(step: { step_name: string; from: string; to: string }): string {
  if (step.step_name === "balance_received_by_hand") return "Balance marked as received"
  if (step.step_name === "pay_deposit") return "Deposit marked as received"
  return `${statusLabel(step.from)} to ${statusLabel(step.to).toLowerCase()}`
}

/** The refusal text of an admin route's answer, for a message under a button. */
export function errorText(body: unknown, status: number): string {
  const message = typeof body === "object" && body !== null ? (body as { message?: unknown }).message : undefined
  return typeof message === "string" && message !== "" ? message : `Error ${status}`
}
