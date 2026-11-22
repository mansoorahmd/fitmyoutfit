/**
 * The fixes after QA's review of team orders in the backend (task M2-4): each defect with a test
 * that fails without its fix. The races fire the competing requests together, twenty times each.
 */
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { TEAM_ORDER_MODULE } from "../../src/modules/team-order/constants"
import { line, makeWorld, team, type World } from "./support/team-order-world"

jest.setTimeout(900 * 1000)

const ADMIN_EMAIL = "team-order-fixes-test-admin@example.com"
const ADMIN_PASSWORD = "team-order-fixes-test-password"

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("Fixes after the QA review of M2 (M2-4)", () => {
      let w: World

      beforeAll(async () => {
        w = await makeWorld(api, getContainer, { adminEmail: ADMIN_EMAIL, adminPassword: ADMIN_PASSWORD, prefix: "fixes-organizer" })
      })

      // ------------------------------------------------------------------------------------
      describe("D3: a count that is not a whole number", () => {
        it("refuses a count of 1.5 or 10.5 as malformed, with the line's index, and saves nothing", async () => {
          const as = await w.signIn()
          const order = await w.aTeamOrder(as)
          const id = order.team_order.id
          for (const [index, count] of [[1, 1.5], [0, 10.5]] as const) {
            const lines = [line(1), line(2)]
            lines[index] = { ...lines[index]!, count }
            const refused = await w.putRoster(as, id, 1, lines)
            expect(refused.status).toBe(400)
            expect(refused.data).toMatchObject({
              code: "roster_malformed",
              detail: { code: "wrong-type", index, field: "count" },
            })
          }
          const after = await w.read(as, id)
          expect(after.data.roster.version).toBe(1)
          expect(after.data.roster.lines).toEqual([])
        })

        it("refuses a count the column cannot hold (3e9, 1e300, -3e9) with 400, never a 500", async () => {
          const as = await w.signIn()
          const order = await w.aTeamOrder(as)
          const id = order.team_order.id
          for (const count of [3e9, 1e300, -3e9, 2147483648]) {
            const refused = await w.putRoster(as, id, 1, [line(1, { count })])
            expect(refused.status).toBe(400)
            expect(refused.data).toMatchObject({ code: "roster_malformed", detail: { code: "wrong-type", index: 0, field: "count" } })
          }
          expect((await w.read(as, id)).data.roster.version).toBe(1)
        })

        it("still saves a whole count outside 1 to 10, with the problem quantity-range", async () => {
          const as = await w.signIn()
          const order = await w.aTeamOrder(as)
          const id = order.team_order.id
          const saved = await w.putRoster(as, id, 1, [line(1, { count: 11 }), line(2, { count: 0 }), line(3, { count: 2147483647 })])
          expect(saved.status).toBe(200)
          expect(saved.data.roster.lines.map((l: any) => l.count)).toEqual([11, 0, 2147483647])
          expect(saved.data.roster.problems.map((p: any) => `${p.index}:${p.code}`)).toEqual([
            "0:quantity-range",
            "1:quantity-range",
            "2:quantity-range",
          ])
          expect(saved.data.roster.summary.ready_for_proof).toBe(false)
        })
      })

      // ------------------------------------------------------------------------------------
      describe("D4: a deleted customer's token", () => {
        it("answers 401 on every design and team-order route once the customer is deleted: read, create, sign", async () => {
          const as = await w.signIn()
          const me = await api.get("/store/customers/me", w.h(as))
          expect(me.status).toBe(200)
          const customerId = me.data.customer.id
          // before the delete: the token works, and a proof waits for a signature
          const order = await w.aTeamOrder(as)
          const id = order.team_order.id
          expect((await w.putRoster(as, id, 1, team(10))).status).toBe(200)
          const made = await w.makeProof(as, id)
          expect(made.status).toBe(201)
          expect((await api.get("/store/designs", w.h(as))).status).toBe(200)

          const admin = await w.adminHeaders()
          const deleted = await api.delete(`/admin/customers/${customerId}`, { headers: admin, ...w.allow })
          expect(deleted.status).toBe(200)

          const unsigned = (r: any) => {
            expect(r.status).toBe(401)
            expect(r.data.type).toBe("unauthorized")
          }
          unsigned(await api.get("/store/designs", w.h(as)))
          unsigned(await w.saveDesign(as))
          unsigned(await api.get("/store/team-orders", w.h(as)))
          unsigned(await w.read(as, id))
          unsigned(await w.sign(as, id, made.data.current_proof.id, w.signBody(made.data)))
          unsigned(await w.reopen(as, id))
          unsigned(await api.delete(`/store/team-orders/${id}`, w.h(as)))
          // nothing was signed or changed by the old token
          const stored = (await (getContainer().resolve(TEAM_ORDER_MODULE) as any).listProofApprovals({ team_order_id: id })) as any[]
          expect(stored.map((p) => p.status)).toEqual(["sent"])
        })
      })

      // ------------------------------------------------------------------------------------
      describe("D1, D2, D5.1: one lock on the first order's row", () => {
        const TRIES = 20
        const teams = () => getContainer().resolve(TEAM_ORDER_MODULE) as any
        /** A signed first order of 12 players numbered 21 to 32 (so 1 to 20 are free for add-ons). */
        const aFirstOrder = async (as: any) => {
          const order = await w.aTeamOrder(as)
          return w.signed(as, order.team_order.id, Array.from({ length: 12 }, (_, i) => line(i + 1, { number: String(21 + i) })))
        }

        // Each race collects what went wrong in every try and expects the list to be empty at the end,
        // so a failure shows how many of the twenty tries went wrong.

        it("never lets the first order go back to draft while an add-on is made (add-on against reopen, 20 tries)", async () => {
          const as = await w.signIn()
          const wrong: string[] = []
          for (let i = 0; i < TRIES; i += 1) {
            const first = await aFirstOrder(as)
            const id = first.team_order.id
            const [addOn, back] = await Promise.all([w.startAddOn(as, id), w.reopen(as, id)])
            const after = await w.read(as, id)
            const status = after.data.team_order.status
            const addOns = after.data.links.add_ons.count
            const seen = `add-on ${addOn.status} ${addOn.data.code ?? ""}, reopen ${back.status} ${back.data.code ?? ""}, order ${status} with ${addOns} add-on(s)`
            const addOnWon = addOn.status === 201 && back.status === 400 && back.data.code === "team_order_has_add_ons" && status === "approved" && addOns === 1
            const reopenWon = back.status === 200 && addOn.status === 400 && addOn.data.code === "team_order_not_signed" && status === "draft" && addOns === 0
            if (!addOnWon && !reopenWon) wrong.push(`try ${i}: ${seen}`)
          }
          expect(wrong).toEqual([])
        })

        it("lets exactly one of two add-ons with the same number make its proof, also as 7 and 07 or an Arabic digit (20 tries)", async () => {
          const as = await w.signIn()
          const variants: [string, string][] = [
            ["7", "7"],
            ["7", "07"],
            ["7", "\u0667"], // Arabic-Indic seven
            ["8", "\u06F8"], // Extended Arabic-Indic (Urdu) eight
          ]
          const wrong: string[] = []
          for (let i = 0; i < TRIES; i += 1) {
            const first = await aFirstOrder(as)
            const id = first.team_order.id
            const [x, y] = variants[i % variants.length]!
            const a = (await w.startAddOn(as, id)).data.team_order.id
            const b = (await w.startAddOn(as, id)).data.team_order.id
            expect((await w.putRoster(as, a, 1, [line(1, { id: "a1", name: "Late A", number: x })])).data.roster.problems).toEqual([])
            expect((await w.putRoster(as, b, 1, [line(1, { id: "b1", name: "Late B", number: y })])).data.roster.problems).toEqual([])
            const [pa, pb] = await Promise.all([w.makeProof(as, a), w.makeProof(as, b)])
            const winner = pa.status === 201 ? a : b
            const loser = pa.status === 201 ? b : a
            const refused = pa.status === 201 ? pb : pa
            const proofs = {
              winner: (await teams().listProofApprovals({ team_order_id: winner })).length,
              loser: (await teams().listProofApprovals({ team_order_id: loser })).length,
            }
            const read = await w.read(as, loser)
            const ok =
              [pa.status, pb.status].sort().join() === "201,400" &&
              refused.data.code === "roster_has_problems" &&
              proofs.winner === 1 &&
              proofs.loser === 0 &&
              read.data.team_order.status === "draft" &&
              read.data.current_proof === null &&
              read.data.roster.problems.map((p: any) => p.code).join() === "number-taken-add-on"
            if (!ok) wrong.push(`try ${i} (${x} / ${y}): proofs ${pa.status}, ${pb.status}; proofs stored ${JSON.stringify(proofs)}`)
          }
          expect(wrong).toEqual([])
        })

        it("lets exactly one of a proof and a delete of the same draft order win (20 tries), and the delete leaves nothing behind", async () => {
          const as = await w.signIn()
          const wrong: string[] = []
          for (let i = 0; i < TRIES; i += 1) {
            const order = await w.aTeamOrder(as)
            const id = order.team_order.id
            expect((await w.putRoster(as, id, 1, team(10))).status).toBe(200)
            const [made, removed] = await Promise.all([w.makeProof(as, id), api.delete(`/store/team-orders/${id}`, w.h(as))])
            const proofs = (await teams().listProofApprovals({ team_order_id: id })).length
            const entries = (await teams().listRosterEntries({ team_order_id: id })).length
            const emails = (await teams().listTeamOrderEmails({ team_order_id: id })).length
            const status = (await w.read(as, id)).status
            const deletedWon = removed.status === 200 && made.status === 404 && status === 404 && proofs === 0 && entries === 0 && emails === 0
            const proofWon = made.status === 201 && removed.status === 400 && removed.data.code === "team_order_not_draft" && status === 200 && proofs === 1
            if (!deletedWon && !proofWon) {
              wrong.push(`try ${i}: proof ${made.status}, delete ${removed.status}, read ${status}, proofs ${proofs}, entries ${entries}, emails ${emails}`)
            }
          }
          expect(wrong).toEqual([])
        })
      })
    })
  },
})
