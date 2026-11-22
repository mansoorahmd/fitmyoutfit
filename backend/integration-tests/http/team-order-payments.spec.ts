/**
 * The money of a team order (task M3-3, decision 016), API only: what it costs (the Medusa order
 * priced from the proof), the deposit paid by the organizer (the system's step to `deposit_paid`),
 * the admin's steps to `balance_due`, shipping refused until the balance is paid, the balance paid,
 * shipped. In Pakistan and in the UK, with rush, as an add-on and as a reorder. At each point the
 * Medusa order's own totals and payment status are read through Medusa's admin route and must agree.
 * The admin's by-hand steps, Medusa's own "Mark as paid", and the payment link of the emails too.
 */
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { Modules } from "@medusajs/framework/utils"
import { TEAM_ORDER_MODULE } from "../../src/modules/team-order/constants"
import { line, makeWorld, team, type World } from "./support/team-order-world"

jest.setTimeout(600 * 1000)

const ADMIN_EMAIL = "team-order-payments-test-admin@example.com"
const ADMIN_PASSWORD = "team-order-payments-test-password"

/** Exact sums of money given as JS numbers with at most 2 decimals. */
const cents = (n: number) => Math.round(n * 100)

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("The deposit and the balance of a team order (M3-3)", () => {
      let w: World
      let admin: Record<string, string>
      let adminId: string
      const teams = () => getContainer().resolve(TEAM_ORDER_MODULE) as any

      const payments = (as: any, id: string) => api.get(`/store/team-orders/${id}/payments`, w.h(as))
      const start = (as: any, id: string, part: string, body: unknown = {}) => api.post(`/store/team-orders/${id}/payments/${part}`, body, w.h(as))
      const complete = (as: any, id: string, part: string, body: unknown) =>
        api.post(`/store/team-orders/${id}/payments/${part}/complete`, body, w.h(as))
      const adminStep = (id: string, action: string) => api.post(`/admin/team-orders/${id}/steps`, { action }, { headers: admin, ...w.allow })
      const adminRead = (id: string) => api.get(`/admin/team-orders/${id}`, { headers: admin, ...w.allow })
      const medusaOrder = async (orderId: string) =>
        (
          await api.get(`/admin/orders/${orderId}?fields=id,total,tax_total,shipping_total,payment_status,summary,currency_code,items.quantity,items.unit_price`, {
            headers: admin,
          })
        ).data.order

      /** Pays a part as the organizer: start, then complete with the session. */
      async function pay(as: any, id: string, part: "deposit" | "balance") {
        const started = await start(as, id, part)
        expect(started.status).toBe(200)
        expect(started.data.payment.next).toEqual({ type: "confirm" })
        expect(started.data.payment.session.provider_id).toBe("pp_system_default")
        const done = await complete(as, id, part, { session_id: started.data.payment.session.id })
        expect(done.status).toBe(200)
        return { started: started.data, done: done.data }
      }

      /** The checks every cost answer must pass: lines, delivery, rush and tax add up to Medusa's total; the parts add up exactly. */
      function expectCostAddsUp(answer: any) {
        const c = answer.cost
        const lines = c.lines.reduce((sum: number, l: any) => sum + cents(l.unit_price) * l.quantity, 0)
        expect(lines + cents(c.delivery.amount) + cents(c.rush?.amount ?? 0) + cents(c.tax_total)).toBe(cents(c.total))
        expect(cents(answer.payments.deposit.amount) + cents(answer.payments.balance.amount)).toBe(cents(c.total))
        for (const l of c.lines) expect(cents(l.total)).toBe(cents(l.unit_price) * l.quantity)
      }

      /**
       * The whole money path of a signed team order: the cost, the deposit (system step), the admin's
       * steps, shipping refused, the balance, shipped; Medusa's order agrees at each point.
       */
      async function moneyPath(as: any, id: string, expected: { pieces: number; currency: string; delivery: string; dutyPaid: boolean; rush: boolean }) {
        const cost = await payments(as, id)
        expect(cost.status).toBe(200)
        expect(cost.data.cost.state).toBe("ordered")
        expect(cost.data.cost.currency_code).toBe(expected.currency)
        expect(cost.data.cost.pieces).toBe(expected.pieces)
        expect(cost.data.cost.delivery).toMatchObject({ name: expected.delivery, duty_paid: expected.dutyPaid })
        expect(cost.data.cost.rush !== null).toBe(expected.rush)
        expect(cost.data.cost.deposit_percentage).toBe(50)
        expect(cost.data.cost.tax_final).toBe(false)
        expectCostAddsUp(cost.data)
        expect(cost.data.payments.deposit).toMatchObject({ state: "unpaid", due: true })
        expect(cost.data.payments.balance).toMatchObject({ state: "unpaid", due: false })
        const orderId = cost.data.order.id
        let m = await medusaOrder(orderId)
        expect(cents(m.total)).toBe(cents(cost.data.cost.total))
        expect(m.payment_status).toBe("not_paid")
        expect(m.items.reduce((n: number, i: any) => n + i.quantity, 0)).toBe(expected.pieces + (expected.rush ? 1 : 0))

        // the deposit, paid by the organizer: the system moves the order to deposit_paid
        const { done } = await pay(as, id, "deposit")
        expect(done.team_order.status).toBe("deposit_paid")
        expect(done.payments.deposit).toMatchObject({ state: "paid", due: false, by_hand: false })
        expect(cents(done.payments.paid_total)).toBe(cents(cost.data.payments.deposit.amount))
        expect(cents(done.payments.outstanding)).toBe(cents(cost.data.payments.balance.amount))
        m = await medusaOrder(orderId)
        expect(m.payment_status).toBe("partially_captured")
        expect(cents(m.summary.paid_total)).toBe(cents(cost.data.payments.deposit.amount))
        expect(cents(m.summary.pending_difference)).toBe(cents(cost.data.payments.balance.amount))
        const afterDeposit = (await adminRead(id)).data
        const depositStep = afterDeposit.steps.find((s: any) => s.to === "deposit_paid")
        expect(depositStep).toMatchObject({ from: "approved", actor: "system", actor_id: null, by_hand: false })

        // the admin's steps to balance_due
        expect((await adminStep(id, "start_production")).status).toBe(200)
        const asked = await adminStep(id, "ask_balance")
        expect(asked.status).toBe(200)
        expect(asked.data.actions.map((a: any) => a.id)).toEqual(["balance_by_hand"])
        // shipping refused until the balance is paid
        const refused = await adminStep(id, "ship")
        expect(refused.status).toBe(400)
        expect(refused.data).toMatchObject({ type: "not_allowed", code: "balance_not_paid", status: "balance_due" })
        expect((await w.read(as, id)).data.team_order.status).toBe("balance_due")
        const due = await payments(as, id)
        expect(due.data.payments.balance).toMatchObject({ state: "unpaid", due: true })

        // the balance, paid by the organizer
        const balance = await pay(as, id, "balance")
        expect(balance.done.team_order.status).toBe("balance_due")
        expect(balance.done.payments.balance).toMatchObject({ state: "paid", due: false })
        expect(cents(balance.done.payments.outstanding)).toBe(0)
        m = await medusaOrder(orderId)
        expect(m.payment_status).toBe("captured")
        expect(cents(m.summary.paid_total)).toBe(cents(cost.data.cost.total))
        expect(cents(m.summary.pending_difference)).toBe(0)
        const ready = (await adminRead(id)).data
        expect(ready.actions.map((a: any) => a.id)).toEqual(["ship"])
        expect(ready.steps.map((s: any) => s.step_name)).toContain("balance_paid")

        // shipped
        const shipped = await adminStep(id, "ship")
        expect(shipped.status).toBe(200)
        expect(shipped.data.team_order.status).toBe("shipped")
        return { orderId, cost: cost.data }
      }

      beforeAll(async () => {
        w = await makeWorld(api, getContainer, { adminEmail: ADMIN_EMAIL, adminPassword: ADMIN_PASSWORD, prefix: "payments-organizer" })
        admin = await w.adminHeaders()
        adminId = (await api.get("/admin/users/me", { headers: admin })).data.user.id
      })

      // ------------------------------------------------------------------------------------
      describe("the money path, API only", () => {
        it("a team of 20 in Pakistan: the quote before signing, then the whole path", async () => {
          const as = await w.signIn()
          const order = await w.aTeamOrder(as, { country: "pk" })
          const id = order.team_order.id
          expect((await w.putRoster(as, id, 1, team(20))).status).toBe(200)
          // a draft has no price yet
          const early = await payments(as, id)
          expect(early.status).toBe(400)
          expect(early.data).toMatchObject({ code: "team_order_not_priced", status: "draft" })
          const made = await w.makeProof(as, id)
          expect(made.status).toBe(201)
          // the quote: the cost of the proof that is out, the parts not due yet
          const quote = await payments(as, id)
          expect(quote.status).toBe(200)
          expect(quote.data.cost.state).toBe("quote")
          expect(quote.data.order).toBeNull()
          expect(quote.data.cost.lines.reduce((n: number, l: any) => n + l.quantity, 0)).toBe(20)
          expect(quote.data.cost.delivery).toEqual({ name: "Delivery in Pakistan", amount: 250, duty_paid: false })
          expect(quote.data.cost.rush).toBeNull()
          expectCostAddsUp(quote.data)
          expect(quote.data.payments.deposit.due).toBe(false)
          // one line per size, in the product's size order, each at the region's price
          const sizes = quote.data.cost.lines.map((l: any) => l.size)
          expect(sizes).toEqual([...sizes].sort((a: string, b: string) => order.sizes.indexOf(a) - order.sizes.indexOf(b)))
          for (const l of quote.data.cost.lines) expect(l.unit_price).toBe(3500)
          expect(quote.data.cost.total).toBe(20 * 3500 + 250)
          expect(quote.data.payments.deposit.amount).toBe(35125)
          expect(quote.data.payments.balance.amount).toBe(35125)

          const signed = await w.sign(as, id, made.data.current_proof.id, w.signBody(made.data))
          expect(signed.status).toBe(200)
          const { cost } = await moneyPath(as, id, { pieces: 20, currency: "pkr", delivery: "Delivery in Pakistan", dutyPaid: false, rush: false })
          // the signed price is the quoted one
          expect(cost.cost.total).toBe(quote.data.cost.total)
        })

        it("a team of 20 in the UK: the duty-paid line, GBP", async () => {
          const as = await w.signIn()
          const signed = await w.aSignedOrder(as, 20, { country: "gb" })
          const { cost } = await moneyPath(as, signed.team_order.id, {
            pieces: 20,
            currency: "gbp",
            delivery: "Shipping & duties included",
            dutyPaid: true,
            rush: false,
          })
          expect(cost.cost.delivery.amount).toBe(0)
        })

        it("with rush: the rush line of decision 011 (20% of the garments), in the total and the split", async () => {
          const as = await w.signIn()
          const order = await w.aTeamOrder(as, { country: "pk", rush_requested: true })
          const signed = await w.signed(as, order.team_order.id, team(20))
          expect(signed.current_proof.rush).toBe(true)
          const { cost } = await moneyPath(as, signed.team_order.id, {
            pieces: 20,
            currency: "pkr",
            delivery: "Delivery in Pakistan",
            dutyPaid: false,
            rush: true,
          })
          expect(cost.cost.rush).toEqual({ amount: 14000, percentage: 20 })
          expect(cost.cost.total).toBe(70000 + 14000 + 250)
        })

        it("as an add-on: one late player in the UK, its own order and its own 50/50", async () => {
          const as = await w.signIn()
          const first = await w.aSignedOrder(as, 12, { country: "gb" })
          const started = await w.startAddOn(as, first.team_order.id)
          expect(started.status).toBe(201)
          const addOnId = started.data.team_order.id
          await w.signed(as, addOnId, [line(13)])
          const { cost } = await moneyPath(as, addOnId, { pieces: 1, currency: "gbp", delivery: "Shipping & duties included", dutyPaid: true, rush: false })
          expect(cost.team_order.kind).toBe("add_on")
          // the first order's money is its own and untouched
          const firstCost = await payments(as, first.team_order.id)
          expect(firstCost.data.cost.pieces).toBe(12)
          expect(firstCost.data.payments.deposit.state).toBe("unpaid")
          expect(firstCost.data.order.id).not.toBe(cost.order.id)
        })

        it("as a reorder: a new full order with its own money", async () => {
          const as = await w.signIn()
          const source = await w.aSignedOrder(as, 15, { country: "pk" })
          const reorder = await w.startReorder(as, source.team_order.id)
          expect(reorder.status).toBe(201)
          const reorderId = reorder.data.team_order.id
          const made = await w.makeProof(as, reorderId)
          expect(made.status).toBe(201)
          expect((await w.sign(as, reorderId, made.data.current_proof.id, w.signBody(made.data))).status).toBe(200)
          const { cost } = await moneyPath(as, reorderId, { pieces: 15, currency: "pkr", delivery: "Delivery in Pakistan", dutyPaid: false, rush: false })
          expect(cost.team_order.kind).toBe("reorder")
        })
      })

      // ------------------------------------------------------------------------------------
      describe("the admin's by-hand steps record real money", () => {
        it("the deposit and the balance by hand: captured for their amounts in the admin's name, steps recorded as by hand", async () => {
          const as = await w.signIn()
          const signed = await w.aSignedOrder(as, 12, { country: "gb" })
          const id = signed.team_order.id
          const before = (await adminRead(id)).data
          expect(before.money.payments.deposit).toMatchObject({ state: "unpaid", due: true })
          expect(before.actions.map((a: any) => a.id)).toEqual(["deposit_by_hand"])
          const marked = await adminStep(id, "deposit_by_hand")
          expect(marked.status).toBe(200)
          expect(marked.data.team_order.status).toBe("deposit_paid")
          expect(marked.data.money.payments.deposit).toMatchObject({ state: "paid", by_hand: true })
          expect(marked.data.steps.find((s: any) => s.to === "deposit_paid")).toMatchObject({ actor: "admin", actor_id: adminId, by_hand: true })
          // Medusa keeps who captured it
          const orderId = marked.data.money.order.id
          const payment: any[] = await (getContainer().resolve(Modules.PAYMENT) as any).listPayments({ payment_collection_id: (await teams().listProofApprovals({ id: signed.current_proof.id }))[0].deposit_collection_id }, { relations: ["captures"] })
          expect(payment[0].captures[0].created_by).toBe(adminId)
          // twice: refused, nothing captured twice
          const again = await adminStep(id, "deposit_by_hand")
          expect(again.status).toBe(400)
          expect((await medusaOrder(orderId)).payment_status).toBe("partially_captured")

          await adminStep(id, "start_production")
          await adminStep(id, "ask_balance")
          const balance = await adminStep(id, "balance_by_hand")
          expect(balance.status).toBe(200)
          expect(balance.data.money.payments.balance).toMatchObject({ state: "paid", by_hand: true })
          expect(balance.data.steps.find((s: any) => s.step_name === "balance_received_by_hand")).toMatchObject({ actor_id: adminId, by_hand: true })
          expect(balance.data.actions.map((a: any) => a.id)).toEqual(["ship"])
          expect((await medusaOrder(orderId)).payment_status).toBe("captured")
          expect((await adminStep(id, "balance_by_hand")).status).toBe(400)
          expect((await adminStep(id, "ship")).status).toBe(200)
        })

        it("the order page shows the amounts, what is paid and what is outstanding in the region's currency", async () => {
          const as = await w.signIn()
          const signed = await w.aSignedOrder(as, 10, { country: "gb" })
          const page = (await adminRead(signed.team_order.id)).data
          expect(page.money.cost.currency_code).toBe("gbp")
          expect(page.money.payments).toMatchObject({ paid_total: 0, payment_status: "not_paid" })
          expect(cents(page.money.payments.outstanding)).toBe(cents(page.money.cost.total))
          expect(page.money.order.display_id).toEqual(expect.any(Number))
        })

        it("Medusa's own Mark as paid on the deposit makes the by-hand step too (the payment.captured subscriber)", async () => {
          const as = await w.signIn()
          const signed = await w.aSignedOrder(as, 10, { country: "gb" })
          const id = signed.team_order.id
          await payments(as, id)
          const [proof] = await teams().listProofApprovals({ id: signed.current_proof.id })
          const marked = await api.post(
            `/admin/payment-collections/${proof.deposit_collection_id}/mark-as-paid`,
            { order_id: proof.order_id },
            { headers: admin, ...w.allow }
          )
          expect(marked.status).toBe(200)
          // no read of ours in between: the subscriber makes the step
          let status = "approved"
          for (let i = 0; i < 50 && status !== "deposit_paid"; i++) {
            await new Promise((r) => setTimeout(r, 200))
            status = (await teams().listTeamOrders({ id }))[0].status
          }
          expect(status).toBe("deposit_paid")
          const steps = await teams().listTeamOrderSteps({ team_order_id: id, to_status: "deposit_paid" })
          expect(steps).toHaveLength(1)
          expect(steps[0]).toMatchObject({ actor: "admin", actor_id: adminId, by_hand: true })
        })
      })

      // ------------------------------------------------------------------------------------
      describe("the payment emails carry the payment link", () => {
        it("deposit due and balance due link to /[countryCode]/account/team-orders/[id]/pay; the amount is data only", async () => {
          const as = await w.signIn()
          const signed = await w.aSignedOrder(as, 12, { country: "gb" })
          const id = signed.team_order.id
          const rows = async () => (await teams().listTeamOrderEmails({ team_order_id: id }, { order: { created_at: "ASC" } })) as any[]
          const deposit = (await rows()).find((r) => r.kind === "deposit_due")
          expect(deposit.payload.paymentUrl).toMatch(new RegExp(`/gb/account/team-orders/${id}/pay$`))
          const cost = (await payments(as, id)).data
          expect(deposit.payload.amount).toEqual({ value: cost.payments.deposit.amount, currency_code: "gbp" })
          await adminStep(id, "deposit_by_hand")
          await adminStep(id, "start_production")
          await adminStep(id, "ask_balance")
          const balance = (await rows()).find((r) => r.kind === "balance_due")
          expect(balance.payload.paymentUrl).toBe(deposit.payload.paymentUrl)
          expect(balance.payload.amount).toEqual({ value: cost.payments.balance.amount, currency_code: "gbp" })
          expect(balance.status).toBe("sent")
        })
      })
    })
  },
})
