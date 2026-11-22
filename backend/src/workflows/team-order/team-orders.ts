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
import { normalizeLines, parseRosterInput, piecesOf, type RosterInputError, type RosterLimits } from "@fitmyoutfit/team-rules"
import { badRequest, conflict, notAllowed, notFound } from "../../lib/http/refusal"
import { printedFieldsOf } from "../../lib/rules/design-input"
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
import { RosterVersionStale } from "../../modules/team-order/service"
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
  created_at: Date | string
  updated_at: Date | string
}

type Metadata = Record<string, unknown> | null | undefined

const service = (container: MedusaContainer) => container.resolve<TeamOrderModuleService>(TEAM_ORDER_MODULE)

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

async function loadEntries(container: MedusaContainer, teamOrderId: string): Promise<StoredEntry[]> {
  return (await service(container).listRosterEntries(
    { team_order_id: teamOrderId },
    { order: { position: "ASC" } }
  )) as StoredEntry[]
}

async function loadProductSizes(container: MedusaContainer, productId: string): Promise<string[] | null> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({
    entity: "product",
    fields: ["id", "options.title", "options.values.value", "options.values.rank"],
    filters: { id: productId },
  })
  const product = (data as unknown as { options?: Parameters<typeof sizesFromOptions>[0] }[])[0]
  return product ? sizesFromOptions(product.options) : null
}

async function loadRegion(container: MedusaContainer, regionId: unknown) {
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
function regionMinimum(region: { name?: string | null; metadata?: Metadata }): number {
  const minimum = readMinGarmentQuantity(region.metadata, region.name)
  if (!minimum.ok) {
    throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, `The store's region settings are incomplete: ${minimum.error}`)
  }
  return minimum.value
}

async function loadLimits(container: MedusaContainer): Promise<Partial<RosterLimits>> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const { data } = await query.graph({ entity: "store", fields: ["metadata"] })
  const limits = readRosterLimits((data as unknown as { metadata?: Metadata }[])[0]?.metadata)
  if (!limits.ok) {
    throw new MedusaError(MedusaError.Types.UNEXPECTED_STATE, `The store's roster settings are invalid: ${limits.error}`)
  }
  return limits.value
}

/** The team order, its team list with the checks' result for every line, and the summary. */
async function describe(container: MedusaContainer, order: TeamOrderRow) {
  const [entries, sizes, region, limits] = await Promise.all([
    loadEntries(container, order.id),
    loadProductSizes(container, order.product_id),
    loadRegion(container, order.region_id),
    loadLimits(container),
  ])
  const productSizes = sizes ?? []
  const view = buildRosterView({
    lines: entriesToLines(entries),
    prints: { name: order.prints_name, number: order.prints_number },
    sizes: productSizes,
    limits,
    minimum: regionMinimum(region),
  })
  return {
    team_order: teamOrderToApi(order),
    sizes: productSizes,
    roster: { version: order.list_version, ...view },
  }
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
  })) as TeamOrderRow
  return describe(container, created)
}

export async function listOwnTeamOrders(container: MedusaContainer, customerId: string) {
  const orders = (await service(container).listTeamOrders(
    { customer_id: customerId },
    { order: { created_at: "DESC" } }
  )) as TeamOrderRow[]
  const entries =
    orders.length === 0
      ? []
      : ((await service(container).listRosterEntries(
          { team_order_id: orders.map((o) => o.id) },
          { select: ["team_order_id", "count"] }
        )) as { team_order_id: string; count: number }[])
  return orders.map((order) => {
    const mine = entries.filter((e) => e.team_order_id === order.id)
    return {
      ...teamOrderToApi(order),
      players: mine.length,
      pieces: mine.reduce((sum, e) => sum + piecesOf(e), 0),
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
  const updated = (await service(container).updateTeamOrders({ id: order.id, team_name: teamName })) as TeamOrderRow
  return describe(container, updated)
}

export async function deleteTeamOrder(container: MedusaContainer, customerId: string, id: string) {
  const order = await loadOwnTeamOrder(container, customerId, id)
  if (order.status !== "draft") {
    throw notAllowed("team_order_not_draft", "Only a draft team order can be deleted.")
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
  if (order.status !== "draft") {
    throw notAllowed("team_order_not_editable", "The team list can only be changed while the team order is a draft.")
  }
  const { version } = body
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw badRequest("roster_version_required", "`version` must be the list version the save was made from (a whole number).")
  }
  const [limits, sizes] = await Promise.all([loadLimits(container), loadProductSizes(container, order.product_id)])
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
