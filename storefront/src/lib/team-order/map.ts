// The one place that turns the editor's shapes into the contract's and back
// (docs/contracts/m2-team-orders.md, sections 2 and 4). The backend speaks
// snake_case; the editor and the pages speak the rules package's camelCase.
// Plain functions with no store, React or network in them, so they are
// tested on their own (map.test.ts).
//
// Nothing is changed on the way: a name, a number or a size is passed as it
// is (Urdu and Arabic letters and digits as typed; the server cleans and
// checks, and its answer is the one that counts). The only repairs are for
// data that cannot be sent at all and the editor never makes (a count that is
// not a whole number is sent as 1).

import type {
  PrintedFields,
  ProblemCode,
  RosterLimits,
  RosterNote,
  RosterProblem,
  RosterSummary,
  NoteCode,
  TakenRef,
} from "@fitmyoutfit/team-rules"
import { parseRosterInput } from "@fitmyoutfit/team-rules"
import type { SavedTeamList } from "@fitmyoutfit/editor"

import {
  TEAM_ORDER_STATUSES,
  type EditorLine,
  type ScheduleState,
  type ScheduleView,
  type TeamOrderListItem,
  type TeamOrderStatus,
  type TeamOrderView,
} from "./types"

/** A line as `PUT /store/team-orders/:id/roster` takes it (contract section 2). */
export type ApiLineInput = {
  id?: string
  name: string
  number: string
  size: string
  count: number
  no_name: boolean
  no_number: boolean
}

type Raw = Record<string, unknown>

const isRaw = (value: unknown): value is Raw => typeof value === "object" && value !== null && !Array.isArray(value)
const str = (value: unknown, fallback = ""): string => (typeof value === "string" ? value : fallback)
const bool = (value: unknown): boolean => value === true
const int = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null)
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : [])

// ---- lines -----------------------------------------------------------------

/** One line of the editor's list as the contract's line-input. The id is kept so a line stays the same line. */
export function lineToInput(line: {
  id?: string
  name: string
  number: string
  size: string
  count: number
  noName: boolean
  noNumber: boolean
}): ApiLineInput {
  return {
    ...(line.id ? { id: line.id } : {}),
    name: line.name,
    number: line.number,
    size: line.size,
    count: Number.isSafeInteger(line.count) ? line.count : 1,
    no_name: line.noName === true,
    no_number: line.noNumber === true,
  }
}

export const linesToInput = (lines: readonly Parameters<typeof lineToInput>[0][]): ApiLineInput[] => lines.map(lineToInput)

/** A line of the server's answer as the editor holds it. Null when it is not a line at all. */
export function lineFromApi(raw: unknown): EditorLine | null {
  if (!isRaw(raw)) return null
  const id = str(raw.id)
  if (!id) return null
  return {
    id,
    name: str(raw.name),
    number: str(raw.number),
    size: str(raw.size),
    count: int(raw.count) ?? 1,
    noName: bool(raw.no_name),
    noNumber: bool(raw.no_number),
  }
}

// ---- the checks' result ----------------------------------------------------

const FIELDS = new Set(["name", "number", "size", "count", "list"])

function takenRef(raw: unknown): TakenRef | null {
  if (!isRaw(raw)) return null
  const source = raw.source === "add_on" || raw.source === "add-on" ? "add-on" : "first-order"
  return {
    source,
    ...(typeof raw.order_id === "string" ? { orderId: raw.order_id } : {}),
    ...(typeof raw.name === "string" ? { name: raw.name } : {}),
  }
}

/** The contract's `detail` (snake_case) as the rules package's `detail`. */
function detailFromApi(raw: unknown): RosterProblem["detail"] | undefined {
  if (!isRaw(raw)) return undefined
  const detail: NonNullable<RosterProblem["detail"]> = {}
  const value = int(raw.value)
  if (value !== null) detail.value = value
  if (Array.isArray(raw.others)) {
    detail.others = raw.others.flatMap((o) =>
      isRaw(o) && int(o.index) !== null
        ? [{ index: o.index as number, ...(typeof o.id === "string" ? { id: o.id } : {}), name: str(o.name) }]
        : []
    )
  }
  if (Array.isArray(raw.taken_in)) {
    detail.takenIn = raw.taken_in.flatMap((t) => {
      const ref = takenRef(t)
      return ref ? [ref] : []
    })
  }
  if (Array.isArray(raw.characters)) detail.characters = raw.characters.filter((c): c is string => typeof c === "string")
  if (typeof raw.has_digit === "boolean") detail.hasDigit = raw.has_digit
  for (const [from, to] of [
    ["length", "length"],
    ["max", "max"],
    ["count", "count"],
    ["min", "min"],
    ["lines", "lines"],
  ] as const) {
    const n = int(raw[from])
    if (n !== null) detail[to] = n
  }
  if (typeof raw.size === "string") detail.size = raw.size
  return Object.keys(detail).length > 0 ? detail : undefined
}

/** One problem of the server's answer. A code this storefront has no word for is kept as it is (the wording has a fallback). */
export function problemFromApi(raw: unknown): RosterProblem | null {
  if (!isRaw(raw) || typeof raw.code !== "string") return null
  const index = int(raw.index)
  if (index === null) return null
  const detail = detailFromApi(raw.detail)
  return {
    code: raw.code as ProblemCode,
    index,
    ...(typeof raw.line_id === "string" ? { lineId: raw.line_id } : {}),
    field: (typeof raw.field === "string" && FIELDS.has(raw.field) ? raw.field : "list") as RosterProblem["field"],
    ...(detail ? { detail } : {}),
  }
}

export function noteFromApi(raw: unknown): RosterNote | null {
  if (!isRaw(raw) || typeof raw.code !== "string") return null
  const index = int(raw.index)
  if (index === null) return null
  return { code: raw.code as NoteCode, index, ...(typeof raw.line_id === "string" ? { lineId: raw.line_id } : {}) }
}

const sizeCounts = (value: unknown) =>
  list(value).flatMap((s) => (isRaw(s) && typeof s.size === "string" ? [{ size: s.size, pieces: int(s.pieces) ?? 0 }] : []))

export function summaryFromApi(raw: unknown): RosterSummary | null {
  if (!isRaw(raw)) return null
  const players = int(raw.players)
  const pieces = int(raw.pieces)
  if (players === null || pieces === null) return null
  const minimum = isRaw(raw.minimum)
    ? { required: int(raw.minimum.required) ?? 0, missing: int(raw.minimum.missing) ?? 0, met: bool(raw.minimum.met) }
    : null
  return {
    players,
    pieces,
    bySize: sizeCounts(raw.by_size),
    otherSizes: sizeCounts(raw.other_sizes),
    linesWithoutSize: int(raw.lines_without_size) ?? 0,
    piecesWithoutSize: int(raw.pieces_without_size) ?? 0,
    readyLines: int(raw.ready_lines) ?? 0,
    linesToFix: int(raw.lines_to_fix) ?? 0,
    indexesToFix: list(raw.indexes_to_fix).flatMap((i) => (typeof i === "number" ? [i] : [])),
    minimum,
    readyForProof: bool(raw.ready_for_proof),
  }
}

/** The server's limits (`max_lines`, ...) as the editor's `limits`. Only what the server sent. */
export function limitsFromApi(raw: unknown): Partial<RosterLimits> {
  if (!isRaw(raw)) return {}
  const limits: Partial<RosterLimits> = {}
  for (const [from, to] of [
    ["max_lines", "maxLines"],
    ["min_count", "minCount"],
    ["max_count", "maxCount"],
    ["max_name_length", "maxNameLength"],
  ] as const) {
    const n = int(raw[from])
    if (n !== null && n >= 1) limits[to] = n
  }
  return limits
}

const SCHEDULE_STATES: readonly ScheduleState[] = ["none", "ok", "needs_rush", "cannot_be_met"]

export function scheduleFromApi(raw: unknown): ScheduleView | null {
  if (!isRaw(raw) || !SCHEDULE_STATES.includes(raw.state as ScheduleState) || typeof raw.today !== "string") return null
  const days = isRaw(raw.days) ? raw.days : {}
  const date = (v: unknown) => (typeof v === "string" ? v : null)
  return {
    state: raw.state as ScheduleState,
    needByDate: date(raw.need_by_date),
    today: raw.today,
    days: { standard: int(days.standard) ?? 0, rush: int(days.rush) ?? 0 },
    latestSignStandard: date(raw.latest_sign_standard),
    latestSignRush: date(raw.latest_sign_rush),
    daysLeftStandard: int(raw.days_left_standard),
    daysLeftRush: int(raw.days_left_rush),
  }
}

// ---- the whole answer ------------------------------------------------------

const isStatus = (value: unknown): value is TeamOrderStatus => TEAM_ORDER_STATUSES.includes(value as TeamOrderStatus)
const isKind = (value: unknown): value is TeamOrderView["kind"] => value === "order" || value === "add_on" || value === "reorder"

/** The contract's "whole read answer" as one object; null when it is not one (the page then says it could not read the order). */
export function parseTeamOrderAnswer(json: unknown): TeamOrderView | null {
  if (!isRaw(json) || !isRaw(json.team_order) || !isRaw(json.roster)) return null
  const order = json.team_order
  const roster = json.roster
  const summary = summaryFromApi(roster.summary)
  const schedule = scheduleFromApi(json.schedule)
  const version = int(roster.version)
  if (
    !summary ||
    !schedule ||
    version === null ||
    typeof order.id !== "string" ||
    !isStatus(order.status) ||
    typeof order.design_id !== "string" ||
    typeof order.design_version_id !== "string" ||
    typeof order.product_id !== "string" ||
    typeof order.region_id !== "string"
  ) {
    return null
  }
  const prints = isRaw(order.prints) ? order.prints : {}
  return {
    id: order.id,
    teamName: str(order.team_name),
    status: order.status,
    kind: isKind(order.kind) ? order.kind : "order",
    designId: order.design_id,
    designVersionId: order.design_version_id,
    productId: order.product_id,
    regionId: order.region_id,
    needByDate: typeof order.need_by_date === "string" ? order.need_by_date : null,
    rushRequested: bool(order.rush_requested),
    prints: { name: bool(prints.name), number: bool(prints.number) },
    listVersion: version,
    createdAt: str(order.created_at),
    sizes: list(json.sizes).filter((s): s is string => typeof s === "string"),
    lines: list(roster.lines).flatMap((l) => {
      const line = lineFromApi(l)
      return line ? [line] : []
    }),
    problems: list(roster.problems).flatMap((p) => {
      const problem = problemFromApi(p)
      return problem ? [problem] : []
    }),
    notes: list(roster.notes).flatMap((n) => {
      const note = noteFromApi(n)
      return note ? [note] : []
    }),
    summary,
    limits: limitsFromApi(json.limits),
    schedule,
  }
}

/** One entry of `GET /store/team-orders`. */
export function parseListItem(raw: unknown): TeamOrderListItem | null {
  if (
    !isRaw(raw) ||
    typeof raw.id !== "string" ||
    !isStatus(raw.status) ||
    typeof raw.product_id !== "string" ||
    typeof raw.region_id !== "string"
  ) {
    return null
  }
  return {
    id: raw.id,
    teamName: str(raw.team_name),
    status: raw.status,
    kind: isKind(raw.kind) ? raw.kind : "order",
    productId: raw.product_id,
    regionId: raw.region_id,
    needByDate: typeof raw.need_by_date === "string" ? raw.need_by_date : null,
    players: int(raw.players) ?? 0,
    pieces: int(raw.pieces) ?? 0,
    createdAt: str(raw.created_at),
  }
}

// ---- to and from the editor's saved list -----------------------------------

/**
 * The list as the editor takes it in (`teamList.initial`): the server's lines, in order. The editor
 * keeps a saved list only when its `productId` is the editor's own product definition id ("stand-in-jersey"),
 * not the store's product id ("prod_..."): the caller passes the editor's.
 */
export function savedListFromView(view: Pick<TeamOrderView, "lines" | "prints">, editorProductId: string): SavedTeamList {
  return {
    version: 1,
    productId: editorProductId,
    prints: { name: view.prints.name, number: view.prints.number } satisfies PrintedFields,
    lines: view.lines.map((l) => ({ ...l })),
  }
}

/**
 * Whether the editor will take these lines as they are. Its reader refuses the whole list when one
 * line is malformed or there are more lines than its limits (it then opens an empty list); the server
 * accepts lists the editor would refuse only when the limits differ. The designer tells the organizer
 * instead of showing an empty list that would then be saved over theirs.
 */
export function editorAcceptsList(view: Pick<TeamOrderView, "lines" | "limits">): boolean {
  return parseRosterInput(view.lines, view.limits).ok
}

/** What the editor hands over (`teamList.onChange`) as the body of the save. */
export function rosterBodyFromSaved(list: Pick<SavedTeamList, "lines">, version: number): { version: number; lines: ApiLineInput[] } {
  return { version, lines: linesToInput(list.lines) }
}
