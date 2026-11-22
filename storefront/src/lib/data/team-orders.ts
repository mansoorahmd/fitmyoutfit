"use server"

import type { SavedTeamList } from "@fitmyoutfit/editor"

import { parseListItem, parseTeamOrderAnswer, rosterBodyFromSaved } from "@lib/team-order/map"
import type { Outcome, TeamOrderListItem, TeamOrderView } from "@lib/team-order/types"

import { teamCall } from "./team-call"

// The signed-in customer's saved designs and team orders
// (docs/contracts/m2-team-orders.md, sections 1, 2 and 4), called with the
// customer's own token from the cookie. Each function answers with plain data
// or a Failure (lib/team-order/types.ts): never a thrown error, never the
// backend's message. They are server actions: the designer calls them from the
// browser, and the token stays on the server. The mapping between the editor's
// shapes and the contract's is lib/team-order/map.ts, nothing here.

type Raw = Record<string, unknown>
const isRaw = (value: unknown): value is Raw => typeof value === "object" && value !== null && !Array.isArray(value)
const enc = encodeURIComponent

/** A design and one of its versions, as the create and add-version routes answer. */
export type SavedDesignRef = { designId: string; versionId: string; version: number }

const readDesignRef = (json: unknown): SavedDesignRef | null => {
  if (!isRaw(json) || !isRaw(json.design) || !isRaw(json.version)) return null
  const { design, version } = json
  if (typeof design.id !== "string" || typeof version.id !== "string" || typeof version.version !== "number") return null
  return { designId: design.id, versionId: version.id, version: version.version }
}

// ---- designs ---------------------------------------------------------------

/** POST /store/designs: a new design, its version 1. */
export async function createSavedDesign(input: {
  name: string
  productId: string
  design: unknown
}): Promise<Outcome<SavedDesignRef>> {
  return teamCall({
    method: "POST",
    path: "/store/designs",
    body: { name: input.name, product_id: input.productId, design: input.design },
    read: readDesignRef,
  })
}

/** POST /store/designs/:id/versions: the next version of a design (never an overwrite). */
export async function addSavedDesignVersion(input: {
  designId: string
  productId: string
  design: unknown
}): Promise<Outcome<SavedDesignRef>> {
  return teamCall({
    method: "POST",
    path: `/store/designs/${enc(input.designId)}/versions`,
    body: { product_id: input.productId, design: input.design },
    read: readDesignRef,
  })
}

/**
 * The design JSON of one version, by the version's id (a team order names its version by id; the
 * backend reads one by its number, so the design's list of versions is read first).
 */
export async function loadSavedDesign(input: {
  designId: string
  versionId: string
}): Promise<Outcome<{ design: unknown; version: number }>> {
  const list = await teamCall({
    method: "GET",
    path: `/store/designs/${enc(input.designId)}`,
    read: (json) =>
      isRaw(json) && Array.isArray(json.versions)
        ? (json.versions as unknown[]).flatMap((v) =>
            isRaw(v) && v.id === input.versionId && typeof v.version === "number" ? [v.version] : []
          )
        : null,
  })
  if (!list.ok) return list
  const number = list.value[0]
  if (number === undefined) return { ok: false, failure: { kind: "not_found" } }
  const version = await teamCall({
    method: "GET",
    path: `/store/designs/${enc(input.designId)}/versions/${number}`,
    read: (json) => (isRaw(json) && isRaw(json.version) && isRaw(json.version.design) ? json.version.design : null),
  })
  return version.ok ? { ok: true, value: { design: version.value, version: number } } : version
}

// ---- team orders -----------------------------------------------------------

/** POST /store/team-orders: a draft team order with an empty list. */
export async function createTeamOrder(input: {
  teamName: string
  designVersionId: string
  regionId: string
  needByDate?: string | null
}): Promise<Outcome<TeamOrderView>> {
  return teamCall({
    method: "POST",
    path: "/store/team-orders",
    body: {
      team_name: input.teamName,
      design_version_id: input.designVersionId,
      region_id: input.regionId,
      ...(input.needByDate ? { need_by_date: input.needByDate } : {}),
    },
    read: parseTeamOrderAnswer,
  })
}

/** GET /store/team-orders: the customer's own, newest first. */
export async function listTeamOrders(): Promise<Outcome<TeamOrderListItem[]>> {
  return teamCall({
    method: "GET",
    path: "/store/team-orders",
    read: (json) =>
      isRaw(json) && Array.isArray(json.team_orders)
        ? (json.team_orders as unknown[]).flatMap((o) => {
            const item = parseListItem(o)
            return item ? [item] : []
          })
        : null,
  })
}

/** GET /store/team-orders/:id: the whole read answer. Another customer's order is not_found. */
export async function retrieveTeamOrder(id: string): Promise<Outcome<TeamOrderView>> {
  return teamCall({ method: "GET", path: `/store/team-orders/${enc(id)}`, read: parseTeamOrderAnswer })
}

/** POST /store/team-orders/:id: rename (a draft only). */
export async function renameTeamOrder(id: string, teamName: string): Promise<Outcome<TeamOrderView>> {
  return teamCall({
    method: "POST",
    path: `/store/team-orders/${enc(id)}`,
    body: { team_name: teamName },
    read: parseTeamOrderAnswer,
  })
}

/** DELETE /store/team-orders/:id: a draft and its list. */
export async function deleteTeamOrder(id: string): Promise<Outcome<true>> {
  return teamCall({
    method: "DELETE",
    path: `/store/team-orders/${enc(id)}`,
    read: (json) => (isRaw(json) && json.deleted === true ? (true as const) : null),
  })
}

/** POST /store/team-orders/:id/design-version: a draft order points at another version of its design. */
export async function setTeamOrderDesignVersion(id: string, designVersionId: string): Promise<Outcome<TeamOrderView>> {
  return teamCall({
    method: "POST",
    path: `/store/team-orders/${enc(id)}/design-version`,
    body: { design_version_id: designVersionId },
    read: parseTeamOrderAnswer,
  })
}

/** POST /store/team-orders/:id/schedule: set (a date), change or clear (null) the need-by date. */
export async function setTeamOrderNeedBy(id: string, needByDate: string | null): Promise<Outcome<TeamOrderView>> {
  return teamCall({
    method: "POST",
    path: `/store/team-orders/${enc(id)}/schedule`,
    body: { need_by_date: needByDate },
    read: parseTeamOrderAnswer,
  })
}

/** PUT /store/team-orders/:id/roster: the whole list, made from `version`. A list with problems is saved too. */
export async function saveTeamOrderList(
  id: string,
  version: number,
  list: Pick<SavedTeamList, "lines">
): Promise<Outcome<TeamOrderView>> {
  return teamCall({
    method: "PUT",
    path: `/store/team-orders/${enc(id)}/roster`,
    body: rosterBodyFromSaved(list, version),
    read: parseTeamOrderAnswer,
  })
}
