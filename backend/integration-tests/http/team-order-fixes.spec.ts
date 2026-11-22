/**
 * The fixes after QA's review of team orders in the backend (task M2-4): each defect with a test
 * that fails without its fix. The races fire the competing requests together, twenty times each.
 */
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
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
    })
  },
})
