/**
 * Saved designs with versions, and team orders with their team list (task M2-1), through the store
 * API: every route, with the happy path, another customer's data (404), signed out (401), a stale
 * list version (409), a list of 20 complete lines (no problems) and a list with one of each
 * problem. The rules themselves are tested in packages/team-rules and in lib/rules.
 */
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { Modules } from "@medusajs/framework/utils"
import { seedStore } from "../../src/scripts/seed-lib/seed-store"

jest.setTimeout(300 * 1000)

const ADMIN_EMAIL = "team-orders-test-admin@example.com"
const ADMIN_PASSWORD = "team-orders-test-password"

type Headers = Record<string, string>

const SIZES = ["YS", "YM", "YL", "YXL", "XS", "S", "M", "L", "XL", "2XL", "3XL"]

/** A design as the editor makes it, cut down to what the server reads. */
function designJson(opts: { name?: boolean; number?: boolean; note?: string } = {}) {
  const layers: Record<string, unknown>[] = [{ id: "team", kind: "text", role: "team-name", value: "LIONS" }]
  if (opts.name ?? true) layers.push({ id: "pname", kind: "text", role: "player-name", value: "" })
  if (opts.number ?? true) layers.push({ id: "pnum", kind: "number", role: "player-number", value: "" })
  return { schemaVersion: 3, product: { id: "stand-in-jersey" }, teamName: "LIONS", layers, note: opts.note ?? "first" }
}

const line = (n: number, extra: Record<string, unknown> = {}) => ({
  id: `l${n}`,
  name: `Player ${String.fromCharCode(64 + n)}`,
  number: String(n),
  size: SIZES[4 + (n % 7)],
  count: 1,
  no_name: false,
  no_number: false,
  ...extra,
})

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("Saved designs and team orders (M2-1)", () => {
      let headers: Headers
      const regionIds: Record<string, string> = {}
      const productIds: Record<string, string> = {}
      const allow = { validateStatus: () => true }
      let counter = 0

      beforeAll(async () => {
        const { publishableKey } = await seedStore(getContainer(), {
          nodeEnv: "test",
          adminEmail: ADMIN_EMAIL,
          adminPassword: ADMIN_PASSWORD,
        })
        headers = { "x-publishable-api-key": publishableKey }
        const { data: regions } = await api.get("/store/regions", { headers })
        for (const region of regions.regions) {
          for (const country of region.countries) regionIds[country.iso_2] = region.id
        }
        const { data: products } = await api.get("/store/products?limit=50&fields=id,handle", { headers })
        for (const product of products.products) productIds[product.handle] = product.id
      })

      /** A registered customer's headers (the test runner restores the database before each test). */
      async function signIn(): Promise<Headers> {
        counter += 1
        const email = `organizer-${counter}-${Date.now()}@example.com`
        const password = "customer-test-password"
        const { data: registered } = await api.post("/auth/customer/emailpass/register", { email, password })
        await api.post(
          "/store/customers",
          { email, first_name: "Ali", last_name: "Khan" },
          { headers: { ...headers, authorization: `Bearer ${registered.token}` } }
        )
        const { data: login } = await api.post("/auth/customer/emailpass", { email, password })
        return { ...headers, authorization: `Bearer ${login.token}` }
      }

      const saveDesign = (as: Headers, design: unknown = designJson(), extra: Record<string, unknown> = {}) =>
        api.post("/store/designs", { name: "Home kit", product_id: productIds["jersey"], design, ...extra }, { headers: as, ...allow })

      async function aDesignVersionId(as: Headers, design: unknown = designJson()): Promise<string> {
        const { data } = await saveDesign(as, design)
        return data.version.id
      }

      const makeOrder = (as: Headers, body: Record<string, unknown>) =>
        api.post("/store/team-orders", body, { headers: as, ...allow })

      async function aTeamOrder(as: Headers, country = "pk", design: unknown = designJson()) {
        const versionId = await aDesignVersionId(as, design)
        const { data, status } = await makeOrder(as, {
          team_name: "Lahore Lions",
          design_version_id: versionId,
          region_id: regionIds[country],
        })
        expect(status).toBe(201)
        return data
      }

      const putRoster = (as: Headers, id: string, version: number, lines: unknown) =>
        api.put(`/store/team-orders/${id}/roster`, { version, lines }, { headers: as, ...allow })

      // ------------------------------------------------------------------------------------
      describe("signed out", () => {
        it("every route answers 401 without a customer sign-in (a store route needs the publishable key first)", async () => {
          const calls: [string, string, unknown?][] = [
            ["post", "/store/designs", { product_id: "x", design: designJson() }],
            ["get", "/store/designs"],
            ["get", "/store/designs/design_x"],
            ["post", "/store/designs/design_x/versions", { design: designJson() }],
            ["get", "/store/designs/design_x/versions/1"],
            ["post", "/store/team-orders", {}],
            ["get", "/store/team-orders"],
            ["get", "/store/team-orders/teamord_x"],
            ["post", "/store/team-orders/teamord_x", { team_name: "x" }],
            ["delete", "/store/team-orders/teamord_x"],
            ["put", "/store/team-orders/teamord_x/roster", { version: 1, lines: [] }],
          ]
          for (const credentials of [headers]) {
            for (const [method, path, body] of calls) {
              const res =
                method === "get" || method === "delete"
                  ? await (api as any)[method](path, { headers: credentials, ...allow })
                  : await (api as any)[method](path, body, { headers: credentials, ...allow })
              expect([method, path, res.status]).toEqual([method, path, 401])
            }
          }
        })
      })

      // ------------------------------------------------------------------------------------
      describe("designs", () => {
        it("saves a design with its first version, adds a version, reads both back, and lists it", async () => {
          const me = await signIn()
          const first = await saveDesign(me)
          expect(first.status).toBe(201)
          expect(first.data.design).toMatchObject({ name: "Home kit", latest_version: 1, product_id: productIds["jersey"] })
          expect(first.data.version).toMatchObject({ version: 1, schema_version: 3, product_id: productIds["jersey"] })
          expect(first.data.version.design).toBeUndefined()
          const designId = first.data.design.id

          const second = await api.post(
            `/store/designs/${designId}/versions`,
            { design: designJson({ note: "second" }) },
            { headers: me, ...allow }
          )
          expect(second.status).toBe(201)
          expect(second.data.version).toMatchObject({ version: 2, product_id: productIds["jersey"] })
          expect(second.data.design.latest_version).toBe(2)

          const read = await api.get(`/store/designs/${designId}`, { headers: me })
          expect(read.data.design).toMatchObject({ id: designId, latest_version: 2 })
          expect(read.data.versions.map((v: any) => v.version)).toEqual([1, 2])
          expect(read.data.versions[0].design).toBeUndefined()

          // Nothing is overwritten: version 1 is as it was saved, version 2 is the new one.
          const v1 = await api.get(`/store/designs/${designId}/versions/1`, { headers: me })
          const v2 = await api.get(`/store/designs/${designId}/versions/2`, { headers: me })
          expect(v1.data.version.design).toEqual(designJson())
          expect(v2.data.version.design).toEqual(designJson({ note: "second" }))

          const list = await api.get("/store/designs", { headers: me })
          expect(list.data.count).toBe(1)
          expect(list.data.designs[0]).toMatchObject({ id: designId, latest_version: 2 })
        })

        it("two saves at the same moment get two different version numbers", async () => {
          const me = await signIn()
          const { data } = await saveDesign(me)
          const id = data.design.id
          const results = await Promise.all(
            [1, 2, 3].map((n) =>
              api.post(`/store/designs/${id}/versions`, { design: designJson({ note: `n${n}` }) }, { headers: me, ...allow })
            )
          )
          expect(results.map((r) => r.status)).toEqual([201, 201, 201])
          expect(results.map((r) => r.data.version.version).sort()).toEqual([2, 3, 4])
        })

        it("another customer's design is not found, however it is reached; their list is empty", async () => {
          const owner = await signIn()
          const other = await signIn()
          const { data } = await saveDesign(owner)
          const id = data.design.id
          for (const res of [
            await api.get(`/store/designs/${id}`, { headers: other, ...allow }),
            await api.get(`/store/designs/${id}/versions/1`, { headers: other, ...allow }),
            await api.post(`/store/designs/${id}/versions`, { design: designJson() }, { headers: other, ...allow }),
          ]) {
            expect(res.status).toBe(404)
            expect(res.data).toMatchObject({ type: "not_found", code: "design_not_found" })
          }
          expect((await api.get("/store/designs", { headers: other })).data).toEqual({ designs: [], count: 0 })
          // Nothing was added by the refused attempt.
          expect((await api.get(`/store/designs/${id}`, { headers: owner })).data.versions).toHaveLength(1)
        })

        it("an unknown design or version is not found", async () => {
          const me = await signIn()
          const { data } = await saveDesign(me)
          expect((await api.get("/store/designs/design_nope", { headers: me, ...allow })).status).toBe(404)
          for (const v of ["2", "0", "abc", "-1"]) {
            const res = await api.get(`/store/designs/${data.design.id}/versions/${v}`, { headers: me, ...allow })
            expect([v, res.status, res.data.code]).toEqual([v, 404, "design_version_not_found"])
          }
        })

        it("refuses what is not a design: not an object, no schemaVersion, too large, too big a body", async () => {
          const me = await signIn()
          const cases: [unknown, string][] = [
            [[1, 2], "design_not_an_object"],
            ["text", "design_not_an_object"],
            [null, "design_not_an_object"],
            [{ layers: [] }, "design_schema_version"],
            [{ schemaVersion: "3" }, "design_schema_version"],
            [{ schemaVersion: 1, pad: "x".repeat(1_000_001) }, "design_too_large"],
          ]
          for (const [design, code] of cases) {
            const res = await saveDesign(me, design)
            expect([res.status, res.data.code]).toEqual([400, code])
          }
          const huge = await saveDesign(me, { schemaVersion: 1, pad: "x".repeat(2_200_000) })
          expect(huge.status).toBe(413)
          expect((await api.get("/store/designs", { headers: me })).data.count).toBe(0)
        })

        it("refuses a design for no product, an unknown product or one that is not a garment", async () => {
          const me = await signIn()
          const bad: [Record<string, unknown>, string][] = [
            [{ product_id: undefined }, "product_id_required"],
            [{ product_id: "prod_nope" }, "product_not_found"],
            [{ product_id: productIds["fit-kit"] }, "product_not_designable"],
            [{ name: "" }, "design_name_invalid"],
          ]
          for (const [extra, code] of bad) {
            const res = await saveDesign(me, designJson(), extra)
            expect([res.status, res.data.code]).toEqual([400, code])
          }
        })
      })

      // ------------------------------------------------------------------------------------
      describe("team orders", () => {
        it("makes a team order for the jersey in Pakistan and one in the UK, and lists them", async () => {
          const me = await signIn()
          const pk = await aTeamOrder(me, "pk")
          const uk = await aTeamOrder(me, "gb")
          expect(pk.team_order).toMatchObject({
            team_name: "Lahore Lions",
            status: "draft",
            region_id: regionIds["pk"],
            product_id: productIds["jersey"],
            need_by_date: null,
            prints: { name: true, number: true },
            list_version: 1,
          })
          expect(pk.sizes).toEqual(SIZES)
          expect(pk.roster).toMatchObject({ version: 1, lines: [], problems: [] })
          expect(pk.roster.summary).toMatchObject({ players: 0, pieces: 0, minimum: { required: 1, missing: 1, met: false } })
          expect(uk.roster.summary.minimum).toEqual({ required: 10, missing: 10, met: false })

          const list = await api.get("/store/team-orders", { headers: me })
          expect(list.data.count).toBe(2)
          expect(list.data.team_orders.map((t: any) => t.id).sort()).toEqual([pk.team_order.id, uk.team_order.id].sort())
          expect(list.data.team_orders[0]).toMatchObject({ players: 0, pieces: 0 })
        })

        it("stores the need-by date as given, and which fields the design prints comes from the design", async () => {
          const me = await signIn()
          const versionId = await aDesignVersionId(me, designJson({ name: false }))
          const res = await makeOrder(me, {
            team_name: "  Numbers   Only ",
            design_version_id: versionId,
            region_id: regionIds["pk"],
            need_by_date: "2027-03-01",
            // Not read: the design says what it prints.
            prints: { name: true, number: false },
          })
          expect(res.status).toBe(201)
          expect(res.data.team_order).toMatchObject({
            team_name: "Numbers Only",
            need_by_date: "2027-03-01",
            prints: { name: false, number: true },
          })
        })

        it("refuses a bad team order: name, date, design version, product, region", async () => {
          const me = await signIn()
          const versionId = await aDesignVersionId(me)
          const good = { team_name: "Lions", design_version_id: versionId, region_id: regionIds["pk"] }
          const bad: [Record<string, unknown>, number, string][] = [
            [{ team_name: "" }, 400, "team_name_invalid"],
            [{ team_name: undefined }, 400, "team_name_invalid"],
            [{ need_by_date: "2027-02-30" }, 400, "need_by_date_invalid"],
            [{ need_by_date: "01/03/2027" }, 400, "need_by_date_invalid"],
            [{ design_version_id: undefined }, 400, "design_version_id_required"],
            [{ design_version_id: "desver_nope" }, 404, "design_version_not_found"],
            [{ product_id: productIds["t-shirt"] }, 400, "product_mismatch"],
            [{ region_id: undefined }, 400, "region_id_required"],
            [{ region_id: "reg_nope" }, 400, "region_not_found"],
          ]
          for (const [change, status, code] of bad) {
            const res = await makeOrder(me, { ...good, ...change })
            expect([JSON.stringify(change), res.status, res.data.code]).toEqual([JSON.stringify(change), status, code])
          }
          expect((await api.get("/store/team-orders", { headers: me })).data.count).toBe(0)
          // The product may be named when it is the design's own.
          expect((await makeOrder(me, { ...good, product_id: productIds["jersey"] })).status).toBe(201)
        })

        it("another customer's design version cannot be made into a team order", async () => {
          const owner = await signIn()
          const other = await signIn()
          const versionId = await aDesignVersionId(owner)
          const res = await makeOrder(other, { team_name: "Thieves", design_version_id: versionId, region_id: regionIds["pk"] })
          expect(res.status).toBe(404)
          expect(res.data.code).toBe("design_version_not_found")
        })

        it("another customer's team order is not found: read, save, rename, delete; their list is empty", async () => {
          const owner = await signIn()
          const other = await signIn()
          const { team_order } = await aTeamOrder(owner)
          const id = team_order.id
          expect((await putRoster(owner, id, 1, [line(1)])).status).toBe(200)
          const attempts = [
            await api.get(`/store/team-orders/${id}`, { headers: other, ...allow }),
            await putRoster(other, id, 2, [line(2)]),
            await api.post(`/store/team-orders/${id}`, { team_name: "Mine now" }, { headers: other, ...allow }),
            await api.delete(`/store/team-orders/${id}`, { headers: other, ...allow }),
          ]
          for (const res of attempts) {
            expect(res.status).toBe(404)
            expect(res.data).toMatchObject({ type: "not_found", code: "team_order_not_found" })
          }
          expect((await api.get("/store/team-orders", { headers: other })).data).toEqual({ team_orders: [], count: 0 })
          // The organizer's order is untouched.
          const mine = await api.get(`/store/team-orders/${id}`, { headers: owner })
          expect(mine.data.team_order.team_name).toBe("Lahore Lions")
          expect(mine.data.roster.lines.map((l: any) => l.id)).toEqual(["l1"])
        })

        it("renames the team and deletes a draft team order with its list", async () => {
          const me = await signIn()
          const { team_order } = await aTeamOrder(me)
          const id = team_order.id
          await putRoster(me, id, 1, [line(1), line(2)])
          const renamed = await api.post(`/store/team-orders/${id}`, { team_name: " Lahore  Lions B " }, { headers: me })
          expect(renamed.data.team_order.team_name).toBe("Lahore Lions B")
          expect(renamed.data.roster.lines).toHaveLength(2)
          expect((await api.post(`/store/team-orders/${id}`, { team_name: "" }, { headers: me, ...allow })).data.code).toBe("team_name_invalid")

          const deleted = await api.delete(`/store/team-orders/${id}`, { headers: me })
          expect(deleted.data).toEqual({ id, object: "team_order", deleted: true })
          expect((await api.get(`/store/team-orders/${id}`, { headers: me, ...allow })).status).toBe(404)
          expect((await api.get("/store/team-orders", { headers: me })).data.count).toBe(0)
        })

        it("will not delete or edit a team order that is no longer a draft", async () => {
          const me = await signIn()
          const { team_order } = await aTeamOrder(me)
          const service: any = getContainer().resolve("teamOrder")
          await service.updateTeamOrders({ id: team_order.id, status: "proof_sent" })
          const del = await api.delete(`/store/team-orders/${team_order.id}`, { headers: me, ...allow })
          expect([del.status, del.data.code]).toEqual([400, "team_order_not_draft"])
          const save = await putRoster(me, team_order.id, 1, [line(1)])
          expect([save.status, save.data.code]).toEqual([400, "team_order_not_editable"])
        })
      })

      // ------------------------------------------------------------------------------------
      describe("saving the team list", () => {
        it("saves a list of 20 complete lines: no problems, the summary counts them, the UK minimum is met", async () => {
          const me = await signIn()
          const { team_order } = await aTeamOrder(me, "gb")
          const lines = Array.from({ length: 20 }, (_, i) => line(i + 1))
          const res = await putRoster(me, team_order.id, 1, lines)
          expect(res.status).toBe(200)
          expect(res.data.roster.version).toBe(2)
          expect(res.data.roster.problems).toEqual([])
          expect(res.data.roster.lines.map((l: any) => l.id)).toEqual(lines.map((l) => l.id))
          expect(res.data.roster.summary).toMatchObject({
            players: 20,
            pieces: 20,
            lines_to_fix: 0,
            ready_lines: 20,
            minimum: { required: 10, missing: 0, met: true },
            ready_for_proof: true,
          })
          const read = await api.get(`/store/team-orders/${team_order.id}`, { headers: me })
          expect(read.data.roster).toEqual(res.data.roster)
          expect((await api.get("/store/team-orders", { headers: me })).data.team_orders[0]).toMatchObject({ players: 20, pieces: 20 })
        })

        it("a list below the UK minimum says how many pieces are missing; Pakistan has no such gap", async () => {
          const me = await signIn()
          const uk = await aTeamOrder(me, "gb")
          const pk = await aTeamOrder(me, "pk")
          const lines = [line(1), line(2, { count: 2 }), line(3)]
          const ukRes = await putRoster(me, uk.team_order.id, 1, lines)
          expect(ukRes.data.roster.summary).toMatchObject({ pieces: 4, minimum: { required: 10, missing: 6, met: false }, ready_for_proof: false })
          const pkRes = await putRoster(me, pk.team_order.id, 1, lines)
          expect(pkRes.data.roster.summary).toMatchObject({ pieces: 4, minimum: { required: 1, missing: 0, met: true }, ready_for_proof: true })
        })

        it("saves a list with one of each problem and reports each with its line, field and code", async () => {
          const me = await signIn()
          const { team_order } = await aTeamOrder(me, "pk")
          const lines = [
            line(1, { name: "" }), // 0 name missing
            line(2, { number: "" }), // 1 number missing
            line(3, { size: "" }), // 2 size missing
            line(4, { number: "4a" }), // 3 number not digits
            line(5, { number: "123" }), // 4 number too long
            line(6, { number: "1٢" }), // 5 mixed digits
            line(7, { number: "7" }), // 6 duplicate
            line(8, { number: "٧" }), // 7 duplicate (Arabic-Indic seven)
            line(9, { name: "Ali 9" }), // 8 character
            line(10, { name: "Muhammad Abdul Rehman Qureshi" }), // 9 name too long
            line(11, { size: "4XL" }), // 10 size unknown
            line(12, { count: 11 }), // 11 count
          ]
          const res = await putRoster(me, team_order.id, 1, lines)
          expect(res.status).toBe(200)
          expect(res.data.roster.problems.map((p: any) => `${p.index}:${p.line_id}:${p.field}:${p.code}`)).toEqual([
            "0:l1:name:name-missing",
            "1:l2:number:number-missing",
            "2:l3:size:size-missing",
            "3:l4:number:number-not-digits",
            "4:l5:number:number-too-long",
            "5:l6:number:number-mixed-digits",
            "6:l7:number:number-duplicate",
            "7:l8:number:number-duplicate",
            "8:l9:name:name-character",
            "9:l10:name:name-too-long",
            "10:l11:size:size-unknown",
            "11:l12:count:quantity-range",
          ])
          expect(res.data.roster.problems[6].detail).toMatchObject({ value: 7, others: [{ index: 7, id: "l8", name: "Player H" }] })
          expect(res.data.roster.summary).toMatchObject({ players: 12, lines_to_fix: 12, ready_for_proof: false })
          // Nothing was refused for being wrong: the list is saved as it is.
          const read = await api.get(`/store/team-orders/${team_order.id}`, { headers: me })
          expect(read.data.roster.lines.map((l: any) => l.number)).toEqual(lines.map((l) => l.number))
        })

        it("what is required follows the design: with no name layer, a blank name is fine", async () => {
          const me = await signIn()
          const { team_order } = await aTeamOrder(me, "pk", designJson({ name: false }))
          const res = await putRoster(me, team_order.id, 1, [line(1, { name: "" }), line(2, { name: "Not printed 2" })])
          expect(res.data.roster.problems).toEqual([])
        })

        it("spare shirts: 'no name' and 'no number' make an empty field fine", async () => {
          const me = await signIn()
          const { team_order } = await aTeamOrder(me, "pk")
          const res = await putRoster(me, team_order.id, 1, [line(1), line(2, { name: "", no_name: true, number: "", no_number: true })])
          expect(res.data.roster.problems).toEqual([])
          expect(res.data.roster.lines[1]).toMatchObject({ no_name: true, no_number: true })
        })

        it("cleans the lines for storage: trimmed names, the number as written, the product's size spelling", async () => {
          const me = await signIn()
          const { team_order } = await aTeamOrder(me, "pk")
          const res = await putRoster(me, team_order.id, 1, [
            { name: "  Ali   Raza ", number: " 07 ", size: " xxl ", count: 1 },
          ])
          expect(res.data.roster.lines[0]).toMatchObject({ name: "Ali Raza", number: "07", size: "2XL", count: 1 })
          expect(res.data.roster.lines[0].id).toMatch(/^ln_/)
          expect(res.data.roster.problems).toEqual([])
        })

        it("keeps the order of the lines and their ids across saves", async () => {
          const me = await signIn()
          const { team_order } = await aTeamOrder(me, "pk")
          await putRoster(me, team_order.id, 1, [line(3), line(1), line(2)])
          const res = await putRoster(me, team_order.id, 2, [line(2), line(3)])
          expect(res.data.roster.lines.map((l: any) => l.id)).toEqual(["l2", "l3"])
          expect(res.data.roster.version).toBe(3)
        })

        it("can be saved empty, to clear the list", async () => {
          const me = await signIn()
          const { team_order } = await aTeamOrder(me, "pk")
          await putRoster(me, team_order.id, 1, [line(1)])
          const res = await putRoster(me, team_order.id, 2, [])
          expect(res.status).toBe(200)
          expect(res.data.roster).toMatchObject({ version: 3, lines: [] })
        })

        it("refuses a stale version with 409 and the current version, and writes nothing", async () => {
          const me = await signIn()
          const { team_order } = await aTeamOrder(me, "pk")
          expect((await putRoster(me, team_order.id, 1, [line(1)])).data.roster.version).toBe(2)
          const stale = await putRoster(me, team_order.id, 1, [line(1), line(2)])
          expect(stale.status).toBe(409)
          expect(stale.data).toMatchObject({ type: "conflict", code: "roster_version_stale", current_version: 2 })
          const read = await api.get(`/store/team-orders/${team_order.id}`, { headers: me })
          expect(read.data.roster.lines).toHaveLength(1)
          expect(read.data.roster.version).toBe(2)
          // A version ahead of the list is stale too.
          expect((await putRoster(me, team_order.id, 5, [line(1)])).status).toBe(409)
        })

        it("of two tabs saving from the same version, one wins and one gets 409", async () => {
          const me = await signIn()
          const { team_order } = await aTeamOrder(me, "pk")
          const [a, b] = await Promise.all([
            putRoster(me, team_order.id, 1, [line(1)]),
            putRoster(me, team_order.id, 1, [line(2), line(3)]),
          ])
          expect([a.status, b.status].sort()).toEqual([200, 409])
          const read = await api.get(`/store/team-orders/${team_order.id}`, { headers: me })
          expect(read.data.roster.version).toBe(2)
          const winner = a.status === 200 ? a : b
          expect(read.data.roster.lines.map((l: any) => l.id)).toEqual(winner.data.roster.lines.map((l: any) => l.id))
        })

        it("refuses a list that is malformed or over the limits, and leaves the saved list alone", async () => {
          const me = await signIn()
          const { team_order } = await aTeamOrder(me, "pk")
          await putRoster(me, team_order.id, 1, [line(1)])
          const cases: [unknown, unknown, number, string][] = [
            [2, "x", 400, "roster_malformed"],
            [2, [5], 400, "roster_malformed"],
            [2, [{ name: 7 }], 400, "roster_malformed"],
            [2, [{ no_name: "yes" }], 400, "roster_malformed"],
            [2, [{ count: "2" }], 400, "roster_malformed"],
            [2, [{ name: "x".repeat(201) }], 400, "roster_malformed"],
            [2, [{ id: "a" }, { id: "a" }], 400, "roster_malformed"],
            [2, Array.from({ length: 101 }, (_, i) => line(i % 99 + 1, { id: `x${i}` })), 400, "roster_too_many_lines"],
            [undefined, [], 400, "roster_version_required"],
            ["2", [], 400, "roster_version_required"],
            [0, [], 400, "roster_version_required"],
          ]
          for (const [version, lines, status, code] of cases) {
            const res = await api.put(`/store/team-orders/${team_order.id}/roster`, { version, lines }, { headers: me, ...allow })
            expect([code, res.status, res.data.code]).toEqual([code, status, code])
          }
          const bad = await putRoster(me, team_order.id, 2, [{ no_name: "yes" }])
          expect(bad.data.detail).toEqual({ code: "wrong-type", index: 0, field: "no_name" })
          const read = await api.get(`/store/team-orders/${team_order.id}`, { headers: me })
          expect(read.data.roster).toMatchObject({ version: 2 })
          expect(read.data.roster.lines.map((l: any) => l.id)).toEqual(["l1"])
        })

        it("accepts exactly 100 lines", async () => {
          const me = await signIn()
          const { team_order } = await aTeamOrder(me, "pk")
          const lines = Array.from({ length: 100 }, (_, i) => line((i % 99) + 1, { id: `x${i}`, number: String(i) }))
          const res = await putRoster(me, team_order.id, 1, lines)
          expect(res.status).toBe(200)
          expect(res.data.roster.summary.players).toBe(100)
          expect(res.data.roster.problems.filter((p: any) => p.code === "list-too-long")).toEqual([])
        })

        it("the limits are store settings: change them in the store's metadata and the checks follow", async () => {
          const me = await signIn()
          const { team_order } = await aTeamOrder(me, "pk")
          const store = getContainer().resolve(Modules.STORE)
          const [current] = await store.listStores()
          await store.updateStores(current!.id, {
            metadata: { ...(current!.metadata ?? {}), roster_max_count: 3, roster_max_name_length: 5, roster_max_lines: 2 },
          })
          const res = await putRoster(me, team_order.id, 1, [line(1, { name: "Abcdef", count: 4 }), line(2, { name: "Bo" })])
          expect(res.data.roster.problems.map((p: any) => `${p.field}:${p.code}`)).toEqual(["name:name-too-long", "count:quantity-range"])
          expect(res.data.roster.problems[1].detail).toMatchObject({ count: 4, min: 1, max: 3 })
          const over = await putRoster(me, team_order.id, 2, [line(1), line(2), line(3)])
          expect([over.status, over.data.code]).toEqual([400, "roster_too_many_lines"])
        })

        it("the product's sizes come from the product, not the request", async () => {
          const me = await signIn()
          const { team_order } = await aTeamOrder(me, "pk")
          // The request cannot say what sizes exist: an extra `sizes` field is ignored.
          const res = await api.put(
            `/store/team-orders/${team_order.id}/roster`,
            { version: 1, lines: [line(1, { size: "4XL" })], sizes: ["4XL"] },
            { headers: me, ...allow }
          )
          expect(res.data.roster.problems.map((p: any) => p.code)).toEqual(["size-unknown"])
          expect(res.data.sizes).toEqual(SIZES)
        })
      })
    })
  },
})
