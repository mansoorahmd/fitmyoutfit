/**
 * What the design-request admin pages show and how: the shapes of the admin routes' answers
 * (/admin/design-requests) and the plain functions that turn them into words and colours. No React
 * here, so it is unit-tested (src/admin/__tests__/design-requests.unit.spec.ts). Every decision
 * (which status may follow, which refusal) is the backend's; this only names it.
 *
 * Everything a requester typed is a stranger's text: the pages render it as text only (React
 * escapes it; there is no HTML injection anywhere), and show their links as text with a warning,
 * never as live links.
 */

export type Status = "new" | "in_progress" | "proof_sent" | "done"

export const STATUSES: readonly Status[] = ["new", "in_progress", "proof_sent", "done"]

export type ListRow = {
  id: string
  reference: string
  status: Status
  status_label: string
  team_name: string
  contact_name: string
  email: string
  region: string
  product: string | null
  pieces: number | null
  need_by_date: string | null
  assigned_to: string | null
  assigned_to_email: string | null
  customer_id: string | null
  created_at: string | null
}

export type ListAnswer = {
  design_requests: ListRow[]
  count: number
  limit: number
  offset: number
  counts: Record<Status, number>
  new_count: number
}

export type Detail = {
  design_request: ListRow & {
    phone: string | null
    message: string
    reference_links: string[]
    staff_notes: string | null
    updated_at: string | null
  }
  steps: { from: Status; to: Status; by: string; by_email: string | null; at: string | null }[]
  allowed_next: { to: Status; label: string }[]
  customer: { id: string; email: string | null; name: string } | null
  team_orders: { id: string; team_name: string; status: string; created_at: string | null }[]
}

const LABELS: Record<Status, string> = {
  new: "New",
  in_progress: "In progress",
  proof_sent: "Proof sent",
  done: "Done",
}

export const statusLabel = (status: string): string => (LABELS as Record<string, string>)[status] ?? status

export function statusColor(status: string): "orange" | "blue" | "purple" | "green" | "grey" {
  switch (status) {
    case "new":
      return "orange"
    case "in_progress":
      return "blue"
    case "proof_sent":
      return "purple"
    case "done":
      return "green"
    default:
      return "grey"
  }
}

const PRODUCTS: Record<string, string> = { jersey: "Jersey", "t-shirt": "T-shirt", jacket: "Jacket", other: "Other" }
export const productLabel = (product: string | null): string => (product ? (PRODUCTS[product] ?? product) : "-")

const REGIONS: Record<string, string> = { pk: "Pakistan", gb: "United Kingdom", ae: "UAE", us: "United States" }
export const regionLabel = (region: string): string => REGIONS[region] ?? region

export function piecesText(pieces: number | null): string {
  return pieces === null ? "-" : `${pieces} piece${pieces === 1 ? "" : "s"}`
}

/** "5 Dec 2026, 14:30" in the viewer's time zone; the text itself if it is not a date. */
export function formatTime(iso: string | null): string {
  if (!iso) return "-"
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })
}

/** `2026-12-05` as "5 Dec 2026"; the text itself if it is not such a day. */
export function formatDay(day: string | null): string {
  if (!day) return "-"
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(day)
  if (!match) return day
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return date.toLocaleDateString("en-GB", { dateStyle: "medium", timeZone: "UTC" })
}

export function errorText(body: unknown, status: number): string {
  const message = typeof body === "object" && body !== null ? (body as { message?: unknown }).message : undefined
  return typeof message === "string" && message !== "" ? message : `Error ${status}`
}

export function stepText(step: { from: Status; to: Status }): string {
  return `${statusLabel(step.from)} to ${statusLabel(step.to)}`
}

export function rangeText(offset: number, shown: number, total: number): string {
  return shown === 0 ? `0 of ${total}` : `${offset + 1} to ${offset + shown} of ${total}`
}

/** What the confirmation asks before a status button does its work. */
export function confirmText(from: Status, to: Status): string {
  return `Move this request from "${statusLabel(from)}" to "${statusLabel(to)}"? The change is recorded with your name.`
}

export const LINK_WARNING =
  "These links were sent by a stranger. They are shown as text and are not clickable. Open one only if you trust it, by copying it into a new tab."
