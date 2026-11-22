import { describe, expect, it, vi } from "vitest"

import { apiAnswer } from "./fixtures"
import { parseTeamOrderAnswer } from "./map"
import { runStart, type StartCalls, type StartInput } from "./start"
import { checkNeedByDate, checkTeamName, TEAM_NAME_MAX } from "./validate"

const order = parseTeamOrderAnswer(apiAnswer())!
const list = {
  version: 1 as const,
  productId: "prod_1",
  prints: { name: true, number: true },
  lines: [{ id: "a", name: "Bilal", number: "7", size: "M", count: 1, noName: false, noNumber: false }],
}
const input: StartInput = { teamName: "Lahore Lions", needByDate: "2026-12-20", productId: "prod_1", regionId: "reg_uk", design: { schemaVersion: 3 }, list }

function calls(over: Partial<StartCalls> = {}): StartCalls {
  return {
    createDesign: vi.fn(async () => ({ ok: true as const, value: { designId: "design_1", versionId: "desver_1", version: 1 } })),
    createOrder: vi.fn(async () => ({ ok: true as const, value: order })),
    saveList: vi.fn(async () => ({ ok: true as const, value: { ...order, listVersion: 4 } })),
    ...over,
  }
}

describe("starting a team order", () => {
  it("saves the design, makes the order for its version and saves the list from the order's version", async () => {
    const c = calls()
    const result = await runStart(input, c)
    expect(result.ok).toBe(true)
    expect(c.createDesign).toHaveBeenCalledWith({ name: "Lahore Lions", productId: "prod_1", design: { schemaVersion: 3 } })
    expect(c.createOrder).toHaveBeenCalledWith({ teamName: "Lahore Lions", designVersionId: "desver_1", regionId: "reg_uk", needByDate: "2026-12-20" })
    expect(c.saveList).toHaveBeenCalledWith("teamord_1", 3, list)
    expect(result.ok && result.order.listVersion).toBe(4)
  })

  it("does not call the list save for an empty list", async () => {
    const c = calls()
    const result = await runStart({ ...input, list: { ...list, lines: [] } }, c)
    expect(result.ok).toBe(true)
    expect(c.saveList).not.toHaveBeenCalled()
    expect((await runStart({ ...input, list: null }, calls())).ok).toBe(true)
  })

  it("a failure of the design call stops there and nothing else was made", async () => {
    const c = calls({ createDesign: vi.fn(async () => ({ ok: false as const, failure: { kind: "unavailable" as const } })) })
    const result = await runStart(input, c)
    expect(result).toMatchObject({ ok: false, step: "design", failure: { kind: "unavailable" }, progress: {} })
    expect(c.createOrder).not.toHaveBeenCalled()
  })

  it("a failure of the order call keeps the design, and trying again does not make another design", async () => {
    const c = calls({ createOrder: vi.fn(async () => ({ ok: false as const, failure: { kind: "refused" as const, status: 400, code: "need_by_date_in_past", extra: { today: "2026-11-22" } } })) })
    const first = await runStart(input, c)
    expect(first).toMatchObject({ ok: false, step: "order", progress: { design: { versionId: "desver_1" } } })
    const again = calls()
    const second = await runStart({ ...input, needByDate: null }, again, first.progress)
    expect(second.ok).toBe(true)
    expect(again.createDesign).not.toHaveBeenCalled()
    expect(again.createOrder).toHaveBeenCalledWith(expect.objectContaining({ designVersionId: "desver_1", needByDate: null }))
  })

  it("a failure of the list call keeps the order, and trying again saves the list only", async () => {
    const c = calls({ saveList: vi.fn(async () => ({ ok: false as const, failure: { kind: "unavailable" as const } })) })
    const first = await runStart(input, c)
    expect(first).toMatchObject({ ok: false, step: "list", progress: { order: { id: "teamord_1" } } })
    expect(first.progress.listSaved).toBeFalsy()
    const again = calls()
    const second = await runStart(input, again, first.progress)
    expect(second.ok).toBe(true)
    expect(again.createDesign).not.toHaveBeenCalled()
    expect(again.createOrder).not.toHaveBeenCalled()
    expect(again.saveList).toHaveBeenCalledTimes(1)
  })
})

describe("the team name", () => {
  it("is trimmed and kept as typed", () => {
    expect(checkTeamName("  لاہور شیر  ")).toEqual({ ok: true, value: "لاہور شیر" })
  })
  it("refuses an empty name, a control character and 101 characters, and takes 100", () => {
    expect(checkTeamName("   ")).toEqual({ ok: false, reason: "empty" })
    expect(checkTeamName("a\u0000b")).toEqual({ ok: false, reason: "control" })
    expect(checkTeamName("a\nb")).toEqual({ ok: false, reason: "control" })
    expect(checkTeamName("x".repeat(TEAM_NAME_MAX + 1))).toEqual({ ok: false, reason: "too_long" })
    expect(checkTeamName("x".repeat(TEAM_NAME_MAX))).toEqual({ ok: true, value: "x".repeat(TEAM_NAME_MAX) })
  })
})

describe("the need-by date", () => {
  it("empty is no date; a real day is kept; anything else is refused", () => {
    expect(checkNeedByDate("")).toEqual({ ok: true, value: null })
    expect(checkNeedByDate(" 2026-12-20 ")).toEqual({ ok: true, value: "2026-12-20" })
    for (const bad of ["20-12-2026", "2026-02-31", "2026-13-01", "tomorrow", "2026-1-5"]) {
      expect(checkNeedByDate(bad)).toEqual({ ok: false })
    }
  })
})
