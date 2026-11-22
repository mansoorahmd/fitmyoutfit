/**
 * The admin's routes for team orders (task M2-3): the list (paged, filtered by status, newest
 * first), one order with its proofs, the record of steps, the links and the buttons its status
 * offers, and the admin's steps with the by-hand payment steps. Every route signed out and with a
 * customer's token. The buttons' rules are unit-tested (lib/rules/team-order-steps.ts).
 */
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { TEAM_ORDER_MODULE } from "../../src/modules/team-order/constants"
import { line, makeWorld, team, type World } from "./support/team-order-world"

jest.setTimeout(300 * 1000)

const ADMIN_EMAIL = "team-order-admin-test-admin@example.com"
const ADMIN_PASSWORD = "team-order-admin-test-password"

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("Admin routes for team orders (M2-3)", () => {
      let w: World
      let admin: Record<string, string>
      let adminId: string
      const teams = () => getContainer().resolve(TEAM_ORDER_MODULE) as any

      const adminGet = (path: string, headers: Record<string, string> = admin) => api.get(path, { headers, ...w.allow })
      const adminStep = (id: string, body: unknown, headers: Record<string, string> = admin) =>
        api.post(`/admin/team-orders/${id}/steps`, body, { headers, ...w.allow })

      beforeAll(async () => {
        w = await makeWorld(api, getContainer, { adminEmail: ADMIN_EMAIL, adminPassword: ADMIN_PASSWORD, prefix: "admin-organizer" })
        admin = await w.adminHeaders()
        adminId = (await api.get("/admin/users/me", { headers: admin })).data.user.id
      })

      // ------------------------------------------------------------------------------------
      describe("sign-in", () => {
        it("every route is refused signed out, and with a customer's token", async () => {
          const as = await w.signIn()
          const order = await w.aSignedOrder(as, 12)
          const id = order.team_order.id
          const customer = { authorization: w.clean(as).authorization! }
          const calls: [string, string, unknown?][] = [
            ["get", "/admin/team-orders"],
            ["get", `/admin/team-orders/${id}`],
            ["post", `/admin/team-orders/${id}/steps`, { action: "deposit_by_hand" }],
          ]
          for (const [method, path, body] of calls) {
            for (const headers of [{}, customer, { ...w.base, ...customer }]) {
              const reply = await (api as any)[method](path, ...(method === "get" ? [{ headers, ...w.allow }] : [body, { headers, ...w.allow }]))
              expect(reply.status).toBe(401)
            }
          }
          // nothing happened
          expect((await w.read(as, id)).data.team_order.status).toBe("approved")
          expect(await teams().listTeamOrderSteps({ team_order_id: id, actor: "admin" })).toEqual([])
        })
      })

      // ------------------------------------------------------------------------------------
      describe("the list", () => {
        it("shows the organizer, region, players and pieces, schedule state and proof status, newest first, paged, filtered", async () => {
          const as = await w.signIn()
          const needBy = w.inDays(60)
          const signedOrder = await w.aSignedOrder(as, 12, { need_by_date: needBy })
          const sentOrder = await w.aTeamOrder(as, { need_by_date: w.inDays(8) }) // 8 days: cannot be met
          await w.putRoster(as, sentOrder.team_order.id, 1, team(10))
          await w.makeProof(as, sentOrder.team_order.id)
          const draftOrder = await w.aTeamOrder(as, { country: "pk" })

          const all = await adminGet("/admin/team-orders?limit=100")
          expect(all.status).toBe(200)
          const ids = all.data.team_orders.map((o: any) => o.id)
          // newest first: draft (made last), proof sent, signed
          const mine = ids.filter((i: string) => [signedOrder.team_order.id, sentOrder.team_order.id, draftOrder.team_order.id].includes(i))
          expect(mine).toEqual([draftOrder.team_order.id, sentOrder.team_order.id, signedOrder.team_order.id])
          expect(all.data.count).toBe(all.data.team_orders.length)

          const byId = Object.fromEntries(all.data.team_orders.map((o: any) => [o.id, o]))
          expect(byId[signedOrder.team_order.id]).toMatchObject({
            team_name: "Lahore Lions",
            status: "approved",
            kind: "order",
            players: 12,
            pieces: 12,
            need_by_date: needBy,
            organizer: { name: "Ali Khan", email: as.__email },
            region: { name: "United Kingdom" },
            current_proof: { number: 1, status: "signed" },
            schedule: { state: "ok", need_by_date: needBy, latest_sign_standard: null },
          })
          expect(byId[sentOrder.team_order.id]).toMatchObject({
            status: "proof_sent",
            players: 10,
            current_proof: { number: 1, status: "sent" },
            schedule: { state: "cannot_be_met", latest_sign_standard: expect.any(String) },
          })
          expect(byId[draftOrder.team_order.id]).toMatchObject({
            status: "draft",
            players: 0,
            current_proof: null,
            region: { name: "Pakistan" },
            schedule: { state: "none", need_by_date: null },
          })
          expect(JSON.stringify(all.data)).not.toContain("signed_ip")

          // a filter by status
          const onlyDrafts = await adminGet("/admin/team-orders?status=draft&limit=100")
          expect(onlyDrafts.data.team_orders.every((o: any) => o.status === "draft")).toBe(true)
          expect(onlyDrafts.data.team_orders.map((o: any) => o.id)).toContain(draftOrder.team_order.id)
          expect(onlyDrafts.data.team_orders.map((o: any) => o.id)).not.toContain(signedOrder.team_order.id)
          const approved = await adminGet("/admin/team-orders?status=approved")
          expect(approved.data.team_orders.map((o: any) => o.id)).toContain(signedOrder.team_order.id)

          // paging
          const page1 = await adminGet("/admin/team-orders?limit=2&offset=0")
          const page2 = await adminGet("/admin/team-orders?limit=2&offset=2")
          expect(page1.data).toMatchObject({ limit: 2, offset: 0 })
          expect(page1.data.team_orders).toHaveLength(2)
          expect(page1.data.count).toBeGreaterThanOrEqual(3)
          expect(page1.data.team_orders.map((o: any) => o.id)).toEqual(ids.slice(0, 2))
          expect(page2.data.team_orders.map((o: any) => o.id)).toEqual(ids.slice(2, 4))
          expect(page2.data.offset).toBe(2)
        })

        it("refuses a status or a page that is not one", async () => {
          for (const q of ["status=shipping", "limit=0", "limit=101", "limit=abc", "offset=-1", "offset=1.5"]) {
            const reply = await adminGet(`/admin/team-orders?${q}`)
            expect(reply.status).toBe(400)
            expect(reply.data.type).toBe("invalid_data")
            expect(reply.data.code).toMatch(/^(status|limit|offset)_invalid$/)
          }
        })

        it("add-ons and reorders are listed with their kind and link", async () => {
          const as = await w.signIn()
          const first = await w.aSignedOrder(as, 12)
          const addOn = (await w.startAddOn(as, first.team_order.id)).data.team_order.id
          const re = (await w.startReorder(as, first.team_order.id, { take: "none" })).data.team_order.id
          const all = await adminGet("/admin/team-orders?limit=100")
          const byId = Object.fromEntries(all.data.team_orders.map((o: any) => [o.id, o]))
          expect(byId[addOn]).toMatchObject({ kind: "add_on", linked_order_id: first.team_order.id })
          expect(byId[re]).toMatchObject({ kind: "reorder", linked_order_id: first.team_order.id })
        })
      })

      // ------------------------------------------------------------------------------------
      describe("one order", () => {
        it("has the facts, the team list with its summary, the signed proof with its snapshot, the links and the record of steps", async () => {
          const as = await w.signIn()
          const needBy = w.inDays(60)
          const first = await w.aSignedOrder(as, 20, { need_by_date: needBy })
          const id = first.team_order.id
          const addOn = await w.startAddOn(as, id)
          await w.startReorder(as, id, { take: [0, 1] })

          const reply = await adminGet(`/admin/team-orders/${id}`)
          expect(reply.status).toBe(200)
          const d = reply.data
          expect(d.team_order).toMatchObject({ id, status: "approved", kind: "order", need_by_date: needBy, customer_id: expect.any(String) })
          expect(d.organizer).toMatchObject({ name: "Ali Khan", email: as.__email })
          expect(d.region).toMatchObject({ id: first.team_order.region_id, name: "United Kingdom" })
          expect(d.product).toMatchObject({ id: first.team_order.product_id, title: expect.any(String) })
          expect(d.product.title).not.toBe("")
          expect(d.design_version).toMatchObject({ id: first.team_order.design_version_id, design_id: first.team_order.design_id, design_name: "Home kit", version: 1 })

          // the team list and the summary per size
          expect(d.roster.lines).toHaveLength(20)
          expect(d.roster.summary).toMatchObject({ players: 20, pieces: 20 })
          expect(d.roster.summary.by_size.reduce((n: number, s: any) => n + s.pieces, 0)).toBe(20)
          expect(d.sizes.length).toBeGreaterThan(3)

          // the proof with who signed, when, the address and the list that was signed
          expect(d.proofs).toHaveLength(1)
          const proof = d.proofs[0]
          expect(proof).toMatchObject({
            number: 1,
            status: "signed",
            hash: first.current_proof.hash,
            signed_name: "Ali Khan",
            signed_by: { name: "Ali Khan", email: as.__email },
            signed_by_customer_id: d.team_order.customer_id,
            schedule_state: "ok",
          })
          expect(proof.signed_at).toEqual(expect.any(String))
          expect(proof.signed_ip).toEqual(expect.any(String))
          expect(proof.signed_ip.length).toBeGreaterThan(2)
          expect(proof.snapshot.lines).toHaveLength(20)
          expect(proof.snapshot.lines[0]).toEqual({ name: "Player A", number: "1", size: first.roster.lines[0].size, count: 1, no_name: false, no_number: false })
          expect(proof.snapshot_text).toEqual(expect.stringContaining('"team_name":"Lahore Lions"'))

          // the links, and the record of the organizer's steps
          expect(d.links.add_ons).toEqual({ count: 1, items: [{ id: addOn.data.team_order.id, status: "draft", players: 0, pieces: 0 }] })
          expect(d.links.reorders.count).toBe(1)
          expect(d.steps.map((s: any) => `${s.from}>${s.to}`)).toEqual(["draft>proof_sent", "proof_sent>approved"])
          expect(d.steps[0]).toMatchObject({
            step_name: "make_proof",
            actor: "organizer",
            actor_label: "Organizer",
            by_hand: false,
            actor_person: { name: "Ali Khan", email: as.__email },
          })
          expect(d.steps[0].created_at).toEqual(expect.any(String))
          // the emails the organizer was sent for it
          expect(d.emails.map((e: any) => `${e.kind}:${e.status}`)).toEqual(["proof_ready:sent", "deposit_due:sent"])
          // the one button of an approved order
          expect(d.actions.map((a: any) => a.id)).toEqual(["deposit_by_hand"])
          // the same order through the store: no address, no admin-only fields
          expect(JSON.stringify((await w.read(as, id)).data)).not.toContain("signed_ip")
        })

        it("an add-on shows its link to the first order, and a withdrawn proof stays with its snapshot", async () => {
          const as = await w.signIn()
          const first = await w.aSignedOrder(as, 12)
          const addOnId = (await w.startAddOn(as, first.team_order.id)).data.team_order.id
          await w.putRoster(as, addOnId, 1, [line(31, { id: "a", name: "Late", number: "31", size: "M" })])
          await w.makeProof(as, addOnId)
          await w.reopen(as, addOnId) // the proof is withdrawn
          const d = (await adminGet(`/admin/team-orders/${addOnId}`)).data
          expect(d.team_order).toMatchObject({ kind: "add_on", linked_order_id: first.team_order.id, status: "draft" })
          expect(d.links.source).toMatchObject({ id: first.team_order.id, status: "approved", kind: "order" })
          expect(d.proofs).toHaveLength(1)
          expect(d.proofs[0]).toMatchObject({ status: "withdrawn", signed_name: null, signed_ip: null })
          expect(d.proofs[0].snapshot.lines).toHaveLength(1)
          expect(d.actions).toEqual([])
        })

        it("404 for an unknown order", async () => {
          const reply = await adminGet("/admin/team-orders/teamord_nope")
          expect(reply.status).toBe(404)
          expect(reply.data).toMatchObject({ type: "not_found", code: "team_order_not_found" })
        })
      })

      // ------------------------------------------------------------------------------------
      describe("the admin's steps", () => {
        it("moves an order from approved to shipped step by step, every step recorded, the deposit and the balance marked by hand", async () => {
          const as = await w.signIn()
          const first = await w.aSignedOrder(as, 12)
          const id = first.team_order.id
          const actionIds = async () => (await adminGet(`/admin/team-orders/${id}`)).data.actions.map((a: any) => a.id)

          expect(await actionIds()).toEqual(["deposit_by_hand"])
          const labels = (await adminGet(`/admin/team-orders/${id}`)).data.actions
          expect(labels[0]).toMatchObject({ label: "Mark the deposit as received by hand", to: "deposit_paid", by_hand: true })
          expect(labels[0].confirm).toEqual(expect.stringContaining("records a payment of the deposit's amount in your name"))

          const deposit = await adminStep(id, { action: "deposit_by_hand" })
          expect(deposit.status).toBe(200)
          expect(deposit.data.team_order.status).toBe("deposit_paid")
          expect(await actionIds()).toEqual(["start_production"])

          // the organizer can no longer go back to draft
          expect((await w.reopen(as, id)).data.code).toBe("team_order_not_reopenable")

          expect((await adminStep(id, { action: "start_production" })).data.team_order.status).toBe("in_production")
          expect(await actionIds()).toEqual(["ask_balance"])
          expect((await adminStep(id, { action: "ask_balance" })).data.team_order.status).toBe("balance_due")
          // shipping is not offered until the balance is paid (M3-3, decision 016)
          expect(await actionIds()).toEqual(["balance_by_hand"])
          expect((await adminStep(id, { action: "ship" })).data.code).toBe("balance_not_paid")

          const note = await adminStep(id, { action: "balance_by_hand" })
          expect(note.status).toBe(200)
          expect(note.data.team_order.status).toBe("balance_due") // the balance is paid by hand: no status change
          expect(await actionIds()).toEqual(["ship"])

          const shipped = await adminStep(id, { action: "ship" })
          expect(shipped.status).toBe(200)
          expect(shipped.data.team_order.status).toBe("shipped")
          expect(shipped.data.actions).toEqual([])
          expect((await w.read(as, id)).data.team_order.status).toBe("shipped")

          // the record of steps: the organizer's two, then the admin's, with who, from, to and when
          const steps = shipped.data.steps
          expect(steps.map((s: any) => `${s.actor}:${s.from}>${s.to}${s.by_hand ? ":by-hand" : ""}`)).toEqual([
            "organizer:draft>proof_sent",
            "organizer:proof_sent>approved",
            "admin:approved>deposit_paid:by-hand",
            "admin:deposit_paid>in_production",
            "admin:in_production>balance_due",
            "admin:balance_due>balance_due:by-hand",
            "admin:balance_due>shipped",
          ])
          for (const step of steps.filter((s: any) => s.actor === "admin")) {
            expect(step.actor_id).toBe(adminId)
            expect(step.actor_person).toMatchObject({ email: ADMIN_EMAIL })
            expect(step.actor_label).toBe("Admin user")
            expect(new Date(step.created_at).getTime()).toBeGreaterThan(Date.now() - 5 * 60_000)
          }
          expect(steps[5].step_name).toBe("balance_received_by_hand")
          // the emails: the balance email went when the order became balance_due, once
          expect(shipped.data.emails.map((e: any) => e.kind)).toEqual(["proof_ready", "deposit_due", "balance_due"])
        })

        it("refuses a step the rules do not offer, and records nothing", async () => {
          const as = await w.signIn()
          const draft = await w.aTeamOrder(as)
          const approved = await w.aSignedOrder(as, 12)
          const cases: [string, string, string][] = [
            [draft.team_order.id, "deposit_by_hand", "draft"],
            [draft.team_order.id, "ship", "draft"],
            [approved.team_order.id, "start_production", "approved"],
            [approved.team_order.id, "ask_balance", "approved"],
            [approved.team_order.id, "balance_by_hand", "approved"],
            [approved.team_order.id, "ship", "approved"],
          ]
          for (const [id, action, status] of cases) {
            const reply = await adminStep(id, { action })
            expect(reply.status).toBe(400)
            expect(reply.data).toMatchObject({ type: "not_allowed", code: "step_not_allowed", status, action })
          }
          expect(await teams().listTeamOrderSteps({ actor: "admin" })).toEqual(
            expect.not.arrayContaining([expect.objectContaining({ team_order_id: draft.team_order.id })])
          )
          expect((await w.read(as, approved.team_order.id)).data.team_order.status).toBe("approved")
        })

        it("refuses a step twice, the balance note twice, and a bad or unknown action", async () => {
          const as = await w.signIn()
          const first = await w.aSignedOrder(as, 12)
          const id = first.team_order.id
          expect((await adminStep(id, { action: "deposit_by_hand" })).status).toBe(200)
          const twice = await adminStep(id, { action: "deposit_by_hand" })
          expect(twice.status).toBe(400)
          expect(twice.data).toMatchObject({ code: "step_not_allowed", status: "deposit_paid" })
          await adminStep(id, { action: "start_production" })
          await adminStep(id, { action: "ask_balance" })
          expect((await adminStep(id, { action: "balance_by_hand" })).status).toBe(200)
          expect((await adminStep(id, { action: "balance_by_hand" })).data.code).toBe("step_not_allowed")
          for (const body of [{}, { action: "refund" }, { action: 7 }, { action: null }]) {
            const reply = await adminStep(id, body)
            expect(reply.status).toBe(400)
            expect(reply.data.code).toBe("action_invalid")
          }
          expect((await adminStep("teamord_nope", { action: "ship" })).status).toBe(404)
          const count = await teams().listTeamOrderSteps({ team_order_id: id, step_name: "balance_received_by_hand" })
          expect(count).toHaveLength(1)
        })

        it("two presses at the same moment make one step", async () => {
          const as = await w.signIn()
          const first = await w.aSignedOrder(as, 12)
          const id = first.team_order.id
          const results = await Promise.all([adminStep(id, { action: "deposit_by_hand" }), adminStep(id, { action: "deposit_by_hand" })])
          expect(results.filter((r) => r.status === 200)).toHaveLength(1)
          expect(results.find((r) => r.status !== 200)!.status).toBeGreaterThanOrEqual(400)
          const steps = await teams().listTeamOrderSteps({ team_order_id: id, actor: "admin" })
          expect(steps).toHaveLength(1)
          const balance = await (async () => {
            await adminStep(id, { action: "start_production" })
            await adminStep(id, { action: "ask_balance" })
            return Promise.all([adminStep(id, { action: "balance_by_hand" }), adminStep(id, { action: "balance_by_hand" })])
          })()
          expect(balance.filter((r) => r.status === 200)).toHaveLength(1)
          expect(await teams().listTeamOrderSteps({ team_order_id: id, step_name: "balance_received_by_hand" })).toHaveLength(1)
        })

        it("an add-on goes through the same steps", async () => {
          const as = await w.signIn()
          const first = await w.aSignedOrder(as, 12)
          const addOnId = (await w.startAddOn(as, first.team_order.id)).data.team_order.id
          await w.signed(as, addOnId, [line(31, { id: "a", name: "Late", number: "31", size: "M" })])
          const reply = await adminStep(addOnId, { action: "deposit_by_hand" })
          expect(reply.status).toBe(200)
          expect(reply.data.team_order).toMatchObject({ kind: "add_on", status: "deposit_paid" })
          // the first order is not moved by its add-on's steps
          expect((await w.read(as, first.team_order.id)).data.team_order.status).toBe("approved")
        })
      })
    })
  },
})
