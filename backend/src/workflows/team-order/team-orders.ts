/**
 * Team orders, as the store routes use them: Medusa glue around the team-order module and the
 * roster rules of @fitmyoutfit/team-rules (through lib/rules/team-order.ts). A customer sees and
 * changes only the team orders they are the organizer of; anyone else's is "not found".
 *
 * Where the checks get their data (never from the request):
 * - which fields the design prints: the design version's JSON (lib/rules/design-input.ts), read
 *   when the team order is made and stored on it;
 * - the product's sizes: the product's "Size" option, read at every check;
 * - the minimum: the region's `min_garment_quantity` (lib/settings/min-garment-quantity.ts);
 * - the limits: the store's metadata, else the package defaults (lib/settings/roster-limits.ts).
 */
import { randomUUID } from "node:crypto"
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, MedusaError } from "@medusajs/framework/utils"
import {
  normalizeLines,
  parseRosterInput,
  piecesOf,
  resolveLimits,
  type RosterInputError,
  type RosterLimits,
  type TakenNumber,
} from "@fitmyoutfit/team-rules"
import { badRequest, conflict, notAllowed, notFound } from "../../lib/http/refusal"
import { printedFieldsOf } from "../../lib/rules/design-input"
import { calendarDateIn } from "../../lib/rules/delivery-promise"
import { currentProofOf, proofToApi, type StoredProof } from "../../lib/rules/team-order-proof"
import { isInThePast, scheduleFor } from "../../lib/rules/team-order-schedule"
import { allowedIn, isStatus } from "../../lib/rules/team-order-status"
import {
  hasProofOut,
  isKind,
  isSigned,
  minimumFor,
  takenNumbers,
  type TakenSourceOrder,
  type TeamOrderKind,
} from "../../lib/rules/team-order-links"
import { readAddOnMinGarmentQuantity } from "../../lib/settings/addon-min-garment-quantity"
import { readDeliveryDays, type DeliveryDays } from "../../lib/settings/delivery-days"
import { readScheduleTimeZone } from "../../lib/settings/schedule-time-zone"
import {
  buildRosterView,
  entriesToLines,
  readNeedByDate,
  readTeamName,
  sizesFromOptions,
  type StoredEntry,
} from "../../lib/rules/team-order"
import { readMinGarmentQuantity } from "../../lib/settings/min-garment-quantity"
import { readRosterLimits } from "../../lib/settings/roster-limits"
import { TEAM_ORDER_MODULE } from "../../modules/team-order/constants"
import { RosterVersionStale, TeamOrderChanged } from "../../modules/team-order/service"
import type TeamOrderModuleService from "../../modules/team-order/service"
import { loadOwnVersionById } from "../design/designs"

export type TeamOrderRow = {
  id: string
  customer_id: string
  team_name: string
  design_id: string
  design_version_id: string
  product_id: string
  region_id: string
  need_by_date: string | null
  status: string
  prints_name: boolean
  prints_number: boolean
  list_version: number
  rush_requested: boolean
  kind: string
  linked_order_id: string | null
  created_at: Date | string
  updated_at: Date | string
}

type Metadata = Record<string, unknown> | null | undefined

export const kindOf = (order: Pick<TeamOrderRow, "kind">): TeamOrderKind => (isKind(order.kind) ? order.kind : "order")

export const service = (container: MedusaContainer) => container.resolve<TeamOrderModuleService>(TEAM_ORDER_MODULE)

export function teamOrderToApi(order: TeamOrderRow) {
  return {
    id: order.id,
    team_name: order.team_name,
    status: order.status,
    design_id: order.design_id,
    design_version_id: order.design_version_id,
    product_id: order.product_id,
    region_id: order.region_id,
    need_by_date: order.need_by_date,
    prints: { name: order.prints_name, number: order.prints_number },
    list_version: order.list_version,
    rush_requested: order.rush_requested === true,
    kind: kindOf(order),
    linked_order_id: order.linked_order_id ?? null,
    created_at: order.created_at,
    updated_at: order.updated_at,
  }
}

/** The team order, if the customer is its organizer; else throws not found. */
export async function loadOwnTeamOrder(container: MedusaContainer, customerId: string, id: string): Promise<TeamOrderRow> {
  const found = (await service(container).listTeamOrders({ id, customer_id: customerId })) as TeamOrderRow[]
  if (found.length === 0) {
    throw notFound("team_order_not_found", `Team order ${id} was not found.`)
  }
  return found[0]!
}

export async function loadEntries(container: MedusaContainer, teamOrderId: string): Promise<StoredEntry[]> {
  return (await service(container).listRosterEntries(
    { team_order_id: teamOrderId },
    { order: { position: "ASC" } }
  )) as StoredEntry[]
}

export async function loadProductSizes(container: MedusaContainer, productId: string): Promise<string[] | null> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product",
    fields: ["id", "options.title", "options.values.value", "options.values.rank"],
    filters: { id: productId },
  })
  const product = (data as unknown as { options?: Parameters<typeof sizesFromOptions>[0] }[])[0]
  return product ? sizesFromOptions(product.options) : null
}

export async function loadRegion(container: MedusaContainer, regionId: unknown) {
  if (typeof regionId !== "string" || regionId === "") {
    throw badRequest("region_id_required", "`region_id` must be the id of a region.")
  }
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "region", fields: ["id", "name", "metadata"], filters: { id: regionId } })
  const region = (data as unknown as { id: string; name?: string | null; metadata?: Metadata }[])[0]
  if (!region) {
    throw badRequest("region_not_found", `Region ${regionId} was not found.`)
  }
  return region
}

/** The region's minimum, in pieces. A setting that is missing or wrong is a server error naming it. */
export function regionMinimum(region: { name?: string | null; metadata?: Metadata }): number {
  const minimum = readMinGarmentQuantity(region.metadata, region.name)
  if (!minimum.ok) {
    throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, `The store's region settings are incomplete: ${minimum.error}`)
  }
  return minimum.value
}

/** The add-on minimum of a region, in pieces. A setting that is missing or wrong is a server error naming it. */
export function regionAddOnMinimum(region: { name?: string | null; metadata?: Metadata }): number {
  const minimum = readAddOnMinGarmentQuantity(region.metadata, region.name)
  if (!minimum.ok) {
    throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, `The store's region settings are incomplete: ${minimum.error}`)
  }
  return minimum.value
}

/** The minimum the order's team list must reach: its region's, or the add-on's own for an add-on. */
export function minimumOfOrder(order: Pick<TeamOrderRow, "kind">, region: { name?: string | null; metadata?: Metadata }): number {
  return kindOf(order) === "add_on"
    ? minimumFor("add_on", { region: 0, addOn: regionAddOnMinimum(region) })
    : regionMinimum(region)
}

/** The store settings a team order reads at every answer: roster limits, delivery days, the store's day. */
export type StoreSettings = { limits: Partial<RosterLimits>; deliveryDays: DeliveryDays; timeZone: string }

export async function loadStoreSettings(container: MedusaContainer): Promise<StoreSettings> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "store", fields: ["metadata"] })
  const metadata = (data as unknown as { metadata?: Metadata }[])[0]?.metadata
  const limits = readRosterLimits(metadata)
  if (!limits.ok) {
    throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, `The store's roster settings are invalid: ${limits.error}`)
  }
  const days = readDeliveryDays(metadata)
  if (!days.ok) {
    throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, `The store's delivery settings are invalid: ${days.error}`)
  }
  const zone = readScheduleTimeZone(metadata)
  if (!zone.ok) {
    throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, `The store's schedule settings are invalid: ${zone.error}`)
  }
  return { limits: limits.value, deliveryDays: days.value, timeZone: zone.value }
}

/** The proofs of a team order, newest first (all of them, signed, withdrawn and replaced). */
export async function loadProofs(container: MedusaContainer, teamOrderId: string): Promise<StoredProof[]> {
  return (await service(container).listProofApprovals(
    { team_order_id: teamOrderId },
    { order: { proof_number: "DESC" } }
  )) as unknown as StoredProof[]
}

/** The lines and printed fields of the proof an order currently holds (`sent` or `signed`), if any. */
async function currentSnapshotOf(container: MedusaContainer, orderId: string) {
  const current = currentProofOf(await loadProofs(container, orderId))
  if (!current) return null
  return JSON.parse(current.snapshot_text) as {
    prints: { number: boolean }
    lines: { name: string; number: string; no_number: boolean }[]
  }
}

/**
 * The numbers an add-on may not use (lib/rules/team-order-links.ts): the first order's signed
 * list, and the lists of the first order's other add-ons that have a proof out or signed. Empty for
 * any other kind of order.
 */
export async function loadTakenNumbers(container: MedusaContainer, order: TeamOrderRow): Promise<TakenNumber[]> {
  if (kindOf(order) !== "add_on" || !order.linked_order_id) return []
  const teams = service(container)
  const [first] = (await teams.listTeamOrders({ id: order.linked_order_id })) as TeamOrderRow[]
  if (!first) return []
  const sources: TakenSourceOrder[] = []
  const firstStatus = isStatus(first.status) ? first.status : "draft"
  if (isSigned(firstStatus)) {
    const snapshot = await currentSnapshotOf(container, first.id)
    if (snapshot) sources.push({ id: first.id, source: "first-order", printsNumber: snapshot.prints.number, lines: snapshot.lines })
  }
  const siblings = (await teams.listTeamOrders({ linked_order_id: first.id, kind: "add_on" })) as TeamOrderRow[]
  for (const sibling of siblings) {
    if (sibling.id === order.id || !isStatus(sibling.status) || !hasProofOut(sibling.status)) continue
    const snapshot = await currentSnapshotOf(container, sibling.id)
    if (snapshot) sources.push({ id: sibling.id, source: "add-on", printsNumber: snapshot.prints.number, lines: snapshot.lines })
  }
  return takenNumbers(sources)
}

/** The store's calendar day (YYYY-MM-DD) in its time zone. */
export const todayIn = (settings: StoreSettings, now: Date): string => calendarDateIn(now, settings.timeZone)

/** The need-by schedule of a team order as of `now`. */
export function scheduleOf(order: Pick<TeamOrderRow, "need_by_date">, settings: StoreSettings, now: Date) {
  return scheduleFor({ needBy: order.need_by_date, today: todayIn(settings, now), days: settings.deliveryDays })
}

/** The limits the checks used, in the API's names. */
export function limitsToApi(limits: Partial<RosterLimits>) {
  const l = resolveLimits(limits)
  return { max_lines: l.maxLines, min_count: l.minCount, max_count: l.maxCount, max_name_length: l.maxNameLength }
}

/**
 * The team order, its team list with the checks' result for every line, the summary, the limits
 * the checks used, the need-by schedule as of `now`, and the proof it currently holds.
 */
export async function describeTeamOrder(container: MedusaContainer, order: TeamOrderRow, now: Date = new Date()) {
  const [entries, sizes, region, settings, proofs, taken, links] = await Promise.all([
    loadEntries(container, order.id),
    loadProductSizes(container, order.product_id),
    loadRegion(container, order.region_id),
    loadStoreSettings(container),
    loadProofs(container, order.id),
    loadTakenNumbers(container, order),
    loadLinks(container, order),
  ])
  const productSizes = sizes ?? []
  const view = buildRosterView({
    lines: entriesToLines(entries),
    prints: { name: order.prints_name, number: order.prints_number },
    sizes: productSizes,
    limits: settings.limits,
    minimum: minimumOfOrder(order, region),
    taken,
  })
  const current = currentProofOf(proofs)
  return {
    team_order: teamOrderToApi(order),
    sizes: productSizes,
    roster: { version: order.list_version, ...view },
    limits: limitsToApi(settings.limits),
    schedule: scheduleOf(order, settings, now),
    current_proof: current ? proofToApi(current) : null,
    links,
  }
}

const describe = describeTeamOrder

type LinkedItem = { id: string; status: string; players: number; pieces: number }

async function linkedItems(container: MedusaContainer, orders: TeamOrderRow[]): Promise<LinkedItem[]> {
  const entries =
    orders.length === 0
      ? []
      : ((await service(container).listRosterEntries(
          { team_order_id: orders.map((o) => o.id) },
          { select: ["team_order_id", "count"] }
        )) as { team_order_id: string; count: number }[])
  return orders.map((o) => {
    const mine = entries.filter((e) => e.team_order_id === o.id)
    return { id: o.id, status: o.status, players: mine.length, pieces: mine.reduce((sum, e) => sum + piecesOf(e), 0) }
  })
}

/**
 * The links of an order: what it belongs to (`source`: the first order of an add-on, the order a
 * reorder was made from), its add-ons (how many, and each one's status, players and pieces) and
 * its reorders. Shown on both ends of a link.
 */
export async function loadLinks(container: MedusaContainer, order: TeamOrderRow) {
  const teams = service(container)
  const [source] = order.linked_order_id ? ((await teams.listTeamOrders({ id: order.linked_order_id })) as TeamOrderRow[]) : []
  const children = (await teams.listTeamOrders({ linked_order_id: order.id }, { order: { created_at: "ASC" } })) as TeamOrderRow[]
  const addOns = await linkedItems(container, children.filter((c) => kindOf(c) === "add_on"))
  const reorders = await linkedItems(container, children.filter((c) => kindOf(c) === "reorder"))
  return {
    kind: kindOf(order),
    source: source ? { id: source.id, team_name: source.team_name, status: source.status, kind: kindOf(source) } : null,
    add_ons: { count: addOns.length, items: addOns },
    reorders: { count: reorders.length, items: reorders },
  }
}

/** The refusal for a change to a team order that is no longer a draft (or, for the schedule, no longer open). */
export function notEditable(order: Pick<TeamOrderRow, "status">, what: string) {
  const status = isStatus(order.status) ? order.status : "draft"
  const frozen = allowedIn(status).listFrozen
  return notAllowed(
    "team_order_not_editable",
    `${what} can only be changed while the team order is a draft${frozen ? " (a proof was made: go back to draft first)" : ""}.`,
    { status: order.status }
  )
}

export async function createTeamOrder(container: MedusaContainer, customerId: string, body: Record<string, unknown>) {
  const teamName = readTeamName(body.team_name)
  if (teamName === null) {
    throw badRequest("team_name_invalid", "`team_name` must be text of 1 to 100 characters.")
  }
  const needBy = readNeedByDate(body.need_by_date)
  if (!needBy.ok) {
    throw badRequest("need_by_date_invalid", "`need_by_date` must be a calendar date written YYYY-MM-DD.")
  }
  if (body.rush_requested !== undefined && typeof body.rush_requested !== "boolean") {
    throw badRequest("rush_requested_invalid", "`rush_requested` must be true or false.")
  }
  if (needBy.value !== null) {
    const today = todayIn(await loadStoreSettings(container), new Date())
    if (isInThePast(needBy.value, today)) {
      throw badRequest("need_by_date_in_past", "`need_by_date` is before today.", { today })
    }
  }
  const version = await loadOwnVersionById(container, customerId, body.design_version_id)
  if (body.product_id !== undefined && body.product_id !== version.product_id) {
    throw badRequest("product_mismatch", "`product_id` is not the product of the design version.")
  }
  if ((await loadProductSizes(container, version.product_id)) === null) {
    throw badRequest("product_not_found", `Product ${version.product_id} was not found.`)
  }
  const region = await loadRegion(container, body.region_id)
  regionMinimum(region)
  const prints = printedFieldsOf(version.data)
  const created = (await service(container).createTeamOrders({
    customer_id: customerId,
    team_name: teamName,
    design_id: version.design_id,
    design_version_id: version.id,
    product_id: version.product_id,
    region_id: region.id,
    need_by_date: needBy.value,
    status: "draft",
    prints_name: prints.name,
    prints_number: prints.number,
    list_version: 1,
    rush_requested: body.rush_requested === true,
  })) as TeamOrderRow
  return describe(container, created)
}

export async function listOwnTeamOrders(container: MedusaContainer, customerId: string) {
  const orders = (await service(container).listTeamOrders(
    { customer_id: customerId },
    { order: { created_at: "DESC" } }
  )) as TeamOrderRow[]
  return listOrderSummaries(container, orders)
}

/** Each order as in the list answer: the order, its players and pieces, and its current proof. */
export async function listOrderSummaries(container: MedusaContainer, orders: TeamOrderRow[]) {
  const entries =
    orders.length === 0
      ? []
      : ((await service(container).listRosterEntries(
          { team_order_id: orders.map((o) => o.id) },
          { select: ["team_order_id", "count"] }
        )) as { team_order_id: string; count: number }[])
  const proofs =
    orders.length === 0
      ? []
      : ((await service(container).listProofApprovals({ team_order_id: orders.map((o) => o.id) })) as unknown as StoredProof[])
  return orders.map((order) => {
    const mine = entries.filter((e) => e.team_order_id === order.id)
    const current = currentProofOf(proofs.filter((p) => p.team_order_id === order.id))
    return {
      ...teamOrderToApi(order),
      players: mine.length,
      pieces: mine.reduce((sum, e) => sum + piecesOf(e), 0),
      current_proof: current ? proofToApi(current) : null,
    }
  })
}

export async function readOwnTeamOrder(container: MedusaContainer, customerId: string, id: string) {
  return describe(container, await loadOwnTeamOrder(container, customerId, id))
}

export async function renameTeamOrder(container: MedusaContainer, customerId: string, id: string, body: Record<string, unknown>) {
  const order = await loadOwnTeamOrder(container, customerId, id)
  const teamName = readTeamName(body.team_name)
  if (teamName === null) {
    throw badRequest("team_name_invalid", "`team_name` must be text of 1 to 100 characters.")
  }
  if (!allowedIn(isStatus(order.status) ? order.status : "draft").editTeam) {
    throw notEditable(order, "The team name")
  }
  try {
    await service(container).updateWhileDraft({ teamOrderId: order.id, teamName })
  } catch (error) {
    if (error instanceof TeamOrderChanged) {
      throw notEditable(await loadOwnTeamOrder(container, customerId, id), "The team name")
    }
    throw error
  }
  return describe(container, await loadOwnTeamOrder(container, customerId, id))
}

export async function deleteTeamOrder(container: MedusaContainer, customerId: string, id: string) {
  const order = await loadOwnTeamOrder(container, customerId, id)
  if (order.status !== "draft") {
    throw notAllowed("team_order_not_draft", "Only a draft team order can be deleted.")
  }
  const linked = (await service(container).listTeamOrders({ linked_order_id: order.id }, { select: ["id"] })) as { id: string }[]
  if (linked.length > 0) {
    throw notAllowed("team_order_has_linked_orders", "A team order with add-ons or reorders cannot be deleted.")
  }
  await service(container).deleteRosterEntries({ team_order_id: order.id })
  await service(container).deleteTeamOrders(order.id)
  return { id: order.id, object: "team_order", deleted: true }
}

/** The API says `no_name` and `no_number`; the package says `noName` and `noNumber`. */
function withCamelCaseFlags(lines: unknown): unknown {
  if (!Array.isArray(lines)) return lines
  return lines.map((line: unknown) =>
    typeof line === "object" && line !== null && !Array.isArray(line)
      ? { ...line, noName: (line as Record<string, unknown>).no_name, noNumber: (line as Record<string, unknown>).no_number }
      : line
  )
}

/** The package's field names in an error, as the API names them. */
function apiFieldNames(error: RosterInputError): RosterInputError {
  if ("field" in error) {
    const field = error.field === "noName" ? "no_name" : error.field === "noNumber" ? "no_number" : error.field
    return { ...error, field }
  }
  return error
}

function malformed(input: RosterInputError) {
  const error = apiFieldNames(input)
  if (error.code === "too-many-lines") {
    return badRequest("roster_too_many_lines", `A team list holds at most ${error.max} lines, not ${error.lines}.`, {
      detail: error,
    })
  }
  return badRequest("roster_malformed", "`lines` is not a well-formed team list.", { detail: error })
}

/**
 * Saves the team list as a whole. A list with problems is saved, and the answer carries them;
 * only a malformed list or one over the limits is refused (400), and a list saved from a version
 * that is no longer current (409 `roster_version_stale`, with `current_version`).
 */
export async function saveRoster(container: MedusaContainer, customerId: string, id: string, body: Record<string, unknown>) {
  const order = await loadOwnTeamOrder(container, customerId, id)
  if (!allowedIn(isStatus(order.status) ? order.status : "draft").editList) {
    throw notEditable(order, "The team list")
  }
  const { version } = body
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw badRequest("roster_version_required", "`version` must be the list version the save was made from (a whole number).")
  }
  const [{ limits }, sizes] = await Promise.all([loadStoreSettings(container), loadProductSizes(container, order.product_id)])
  const parsed = parseRosterInput(withCamelCaseFlags(body.lines), limits)
  if (!parsed.ok) {
    throw malformed(parsed.error)
  }
  const lines = normalizeLines(parsed.lines, { sizes: sizes ?? [] })
  if (version !== order.list_version) {
    throw staleRefusal(order.list_version)
  }
  try {
    await service(container).replaceRoster({
      teamOrderId: order.id,
      expectedVersion: version,
      productId: order.product_id,
      lines: lines.map((line) => ({
        line_id: line.id ?? `ln_${randomUUID()}`,
        name: line.name,
        number: line.number,
        size: line.size,
        count: line.count,
        no_name: line.noName,
        no_number: line.noNumber,
      })),
    })
  } catch (error) {
    if (error instanceof RosterVersionStale) {
      const current = await loadOwnTeamOrder(container, customerId, id)
      if (current.status !== "draft") {
        // A proof was made between the read and the write: the list is frozen now.
        throw notEditable(current, "The team list")
      }
      throw staleRefusal(current.list_version)
    }
    throw error
  }
  return describe(container, await loadOwnTeamOrder(container, customerId, id))
}

function staleRefusal(current: number) {
  return conflict(
    "roster_version_stale",
    "The team list was changed since it was read. Read it again, then save.",
    { current_version: current }
  )
}
