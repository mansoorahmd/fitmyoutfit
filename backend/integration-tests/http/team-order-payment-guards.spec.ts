/**
 * What may go wrong with a team order's payments (task M3-3, decision 016), each with a test: two
 * "pay the deposit" requests at once pay once; paying when nothing is due, or twice; going back to
 * draft or deleting the order while a payment is being made; another customer's order; amounts
 * never taken from the request; a price changed in the admin after the proof was priced; and every
 * new refusal code.
 */
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { MedusaError, Modules } from "@medusajs/framework/utils"
import { TEAM_ORDER_MODULE } from "../../src/modules/team-order/constants"
import { withTeamOrderMoneyLock } from "../../src/workflows/team-order/money-lock"
import { makeWorld, team, type World } from "./support/team-order-world"

jest.setTimeout(600 * 1000)

const ADMIN_EMAIL = "team-order-payment-guards-test-admin@example.com"
const ADMIN_PASSWORD = "team-order-payment-guards-test-password"

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("Team order payments: what may go wrong (M3-3)", () => {
      let w: World
      let admin: Record<string, string>
      const teams = () => getContainer().resolve(TEAM_ORDER_MODULE) as any
      const paymentModule = () => getContainer().resolve(Modules.PAYMENT) as any

      const payments = (as: any, id: string) => api.get(`/store/team-orders/${id}/payments`, w.h(as))
      const start = (as: any, id: string, part: string, body: unknown = {}) => api.post(`/store/team-orders/${id}/payments/${part}`, body, w.h(as))
      const complete = (as: any, id: string, part: string, body: unknown) =>
        api.post(`/store/team-orders/${id}/payments/${part}/complete`, body, w.h(as))
      const adminStep = (id: string, action: string) => api.post(`/admin/team-orders/${id}/steps`, { action }, { headers: admin, ...w.allow })
      const proofOf = async (proofId: string) => (await teams().listProofApprovals({ id: proofId }))[0]
      const capturesOf = async (collectionId: string) => {
        const list = await paymentModule().listPayments({ payment_collection_id: collectionId }, { relations: ["captures"] })
        return list.flatMap((p: any) => p.captures)
      }
      const medusaOrder = async (orderId: string) =>
        (await api.get(`/admin/orders/${orderId}?fields=id,status,total,payment_status,summary`, { headers: admin })).data.order

      beforeAll(async () => {
        w = await makeWorld(api, getContainer, { adminEmail: ADMIN_EMAIL, adminPassword: ADMIN_PASSWORD, prefix: "payment-guards" })
        admin = await w.adminHeaders()
      })

      // ------------------------------------------------------------------------------------
      describe("two requests at once", () => {
        it("two completions of the deposit at once pay once; the other is refused as already paid", async () => {
          const as = await w.signIn()
          const signed = await w.aSignedOrder(as, 12, { country: "gb" })
          const id = signed.team_order.id
          const started = await start(as, id, "deposit")
          const body = { session_id: started.data.payment.session.id }
          const replies = await Promise.all([complete(as, id, "deposit", body), complete(as, id, "deposit", body), complete(as, id, "deposit", body)])
          expect(replies.map((r) => r.status).sort()).toEqual([200, 400, 400])
          for (const r of replies.filter((r) => r.status === 400)) expect(r.data.code).toBe("deposit_already_paid")
          const proof = await proofOf(signed.current_proof.id)
          expect(await capturesOf(proof.deposit_collection_id)).toHaveLength(1)
          const m = await medusaOrder(proof.order_id)
          expect(m.payment_status).toBe("partially_captured")
          expect((await teams().listTeamOrderSteps({ team_order_id: id, to_status: "deposit_paid" })).length).toBe(1)
        })

        it("two whole payments of the deposit at once (start and complete each) pay once", async () => {
          const as = await w.signIn()
          const signed = await w.aSignedOrder(as, 12, { country: "pk" })
          const id = signed.team_order.id
          const payOnce = async () => {
            const s = await start(as, id, "deposit")
            if (s.status !== 200) return s.status
            return (await complete(as, id, "deposit", { session_id: s.data.payment.session.id })).status
          }
          const results = await Promise.all([payOnce(), payOnce()])
          expect(results.filter((s) => s === 200).length).toBe(1)
          const proof = await proofOf(signed.current_proof.id)
          expect(await capturesOf(proof.deposit_collection_id)).toHaveLength(1)
          expect((await w.read(as, id)).data.team_order.status).toBe("deposit_paid")
        })

        it("a request that waits too long for another one on the same order is 409 payment_busy", async () => {
          const as = await w.signIn()
          const signed = await w.aSignedOrder(as, 10, { country: "gb" })
          const id = signed.team_order.id
          let release!: () => void
          const held = withTeamOrderMoneyLock(getContainer(), id, () => new Promise<void>((resolve) => (release = resolve)))
          await new Promise((r) => setTimeout(r, 300))
          const busy = await start(as, id, "deposit")
          release()
          await held
          expect(busy.status).toBe(409)
          expect(busy.data).toMatchObject({ type: "conflict", code: "payment_busy" })
        })
      })

      // ------------------------------------------------------------------------------------
      describe("paying when nothing is due, or twice", () => {
        it("the deposit of a draft, of an order with a proof out, and twice; the balance before balance_due and twice", async () => {
          const as = await w.signIn()
          const order = await w.aTeamOrder(as, { country: "gb" })
          const id = order.team_order.id
          await w.putRoster(as, id, 1, team(10))
          const draft = await start(as, id, "deposit")
          expect(draft.status).toBe(400)
          expect(draft.data).toMatchObject({ type: "not_allowed", code: "deposit_not_due", status: "draft" })
          const made = await w.makeProof(as, id)
          const out = await start(as, id, "deposit")
          expect(out.data).toMatchObject({ code: "deposit_not_due", status: "proof_sent" })
          expect((await start(as, id, "balance")).data).toMatchObject({ code: "balance_not_due" })
          await w.sign(as, id, made.data.current_proof.id, w.signBody(made.data))
          expect((await start(as, id, "balance")).data).toMatchObject({ code: "balance_not_due", status: "approved" })
          const s = await start(as, id, "deposit")
          expect((await complete(as, id, "deposit", { session_id: s.data.payment.session.id })).status).toBe(200)
          const twice = await start(as, id, "deposit")
          expect(twice.status).toBe(400)
          expect(twice.data).toMatchObject({ code: "deposit_already_paid", status: "deposit_paid" })
          expect((await complete(as, id, "deposit", { session_id: s.data.payment.session.id })).data.code).toBe("deposit_already_paid")
          await adminStep(id, "start_production")
          expect((await start(as, id, "balance")).data).toMatchObject({ code: "balance_not_due", status: "in_production" })
          await adminStep(id, "ask_balance")
          const b = await start(as, id, "balance")
          expect((await complete(as, id, "balance", { session_id: b.data.payment.session.id })).status).toBe(200)
          expect((await start(as, id, "balance")).data).toMatchObject({ code: "balance_already_paid" })
          await adminStep(id, "ship")
          expect((await start(as, id, "balance")).data).toMatchObject({ code: "balance_already_paid", status: "shipped" })
        })

        it("refusal codes of the request itself: part, provider, session", async () => {
          const as = await w.signIn()
          const signed = await w.aSignedOrder(as, 10, { country: "gb" })
          const id = signed.team_order.id
          expect((await start(as, id, "total")).data).toMatchObject({ type: "invalid_data", code: "payment_part_invalid" })
          expect((await complete(as, id, "total", { session_id: "x" })).data.code).toBe("payment_part_invalid")
          expect((await start(as, id, "deposit", { provider_id: "pp_cod_cod" })).data).toMatchObject({ code: "payment_provider_invalid" })
          expect((await complete(as, id, "deposit", {})).data).toMatchObject({ code: "payment_session_required" })
          const first = await start(as, id, "deposit")
          const second = await start(as, id, "deposit")
          expect(second.data.payment.session.id).not.toBe(first.data.payment.session.id)
          // starting again replaced the first session
          const stale = await complete(as, id, "deposit", { session_id: first.data.payment.session.id })
          expect(stale.status).toBe(409)
          expect(stale.data).toMatchObject({ type: "conflict", code: "payment_session_stale" })
          expect((await complete(as, id, "deposit", { session_id: "payses_unknown" })).data.code).toBe("payment_session_stale")
          expect((await complete(as, id, "deposit", { session_id: second.data.payment.session.id })).status).toBe(200)
        })

        it("a payment the provider refuses is payment_failed; one that needs more is payment_requires_action; nothing is paid", async () => {
          const as = await w.signIn()
          const signed = await w.aSignedOrder(as, 10, { country: "gb" })
          const id = signed.team_order.id
          const module = paymentModule()
          const original = module.authorizePaymentSession
          try {
            module.authorizePaymentSession = jest.fn().mockRejectedValueOnce(new Error("card declined"))
            const s1 = await start(as, id, "deposit")
            const failed = await complete(as, id, "deposit", { session_id: s1.data.payment.session.id })
            expect(failed.status).toBe(400)
            expect(failed.data).toMatchObject({ type: "not_allowed", code: "payment_failed" })
            module.authorizePaymentSession = jest
              .fn()
              .mockRejectedValueOnce(new MedusaError(MedusaError.Types.PAYMENT_REQUIRES_MORE_ERROR, "3-D Secure"))
            const s2 = await start(as, id, "deposit")
            const more = await complete(as, id, "deposit", { session_id: s2.data.payment.session.id })
            expect(more.status).toBe(400)
            expect(more.data).toMatchObject({ code: "payment_requires_action" })
          } finally {
            module.authorizePaymentSession = original
          }
          expect((await w.read(as, id)).data.team_order.status).toBe("approved")
          const s3 = await start(as, id, "deposit")
          expect((await complete(as, id, "deposit", { session_id: s3.data.payment.session.id })).status).toBe(200)
        })
      })

      // ------------------------------------------------------------------------------------
      describe("going back to draft, or deleting, while a payment is being made", () => {
        it("a started deposit does not block going back; the order is let go and completing it afterwards is refused", async () => {
          const as = await w.signIn()
          const signed = await w.aSignedOrder(as, 10, { country: "gb" })
          const id = signed.team_order.id
          const s = await start(as, id, "deposit")
          const proof = await proofOf(signed.current_proof.id)
          const back = await w.reopen(as, id)
          expect(back.status).toBe(200)
          expect(back.data.team_order.status).toBe("draft")
          expect((await medusaOrder(proof.order_id)).status).toBe("canceled")
          const late = await complete(as, id, "deposit", { session_id: s.data.payment.session.id })
          expect(late.status).toBe(400)
          expect(late.data).toMatchObject({ code: "deposit_not_due", status: "draft" })
          expect(await capturesOf(proof.deposit_collection_id)).toHaveLength(0)
          // deleted: then it is not found
          expect((await api.delete(`/store/team-orders/${id}`, w.h(as))).status).toBe(200)
          const gone = await complete(as, id, "deposit", { session_id: s.data.payment.session.id })
          expect(gone.status).toBe(404)
          expect(gone.data.code).toBe("team_order_not_found")
          expect((await payments(as, id)).status).toBe(404)
        })

        it("a deposit authorised but not captured (a gateway at work) blocks going back and a new start: payment_in_progress", async () => {
          const as = await w.signIn()
          const signed = await w.aSignedOrder(as, 10, { country: "gb" })
          const id = signed.team_order.id
          const s = await start(as, id, "deposit")
          await paymentModule().authorizePaymentSession(s.data.payment.session.id, {})
          const back = await w.reopen(as, id)
          expect(back.status).toBe(400)
          expect(back.data).toMatchObject({ type: "not_allowed", code: "payment_in_progress", status: "approved" })
          expect((await start(as, id, "deposit")).data).toMatchObject({ code: "payment_in_progress" })
          expect((await w.read(as, id)).data.team_order.status).toBe("approved")
        })

        it("after the deposit is paid the organizer cannot go back", async () => {
          const as = await w.signIn()
          const signed = await w.aSignedOrder(as, 10, { country: "gb" })
          const id = signed.team_order.id
          const s = await start(as, id, "deposit")
          await complete(as, id, "deposit", { session_id: s.data.payment.session.id })
          const back = await w.reopen(as, id)
          expect(back.status).toBe(400)
          expect(back.data).toMatchObject({ code: "team_order_not_reopenable", status: "deposit_paid" })
        })

        it("a completion and a going back at the same moment: exactly one wins, and the money agrees with the status", async () => {
          for (let round = 0; round < 4; round++) {
            const as = await w.signIn()
            const signed = await w.aSignedOrder(as, 10, { country: "gb" })
            const id = signed.team_order.id
            const s = await start(as, id, "deposit")
            const [paid, back] = await Promise.all([complete(as, id, "deposit", { session_id: s.data.payment.session.id }), w.reopen(as, id)])
            const proof = await proofOf(signed.current_proof.id)
            const captures = await capturesOf(proof.deposit_collection_id)
            const status = (await w.read(as, id)).data.team_order.status
            if (paid.status === 200) {
              expect(back.status).toBe(400)
              expect(status).toBe("deposit_paid")
              expect(captures).toHaveLength(1)
            } else {
              expect(back.status).toBe(200)
              expect(status).toBe("draft")
              expect(captures).toHaveLength(0)
              expect((await medusaOrder(proof.order_id)).status).toBe("canceled")
            }
          }
        })

        it("withdrawing a proof deletes its draft order", async () => {
          const as = await w.signIn()
          const order = await w.aTeamOrder(as, { country: "gb" })
          const id = order.team_order.id
          await w.putRoster(as, id, 1, team(10))
          const made = await w.makeProof(as, id)
          const quote = await payments(as, id)
          expect(quote.data.cost.state).toBe("quote")
          const proof = await proofOf(made.data.current_proof.id)
          expect(proof.order_id).toEqual(expect.any(String))
          expect((await w.reopen(as, id)).status).toBe(200)
          const drafts = await getContainer().resolve(Modules.ORDER).listOrders({ id: proof.order_id })
          expect(drafts).toHaveLength(0)
        })
      })

      // ------------------------------------------------------------------------------------
      describe("whose order, and which amount", () => {
        it("another customer's order is not found on every payment route", async () => {
          const owner = await w.signIn()
          const other = await w.signIn()
          const signed = await w.aSignedOrder(owner, 10, { country: "gb" })
          const id = signed.team_order.id
          const s = await start(owner, id, "deposit")
          for (const reply of [
            await payments(other, id),
            await start(other, id, "deposit"),
            await complete(other, id, "deposit", { session_id: s.data.payment.session.id }),
          ]) {
            expect(reply.status).toBe(404)
            expect(reply.data.code).toBe("team_order_not_found")
          }
          // and signed out
          expect((await api.get(`/store/team-orders/${id}/payments`, { headers: w.base, ...w.allow })).status).toBe(401)
          expect((await w.read(owner, id)).data.team_order.status).toBe("approved")
        })

        it("amounts are never taken from the request body", async () => {
          const as = await w.signIn()
          const signed = await w.aSignedOrder(as, 10, { country: "gb" })
          const id = signed.team_order.id
          const cost = (await payments(as, id)).data
          const s = await start(as, id, "deposit", { amount: 1, total: 1, currency_code: "usd" })
          expect(s.data.payment.amount).toBe(cost.payments.deposit.amount)
          expect(s.data.payment.currency_code).toBe("gbp")
          const done = await complete(as, id, "deposit", { session_id: s.data.payment.session.id, amount: 1 })
          expect(done.status).toBe(200)
          const proof = await proofOf(signed.current_proof.id)
          const [capture] = await capturesOf(proof.deposit_collection_id)
          expect(Number(capture.amount)).toBe(cost.payments.deposit.amount)
        })

        it("a price changed in the admin after the cost was shown: the order keeps the price the organizer saw", async () => {
          const as = await w.signIn()
          const order = await w.aTeamOrder(as, { country: "pk" })
          const id = order.team_order.id
          await w.putRoster(as, id, 1, team(10))
          const made = await w.makeProof(as, id)
          const quote = (await payments(as, id)).data
          // staff raise the price of every jersey size in PKR
          const productId = w.productIds["jersey"]
          const { data: product } = await api.get(`/admin/products/${productId}?fields=variants.id,variants.prices.*`, { headers: admin })
          for (const variant of product.product.variants) {
            const prices = variant.prices.map((p: any) => ({ id: p.id, currency_code: p.currency_code, amount: p.currency_code === "pkr" ? p.amount + 1000 : p.amount }))
            const updated = await api.post(`/admin/products/${productId}/variants/${variant.id}`, { prices }, { headers: admin, ...w.allow })
            expect(updated.status).toBe(200)
          }
          try {
            // still the quoted price, before and after signing, and in the deposit
            expect((await payments(as, id)).data.cost.total).toBe(quote.cost.total)
            expect((await w.sign(as, id, made.data.current_proof.id, w.signBody(made.data))).status).toBe(200)
            const ordered = (await payments(as, id)).data
            expect(ordered.cost.state).toBe("ordered")
            expect(ordered.cost.total).toBe(quote.cost.total)
            expect(ordered.cost.lines.every((l: any) => l.unit_price === 3500)).toBe(true)
            const s = await start(as, id, "deposit")
            expect(s.data.payment.amount).toBe(quote.payments.deposit.amount)
            // a new order of the same product is priced at the new price
            const other = await w.aTeamOrder(as, { country: "pk" })
            await w.putRoster(as, other.team_order.id, 1, team(10))
            await w.makeProof(as, other.team_order.id)
            expect((await payments(as, other.team_order.id)).data.cost.lines.every((l: any) => l.unit_price === 4500)).toBe(true)
          } finally {
            for (const variant of product.product.variants) {
              const prices = variant.prices.map((p: any) => ({ id: p.id, currency_code: p.currency_code, amount: p.amount }))
              await api.post(`/admin/products/${productId}/variants/${variant.id}`, { prices }, { headers: admin, ...w.allow })
            }
          }
        })

        it("changing the rush choice while the proof is out prices it again", async () => {
          const as = await w.signIn()
          const order = await w.aTeamOrder(as, { country: "pk" })
          const id = order.team_order.id
          await w.putRoster(as, id, 1, team(10))
          const made = await w.makeProof(as, id)
          expect((await payments(as, id)).data.cost.rush).toBeNull()
          expect((await api.post(`/store/team-orders/${id}/schedule`, { rush_requested: true }, w.h(as))).status).toBe(200)
          const rushed = (await payments(as, id)).data
          expect(rushed.cost.rush).toEqual({ amount: 7000, percentage: 20 })
          expect(rushed.cost.total).toBe(35000 + 7000 + 250)
          const reread = await w.read(as, id)
          expect((await w.sign(as, id, made.data.current_proof.id, w.signBody(reread.data))).status).toBe(200)
          expect((await payments(as, id)).data.cost.total).toBe(rushed.cost.total)
        })
      })

      // ------------------------------------------------------------------------------------
      describe("an order the store canceled", () => {
        it("starting a payment on it is refused: order_canceled", async () => {
          const as = await w.signIn()
          const signed = await w.aSignedOrder(as, 10, { country: "gb" })
          const id = signed.team_order.id
          await payments(as, id)
          const proof = await proofOf(signed.current_proof.id)
          expect((await api.post(`/admin/orders/${proof.order_id}/cancel`, {}, { headers: admin, ...w.allow })).status).toBe(200)
          const refused = await start(as, id, "deposit")
          expect(refused.status).toBe(400)
          expect(refused.data).toMatchObject({ type: "not_allowed", code: "order_canceled" })
        })
      })
    })
  },
})
