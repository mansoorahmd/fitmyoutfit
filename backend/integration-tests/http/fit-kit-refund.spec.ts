/**
 * The fit kit's refund ("Kit returned: refund the deposit"), through the store and admin routes
 * only: a kit bought alone in Pakistan and in the UK and together with garments, one return after
 * another, a third refused, two presses at once, an unpaid order, cash on delivery (recorded by
 * hand, no refund through the payment), an order without a kit, an amount in the body never
 * trusted.
 */
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { seedStore } from "../../src/scripts/seed-lib/seed-store"

jest.setTimeout(300 * 1000)

const COD = "pp_cod_cod"
const PLACEHOLDER = "pp_system_default"
const ADMIN_EMAIL = "kit-test-admin@example.com"
const ADMIN_PASSWORD = "kit-test-password"

type Line = { handle: string; size?: string; quantity: number }

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("The fit kit's refund", () => {
      let headers: Record<string, string>
      let adminHeaders: Record<string, string>
      let adminUserId: string
      const regionIds: Record<string, string> = {}
      const variantIds: Record<string, string> = {}
      const allow = { validateStatus: () => true }

      beforeAll(async () => {
        const { publishableKey } = await seedStore(getContainer(), {
          nodeEnv: "test",
          adminEmail: ADMIN_EMAIL,
          adminPassword: ADMIN_PASSWORD,
        })
        headers = { "x-publishable-api-key": publishableKey }
        const { data: login } = await api.post("/auth/user/emailpass", { email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
        adminHeaders = { authorization: `Bearer ${login.token}` }
        adminUserId = (await api.get("/admin/users/me", { headers: adminHeaders })).data.user.id
        const { data: regions } = await api.get("/store/regions", { headers })
        for (const region of regions.regions) {
          for (const country of region.countries) {
            regionIds[country.iso_2] = region.id
          }
        }
        const { data: products } = await api.get("/store/products?limit=50&fields=handle,*variants,*variants.options", { headers })
        for (const product of products.products) {
          for (const variant of product.variants) {
            const size = variant.options?.find((o: any) => o.value)?.value
            variantIds[product.handle] ??= variant.id
            variantIds[`${product.handle}/${size}`] = variant.id
          }
        }
      })

      const address = (country: string) => ({
        first_name: "Test",
        last_name: "Buyer",
        address_1: "1 Test Road",
        city: "Test City",
        postal_code: "12345",
        country_code: country,
      })

      /** Places an order through the ordinary checkout; returns its id. */
      async function placeOrder(country: string, lines: Line[], providerId = PLACEHOLDER): Promise<string> {
        const { data } = await api.post(
          "/store/carts",
          {
            region_id: regionIds[country],
            email: "buyer@example.com",
            shipping_address: address(country),
            items: lines.map((line) => ({
              variant_id: variantIds[line.size ? `${line.handle}/${line.size}` : line.handle],
              quantity: line.quantity,
            })),
          },
          { headers }
        )
        const cartId = data.cart.id
        const { data: options } = await api.get(`/store/shipping-options?cart_id=${cartId}`, { headers })
        await api.post(`/store/carts/${cartId}/shipping-methods`, { option_id: options.shipping_options[0].id }, { headers })
        const { data: pc } = await api.post("/store/payment-collections", { cart_id: cartId }, { headers })
        await api.post(`/store/payment-collections/${pc.payment_collection.id}/payment-sessions`, { provider_id: providerId }, { headers })
        const completed = await api.post(`/store/carts/${cartId}/complete`, {}, { headers })
        expect(completed.data.type).toBe("order")
        return completed.data.order.id
      }

      async function orderRow(orderId: string) {
        const query = getContainer().resolve(ContainerRegistrationKeys.QUERY)
        const { data } = await query.graph({
          entity: "order",
          fields: [
            "id",
            "total",
            "payment_status",
            "items.quantity",
            "items.total",
            "items.product.metadata",
            "payment_collections.payments.id",
            "payment_collections.payments.provider_id",
            "payment_collections.payments.refunds.amount",
            "payment_collections.payments.captures.amount",
            "transactions.reference",
            "transactions.amount",
          ],
          filters: { id: orderId },
        })
        return data[0] as any
      }

      /** Medusa's own payment status, as the admin's order page reads it. */
      const paymentStatus = async (orderId: string) =>
        (await api.get(`/admin/orders/${orderId}`, { headers: adminHeaders })).data.order.payment_status as string

      const paymentOf = async (orderId: string) => (await orderRow(orderId)).payment_collections[0].payments[0] as { id: string; refunds: any[]; captures: any[] }
      const capture = async (orderId: string) =>
        api.post(`/admin/payments/${(await paymentOf(orderId)).id}/capture`, {}, { headers: adminHeaders })
      const kitUrl = (orderId: string) => `/admin/orders/${orderId}/fit-kit-refund`
      const state = async (orderId: string) => (await api.get(kitUrl(orderId), { headers: adminHeaders })).data.fit_kit
      const refund = (orderId: string, body: unknown) => api.post(kitUrl(orderId), body, { headers: adminHeaders, ...allow })
      const refundedTotal = async (orderId: string) =>
        (await paymentOf(orderId)).refunds.reduce((sum: number, r: any) => sum + Number(r.amount), 0)
      const kitLinesTotal = async (orderId: string) => {
        const order = await orderRow(orderId)
        return order.items
          .filter((item: any) => item.product?.metadata?.kind === "fit_kit")
          .reduce((sum: number, item: any) => sum + Number(item.total), 0)
      }
      const records = async (orderId: string) => {
        const knex = getContainer().resolve(ContainerRegistrationKeys.PG_CONNECTION) as any
        return (await knex.raw(`SELECT quantity, amount, currency_code, method, payment_id, actor_id FROM fit_kit_refund WHERE order_id = ? ORDER BY created_at`, [orderId])).rows as any[]
      }

      describe("a fit kit bought alone in Pakistan", () => {
        it("refunds one kit, then the other, and refuses a third", async () => {
          const orderId = await placeOrder("pk", [{ handle: "fit-kit", quantity: 2 }])
          const kitTotal = await kitLinesTotal(orderId)
          expect(kitTotal).toBe(10000)
          expect(await capture(orderId)).toMatchObject({ status: 200 })

          const before = await state(orderId)
          expect(before).toMatchObject({
            applies: true,
            kits_total: 2,
            kits_returned: 0,
            kits_left: 2,
            can_refund: true,
            method: "medusa",
            amounts_by_quantity: [5000, 10000],
            currency_code: "pkr",
            currency_digits: 0,
          })

          const first = await refund(orderId, { quantity: 1 })
          expect(first.status).toBe(200)
          expect(first.data.refunded).toEqual({ quantity: 1, amount: 5000, method: "medusa" })
          expect(first.data.fit_kit).toMatchObject({ kits_returned: 1, kits_left: 1, refunded_amount: 5000, amounts_by_quantity: [5000] })
          expect(await refundedTotal(orderId)).toBe(5000)
          let order = await orderRow(orderId)
          expect(await paymentStatus(orderId)).toBe("partially_refunded")
          expect(order.transactions.filter((t: any) => t.reference === "refund").map((t: any) => Number(t.amount))).toEqual([-5000])
          expect(await records(orderId)).toEqual([
            { quantity: 1, amount: "5000", currency_code: "pkr", method: "medusa", payment_id: (await paymentOf(orderId)).id, actor_id: adminUserId },
          ])

          const second = await refund(orderId, { quantity: 1 })
          expect(second.status).toBe(200)
          expect(second.data.refunded.amount).toBe(5000)
          expect(await refundedTotal(orderId)).toBe(10000)
          order = await orderRow(orderId)
          // The delivery charge was not refunded, so Medusa still calls the payment partly refunded.
          expect(await paymentStatus(orderId)).toBe("partially_refunded")
          expect((await records(orderId)).map((r) => r.quantity)).toEqual([1, 1])
          const shown = await state(orderId)
          expect(shown.returns).toHaveLength(2)
          expect(shown.returns[0]).toMatchObject({ quantity: 1, amount: "5000", method: "medusa", by: adminUserId, by_email: ADMIN_EMAIL })

          const third = await refund(orderId, { quantity: 1 })
          expect(third.status).toBe(400)
          expect(third.data).toMatchObject({ type: "not_allowed", code: "nothing_to_refund" })
          expect(await refundedTotal(orderId)).toBe(10000)
        })

        it("refunds two kits at once when both come back together", async () => {
          const orderId = await placeOrder("pk", [{ handle: "fit-kit", quantity: 2 }])
          await capture(orderId)
          const result = await refund(orderId, { quantity: 2 })
          expect(result.status).toBe(200)
          expect(result.data.refunded).toMatchObject({ quantity: 2, amount: 10000 })
          expect(await refundedTotal(orderId)).toBe(10000)
          expect((await state(orderId)).kits_left).toBe(0)
        })

        it("never trusts an amount, a payment or any other field in the body", async () => {
          const orderId = await placeOrder("pk", [{ handle: "fit-kit", quantity: 1 }])
          await capture(orderId)
          const paid = await refund(orderId, { quantity: 1, amount: 999999, payment_id: "pay_other", method: "by_hand", order_id: "x" })
          expect(paid.status).toBe(200)
          expect(paid.data.refunded).toEqual({ quantity: 1, amount: 5000, method: "medusa" })
          expect(await refundedTotal(orderId)).toBe(5000)
        })

        it("refuses a quantity that is not a whole number from 1 to what is left", async () => {
          const orderId = await placeOrder("pk", [{ handle: "fit-kit", quantity: 2 }])
          await capture(orderId)
          for (const quantity of [0, 3, -1, 1.5, "1", null, undefined]) {
            const refused = await refund(orderId, { quantity })
            expect(refused.status).toBe(400)
            expect(refused.data).toMatchObject({ type: "not_allowed", code: "invalid_quantity" })
          }
          expect((await refund(orderId, {})).data.code).toBe("invalid_quantity")
          expect(await refundedTotal(orderId)).toBe(0)
        })

        it("refunds once when two presses arrive at the same moment", async () => {
          const orderId = await placeOrder("pk", [{ handle: "fit-kit", quantity: 1 }])
          await capture(orderId)
          const answers = await Promise.all([refund(orderId, { quantity: 1 }), refund(orderId, { quantity: 1 }), refund(orderId, { quantity: 1 })])
          const statuses = answers.map((a) => a.status).sort()
          expect(statuses).toEqual([200, 400, 400])
          expect(answers.filter((a) => a.status === 400).every((a) => a.data.code === "nothing_to_refund")).toBe(true)
          expect(await refundedTotal(orderId)).toBe(5000)
          expect(await records(orderId)).toHaveLength(1)
        })

        it("refuses an order that is not paid (nothing captured)", async () => {
          const orderId = await placeOrder("pk", [{ handle: "fit-kit", quantity: 1 }])
          const refused = await refund(orderId, { quantity: 1 })
          expect(refused.status).toBe(400)
          expect(refused.data).toMatchObject({ type: "not_allowed", code: "not_paid" })
          expect(await state(orderId)).toMatchObject({ applies: true, can_refund: false, reason: "not_paid" })
          expect(await records(orderId)).toEqual([])
        })

        it("refuses a canceled order", async () => {
          const orderId = await placeOrder("pk", [{ handle: "fit-kit", quantity: 1 }])
          await capture(orderId)
          expect((await api.post(`/admin/orders/${orderId}/cancel`, {}, { headers: adminHeaders, ...allow })).status).toBe(200)
          const refused = await refund(orderId, { quantity: 1 })
          expect(refused.status).toBe(400)
          expect(refused.data.code).toBe("order_canceled")
        })

        it("refuses once the payment holds less than the kit, after a refund made in Medusa's own payment section", async () => {
          const orderId = await placeOrder("pk", [{ handle: "fit-kit", quantity: 1 }])
          await capture(orderId)
          const paymentId = (await paymentOf(orderId)).id
          // Delivery is 250: the payment holds 5250; take back 1000 by hand, leaving 4250 < 5000.
          expect((await api.post(`/admin/payments/${paymentId}/refund`, { amount: 1000 }, { headers: adminHeaders })).status).toBe(200)
          const refused = await refund(orderId, { quantity: 1 })
          expect(refused.status).toBe(400)
          expect(refused.data.code).toBe("payment_refunded_elsewhere")
        })
      })

      describe("a fit kit bought in the UK", () => {
        it("refunds the kit's own price in pounds, exactly", async () => {
          const orderId = await placeOrder("gb", [{ handle: "fit-kit", quantity: 1 }])
          const kitTotal = await kitLinesTotal(orderId)
          expect(kitTotal).toBe(30)
          await capture(orderId)
          const before = await state(orderId)
          expect(before).toMatchObject({ currency_code: "gbp", currency_digits: 2, amounts_by_quantity: [30], method: "medusa" })
          const result = await refund(orderId, { quantity: 1 })
          expect(result.status).toBe(200)
          expect(result.data.refunded.amount).toBe(30)
          expect(await refundedTotal(orderId)).toBe(30)
          expect((await records(orderId))[0]).toMatchObject({ amount: "30", currency_code: "gbp", method: "medusa" })
          // Duty-paid delivery is free in the UK, so the whole order is refunded.
          expect(await paymentStatus(orderId)).toBe("refunded")
        })
      })

      describe("a fit kit bought together with garments", () => {
        it("refunds only the kit's share, never a garment's money", async () => {
          const orderId = await placeOrder("pk", [
            { handle: "t-shirt", size: "M", quantity: 2 },
            { handle: "fit-kit", quantity: 1 },
          ])
          const order = await orderRow(orderId)
          const garments = order.items.filter((i: any) => i.product?.metadata?.kind !== "fit_kit").reduce((s: number, i: any) => s + Number(i.total), 0)
          expect(garments).toBe(4000)
          await capture(orderId)
          const shown = await state(orderId)
          expect(shown).toMatchObject({ kits_total: 1, amounts_by_quantity: [5000] })
          const result = await refund(orderId, { quantity: 1 })
          expect(result.status).toBe(200)
          expect(result.data.refunded.amount).toBe(5000)
          expect(await refundedTotal(orderId)).toBe(5000)
          expect(await paymentStatus(orderId)).toBe("partially_refunded")
        })
      })

      describe("cash on delivery", () => {
        it("refuses before the cash is collected, then records the refund by hand and moves no money", async () => {
          const orderId = await placeOrder("pk", [{ handle: "fit-kit", quantity: 1 }], COD)
          const refused = await refund(orderId, { quantity: 1 })
          expect(refused.status).toBe(400)
          expect(refused.data.code).toBe("not_paid")

          const collected = await api.post(`/admin/orders/${orderId}/cash-collection`, { slip_reference: "TCS 9001" }, { headers: adminHeaders, ...allow })
          expect(collected.status).toBe(200)

          expect(await state(orderId)).toMatchObject({ can_refund: true, method: "by_hand", amounts_by_quantity: [5000] })
          const result = await refund(orderId, { quantity: 1 })
          expect(result.status).toBe(200)
          expect(result.data.refunded).toEqual({ quantity: 1, amount: 5000, method: "by_hand" })
          // No refund was made on the payment, and the order's payment is still fully captured.
          expect(await refundedTotal(orderId)).toBe(0)
          const order = await orderRow(orderId)
          expect(await paymentStatus(orderId)).toBe("captured")
          expect(order.transactions.filter((t: any) => t.reference === "refund")).toEqual([])
          expect(await records(orderId)).toEqual([
            { quantity: 1, amount: "5000", currency_code: "pkr", method: "by_hand", payment_id: (await paymentOf(orderId)).id, actor_id: adminUserId },
          ])
          expect(result.data.fit_kit.returns[0]).toMatchObject({ method: "by_hand", by_email: ADMIN_EMAIL })
          const again = await refund(orderId, { quantity: 1 })
          expect(again.data.code).toBe("nothing_to_refund")
        })
      })

      describe("an order with no fit kit", () => {
        it("has no panel and refuses with a code", async () => {
          const orderId = await placeOrder("pk", [{ handle: "t-shirt", size: "M", quantity: 1 }])
          await capture(orderId)
          expect(await state(orderId)).toMatchObject({ applies: false, can_refund: false, reason: "no_fit_kit", kits_total: 0 })
          const refused = await refund(orderId, { quantity: 1 })
          expect(refused.status).toBe(400)
          expect(refused.data).toMatchObject({ type: "not_allowed", code: "no_fit_kit" })
          expect(await refundedTotal(orderId)).toBe(0)
        })
      })

      describe("the route", () => {
        it("answers 404 for an unknown order and for an id with a NUL character", async () => {
          const unknown = await api.get(kitUrl("order_does_not_exist"), { headers: adminHeaders, ...allow })
          expect(unknown.status).toBe(404)
          expect(unknown.data).toMatchObject({ type: "not_found", code: "order_not_found" })
          expect((await api.post(kitUrl("order_does_not_exist"), { quantity: 1 }, { headers: adminHeaders, ...allow })).status).toBe(404)
          expect((await api.get(kitUrl("order_%00x"), { headers: adminHeaders, ...allow })).status).toBe(404)
        })

        it("needs an admin user", async () => {
          const orderId = await placeOrder("pk", [{ handle: "fit-kit", quantity: 1 }])
          await capture(orderId)
          expect((await api.get(kitUrl(orderId), { ...allow })).status).toBe(401)
          expect((await api.post(kitUrl(orderId), { quantity: 1 }, { ...allow })).status).toBe(401)
          expect((await api.post(kitUrl(orderId), { quantity: 1 }, { headers, ...allow })).status).toBe(401)
          expect(await records(orderId)).toEqual([])
        })

        it("keeps the record out of a customer's order answer", async () => {
          const orderId = await placeOrder("pk", [{ handle: "fit-kit", quantity: 1 }])
          await capture(orderId)
          await refund(orderId, { quantity: 1 })
          const { data } = await api.get(`/store/orders/${orderId}`, { headers, ...allow })
          expect(JSON.stringify(data)).not.toMatch(/fit_kit_refund|kitref_/)
        })
      })

      describe("the return window setting", () => {
        it("refuses an old order when fit_kit_return_days is set, and allows it again at 0", async () => {
          const container = getContainer()
          const orderId = await placeOrder("pk", [{ handle: "fit-kit", quantity: 1 }])
          await capture(orderId)
          const knex = container.resolve(ContainerRegistrationKeys.PG_CONNECTION) as any
          await knex.raw(`UPDATE "order" SET created_at = now() - interval '10 days' WHERE id = ?`, [orderId])
          const store = container.resolve(Modules.STORE)
          const [current] = await store.listStores({}, { take: 1 })
          const setDays = (days: number) =>
            store.updateStores(current!.id, { metadata: { ...(current!.metadata ?? {}), fit_kit_return_days: days } })
          try {
            await setDays(7)
            const refused = await refund(orderId, { quantity: 1 })
            expect(refused.status).toBe(400)
            expect(refused.data.code).toBe("return_window_over")
            await setDays(14)
            expect((await state(orderId)).can_refund).toBe(true)
            await setDays(0)
            expect((await refund(orderId, { quantity: 1 })).status).toBe(200)
          } finally {
            await store.updateStores(current!.id, { metadata: current!.metadata ?? {} })
          }
        })
      })
    })
  },
})
