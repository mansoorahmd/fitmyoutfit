import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { apiAnswer } from "@lib/team-order/fixtures"

vi.mock("./cookies", () => ({ getAuthHeaders: async () => ({ authorization: "Bearer test-token" }) }))

import {
  addSavedDesignVersion,
  createSavedDesign,
  createTeamOrder,
  deleteTeamOrder,
  listTeamOrders,
  loadSavedDesign,
  renameTeamOrder,
  retrieveTeamOrder,
  saveTeamOrderList,
  setTeamOrderDesignVersion,
  setTeamOrderSchedule,
} from "./team-orders"

type Reply = { status: number; body?: unknown }
let replies: Reply[] = []
let requests: { url: string; init: RequestInit }[] = []

beforeEach(() => {
  replies = []
  requests = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      requests.push({ url, init })
      const reply = replies.shift()
      if (!reply) throw new Error("no connection")
      return { status: reply.status, json: async () => reply.body ?? null }
    })
  )
})
afterEach(() => vi.unstubAllGlobals())

const refusal = (status: number, code: string, extra: Record<string, unknown> = {}): Reply => ({
  status,
  body: { type: status === 409 ? "conflict" : "invalid_data", code, message: "for developers", ...extra },
})

describe("what each call sends", () => {
  it("sends the customer's token and the publishable key, and a JSON body", async () => {
    replies.push({ status: 200, body: apiAnswer() })
    await retrieveTeamOrder("teamord_1")
    const { url, init } = requests[0]
    expect(url).toMatch(/\/store\/team-orders\/teamord_1$/)
    const headers = init.headers as Record<string, string>
    expect(headers.authorization).toBe("Bearer test-token")
    expect("x-publishable-api-key" in headers).toBe(true)
    expect(init.method).toBe("GET")
  })

  it("escapes an id in the address", async () => {
    replies.push({ status: 404, body: { code: "team_order_not_found" } })
    await retrieveTeamOrder("../x?y")
    expect(requests[0].url).toContain("..%2Fx%3Fy")
  })

  it("makes a design, the contract's snake_case body", async () => {
    replies.push({ status: 201, body: { design: { id: "design_1" }, version: { id: "desver_1", version: 1 } } })
    const result = await createSavedDesign({ name: "Lions", productId: "prod_1", design: { schemaVersion: 3 } })
    expect(result).toEqual({ ok: true, value: { designId: "design_1", versionId: "desver_1", version: 1 } })
    expect(JSON.parse(requests[0].init.body as string)).toEqual({ name: "Lions", product_id: "prod_1", design: { schemaVersion: 3 } })
  })

  it("adds a version to a design", async () => {
    replies.push({ status: 201, body: { design: { id: "design_1" }, version: { id: "desver_2", version: 2 } } })
    const result = await addSavedDesignVersion({ designId: "design_1", productId: "prod_1", design: { schemaVersion: 3 } })
    expect(result).toEqual({ ok: true, value: { designId: "design_1", versionId: "desver_2", version: 2 } })
    expect(requests[0].url).toMatch(/\/store\/designs\/design_1\/versions$/)
  })

  it("makes a team order with a need-by date only when there is one", async () => {
    replies.push({ status: 201, body: apiAnswer() }, { status: 201, body: apiAnswer() })
    await createTeamOrder({ teamName: "Lions", designVersionId: "desver_1", regionId: "reg_uk", needByDate: "2026-12-20" })
    await createTeamOrder({ teamName: "Lions", designVersionId: "desver_1", regionId: "reg_uk", needByDate: null })
    expect(JSON.parse(requests[0].init.body as string)).toEqual({ team_name: "Lions", design_version_id: "desver_1", region_id: "reg_uk", need_by_date: "2026-12-20" })
    expect(JSON.parse(requests[1].init.body as string)).toEqual({ team_name: "Lions", design_version_id: "desver_1", region_id: "reg_uk" })
  })

  it("lists, renames, points at a version, sets the schedule and deletes", async () => {
    replies.push(
      { status: 200, body: { team_orders: [{ id: "teamord_1", team_name: "L", status: "draft", kind: "order", product_id: "p", region_id: "r", need_by_date: null, players: 2, pieces: 3, created_at: "x" }, { junk: true }], count: 2 } },
      { status: 200, body: apiAnswer() },
      { status: 200, body: apiAnswer() },
      { status: 200, body: apiAnswer() },
      { status: 200, body: apiAnswer() },
      { status: 200, body: { id: "teamord_1", object: "team_order", deleted: true } }
    )
    const listed = await listTeamOrders()
    expect(listed.ok && listed.value.map((o) => o.id)).toEqual(["teamord_1"])
    await renameTeamOrder("teamord_1", "New")
    await setTeamOrderDesignVersion("teamord_1", "desver_2")
    await setTeamOrderSchedule("teamord_1", { needByDate: null })
    await saveTeamOrderList("teamord_1", 3, { lines: [{ id: "a", name: "A", number: "1", size: "M", count: 1, noName: false, noNumber: false }] })
    expect(await deleteTeamOrder("teamord_1")).toEqual({ ok: true, value: true })
    expect(requests.map((r) => `${r.init.method} ${r.url.replace(/^.*\/store/, "")}`)).toEqual([
      "GET /team-orders",
      "POST /team-orders/teamord_1",
      "POST /team-orders/teamord_1/design-version",
      "POST /team-orders/teamord_1/schedule",
      "PUT /team-orders/teamord_1/roster",
      "DELETE /team-orders/teamord_1",
    ])
    expect(JSON.parse(requests[3].init.body as string)).toEqual({ need_by_date: null })
    expect(JSON.parse(requests[4].init.body as string)).toEqual({
      version: 3,
      lines: [{ id: "a", name: "A", number: "1", size: "M", count: 1, no_name: false, no_number: false }],
    })
  })

  it("sends only the keys it is given: a date, a clear, or the rush choice", async () => {
    replies.push({ status: 200, body: apiAnswer() }, { status: 200, body: apiAnswer() }, { status: 200, body: apiAnswer() })
    await setTeamOrderSchedule("teamord_1", { needByDate: "2026-12-20" })
    await setTeamOrderSchedule("teamord_1", { rushRequested: true })
    await setTeamOrderSchedule("teamord_1", { needByDate: null, rushRequested: false })
    expect(requests.map((r) => JSON.parse(r.init.body as string))).toEqual([
      { need_by_date: "2026-12-20" },
      { rush_requested: true },
      { need_by_date: null, rush_requested: false },
    ])
  })

  it("reads a design by the version's id: the design's versions first, then the version's number", async () => {
    replies.push(
      { status: 200, body: { design: { id: "design_1" }, versions: [{ id: "desver_1", version: 1 }, { id: "desver_2", version: 2 }] } },
      { status: 200, body: { version: { id: "desver_2", version: 2, design: { schemaVersion: 3, teamName: "L" } } } }
    )
    expect(await loadSavedDesign({ designId: "design_1", versionId: "desver_2" })).toEqual({ ok: true, value: { design: { schemaVersion: 3, teamName: "L" }, version: 2 } })
    expect(requests[1].url).toMatch(/\/store\/designs\/design_1\/versions\/2$/)
  })

  it("says not found when the order's version is not among the design's", async () => {
    replies.push({ status: 200, body: { design: {}, versions: [{ id: "desver_9", version: 9 }] } })
    expect(await loadSavedDesign({ designId: "design_1", versionId: "desver_2" })).toEqual({ ok: false, failure: { kind: "not_found" } })
  })
})

describe("each refusal the backend can answer", () => {
  it("401 is signed out, for every call", async () => {
    replies.push({ status: 401, body: { message: "Unauthorized" } })
    expect(await listTeamOrders()).toEqual({ ok: false, failure: { kind: "signed_out" } })
  })

  it("404 is not found, and another customer's order is the same", async () => {
    replies.push(refusal(404, "team_order_not_found"))
    expect(await retrieveTeamOrder("teamord_x")).toEqual({ ok: false, failure: { kind: "not_found" } })
  })

  it("409 roster_version_stale gives the version to save from", async () => {
    replies.push(refusal(409, "roster_version_stale", { current_version: 9 }))
    expect(await saveTeamOrderList("teamord_1", 3, { lines: [] })).toEqual({ ok: false, failure: { kind: "stale", currentVersion: 9 } })
  })

  it.each([
    ["team_name_invalid", () => renameTeamOrder("teamord_1", "x")],
    ["team_order_not_editable", () => renameTeamOrder("teamord_1", "x")],
    ["need_by_date_invalid", () => setTeamOrderSchedule("teamord_1", { needByDate: "2026-12-20" })],
    ["need_by_date_in_past", () => setTeamOrderSchedule("teamord_1", { needByDate: "2020-01-01" })],
    ["roster_malformed", () => saveTeamOrderList("teamord_1", 1, { lines: [] })],
    ["roster_too_many_lines", () => saveTeamOrderList("teamord_1", 1, { lines: [] })],
    ["roster_version_required", () => saveTeamOrderList("teamord_1", 1, { lines: [] })],
    ["team_order_not_draft", () => deleteTeamOrder("teamord_1")],
    ["team_order_has_linked_orders", () => deleteTeamOrder("teamord_1")],
    ["design_mismatch", () => setTeamOrderDesignVersion("teamord_1", "desver_x")],
    ["product_mismatch", () => setTeamOrderDesignVersion("teamord_1", "desver_x")],
    ["region_not_found", () => createTeamOrder({ teamName: "x", designVersionId: "d", regionId: "r" })],
    ["design_too_large", () => createSavedDesign({ name: "x", productId: "p", design: {} })],
    ["product_not_designable", () => createSavedDesign({ name: "x", productId: "p", design: {} })],
    ["design_schema_version", () => addSavedDesignVersion({ designId: "d", productId: "p", design: {} })],
  ])("400 %s is a refusal that keeps its code", async (code, run) => {
    replies.push(refusal(400, code, { today: "2026-11-22" }))
    const result = await run()
    expect(result).toEqual({ ok: false, failure: { kind: "refused", status: 400, code, extra: { today: "2026-11-22" } } })
    expect(JSON.stringify(result)).not.toContain("developers")
  })

  it("a server error and no connection are 'unavailable'", async () => {
    replies.push({ status: 500, body: { type: "unexpected_state", message: "boom" } })
    expect(await retrieveTeamOrder("teamord_1")).toEqual({ ok: false, failure: { kind: "unavailable" } })
    // no reply queued: the fetch throws
    expect(await retrieveTeamOrder("teamord_1")).toEqual({ ok: false, failure: { kind: "unavailable" } })
  })

  it("an answer it cannot read is 'unavailable', never half-used", async () => {
    replies.push({ status: 200, body: { team_order: { id: "x" } } })
    expect(await retrieveTeamOrder("teamord_1")).toEqual({ ok: false, failure: { kind: "unavailable" } })
  })
})
