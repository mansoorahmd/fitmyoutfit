// Starting a team order from the designer: three calls in a row (the design is
// saved as a design, the team order is made for it, the team list is saved to
// the order). `runStart` does them in that order and remembers how far it got,
// so a failure at any call leaves the organizer able to try again from that very
// call, never making a second design or a second order. What was made is in
// `progress`; the page keeps it while it is open. Pure: the calls are passed in.

import type { SavedTeamList } from "@fitmyoutfit/editor"

import type { Failure, Outcome, TeamOrderView } from "./types"

export type StartStep = "design" | "order" | "list"

export type StartProgress = {
  design?: { designId: string; versionId: string; version: number }
  order?: TeamOrderView
  listSaved?: boolean
}

export type StartInput = {
  teamName: string
  needByDate: string | null
  productId: string
  regionId: string
  design: unknown
  list: SavedTeamList | null
}

export type StartCalls = {
  createDesign: (input: {
    name: string
    productId: string
    design: unknown
  }) => Promise<Outcome<{ designId: string; versionId: string; version: number }>>
  createOrder: (input: {
    teamName: string
    designVersionId: string
    regionId: string
    needByDate?: string | null
  }) => Promise<Outcome<TeamOrderView>>
  saveList: (orderId: string, version: number, list: SavedTeamList) => Promise<Outcome<TeamOrderView>>
}

export type StartResult =
  | { ok: true; order: TeamOrderView; progress: StartProgress }
  | { ok: false; step: StartStep; failure: Failure; progress: StartProgress }

export async function runStart(input: StartInput, calls: StartCalls, before: StartProgress = {}): Promise<StartResult> {
  const progress: StartProgress = { ...before }

  if (!progress.design) {
    const made = await calls.createDesign({ name: input.teamName, productId: input.productId, design: input.design })
    if (!made.ok) return { ok: false, step: "design", failure: made.failure, progress }
    progress.design = made.value
  }

  if (!progress.order) {
    const made = await calls.createOrder({
      teamName: input.teamName,
      designVersionId: progress.design.versionId,
      regionId: input.regionId,
      needByDate: input.needByDate,
    })
    if (!made.ok) return { ok: false, step: "order", failure: made.failure, progress }
    progress.order = made.value
  }

  if (!progress.listSaved) {
    if (input.list && input.list.lines.length > 0) {
      const saved = await calls.saveList(progress.order.id, progress.order.listVersion, input.list)
      if (!saved.ok) return { ok: false, step: "list", failure: saved.failure, progress }
      progress.order = saved.value
    }
    progress.listSaved = true
  }

  return { ok: true, order: progress.order, progress }
}
