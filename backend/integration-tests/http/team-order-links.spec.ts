/**
 * Late joiners (add-ons), reorders and the record of steps of a team order (task M2-3), through the
 * store API: an add-on from a signed order with the numbers already taken, its own minimum, proof and
 * signature (the first order untouched), an add-on of an add-on refused, a reorder with some players
 * taken over from the signed list, every new route signed out / with another customer's order / with
 * the wrong kind of token. The rules themselves are unit-tested (lib/rules/team-order-links.ts).
 */
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { Modules } from "@medusajs/framework/utils"
import { TEAM_ORDER_MODULE } from "../../src/modules/team-order/constants"
import { line, makeWorld, team, type World } from "./support/team-order-world"

jest.setTimeout(300 * 1000)

const ADMIN_EMAIL = "team-order-links-test-admin@example.com"
const ADMIN_PASSWORD = "team-order-links-test-password"

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("Late joiners, reorders and the record of steps (M2-3)", () => {
      let w: World
      const teams = () => getContainer().resolve(TEAM_ORDER_MODULE) as any

      beforeAll(async () => {
        w = await makeWorld(api, getContainer, { adminEmail: ADMIN_EMAIL, adminPassword: ADMIN_PASSWORD, prefix: "links-organizer" })
      })

      /** The first order's current proof, read again, for "untouched" checks. */
      const proofOf = async (as: any, id: string) => (await w.read(as, id)).data.current_proof

      // ------------------------------------------------------------------------------------
      describe("late joiners: add-ons", () => {
        it("starts an add-on from a signed order, linked, with the same design version, product and region", async () => {
          const as = await w.signIn()
          const first = await w.aSignedOrder(as, 20)
          const firstId = first.team_order.id

          const started = await w.startAddOn(as, firstId)
          expect(started.status).toBe(201)
          const addOn = started.data
          expect(addOn.team_order).toMatchObject({
            kind: "add_on",
            linked_order_id: firstId,
            status: "draft",
            team_name: "Lahore Lions",
            design_id: first.team_order.design_id,
            design_version_id: first.team_order.design_version_id,
            product_id: first.team_order.product_id,
            region_id: first.team_order.region_id,
            prints: first.team_order.prints,
          })
          expect(addOn.roster.lines).toEqual([])
          expect(addOn.current_proof).toBeNull()
          expect(addOn.links).toMatchObject({
            kind: "add_on",
            source: { id: firstId, team_name: "Lahore Lions", status: "approved", kind: "order" },
            add_ons: { count: 0, items: [] },
          })

          // reading the first order says how many add-ons it has, and their statuses
          const firstAgain = await w.read(as, firstId)
          expect(firstAgain.data.team_order.kind).toBe("order")
          expect(firstAgain.data.team_order.linked_order_id).toBeNull()
          expect(firstAgain.data.links.add_ons).toEqual({
            count: 1,
            items: [{ id: addOn.team_order.id, status: "draft", players: 0, pieces: 0 }],
          })

          const listed = await w.listAddOns(as, firstId)
          expect(listed.status).toBe(200)
          expect(listed.data.count).toBe(1)
          expect(listed.data.add_ons[0]).toMatchObject({ id: addOn.team_order.id, kind: "add_on", players: 0, pieces: 0, current_proof: null })
        })

        it("takes an optional team name and need-by date, and refuses bad ones", async () => {
          const as = await w.signIn()
          const first = await w.aSignedOrder(as, 12)
          const id = first.team_order.id
          const named = await w.startAddOn(as, id, { team_name: "Lions late", need_by_date: w.inDays(40), rush_requested: true })
          expect(named.status).toBe(201)
          expect(named.data.team_order).toMatchObject({ team_name: "Lions late", need_by_date: w.inDays(40), rush_requested: true })
          expect((await w.startAddOn(as, id, { team_name: "" })).data.code).toBe("team_name_invalid")
          expect((await w.startAddOn(as, id, { need_by_date: "soon" })).data.code).toBe("need_by_date_invalid")
          expect((await w.startAddOn(as, id, { need_by_date: "2020-01-01" })).data.code).toBe("need_by_date_in_past")
          expect((await w.startAddOn(as, id, { rush_requested: "yes" })).data.code).toBe("rush_requested_invalid")
        })

        it("its list is checked against the numbers taken in the first order: a taken number is a problem on the line, a free one is fine", async () => {
          const as = await w.signIn()
          const first = await w.aSignedOrder(as, 20) // numbers 1 to 20
          const addOnId = (await w.startAddOn(as, first.team_order.id)).data.team_order.id

          const saved = await w.putRoster(as, addOnId, 1, [
            line(31, { id: "a", name: "Late Taken", number: "7" }),
            line(32, { id: "b", name: "Late Zero", number: "07" }),
            line(33, { id: "c", name: "Late Arabic", number: "٧" }),
            line(34, { id: "d", name: "Late Free", number: "31" }),
          ])
          expect(saved.status).toBe(200)
          const problems = saved.data.roster.problems
          // "7", "07" and "٧" are the same number; but 07 and ٧ are also each other's duplicates inside the list
          expect(problems.filter((p: any) => p.index === 0)).toEqual([
            {
              code: "number-duplicate",
              index: 0,
              line_id: "a",
              field: "number",
              detail: expect.objectContaining({ value: 7 }),
            },
          ])
          // the free line has no problem at all
          expect(problems.filter((p: any) => p.index === 3)).toEqual([])

          // without the in-list duplicates: one taken number, with where
          const again = await w.putRoster(as, addOnId, 2, [
            line(31, { id: "a", name: "Late Taken", number: "7" }),
            line(34, { id: "d", name: "Late Free", number: "31" }),
          ])
          expect(again.data.roster.problems).toEqual([
            {
              code: "number-taken-first-order",
              index: 0,
              line_id: "a",
              field: "number",
              detail: { value: 7, taken_in: [{ source: "first_order", order_id: first.team_order.id, name: "Player G" }] },
            },
          ])
          expect(again.data.roster.summary).toMatchObject({ ready_for_proof: false, lines_to_fix: 1, indexes_to_fix: [0] })

          // Arabic digits and a leading zero are the same number as the first order's 7
          for (const [version, number] of [[3, "07"], [4, "٧"], [5, "۷"]] as const) {
            const r = await w.putRoster(as, addOnId, version, [line(31, { id: "a", name: "L", number })])
            expect(r.data.roster.problems.map((p: any) => p.code)).toEqual(["number-taken-first-order"])
          }

          // the proof is refused while a number is taken
          const refused = await w.makeProof(as, addOnId)
          expect(refused.status).toBe(400)
          expect(refused.data.code).toBe("roster_has_problems")

          // a free number: ready, even with one player (the add-on's own minimum)
          const free = await w.putRoster(as, addOnId, 6, [line(31, { id: "a", name: "Late Free", number: "31" })])
          expect(free.data.roster.problems).toEqual([])
          expect(free.data.roster.summary).toMatchObject({ players: 1, ready_for_proof: true, minimum: { required: 1, missing: 0, met: true } })
        })

        it("has its own proof and signature; the first order and its signed proof are untouched", async () => {
          const as = await w.signIn()
          const first = await w.aSignedOrder(as, 20)
          const firstId = first.team_order.id
          const before = await proofOf(as, firstId)
          const stepsBefore = await teams().listTeamOrderSteps({ team_order_id: firstId })

          const addOnId = (await w.startAddOn(as, firstId)).data.team_order.id
          const done = await w.signed(as, addOnId, [line(31, { id: "a", name: "Late Joiner", number: "31", size: "M" })])
          expect(done.team_order).toMatchObject({ id: addOnId, kind: "add_on", status: "approved" })
          expect(done.current_proof).toMatchObject({ number: 1, status: "signed", signed_name: "Ali Khan" })
          expect(done.current_proof.id).not.toBe(before.id)
          expect(done.current_proof.team_order_id).toBe(addOnId)

          const firstAfter = await w.read(as, firstId)
          expect(firstAfter.data.team_order).toMatchObject({ status: "approved", list_version: first.team_order.list_version })
          expect(firstAfter.data.current_proof).toEqual(before)
          expect(firstAfter.data.roster.lines).toEqual(first.roster.lines)
          expect(await teams().listTeamOrderSteps({ team_order_id: firstId })).toHaveLength(stepsBefore.length)
          expect(firstAfter.data.links.add_ons.items).toEqual([{ id: addOnId, status: "approved", players: 1, pieces: 1 }])
        })

        it("numbers of the other add-ons count once their proof is out, not while they are drafts", async () => {
          const as = await w.signIn()
          const first = await w.aSignedOrder(as, 12)
          const a = (await w.startAddOn(as, first.team_order.id)).data.team_order.id
          const b = (await w.startAddOn(as, first.team_order.id)).data.team_order.id
          expect((await w.listAddOns(as, first.team_order.id)).data.count).toBe(2)

          await w.putRoster(as, a, 1, [line(41, { id: "x", name: "Late A", number: "41" })])
          // A is still a draft: 41 is free in B
          const draftOnly = await w.putRoster(as, b, 1, [line(41, { id: "y", name: "Late B", number: "41" })])
          expect(draftOnly.data.roster.problems).toEqual([])

          // A's proof goes out: 41 is taken in B, and the problem says it is in an add-on
          const madeA = await w.makeProof(as, a)
          expect(madeA.status).toBe(201)
          const sentOnly = await w.read(as, b)
          expect(sentOnly.data.roster.problems).toEqual([
            {
              code: "number-taken-add-on",
              index: 0,
              line_id: "y",
              field: "number",
              detail: { value: 41, taken_in: [{ source: "add_on", order_id: a, name: "Late A" }] },
            },
          ])
          // and still after A is signed
          await w.sign(as, a, madeA.data.current_proof.id, w.signBody(madeA.data))
          expect((await w.read(as, b)).data.roster.problems.map((p: any) => p.code)).toEqual(["number-taken-add-on"])
          // A itself never sees its own numbers as taken
          expect((await w.read(as, a)).data.roster.problems).toEqual([])
          // if A goes back to draft, its numbers are free again (A is a draft)
          await w.reopen(as, a)
          expect((await w.read(as, b)).data.roster.problems).toEqual([])
        })

        it("the add-on's minimum is a setting of its own, read from the region", async () => {
          const as = await w.signIn()
          const first = await w.aSignedOrder(as, 12)
          const addOnId = (await w.startAddOn(as, first.team_order.id)).data.team_order.id
          const region = (await getContainer().resolve(Modules.REGION).listRegions({ id: first.team_order.region_id }))[0] as any
          expect(region.metadata).toMatchObject({ min_garment_quantity: 10, addon_min_garment_quantity: 1 })
          try {
            await getContainer()
              .resolve(Modules.REGION)
              .updateRegions(region.id, { metadata: { ...region.metadata, addon_min_garment_quantity: 3 } })
            const saved = await w.putRoster(as, addOnId, 1, [line(51, { id: "a", name: "One", number: "51" })])
            expect(saved.data.roster.summary.minimum).toEqual({ required: 3, missing: 2, met: false })
            const refused = await w.makeProof(as, addOnId)
            expect(refused.status).toBe(400)
            expect(refused.data).toMatchObject({ code: "roster_below_minimum", required: 3, missing: 2 })
            // an ordinary order of the region keeps the region's own minimum
            const ordinary = await w.aTeamOrder(as)
            expect((await w.putRoster(as, ordinary.team_order.id, 1, team(4))).data.roster.summary.minimum).toEqual({
              required: 10,
              missing: 6,
              met: false,
            })
          } finally {
            await getContainer().resolve(Modules.REGION).updateRegions(region.id, { metadata: region.metadata })
          }
        })

        it("an add-on cannot have add-ons, and none starts before the proof is signed", async () => {
          const as = await w.signIn()
          const first = await w.aSignedOrder(as, 12)
          const addOnId = (await w.startAddOn(as, first.team_order.id)).data.team_order.id
          const noAddOn = await w.startAddOn(as, addOnId)
          expect(noAddOn.status).toBe(400)
          expect(noAddOn.data).toMatchObject({ type: "not_allowed", code: "add_on_of_add_on" })
          // even a signed add-on cannot have add-ons
          await w.signed(as, addOnId, [line(61, { id: "a", name: "Late", number: "61", size: "M" })])
          expect((await w.startAddOn(as, addOnId)).data.code).toBe("add_on_of_add_on")

          const draft = await w.aTeamOrder(as)
          const refusedDraft = await w.startAddOn(as, draft.team_order.id)
          expect(refusedDraft.status).toBe(400)
          expect(refusedDraft.data).toMatchObject({ code: "team_order_not_signed", status: "draft" })
          await w.putRoster(as, draft.team_order.id, 1, team(12))
          await w.makeProof(as, draft.team_order.id)
          expect((await w.startAddOn(as, draft.team_order.id)).data).toMatchObject({ code: "team_order_not_signed", status: "proof_sent" })
        })

        it("an add-on can be deleted while it is a draft, not after its proof is made", async () => {
          const as = await w.signIn()
          const first = await w.aSignedOrder(as, 12)
          const id = first.team_order.id
          const gone = (await w.startAddOn(as, id)).data.team_order.id
          const del = await w.api.delete(`/store/team-orders/${gone}`, w.h(as))
          expect(del.status).toBe(200)
          expect(del.data).toEqual({ id: gone, object: "team_order", deleted: true })
          expect((await w.read(as, id)).data.links.add_ons.count).toBe(0)

          const kept = (await w.startAddOn(as, id)).data.team_order.id
          await w.putRoster(as, kept, 1, [line(71, { id: "a", name: "Late", number: "71", size: "M" })])
          await w.makeProof(as, kept)
          const refused = await w.api.delete(`/store/team-orders/${kept}`, w.h(as))
          expect(refused.status).toBe(400)
          expect(refused.data.code).toBe("team_order_not_draft")
        })

        it("the first order cannot go back to draft while it has add-ons", async () => {
          const as = await w.signIn()
          const first = await w.aSignedOrder(as, 12)
          const id = first.team_order.id
          const addOn = (await w.startAddOn(as, id)).data.team_order.id
          const refused = await w.reopen(as, id)
          expect(refused.status).toBe(400)
          expect(refused.data).toMatchObject({ type: "not_allowed", code: "team_order_has_add_ons", status: "approved", add_ons: 1 })
          expect((await w.read(as, id)).data.team_order.status).toBe("approved")
          // once the add-on is gone, it can
          await w.api.delete(`/store/team-orders/${addOn}`, w.h(as))
          expect((await w.reopen(as, id)).status).toBe(200)
        })

        it("an add-on of a reorder is allowed (a reorder is a full order of its own)", async () => {
          const as = await w.signIn()
          const first = await w.aSignedOrder(as, 12)
          const reorder = (await w.startReorder(as, first.team_order.id)).data
          await w.signed(as, reorder.team_order.id, team(12), reorder.roster.version)
          const addOn = await w.startAddOn(as, reorder.team_order.id)
          expect(addOn.status).toBe(201)
          expect(addOn.data.team_order).toMatchObject({ kind: "add_on", linked_order_id: reorder.team_order.id })
        })
      })

      // ------------------------------------------------------------------------------------
      describe("reorders", () => {
        it("takes some players over from the signed list, as a full order of its own, linked on both ends", async () => {
          const as = await w.signIn()
          const first = await w.aSignedOrder(as, 20)
          const firstId = first.team_order.id

          const started = await w.startReorder(as, firstId, { take: [0, 2, 4, 5, 6] })
          expect(started.status).toBe(201)
          const re = started.data
          expect(re.team_order).toMatchObject({
            kind: "reorder",
            linked_order_id: firstId,
            status: "draft",
            design_version_id: first.team_order.design_version_id,
            product_id: first.team_order.product_id,
            region_id: first.team_order.region_id,
            team_name: "Lahore Lions",
          })
          expect(re.roster.lines).toHaveLength(5)
          expect(re.roster.lines.map((l: any) => [l.name, l.number, l.size, l.count])).toEqual(
            [0, 2, 4, 5, 6].map((i) => [first.roster.lines[i].name, first.roster.lines[i].number, first.roster.lines[i].size, 1])
          )
          // new line ids, not the source's
          expect(re.roster.lines.map((l: any) => l.id).filter((id: string) => first.roster.lines.some((s: any) => s.id === id))).toEqual([])
          expect(re.roster.problems).toEqual([])
          // a full order: the region's ordinary minimum (10 in the UK) applies, not the add-on's
          expect(re.roster.summary).toMatchObject({ players: 5, pieces: 5, ready_for_proof: false, minimum: { required: 10, missing: 5, met: false } })
          expect(re.links).toMatchObject({ kind: "reorder", source: { id: firstId, status: "approved", kind: "order" } })

          // the link is visible on the source as well
          const sourceAgain = await w.read(as, firstId)
          expect(sourceAgain.data.links.reorders).toEqual({
            count: 1,
            items: [{ id: re.team_order.id, status: "draft", players: 5, pieces: 5 }],
          })
          expect(sourceAgain.data.links.add_ons.count).toBe(0)
          expect(sourceAgain.data.team_order.status).toBe("approved")

          // the existing routes do the rest: change a size and a count, add players, make the proof, sign
          const lines = re.roster.lines.map((l: any, i: number) => ({ ...l, ...(i === 0 ? { size: "XL", count: 3 } : {}) }))
          for (let n = 21; n <= 25; n += 1) lines.push(line(n, { id: `new${n}` }))
          const saved = await w.putRoster(as, re.team_order.id, re.roster.version, lines)
          expect(saved.status).toBe(200)
          expect(saved.data.roster.summary).toMatchObject({ players: 10, pieces: 12, ready_for_proof: true })
          const done = await w.signed(as, re.team_order.id, lines, saved.data.roster.version)
          expect(done.team_order.status).toBe("approved")
          // the source was never changed
          expect((await w.read(as, firstId)).data.current_proof).toEqual(first.current_proof)
        })

        it("a reorder checks its numbers within itself only (the source's numbers are not taken)", async () => {
          const as = await w.signIn()
          const first = await w.aSignedOrder(as, 12)
          const re = (await w.startReorder(as, first.team_order.id)).data
          expect(re.roster.lines).toHaveLength(12)
          expect(re.roster.problems).toEqual([])
          // two lines of the new order with the same number are still a duplicate inside it
          const dup = await w.putRoster(as, re.team_order.id, re.roster.version, [
            line(1, { id: "p", name: "P", number: "5" }),
            line(2, { id: "q", name: "Q", number: "05" }),
          ])
          expect(dup.data.roster.problems.map((p: any) => p.code)).toEqual(["number-duplicate", "number-duplicate"])
        })

        it("takes all by default and with all, none with none", async () => {
          const as = await w.signIn()
          const first = await w.aSignedOrder(as, 12)
          const id = first.team_order.id
          expect((await w.startReorder(as, id)).data.roster.lines).toHaveLength(12)
          expect((await w.startReorder(as, id, { take: "all" })).data.roster.lines).toHaveLength(12)
          const none = await w.startReorder(as, id, { take: "none" })
          expect(none.status).toBe(201)
          expect(none.data.roster.lines).toEqual([])
          expect(none.data.roster.version).toBe(1)
          expect((await w.read(as, id)).data.links.reorders.count).toBe(3)
        })

        it("copies from the SIGNED list on record, not from rows that differ", async () => {
          const as = await w.signIn()
          const first = await w.aSignedOrder(as, 12)
          const id = first.team_order.id
          // The rows of the list are changed behind the API's back: the signature is what counts.
          await teams().deleteRosterEntries({ team_order_id: id })
          await teams().createRosterEntries([
            { team_order_id: id, line_id: "z", position: 0, product_id: first.team_order.product_id, name: "Changed", number: "99", size: "S", count: 1 },
          ])
          const re = (await w.startReorder(as, id, { take: [0, 1] })).data
          expect(re.roster.lines.map((l: any) => l.name)).toEqual(["Player A", "Player B"])
          expect(re.roster.lines.map((l: any) => l.number)).toEqual(["1", "2"])
        })

        it("is refused for an order whose proof is not signed (also after going back to draft), and takes the new list after a new signature", async () => {
          const as = await w.signIn()
          const draft = await w.aTeamOrder(as)
          expect((await w.startReorder(as, draft.team_order.id)).data).toMatchObject({ code: "team_order_not_signed", status: "draft" })
          await w.putRoster(as, draft.team_order.id, 1, team(12))
          await w.makeProof(as, draft.team_order.id)
          expect((await w.startReorder(as, draft.team_order.id)).data).toMatchObject({ code: "team_order_not_signed", status: "proof_sent" })
          await w.reopen(as, draft.team_order.id)

          const edited = team(12).map((l, i) => (i === 0 ? { ...l, name: "Renamed" } : l))
          const done = await w.signed(as, draft.team_order.id, edited, 2)
          expect(done.team_order.status).toBe("approved")
          const re = (await w.startReorder(as, draft.team_order.id, { take: [0] })).data
          expect(re.roster.lines[0].name).toBe("Renamed")
        })

        it("can be started in another region, and takes a name, a need-by date and the rush choice", async () => {
          const as = await w.signIn()
          const first = await w.aSignedOrder(as, 12)
          const re = await w.startReorder(as, first.team_order.id, {
            take: [0, 1, 2],
            team_name: "Lions II",
            region_id: w.regionIds["pk"],
            need_by_date: w.inDays(50),
            rush_requested: true,
          })
          expect(re.status).toBe(201)
          expect(re.data.team_order).toMatchObject({
            team_name: "Lions II",
            region_id: w.regionIds["pk"],
            need_by_date: w.inDays(50),
            rush_requested: true,
          })
          // Pakistan's minimum is 1
          expect(re.data.roster.summary).toMatchObject({ players: 3, ready_for_proof: true, minimum: { required: 1, met: true } })
        })

        it("refuses a bad choice", async () => {
          const as = await w.signIn()
          const first = await w.aSignedOrder(as, 12)
          const id = first.team_order.id
          for (const take of ["some", 5, [1.5], ["0"], null]) {
            const r = await w.startReorder(as, id, { take })
            expect(r.status).toBe(400)
            expect(r.data.code).toBe("take_invalid")
          }
          const out = await w.startReorder(as, id, { take: [12] })
          expect(out.status).toBe(400)
          expect(out.data).toMatchObject({ code: "take_out_of_range", lines: 12 })
          expect((await w.startReorder(as, id, { team_name: " " })).data.code).toBe("team_name_invalid")
          expect((await w.startReorder(as, id, { need_by_date: "2020-01-01" })).data.code).toBe("need_by_date_in_past")
          expect((await w.startReorder(as, id, { region_id: "reg_nope" })).data.code).toBe("region_not_found")
          expect((await w.startReorder(as, id, { rush_requested: 1 })).data.code).toBe("rush_requested_invalid")
          expect((await w.read(as, id)).data.links.reorders.count).toBe(0)
        })

        it("a source with reorders cannot be deleted", async () => {
          const as = await w.signIn()
          const first = await w.aSignedOrder(as, 12)
          const id = first.team_order.id
          await w.startReorder(as, id)
          await w.reopen(as, id) // reorders do not stop going back to draft
          const del = await w.api.delete(`/store/team-orders/${id}`, w.h(as))
          expect(del.status).toBe(400)
          expect(del.data.code).toBe("team_order_has_linked_orders")
        })
      })

      // ------------------------------------------------------------------------------------
      describe("who may reach the new routes", () => {
        it("signed out: 401; another customer's order: 404; an admin's token: 401", async () => {
          const owner = await w.signIn()
          const other = await w.signIn()
          const first = await w.aSignedOrder(owner, 12)
          const id = first.team_order.id
          const admin = await w.adminHeaders()
          const signedOut = { headers: w.base, ...w.allow }
          const asAdmin = { headers: { ...w.base, ...admin }, ...w.allow }
          const calls: [string, string][] = [
            ["post", `/store/team-orders/${id}/add-ons`],
            ["get", `/store/team-orders/${id}/add-ons`],
            ["post", `/store/team-orders/${id}/reorders`],
          ]
          for (const [method, path] of calls) {
            const body = method === "get" ? [signedOut] : [{}, signedOut]
            const out = await (w.api as any)[method](path, ...body)
            expect(out.status).toBe(401)
            const adminReply = await (w.api as any)[method](path, ...(method === "get" ? [asAdmin] : [{}, asAdmin]))
            expect(adminReply.status).toBe(401)
            const wrong = await (w.api as any)[method](path, ...(method === "get" ? [w.h(other)] : [{}, w.h(other)]))
            expect(wrong.status).toBe(404)
            expect(wrong.data).toMatchObject({ type: "not_found", code: "team_order_not_found" })
          }
          // nothing was made by any of them
          expect((await w.read(owner, id)).data.links).toMatchObject({ add_ons: { count: 0 }, reorders: { count: 0 } })
        })

        it("another customer cannot see an add-on or a reorder either", async () => {
          const owner = await w.signIn()
          const other = await w.signIn()
          const first = await w.aSignedOrder(owner, 12)
          const addOn = (await w.startAddOn(owner, first.team_order.id)).data.team_order.id
          const re = (await w.startReorder(owner, first.team_order.id)).data.team_order.id
          for (const id of [addOn, re]) {
            expect((await w.read(other, id)).status).toBe(404)
          }
          expect((await w.listAddOns(other, first.team_order.id)).status).toBe(404)
        })
      })

      // ------------------------------------------------------------------------------------
      describe("the record of steps (organizer's steps)", () => {
        it("records who, from, to and when for the organizer's steps, in order", async () => {
          const as = await w.signIn()
          const order = await w.aTeamOrder(as)
          const id = order.team_order.id
          await w.putRoster(as, id, 1, team(12))
          const proof = await w.makeProof(as, id)
          await w.reopen(as, id) // proof_sent -> draft
          const again = await w.makeProof(as, id)
          expect(again.status).toBe(201)
          await w.sign(as, id, again.data.current_proof.id, w.signBody(again.data))
          await w.reopen(as, id) // approved -> draft
          expect(proof.status).toBe(201)

          const steps = (await teams().listTeamOrderSteps({ team_order_id: id }, { order: { created_at: "ASC" } })) as any[]
          expect(steps.map((s) => `${s.from_status}>${s.to_status}:${s.step_name}`)).toEqual([
            "draft>proof_sent:make_proof",
            "proof_sent>draft:withdraw_proof",
            "draft>proof_sent:make_proof",
            "proof_sent>approved:sign_proof",
            "approved>draft:reopen",
          ])
          const { data: me } = await w.api.get("/store/customers/me", w.h(as))
          for (const step of steps) {
            expect(step).toMatchObject({ actor: "organizer", actor_id: me.customer.id, by_hand: false })
            expect(new Date(step.created_at).getTime()).toBeGreaterThan(Date.now() - 5 * 60_000)
          }
        })

        it("a refused step leaves no record", async () => {
          const as = await w.signIn()
          const order = await w.aTeamOrder(as)
          const id = order.team_order.id
          expect((await w.makeProof(as, id)).status).toBe(400) // empty list
          expect((await w.reopen(as, id)).status).toBe(400) // already draft
          expect(await teams().listTeamOrderSteps({ team_order_id: id })).toEqual([])
        })
      })
    })
  },
})
