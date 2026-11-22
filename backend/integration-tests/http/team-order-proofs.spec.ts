/**
 * The roster proof, its signature, the status flow and the need-by date of a team order (task M2-2),
 * through the store API: the milestone's "done when" (a team of 20, from a new team order to a signed
 * proof), every new route, every refusal, the concurrency cases and the schedule states. The rules
 * themselves are tested in packages/team-rules and in lib/rules.
 */
import { createHash } from "node:crypto"
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { hashSnapshot } from "@fitmyoutfit/team-rules"
import { addCalendarDays, calendarDateIn } from "../../src/lib/rules/delivery-promise"
import { seedStore } from "../../src/scripts/seed-lib/seed-store"
import { TEAM_ORDER_MODULE } from "../../src/modules/team-order/constants"

jest.setTimeout(300 * 1000)

const ADMIN_EMAIL = "team-order-proofs-test-admin@example.com"
const ADMIN_PASSWORD = "team-order-proofs-test-password"

type Headers = Record<string, string>

const SIZES = ["YS", "YM", "YL", "YXL", "XS", "S", "M", "L", "XL", "2XL", "3XL"]

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

/** A team of `count` players, numbers 1 to `count`, with a few Urdu and Arabic names and digits. */
function team(count: number) {
  const lines = Array.from({ length: count }, (_, i) => line(i + 1))
  if (count >= 4) {
    lines[0] = line(1, { name: "محمد علی", number: "1" })
    lines[1] = line(2, { name: "عبداللہ", number: "٢" })
    lines[2] = line(3, { name: "نور‌الدین", number: "۳" })
    lines[3] = line(4, { name: "José O'Brien-Smith" })
  }
  return lines
}

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("Roster proof, signature, status flow and need-by date (M2-2)", () => {
      let headers: Headers
      const regionIds: Record<string, string> = {}
      const productIds: Record<string, string> = {}
      const allow = { validateStatus: () => true }
      let counter = 0

      const today = () => calendarDateIn(new Date(), "Asia/Karachi")
      const inDays = (n: number) => addCalendarDays(today(), n)

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

      async function signIn(): Promise<Headers> {
        counter += 1
        const email = `proof-organizer-${counter}-${Date.now()}@example.com`
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

      const saveDesign = (as: Headers, design: unknown = designJson()) =>
        api.post("/store/designs", { name: "Home kit", product_id: productIds["jersey"], design }, { headers: as, ...allow })

      async function aTeamOrder(as: Headers, opts: { country?: string; need_by_date?: string | null; rush_requested?: boolean } = {}) {
        const { data: saved } = await saveDesign(as)
        const { data, status } = await api.post(
          "/store/team-orders",
          {
            team_name: "Lahore Lions",
            design_version_id: saved.version.id,
            region_id: regionIds[opts.country ?? "gb"],
            ...(opts.need_by_date !== undefined ? { need_by_date: opts.need_by_date } : {}),
            ...(opts.rush_requested !== undefined ? { rush_requested: opts.rush_requested } : {}),
          },
          { headers: as, ...allow }
        )
        expect(status).toBe(201)
        return { ...data, design_id: saved.design.id as string }
      }

      const putRoster = (as: Headers, id: string, version: number, lines: unknown) =>
        api.put(`/store/team-orders/${id}/roster`, { version, lines }, { headers: as, ...allow })
      const read = (as: Headers, id: string) => api.get(`/store/team-orders/${id}`, { headers: as, ...allow })
      const makeProof = (as: Headers, id: string) => api.post(`/store/team-orders/${id}/proofs`, {}, { headers: as, ...allow })
      const proofsOf = (as: Headers, id: string) => api.get(`/store/team-orders/${id}/proofs`, { headers: as, ...allow })
      const proofOf = (as: Headers, id: string, proofId: string) =>
        api.get(`/store/team-orders/${id}/proofs/${proofId}`, { headers: as, ...allow })
      const sign = (as: Headers, id: string, proofId: string, body: Record<string, unknown>, extraHeaders: Headers = {}) =>
        api.post(`/store/team-orders/${id}/proofs/${proofId}/sign`, body, { headers: { ...as, ...extraHeaders }, ...allow })
      const reopen = (as: Headers, id: string) => api.post(`/store/team-orders/${id}/reopen`, {}, { headers: as, ...allow })
      const schedule = (as: Headers, id: string, body: unknown) =>
        api.post(`/store/team-orders/${id}/schedule`, body, { headers: as, ...allow })

      /** The body of a signature request for the proof an answer shows, as the storefront would send it. */
      const signBody = (answer: any, extra: Record<string, unknown> = {}) => ({
        proof_hash: answer.current_proof.hash,
        signed_name: "Ali Khan",
        confirmed: true,
        schedule_state: answer.schedule.state,
        ...extra,
      })

      /** A team order with a full list of `n` players, ready for a proof (UK minimum is 10). */
      async function aReadyOrder(as: Headers, n = 20, opts: Parameters<typeof aTeamOrder>[1] = {}) {
        const order = await aTeamOrder(as, opts)
        const { data, status } = await putRoster(as, order.team_order.id, 1, team(n))
        expect(status).toBe(200)
        expect(data.roster.summary.ready_for_proof).toBe(true)
        return { ...order, ...data }
      }

      const proofService = () => getContainer().resolve(TEAM_ORDER_MODULE) as any

      // ------------------------------------------------------------------------------------
      it('the milestone "done when": a team of 20, from a new team order to a signed proof', async () => {
        const as = await signIn()
        const needBy = inDays(60)
        const { data: saved } = await saveDesign(as)
        const created = await api.post(
          "/store/team-orders",
          { team_name: "Lahore Lions", design_version_id: saved.version.id, region_id: regionIds["gb"], need_by_date: needBy },
          { headers: as }
        )
        expect(created.status).toBe(201)
        const id = created.data.team_order.id
        expect(created.data.team_order.status).toBe("draft")
        expect(created.data.current_proof).toBeNull()
        expect(created.data.schedule).toMatchObject({ state: "ok", need_by_date: needBy, today: today() })
        expect(created.data.limits).toEqual({ max_lines: 100, min_count: 1, max_count: 10, max_name_length: 18 })

        // the full team list of 20
        const saveList = await putRoster(as, id, 1, team(20))
        expect(saveList.status).toBe(200)
        expect(saveList.data.roster.lines).toHaveLength(20)
        expect(saveList.data.roster.problems).toEqual([])
        expect(saveList.data.roster.summary.ready_for_proof).toBe(true)

        // the proof
        const made = await makeProof(as, id)
        expect(made.status).toBe(201)
        expect(made.data.team_order.status).toBe("proof_sent")
        const first = made.data.current_proof
        expect(first).toMatchObject({ number: 1, status: "sent", signed_name: null, signed_at: null })
        expect(first.hash).toMatch(/^[0-9a-f]{64}$/)

        // read it: the snapshot holds the 20 lines, and its hash is the hash of its canonical text
        const proof1 = await proofOf(as, id, first.id)
        expect(proof1.status).toBe(200)
        const { snapshot, snapshot_text: text } = proof1.data.proof
        expect(snapshot.lines).toHaveLength(20)
        expect(snapshot).toMatchObject({
          design_version_id: saved.version.id,
          product_id: productIds["jersey"],
          region_id: regionIds["gb"],
          team_name: "Lahore Lions",
          prints: { name: true, number: true },
        })
        expect(snapshot.lines[0]).toEqual({ name: "محمد علی", number: "1", size: saveList.data.roster.lines[0].size, count: 1, no_name: false, no_number: false })
        expect(snapshot.lines[1].number).toBe("٢")
        expect(createHash("sha256").update(text, "utf8").digest("hex")).toBe(first.hash)
        expect(hashSnapshot(snapshot).hash).toBe(first.hash)
        expect(hashSnapshot(snapshot).text).toBe(text)
        expect(JSON.stringify(proof1.data)).not.toContain("signed_ip")

        // sign it
        const signed = await sign(as, id, first.id, signBody(made.data))
        expect(signed.status).toBe(200)
        expect(signed.data.team_order.status).toBe("approved")
        expect(signed.data.current_proof).toMatchObject({
          id: first.id,
          number: 1,
          status: "signed",
          hash: first.hash,
          signed_name: "Ali Khan",
          schedule_state: "ok",
          need_by_date: needBy,
          rush: false,
          promised_delivery_date: inDays(15),
        })
        expect(typeof signed.data.current_proof.signed_at).toBe("string")

        // the list can no longer be changed
        const frozen = await putRoster(as, id, signed.data.roster.version, team(20))
        expect(frozen.status).toBe(400)
        expect(frozen.data).toMatchObject({ type: "not_allowed", code: "team_order_not_editable", status: "approved" })

        // going back to draft and changing one name gives a second proof with another hash
        const back = await reopen(as, id)
        expect(back.status).toBe(200)
        expect(back.data.team_order.status).toBe("draft")
        expect(back.data.current_proof).toBeNull()
        const changed = team(20)
        changed[5] = line(6, { name: "Bilal Ahmed" })
        const save2 = await putRoster(as, id, back.data.roster.version, changed)
        expect(save2.status).toBe(200)
        const made2 = await makeProof(as, id)
        expect(made2.status).toBe(201)
        expect(made2.data.current_proof.number).toBe(2)
        expect(made2.data.current_proof.hash).not.toBe(first.hash)

        // the first stays on record, as replaced, with its snapshot and signature
        const list = await proofsOf(as, id)
        expect(list.status).toBe(200)
        expect(list.data.count).toBe(2)
        expect(list.data.proofs.map((p: any) => [p.number, p.status])).toEqual([
          [2, "sent"],
          [1, "replaced"],
        ])
        const replaced = await proofOf(as, id, first.id)
        expect(replaced.data.proof).toMatchObject({ status: "replaced", hash: first.hash, signed_name: "Ali Khan" })
        expect(replaced.data.proof.closed_at).not.toBeNull()
        expect(replaced.data.proof.snapshot_text).toBe(text)
        expect(replaced.data.proof.snapshot.lines[5].name).toBe("Player F")

        // and the new one can be signed
        const signed2 = await sign(as, id, made2.data.current_proof.id, signBody(made2.data))
        expect(signed2.status).toBe(200)
        expect(signed2.data.team_order.status).toBe("approved")
        expect(signed2.data.current_proof).toMatchObject({ number: 2, status: "signed" })
      })

      // ------------------------------------------------------------------------------------
      describe("signed out and other customers", () => {
        it("every new route answers 401 without a customer sign-in", async () => {
          const calls: [string, string, unknown?][] = [
            ["post", "/store/team-orders/teamord_x/proofs", {}],
            ["get", "/store/team-orders/teamord_x/proofs"],
            ["get", "/store/team-orders/teamord_x/proofs/proof_x"],
            ["post", "/store/team-orders/teamord_x/proofs/proof_x/sign", {}],
            ["post", "/store/team-orders/teamord_x/reopen", {}],
            ["post", "/store/team-orders/teamord_x/schedule", { need_by_date: null }],
            ["post", "/store/team-orders/teamord_x/design-version", {}],
          ]
          for (const [method, path, body] of calls) {
            const res = await (api as any)[method](path, ...(body === undefined ? [] : [body]), { headers, ...allow })
            expect([method, path, res.status]).toEqual([method, path, 401])
            expect(res.data).toEqual({ message: "Unauthorized" })
          }
        })

        it("another customer's team order and proof are 404, the same as an unknown id", async () => {
          const owner = await signIn()
          const other = await signIn()
          const order = await aReadyOrder(owner, 12)
          const id = order.team_order.id
          const made = await makeProof(owner, id)
          const proofId = made.data.current_proof.id
          const body = signBody(made.data)
          const calls: [string, any][] = [
            ["make", makeProof(other, id)],
            ["list", proofsOf(other, id)],
            ["read", proofOf(other, id, proofId)],
            ["sign", sign(other, id, proofId, body)],
            ["reopen", reopen(other, id)],
            ["schedule", schedule(other, id, { need_by_date: inDays(40) })],
            ["design-version", api.post(`/store/team-orders/${id}/design-version`, { design_version_id: "desver_x" }, { headers: other, ...allow })],
          ]
          for (const [name, call] of calls) {
            const res = await call
            expect([name, res.status, res.data.code]).toEqual([name, 404, "team_order_not_found"])
          }
          // an unknown proof of an own order is 404 too, and another customer's order is unchanged
          const unknown = await proofOf(owner, id, "proof_unknown")
          expect([unknown.status, unknown.data.code]).toEqual([404, "proof_not_found"])
          const stillSent = await read(owner, id)
          expect(stillSent.data.team_order.status).toBe("proof_sent")
          expect(stillSent.data.current_proof.status).toBe("sent")
          // a proof of another order of the same customer is not found under this order
          const second = await aReadyOrder(owner, 12)
          const crossed = await proofOf(owner, second.team_order.id, proofId)
          expect([crossed.status, crossed.data.code]).toEqual([404, "proof_not_found"])
        })
      })

      // ------------------------------------------------------------------------------------
      describe("making a proof", () => {
        it("refuses an empty list, a list with a problem and a list below the minimum, with the reason", async () => {
          const as = await signIn()
          const order = await aTeamOrder(as)
          const id = order.team_order.id
          const empty = await makeProof(as, id)
          expect(empty.status).toBe(400)
          expect(empty.data).toMatchObject({ type: "not_allowed", code: "roster_empty" })

          const below = await putRoster(as, id, 1, team(6))
          expect(below.data.roster.summary.minimum).toMatchObject({ required: 10, missing: 4, met: false })
          const tooFew = await makeProof(as, id)
          expect(tooFew.status).toBe(400)
          expect(tooFew.data).toMatchObject({ type: "not_allowed", code: "roster_below_minimum", required: 10, missing: 4 })

          const bad = team(12)
          bad[2] = line(3, { number: "1" }) // the same number as line 1: a problem on both lines
          bad[7] = line(8, { name: "" })
          const problems = await putRoster(as, id, 2, bad)
          expect(problems.status).toBe(200)
          const refused = await makeProof(as, id)
          expect(refused.status).toBe(400)
          expect(refused.data.code).toBe("roster_has_problems")
          expect(refused.data.problems).toBe(problems.data.roster.problems.length)
          expect(refused.data.indexes_to_fix).toEqual(problems.data.roster.summary.indexes_to_fix)
          expect(refused.data.indexes_to_fix).toEqual(expect.arrayContaining([0, 2, 7]))

          // nothing was made, and the order is still a draft
          const after = await read(as, id)
          expect(after.data.team_order.status).toBe("draft")
          expect(after.data.current_proof).toBeNull()
          expect((await proofsOf(as, id)).data.count).toBe(0)
        })

        it("lets Pakistan make a proof from one player: its minimum is 1", async () => {
          const as = await signIn()
          const order = await aTeamOrder(as, { country: "pk" })
          await putRoster(as, order.team_order.id, 1, [line(1)])
          const made = await makeProof(as, order.team_order.id)
          expect(made.status).toBe(201)
          expect(made.data.current_proof.number).toBe(1)
        })

        it("refuses a second proof while one is out or signed, naming the status", async () => {
          const as = await signIn()
          const order = await aReadyOrder(as, 10)
          const id = order.team_order.id
          const first = await makeProof(as, id)
          expect(first.status).toBe(201)
          const again = await makeProof(as, id)
          expect(again.status).toBe(400)
          expect(again.data).toMatchObject({ type: "not_allowed", code: "team_order_not_draft", status: "proof_sent" })
          await sign(as, id, first.data.current_proof.id, signBody(first.data))
          const afterSigning = await makeProof(as, id)
          expect(afterSigning.data).toMatchObject({ code: "team_order_not_draft", status: "approved" })
          expect((await proofsOf(as, id)).data.count).toBe(1)
        })

        it("numbers the proofs 1, 2, 3 within a team order, and each order counts for itself", async () => {
          const as = await signIn()
          const a = await aReadyOrder(as, 10)
          const b = await aReadyOrder(as, 10)
          const numbers: number[] = []
          for (let i = 0; i < 3; i++) {
            const made = await makeProof(as, a.team_order.id)
            numbers.push(made.data.current_proof.number)
            expect((await reopen(as, a.team_order.id)).status).toBe(200)
          }
          expect(numbers).toEqual([1, 2, 3])
          const first = await makeProof(as, b.team_order.id)
          expect(first.data.current_proof.number).toBe(1)
          const list = await proofsOf(as, a.team_order.id)
          expect(list.data.proofs.map((p: any) => [p.number, p.status])).toEqual([
            [3, "withdrawn"],
            [2, "withdrawn"],
            [1, "withdrawn"],
          ])
        })

        it("gives the same proof the same hash as the package computes from the list (any list order matters)", async () => {
          const as = await signIn()
          const order = await aReadyOrder(as, 10)
          const id = order.team_order.id
          const made = await makeProof(as, id)
          const read1 = await proofOf(as, id, made.data.current_proof.id)
          const lines = order.roster.lines.map((l: any) => ({
            name: l.name,
            number: l.number,
            size: l.size,
            count: l.count,
            no_name: l.no_name,
            no_number: l.no_number,
          }))
          const local = hashSnapshot({
            design_version_id: order.team_order.design_version_id,
            product_id: order.team_order.product_id,
            region_id: order.team_order.region_id,
            team_name: order.team_order.team_name,
            prints: order.team_order.prints,
            lines,
          })
          expect(local.hash).toBe(made.data.current_proof.hash)
          expect(local.text).toBe(read1.data.proof.snapshot_text)
        })
      })

      // ------------------------------------------------------------------------------------
      describe("what is frozen while a proof is out or signed", () => {
        it("refuses the list, the team name and the design version, with a code, until the order goes back to draft", async () => {
          const as = await signIn()
          const order = await aReadyOrder(as, 10)
          const id = order.team_order.id
          const { data: v2 } = await api.post(
            `/store/designs/${order.design_id}/versions`,
            { design: designJson({ note: "second" }) },
            { headers: as }
          )
          const made = await makeProof(as, id)
          for (const state of ["proof_sent", "approved"]) {
            if (state === "approved") {
              expect((await sign(as, id, made.data.current_proof.id, signBody(made.data))).status).toBe(200)
            }
            const list = await putRoster(as, id, order.roster.version, team(10))
            expect([state, list.status, list.data.code, list.data.status]).toEqual([state, 400, "team_order_not_editable", state])
            const rename = await api.post(`/store/team-orders/${id}`, { team_name: "Other" }, { headers: as, ...allow })
            expect([state, rename.status, rename.data.code]).toEqual([state, 400, "team_order_not_editable"])
            const design = await api.post(`/store/team-orders/${id}/design-version`, { design_version_id: v2.version.id }, { headers: as, ...allow })
            expect([state, design.status, design.data.code]).toEqual([state, 400, "team_order_not_editable"])
            const del = await api.delete(`/store/team-orders/${id}`, { headers: as, ...allow })
            expect([state, del.status, del.data.code]).toEqual([state, 400, "team_order_not_draft"])
          }
          const unchanged = await read(as, id)
          expect(unchanged.data.team_order.team_name).toBe("Lahore Lions")
          expect(unchanged.data.team_order.design_version_id).toBe(order.team_order.design_version_id)
          expect(unchanged.data.roster.version).toBe(order.roster.version)

          // back to draft unlocks all three
          expect((await reopen(as, id)).status).toBe(200)
          expect((await putRoster(as, id, order.roster.version, team(10))).status).toBe(200)
          const renamed = await api.post(`/store/team-orders/${id}`, { team_name: "Other" }, { headers: as })
          expect(renamed.data.team_order.team_name).toBe("Other")
          const moved = await api.post(`/store/team-orders/${id}/design-version`, { design_version_id: v2.version.id }, { headers: as })
          expect(moved.data.team_order.design_version_id).toBe(v2.version.id)
        })

        it("points a draft order at another version of the same design, reading again what it prints", async () => {
          const as = await signIn()
          const order = await aTeamOrder(as)
          const id = order.team_order.id
          expect(order.team_order.prints).toEqual({ name: true, number: true })
          const { data: v2 } = await api.post(
            `/store/designs/${order.design_id}/versions`,
            { design: designJson({ name: false }) },
            { headers: as }
          )
          const moved = await api.post(`/store/team-orders/${id}/design-version`, { design_version_id: v2.version.id }, { headers: as, ...allow })
          expect(moved.status).toBe(200)
          expect(moved.data.team_order.design_version_id).toBe(v2.version.id)
          expect(moved.data.team_order.prints).toEqual({ name: false, number: true })
          // refusals
          const none = await api.post(`/store/team-orders/${id}/design-version`, {}, { headers: as, ...allow })
          expect([none.status, none.data.code]).toEqual([400, "design_version_id_required"])
          const unknown = await api.post(`/store/team-orders/${id}/design-version`, { design_version_id: "desver_nope" }, { headers: as, ...allow })
          expect([unknown.status, unknown.data.code]).toEqual([404, "design_version_not_found"])
          const { data: otherDesign } = await saveDesign(as)
          const otherDesignRes = await api.post(
            `/store/team-orders/${id}/design-version`,
            { design_version_id: otherDesign.version.id },
            { headers: as, ...allow }
          )
          expect([otherDesignRes.status, otherDesignRes.data.code]).toEqual([400, "design_mismatch"])
          const { data: v3 } = await api.post(
            `/store/designs/${order.design_id}/versions`,
            { product_id: productIds["t-shirt"], design: designJson() },
            { headers: as }
          )
          const otherProduct = await api.post(`/store/team-orders/${id}/design-version`, { design_version_id: v3.version.id }, { headers: as, ...allow })
          expect([otherProduct.status, otherProduct.data.code]).toEqual([400, "product_mismatch"])
          // another customer's version is not found
          const stranger = await signIn()
          const { data: foreign } = await saveDesign(stranger)
          const foreignRes = await api.post(`/store/team-orders/${id}/design-version`, { design_version_id: foreign.version.id }, { headers: as, ...allow })
          expect([foreignRes.status, foreignRes.data.code]).toEqual([404, "design_version_not_found"])
        })

        it("refuses a list saved from a stale read once a proof was made at the same moment", async () => {
          const as = await signIn()
          const order = await aReadyOrder(as, 10)
          const id = order.team_order.id
          const [save, made] = await Promise.all([putRoster(as, id, order.roster.version, team(11)), makeProof(as, id)])
          // either order of the two is possible; what matters is that the proof is the list on record
          const after = await read(as, id)
          if (made.status === 201) {
            const proof = await proofOf(as, id, made.data.current_proof.id)
            expect(proof.data.proof.snapshot.lines).toHaveLength(after.data.roster.lines.length)
            if (save.status !== 200) expect(["team_order_not_editable", "roster_version_stale"]).toContain(save.data.code)
          } else {
            expect(made.status).toBe(409)
            expect(save.status).toBe(200)
          }
        })
      })

      // ------------------------------------------------------------------------------------
      describe("signing", () => {
        it("refuses a hash that is not the current proof's, naming the current one", async () => {
          const as = await signIn()
          const order = await aReadyOrder(as, 10)
          const id = order.team_order.id
          const made = await makeProof(as, id)
          const stale = await sign(as, id, made.data.current_proof.id, signBody(made.data, { proof_hash: "0".repeat(64) }))
          expect(stale.status).toBe(409)
          expect(stale.data).toMatchObject({ type: "conflict", code: "proof_hash_mismatch", current_hash: made.data.current_proof.hash })
          expect((await read(as, id)).data.team_order.status).toBe("proof_sent")
        })

        it("refuses the hash of a withdrawn proof: the list the organizer saw is not the list on record", async () => {
          const as = await signIn()
          const order = await aReadyOrder(as, 10)
          const id = order.team_order.id
          const first = await makeProof(as, id)
          await reopen(as, id)
          const edited = team(10)
          edited[0] = line(1, { name: "Zain Ali" })
          await putRoster(as, id, order.roster.version, edited)
          const second = await makeProof(as, id)
          // the old hash on the new proof
          const staleHash = await sign(as, id, second.data.current_proof.id, signBody(first.data))
          expect([staleHash.status, staleHash.data.code]).toEqual([409, "proof_hash_mismatch"])
          // the old proof itself can no longer be signed
          const old = await sign(as, id, first.data.current_proof.id, signBody(first.data))
          expect([old.status, old.data.code]).toEqual([409, "proof_not_current"])
          expect((await read(as, id)).data.team_order.status).toBe("proof_sent")
        })

        it("refuses a request without the hash, the name, the confirmation or the schedule state", async () => {
          const as = await signIn()
          const order = await aReadyOrder(as, 10)
          const id = order.team_order.id
          const made = await makeProof(as, id)
          const proofId = made.data.current_proof.id
          const cases: [Record<string, unknown>, string][] = [
            [{ proof_hash: undefined }, "proof_hash_required"],
            [{ proof_hash: "abc" }, "proof_hash_required"],
            [{ signed_name: "" }, "signed_name_required"],
            [{ signed_name: "   " }, "signed_name_required"],
            [{ signed_name: undefined }, "signed_name_required"],
            [{ confirmed: false }, "confirmation_required"],
            [{ confirmed: undefined }, "confirmation_required"],
            [{ confirmed: "yes" }, "confirmation_required"],
            [{ schedule_state: undefined }, "schedule_state_required"],
            [{ schedule_state: "late" }, "schedule_state_required"],
          ]
          for (const [change, code] of cases) {
            const res = await sign(as, id, proofId, signBody(made.data, change))
            expect([JSON.stringify(change), res.status, res.data.code]).toEqual([JSON.stringify(change), 400, code])
          }
          const noBody = await sign(as, id, proofId, {})
          expect(noBody.status).toBe(400)
          expect((await read(as, id)).data.team_order.status).toBe("proof_sent")
        })

        it("stores the name as typed, cleaned, in Urdu too", async () => {
          const as = await signIn()
          const order = await aReadyOrder(as, 10)
          const id = order.team_order.id
          const made = await makeProof(as, id)
          const signed = await sign(as, id, made.data.current_proof.id, signBody(made.data, { signed_name: "  محمد   علی خان " }))
          expect(signed.status).toBe(200)
          expect(signed.data.current_proof.signed_name).toBe("محمد علی خان")
        })

        it("does nothing the second time: the same answer, no second record", async () => {
          const as = await signIn()
          const order = await aReadyOrder(as, 10)
          const id = order.team_order.id
          const made = await makeProof(as, id)
          const body = signBody(made.data)
          const first = await sign(as, id, made.data.current_proof.id, body)
          const second = await sign(as, id, made.data.current_proof.id, { ...body, signed_name: "Someone Else" })
          expect(first.status).toBe(200)
          expect(second.status).toBe(200)
          expect(second.data.current_proof).toEqual(first.data.current_proof)
          expect(second.data.current_proof.signed_name).toBe("Ali Khan")
          expect(second.data.team_order.status).toBe("approved")
          const list = await proofsOf(as, id)
          expect(list.data.count).toBe(1)
          expect(list.data.proofs[0].status).toBe("signed")
          // a repeat with another hash is still refused
          const wrong = await sign(as, id, made.data.current_proof.id, { ...body, proof_hash: "f".repeat(64) })
          expect([wrong.status, wrong.data.code]).toEqual([409, "proof_hash_mismatch"])
        })

        it("records exactly one signature when two requests come at the same moment", async () => {
          const as = await signIn()
          const order = await aReadyOrder(as, 10)
          const id = order.team_order.id
          const made = await makeProof(as, id)
          const proofId = made.data.current_proof.id
          const results = await Promise.all([
            sign(as, id, proofId, signBody(made.data, { signed_name: "First Signer" })),
            sign(as, id, proofId, signBody(made.data, { signed_name: "Second Signer" })),
            sign(as, id, proofId, signBody(made.data, { signed_name: "Third Signer" })),
          ])
          expect(results.map((r) => r.status)).toEqual([200, 200, 200])
          const names = new Set(results.map((r) => r.data.current_proof.signed_name))
          expect(names.size).toBe(1)
          const stored = (await proofService().listProofApprovals({ team_order_id: id })) as any[]
          expect(stored).toHaveLength(1)
          expect(stored[0].status).toBe("signed")
          expect(stored[0].signed_name).toBe([...names][0])
          expect((await read(as, id)).data.team_order.status).toBe("approved")
        })

        it("makes exactly one proof when two requests come at the same moment", async () => {
          const as = await signIn()
          const order = await aReadyOrder(as, 10)
          const id = order.team_order.id
          const results = await Promise.all([makeProof(as, id), makeProof(as, id), makeProof(as, id)])
          expect(results.filter((r) => r.status === 201)).toHaveLength(1)
          for (const r of results.filter((x) => x.status !== 201)) {
            expect([400, 409]).toContain(r.status)
            expect(["team_order_not_draft", "team_order_changed"]).toContain(r.data.code)
          }
          const list = await proofsOf(as, id)
          expect(list.data.count).toBe(1)
          expect(list.data.proofs[0]).toMatchObject({ number: 1, status: "sent" })
        })

        it("does not let a reopen and a signature both win", async () => {
          const as = await signIn()
          const order = await aReadyOrder(as, 10)
          const id = order.team_order.id
          const made = await makeProof(as, id)
          const [signed, back] = await Promise.all([
            sign(as, id, made.data.current_proof.id, signBody(made.data)),
            reopen(as, id),
          ])
          const final = await read(as, id)
          const stored = (await proofService().listProofApprovals({ team_order_id: id })) as any[]
          expect(stored).toHaveLength(1)
          if (final.data.team_order.status === "approved") {
            expect(signed.status).toBe(200)
            expect(stored[0].status).toBe("signed")
            // the reopen came second and found an approved order: it went back to draft after signing?
            expect([200, 400, 409]).toContain(back.status)
          } else {
            expect(final.data.team_order.status).toBe("draft")
            expect(stored[0].status === "withdrawn" || stored[0].status === "replaced").toBe(true)
          }
        })

        it("does not accept a signature on a proof of an order that went back to draft", async () => {
          const as = await signIn()
          const order = await aReadyOrder(as, 10)
          const id = order.team_order.id
          const made = await makeProof(as, id)
          await reopen(as, id)
          const res = await sign(as, id, made.data.current_proof.id, signBody(made.data))
          expect([res.status, res.data.code]).toEqual([409, "proof_not_current"])
          expect((await read(as, id)).data.team_order.status).toBe("draft")
        })

        it("stores the address the backend sees, ignores a spoofed header without a trusted proxy, and never shows it", async () => {
          const as = await signIn()
          const order = await aReadyOrder(as, 10)
          const id = order.team_order.id
          const made = await makeProof(as, id)
          const signed = await sign(as, id, made.data.current_proof.id, signBody(made.data), { "x-forwarded-for": "6.6.6.6" })
          expect(signed.status).toBe(200)
          const stored = (await proofService().listProofApprovals({ team_order_id: id })) as any[]
          expect(stored[0].signed_ip).toMatch(/^(127\.0\.0\.1|::1)$/)
          // nothing the store answers carries an address
          const everything = JSON.stringify([
            signed.data,
            (await read(as, id)).data,
            (await proofsOf(as, id)).data,
            (await proofOf(as, id, made.data.current_proof.id)).data,
            (await api.get("/store/team-orders", { headers: as })).data,
          ])
          expect(everything).not.toContain("6.6.6.6")
          expect(everything).not.toContain("127.0.0.1")
          expect(everything).not.toContain("signed_ip")
          expect(everything).not.toContain("::1")
        })

        it("takes the address a trusted proxy appended, not the first one the client wrote", async () => {
          const as = await signIn()
          const order = await aReadyOrder(as, 10)
          const id = order.team_order.id
          const made = await makeProof(as, id)
          process.env.TRUSTED_PROXY_HOPS = "1"
          try {
            const signed = await sign(as, id, made.data.current_proof.id, signBody(made.data), {
              "x-forwarded-for": "6.6.6.6, 203.0.113.9",
            })
            expect(signed.status).toBe(200)
          } finally {
            delete process.env.TRUSTED_PROXY_HOPS
          }
          const stored = (await proofService().listProofApprovals({ team_order_id: id })) as any[]
          expect(stored[0].signed_ip).toBe("203.0.113.9")
        })
      })

      // ------------------------------------------------------------------------------------
      describe("the status flow", () => {
        it("sends the organizer back to draft from proof_sent and from approved, and refuses it in draft", async () => {
          const as = await signIn()
          const order = await aReadyOrder(as, 10)
          const id = order.team_order.id
          const inDraft = await reopen(as, id)
          expect([inDraft.status, inDraft.data]).toMatchObject([400, { type: "not_allowed", code: "team_order_already_draft" }])
          const made = await makeProof(as, id)
          const back1 = await reopen(as, id)
          expect(back1.status).toBe(200)
          expect(back1.data.team_order.status).toBe("draft")
          expect((await proofOf(as, id, made.data.current_proof.id)).data.proof.status).toBe("withdrawn")
          const made2 = await makeProof(as, id)
          await sign(as, id, made2.data.current_proof.id, signBody(made2.data))
          const back2 = await reopen(as, id)
          expect(back2.status).toBe(200)
          expect(back2.data.team_order.status).toBe("draft")
          const proofs = (await proofsOf(as, id)).data.proofs
          expect(proofs.map((p: any) => [p.number, p.status])).toEqual([
            [2, "replaced"],
            [1, "withdrawn"],
          ])
          expect(proofs[0].signed_name).toBe("Ali Khan")
        })

        it("refuses the later steps on the store routes: after the deposit nothing goes back, nothing changes", async () => {
          const as = await signIn()
          const order = await aReadyOrder(as, 10)
          const id = order.team_order.id
          const made = await makeProof(as, id)
          await sign(as, id, made.data.current_proof.id, signBody(made.data))
          // the payment system's step (a later milestone) is made here by hand
          for (const status of ["deposit_paid", "in_production", "balance_due", "shipped"]) {
            await proofService().updateTeamOrders({ id, status })
            const back = await reopen(as, id)
            expect([status, back.status, back.data.code]).toEqual([status, 400, "team_order_not_reopenable"])
            const list = await putRoster(as, id, order.roster.version, team(10))
            expect([status, list.status, list.data.code, list.data.status]).toEqual([status, 400, "team_order_not_editable", status])
            const make = await makeProof(as, id)
            expect([status, make.status, make.data.code]).toEqual([status, 400, "team_order_not_draft"])
            const sched = await schedule(as, id, { rush_requested: true })
            expect([status, sched.status, sched.data.code]).toEqual([status, 400, "team_order_not_editable"])
            const signAgain = await sign(as, id, made.data.current_proof.id, signBody(made.data))
            expect([status, signAgain.status]).toEqual([status, 200]) // already signed: the same answer
            const read1 = await read(as, id)
            expect(read1.data.current_proof).toMatchObject({ status: "signed", number: 1 })
          }
        })

        it("shows the status and the current proof in the list of team orders", async () => {
          const as = await signIn()
          const a = await aReadyOrder(as, 10)
          const b = await aReadyOrder(as, 10)
          const c = await aTeamOrder(as)
          const made = await makeProof(as, a.team_order.id)
          const made2 = await makeProof(as, b.team_order.id)
          await sign(as, b.team_order.id, made2.data.current_proof.id, signBody(made2.data))
          const list = await api.get("/store/team-orders", { headers: as })
          const byId = Object.fromEntries(list.data.team_orders.map((o: any) => [o.id, o]))
          expect(byId[a.team_order.id]).toMatchObject({ status: "proof_sent", current_proof: { number: 1, status: "sent", hash: made.data.current_proof.hash } })
          expect(byId[b.team_order.id]).toMatchObject({ status: "approved", current_proof: { number: 1, status: "signed", signed_name: "Ali Khan" } })
          expect(byId[c.team_order.id]).toMatchObject({ status: "draft", current_proof: null })
        })

        it("shows the limits the checks used, and what an admin changed", async () => {
          const as = await signIn()
          const order = await aTeamOrder(as)
          expect(order.limits).toEqual({ max_lines: 100, min_count: 1, max_count: 10, max_name_length: 18 })
          const query = getContainer().resolve("query") as any
          const { data } = await query.graph({ entity: "store", fields: ["id", "metadata"] })
          const store = data[0]
          expect(store.metadata).toMatchObject({
            roster_max_lines: 100,
            roster_max_count: 10,
            roster_max_name_length: 18,
            schedule_time_zone: "Asia/Karachi",
          })
          const storeService = getContainer().resolve("store") as any
          await storeService.updateStores(store.id, { metadata: { ...store.metadata, roster_max_name_length: 12, roster_max_lines: 60 } })
          const again = await read(as, order.team_order.id)
          expect(again.data.limits).toEqual({ max_lines: 60, min_count: 1, max_count: 10, max_name_length: 12 })
        })
      })

      // ------------------------------------------------------------------------------------
      describe("the need-by date", () => {
        it("works the latest signing days out from the date, in the store's time zone", async () => {
          const as = await signIn()
          const needBy = inDays(40)
          const order = await aTeamOrder(as, { need_by_date: needBy })
          expect(order.schedule).toEqual({
            state: "ok",
            need_by_date: needBy,
            today: today(),
            days: { standard: 15, rush: 10 },
            latest_sign_standard: inDays(25),
            latest_sign_rush: inDays(30),
            days_left_standard: 25,
            days_left_rush: 30,
            delivery_if_signed_today: { standard: inDays(15), rush: inDays(10) },
          })
          const none = await aTeamOrder(as)
          expect(none.schedule).toMatchObject({ state: "none", need_by_date: null, latest_sign_standard: null, latest_sign_rush: null })
        })

        it("sets, changes and clears the date and the rush choice while a draft or a proof is out", async () => {
          const as = await signIn()
          const order = await aReadyOrder(as, 10)
          const id = order.team_order.id
          const set = await schedule(as, id, { need_by_date: inDays(50), rush_requested: true })
          expect(set.status).toBe(200)
          expect(set.data.team_order).toMatchObject({ need_by_date: inDays(50), rush_requested: true })
          expect(set.data.schedule.state).toBe("ok")
          // a rush choice alone leaves the date alone, and the date alone leaves the choice alone
          const rushOff = await schedule(as, id, { rush_requested: false })
          expect(rushOff.data.team_order).toMatchObject({ need_by_date: inDays(50), rush_requested: false })
          const moved = await schedule(as, id, { need_by_date: inDays(12) })
          expect(moved.data.team_order).toMatchObject({ need_by_date: inDays(12), rush_requested: false })
          expect(moved.data.schedule.state).toBe("needs_rush")
          // allowed with a proof out; the proof itself is untouched
          const made = await makeProof(as, id)
          const outDate = await schedule(as, id, { need_by_date: inDays(45) })
          expect(outDate.status).toBe(200)
          expect(outDate.data.current_proof.hash).toBe(made.data.current_proof.hash)
          const cleared = await schedule(as, id, { need_by_date: null })
          expect(cleared.data.team_order.need_by_date).toBeNull()
          expect(cleared.data.schedule.state).toBe("none")
          // refused once approved
          await sign(as, id, made.data.current_proof.id, signBody(cleared.data))
          const late = await schedule(as, id, { need_by_date: inDays(45) })
          expect([late.status, late.data.code, late.data.status]).toEqual([400, "team_order_not_editable", "approved"])
        })

        it("refuses a date in the past, a malformed one, an empty body and a rush choice that is not true or false", async () => {
          const as = await signIn()
          const order = await aTeamOrder(as, { need_by_date: inDays(40) })
          const id = order.team_order.id
          const yesterday = inDays(-1)
          const past = await schedule(as, id, { need_by_date: yesterday })
          expect(past.status).toBe(400)
          expect(past.data).toMatchObject({ type: "invalid_data", code: "need_by_date_in_past", today: today() })
          const onCreate = await api.post(
            "/store/team-orders",
            { team_name: "X", design_version_id: (await saveDesign(as)).data.version.id, region_id: regionIds["gb"], need_by_date: yesterday },
            { headers: as, ...allow }
          )
          expect([onCreate.status, onCreate.data.code]).toEqual([400, "need_by_date_in_past"])
          expect((await schedule(as, id, { need_by_date: today() })).status).toBe(200) // today is not the past
          const cases: [unknown, string][] = [
            [{ need_by_date: "2027-02-30" }, "need_by_date_invalid"],
            [{ need_by_date: "01/03/2027" }, "need_by_date_invalid"],
            [{ need_by_date: 20270301 }, "need_by_date_invalid"],
            [{ rush_requested: "yes" }, "rush_requested_invalid"],
            [{ rush_requested: 1 }, "rush_requested_invalid"],
            [{}, "schedule_empty"],
          ]
          for (const [body, code] of cases) {
            const res = await schedule(as, id, body)
            expect([JSON.stringify(body), res.status, res.data.code]).toEqual([JSON.stringify(body), 400, code])
          }
          // nothing changed by the refusals
          expect((await read(as, id)).data.team_order.need_by_date).toBe(today())
        })

        it("refuses nothing for a date that cannot be met: the state says it", async () => {
          const as = await signIn()
          const order = await aTeamOrder(as, { need_by_date: inDays(3) })
          expect(order.schedule.state).toBe("cannot_be_met")
          const late = await schedule(as, order.team_order.id, { need_by_date: today() })
          expect(late.status).toBe(200)
          expect(late.data.schedule.state).toBe("cannot_be_met")
        })

        // need-by dates for each state, as days from today (standard 15 days, rush 10)
        const STATES: [string, number | null][] = [
          ["none", null],
          ["ok", 40],
          ["needs_rush", 12],
          ["cannot_be_met", 4],
        ]
        it.each(STATES)("signs under the state %s, records it and the promised delivery date", async (state, days) => {
          const as = await signIn()
          const order = await aReadyOrder(as, 10, { need_by_date: days === null ? null : inDays(days) })
          const id = order.team_order.id
          const made = await makeProof(as, id)
          expect(made.data.schedule.state).toBe(state)
          const signed = await sign(as, id, made.data.current_proof.id, signBody(made.data))
          expect(signed.status).toBe(200)
          expect(signed.data.current_proof).toMatchObject({
            schedule_state: state,
            need_by_date: days === null ? null : inDays(days),
            rush: false,
            promised_delivery_date: inDays(15),
          })
        })

        it("promises the rush date when rush is requested", async () => {
          const as = await signIn()
          const order = await aReadyOrder(as, 10, { need_by_date: inDays(12), rush_requested: true })
          const id = order.team_order.id
          const made = await makeProof(as, id)
          expect(made.data.team_order.rush_requested).toBe(true)
          const signed = await sign(as, id, made.data.current_proof.id, signBody(made.data))
          expect(signed.data.current_proof).toMatchObject({ schedule_state: "needs_rush", rush: true, promised_delivery_date: inDays(10) })
        })

        it("refuses a signature made under another state than the one the server finds, with the current schedule", async () => {
          const as = await signIn()
          const order = await aReadyOrder(as, 10, { need_by_date: inDays(12) })
          const id = order.team_order.id
          const made = await makeProof(as, id)
          expect(made.data.schedule.state).toBe("needs_rush")
          for (const shown of ["ok", "cannot_be_met", "none"]) {
            const res = await sign(as, id, made.data.current_proof.id, signBody(made.data, { schedule_state: shown }))
            expect([shown, res.status, res.data.code]).toEqual([shown, 409, "schedule_changed"])
            expect(res.data.schedule).toMatchObject({ state: "needs_rush", need_by_date: inDays(12) })
          }
          expect((await read(as, id)).data.team_order.status).toBe("proof_sent")
          // the organizer changes the date after seeing the proof: the state they were shown is stale
          await schedule(as, id, { need_by_date: inDays(60) })
          const stale = await sign(as, id, made.data.current_proof.id, signBody(made.data))
          expect([stale.status, stale.data.code]).toEqual([409, "schedule_changed"])
          expect(stale.data.schedule.state).toBe("ok")
          // read again and sign with the new state
          const fresh = await read(as, id)
          const signed = await sign(as, id, made.data.current_proof.id, signBody(fresh.data))
          expect(signed.status).toBe(200)
          expect(signed.data.current_proof.schedule_state).toBe("ok")
        })
      })
    })
  },
})
