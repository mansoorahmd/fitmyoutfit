/**
 * Cash on delivery collected: the follow-ups of QA's tenth review (task S1-1e), through the admin
 * and store routes. The first cash-collection tests are in checkout.spec.ts.
 *
 * - M2: canceled and refunded orders are shown truthfully, and nothing is recorded on them, also
 *   when the cancel or the refund happens at the same moment as the press.
 * - M3: the "already recorded" answer when the database lets only the other press's record in.
 * - S1: the warning when the order's capture transactions do not add up to the payment's captures.
 * - M1: orders recorded before 12 Nov (cod_* keys in their metadata) moved into the table, and
 *   cod_* keys never returned to a customer.
 */
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { seedStore } from "../../src/scripts/seed-lib/seed-store"
import { moveLegacyCodMetadata } from "../../src/workflows/cash-collection/move-legacy-cod-metadata"
import { insertCashCollectionRecord } from "../../src/workflows/cash-collection/record-cash-collection"
import moveCodMetadataToCashCollection from "../../src/migration-scripts/move-cod-metadata-to-cash-collection"

jest.setTimeout(300 * 1000)

const COD = "pp_cod_cod"
const ADMIN_EMAIL = "cash-test-admin@example.com"
const ADMIN_PASSWORD = "cash-test-password"

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("Cash on delivery collected: QA's tenth review (S1-1e)", () => {
      let headers: Record<string, string>
      let adminHeaders: Record<string, string>
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
            variantIds[`${product.handle}/${size}`] = variant.id
          }
        }
      })

      async function sql(statement: string, bindings: unknown[] = []) {
        const knex = getContainer().resolve(ContainerRegistrationKeys.PG_CONNECTION) as any
        return (await knex.raw(statement, bindings)).rows as any[]
      }

      async function placeCashOnDeliveryOrder(requestHeaders = headers): Promise<string> {
        const { data } = await api.post(
          "/store/carts",
          {
            region_id: regionIds.pk,
            email: "organizer@example.com",
            shipping_address: { first_name: "T", last_name: "O", address_1: "1 Rd", city: "Lahore", postal_code: "54000", country_code: "pk" },
            items: [{ variant_id: variantIds["t-shirt/M"], quantity: 1 }],
          },
          { headers: requestHeaders }
        )
        const cartId = data.cart.id
        const { data: options } = await api.get(`/store/shipping-options?cart_id=${cartId}`, { headers })
        await api.post(`/store/carts/${cartId}/shipping-methods`, { option_id: options.shipping_options[0].id }, { headers })
        const { data: pc } = await api.post("/store/payment-collections", { cart_id: cartId }, { headers })
        await api.post(`/store/payment-collections/${pc.payment_collection.id}/payment-sessions`, { provider_id: COD }, { headers })
        const completed = await api.post(`/store/carts/${cartId}/complete`, {}, { headers: requestHeaders })
        expect(completed.data.type).toBe("order")
        return completed.data.order.id
      }

      const collection = (orderId: string) => `/admin/orders/${orderId}/cash-collection`
      const record = (orderId: string, slip: unknown) =>
        api.post(collection(orderId), { slip_reference: slip }, { headers: adminHeaders, ...allow })
      const panel = async (orderId: string) => (await api.get(collection(orderId), { headers: adminHeaders })).data.cash_collection
      const records = (orderId: string) =>
        sql(`SELECT slip_reference, collected_at FROM cash_collection WHERE order_id = ? AND deleted_at IS NULL`, [orderId])
      const cancel = (orderId: string) => api.post(`/admin/orders/${orderId}/cancel`, {}, { headers: adminHeaders, ...allow })

      async function paymentOf(orderId: string) {
        const query = getContainer().resolve(ContainerRegistrationKeys.QUERY)
        const { data } = await query.graph({
          entity: "order",
          fields: ["payment_collections.payments.id", "payment_collections.payments.amount"],
          filters: { id: orderId },
        })
        return (data[0] as any).payment_collections[0].payments[0] as { id: string; amount: number }
      }
      const refund = async (orderId: string, amount: number) =>
        api.post(`/admin/payments/${(await paymentOf(orderId)).id}/refund`, { amount }, { headers: adminHeaders, ...allow })
      const captureInMedusa = async (orderId: string, amount?: number) =>
        api.post(
          `/admin/payments/${(await paymentOf(orderId)).id}/capture`,
          amount === undefined ? {} : { amount },
          { headers: adminHeaders, ...allow }
        )

      // --- M2 ---

      describe("canceled and refunded orders (M2)", () => {
        it("shows a recorded collection on an order canceled afterwards as collected, then canceled and refunded", async () => {
          const orderId = await placeCashOnDeliveryOrder()
          expect((await record(orderId, "TCS 501")).status).toBe(200)
          expect(await panel(orderId)).toMatchObject({ stage: "recorded", label: "Collected", tone: "green" })
          const canceled = await cancel(orderId)
          expect(canceled.status).toBe(200)
          const after = await panel(orderId)
          expect(after).toMatchObject({
            stage: "recorded",
            slip_reference: "TCS 501",
            order_canceled: true,
            refunded_amount: 2250,
            label: "Collected, then canceled and refunded",
            tone: "grey",
            can_record: false,
          })
          expect(after.note).toMatch(/PKR 2,250 of the PKR 2,250 captured is refunded/)
        })

        it("shows a refund after the record, and refuses a record on a refunded payment", async () => {
          const recorded = await placeCashOnDeliveryOrder()
          expect((await record(recorded, "TCS 502")).status).toBe(200)
          expect((await refund(recorded, 1000)).status).toBe(200)
          expect(await panel(recorded)).toMatchObject({ label: "Collected, partly refunded", refunded_amount: 1000 })

          // Captured with Medusa's button, refunded, never recorded: the slip may not be recorded now.
          const orderId = await placeCashOnDeliveryOrder()
          expect((await captureInMedusa(orderId)).status).toBe(200)
          expect((await refund(orderId, 2250)).status).toBe(200)
          expect(await panel(orderId)).toMatchObject({
            stage: "unavailable",
            reason: "payment_refunded",
            can_record: false,
            label: "Refunded, not collected",
          })
          const response = await record(orderId, "TCS 503")
          expect(response.status).toBe(400)
          expect(response.data.message).toBe(
            "The cash-on-delivery payment of this order has been refunded, so the cash cannot be recorded as collected."
          )
          expect(await records(orderId)).toEqual([])
        })

        it("refuses a record on a canceled order", async () => {
          const orderId = await placeCashOnDeliveryOrder()
          expect((await cancel(orderId)).status).toBe(200)
          expect(await panel(orderId)).toMatchObject({ reason: "order_canceled", label: "Canceled, not collected" })
          const response = await record(orderId, "TCS 504")
          expect(response.status).toBe(400)
          expect(response.data.message).toBe("This order is canceled, so the cash cannot be recorded as collected.")
          expect(await records(orderId)).toEqual([])
        })

        it("checks again under the row locks at the insert: nothing is recorded on an order canceled or refunded since the check", async () => {
          const container = getContainer()
          const canceled = await placeCashOnDeliveryOrder()
          await sql(`UPDATE "order" SET status = 'canceled' WHERE id = ?`, [canceled])
          const at = new Date()
          const paymentId = (await paymentOf(canceled)).id
          expect(
            await insertCashCollectionRecord(container, { orderId: canceled, paymentId, slipReference: "X 1", collectedAt: at })
          ).toBe("order_canceled")

          const refunded = await placeCashOnDeliveryOrder()
          expect((await captureInMedusa(refunded)).status).toBe(200)
          expect((await refund(refunded, 1)).status).toBe(200)
          const refundedPayment = (await paymentOf(refunded)).id
          expect(
            await insertCashCollectionRecord(container, { orderId: refunded, paymentId: refundedPayment, slipReference: "X 2", collectedAt: at })
          ).toBe("payment_refunded")

          const open = await placeCashOnDeliveryOrder()
          const openPayment = (await paymentOf(open)).id
          await sql(`UPDATE payment SET canceled_at = now() WHERE id = ?`, [openPayment])
          expect(
            await insertCashCollectionRecord(container, { orderId: open, paymentId: openPayment, slipReference: "X 3", collectedAt: at })
          ).toBe("payment_canceled")
          await sql(`UPDATE payment SET canceled_at = NULL WHERE id = ?`, [openPayment])
          expect(
            await insertCashCollectionRecord(container, { orderId: open, paymentId: openPayment, slipReference: "X 4", collectedAt: at })
          ).toBe("recorded")
          expect(
            await insertCashCollectionRecord(container, { orderId: open, paymentId: openPayment, slipReference: "X 5", collectedAt: at })
          ).toBe("already_recorded")
          expect((await records(open)).map((r) => r.slip_reference)).toEqual(["X 4"])
          for (const id of [canceled, refunded]) {
            expect(await records(id)).toEqual([])
          }
        })

        it("never ends a press racing a cancel with a record the panel does not explain", async () => {
          const outcomes: Record<string, number> = {}
          for (let round = 0; round < 6; round++) {
            const orderId = await placeCashOnDeliveryOrder()
            const [marked, canceled] = await Promise.all([
              record(orderId, `TCS R${round}`),
              sleep(round * 15).then(() => cancel(orderId)),
            ])
            const state = await panel(orderId)
            const kept = await records(orderId)
            const key = `mark ${marked.status} / cancel ${canceled.status} / ${state.label}`
            outcomes[key] = (outcomes[key] ?? 0) + 1
            // A 200 always means a record; a refusal never leaves one.
            expect(kept).toHaveLength(marked.status === 200 ? 1 : 0)
            if (canceled.status === 200) {
              expect(state.order_canceled).toBe(true)
              // Either nothing recorded on the canceled order, or recorded first and then canceled.
              expect(["Canceled, not collected", "Collected, then canceled and refunded", "Collected, then canceled, not refunded"]).toContain(
                state.label
              )
              expect(state.label.startsWith("Collected")).toBe(kept.length === 1)
            } else {
              expect(state.order_canceled).toBe(false)
            }
          }
          expect(Object.keys(outcomes).length).toBeGreaterThan(0)
        })
      })

      // --- M3 ---

      describe("the second press, refused by the database (M3)", () => {
        it("answers 'already recorded' when another press's record went in between the check and the insert", async () => {
          const orderId = await placeCashOnDeliveryOrder()
          // A record made by "another press" the moment this press's capture is saved, after its
          // check found no record (the trigger stands in for the other press).
          await sql(
            `CREATE OR REPLACE FUNCTION s1e_other_press() RETURNS trigger AS $body$
             BEGIN
               INSERT INTO cash_collection (id, order_id, slip_reference, collected_at)
               SELECT 'cashcol_other_press', opc.order_id, 'OTHER PRESS', now()
                 FROM payment p JOIN order_payment_collection opc ON opc.payment_collection_id = p.payment_collection_id
                WHERE p.id = NEW.payment_id;
               RETURN NEW;
             END $body$ LANGUAGE plpgsql`
          )
          await sql(`CREATE TRIGGER s1e_other_press AFTER INSERT ON capture FOR EACH ROW EXECUTE FUNCTION s1e_other_press()`)
          try {
            const response = await record(orderId, "TCS 601")
            expect(response.status).toBe(400)
            expect(response.data).toMatchObject({
              type: "not_allowed",
              message: "The cash for this order is already recorded as collected.",
            })
          } finally {
            await sql(`DROP TRIGGER IF EXISTS s1e_other_press ON capture`)
            await sql(`DROP FUNCTION IF EXISTS s1e_other_press()`)
          }
          expect((await records(orderId)).map((r) => r.slip_reference)).toEqual(["OTHER PRESS"])
          expect(await panel(orderId)).toMatchObject({ stage: "recorded", slip_reference: "OTHER PRESS", collected: true })
        })
      })

      // --- S1 ---

      describe("capture transactions that do not add up (S1)", () => {
        it("warns staff with both figures when the order shows a capture transaction the payment does not have", async () => {
          const orderId = await placeCashOnDeliveryOrder()
          expect((await record(orderId, "TCS 701")).status).toBe(200)
          expect((await panel(orderId)).capture_warning).toBeNull()
          // QA's phantom transaction: an extra capture transaction of 333 on the order.
          await sql(
            `INSERT INTO order_transaction (id, order_id, version, amount, raw_amount, currency_code, reference, reference_id)
             SELECT 'ordtrans_phantom_test', order_id, version, 333, '{"value": "333", "precision": 20}'::jsonb, currency_code, 'capture', 'capt_phantom'
               FROM order_transaction WHERE order_id = ? AND reference = 'capture' LIMIT 1`,
            [orderId]
          )
          const state = await panel(orderId)
          expect(state.capture_mismatch).toEqual({ order_transactions: 2583, payment_captures: 2250 })
          expect(state.capture_warning).toContain("shows PKR 2,583 captured, but the payment's captures add up to PKR 2,250")
          expect(state.capture_warning).toContain("tell the developer")
          expect(state).toMatchObject({ stage: "recorded", label: "Collected" })
        })
      })

      // --- M1 ---

      describe("cod_ keys of orders recorded before 12 Nov (M1)", () => {
        async function signInCustomer(): Promise<Record<string, string>> {
          const email = `customer-s1e-${Date.now()}@example.com`
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

        const legacyKeys = {
          cod_slip_reference: "TCS OLD-1",
          cod_collected_at: "2026-11-11T09:30:00.000Z",
          cod_collected_by: "user_01OLDSTAFF",
        }

        /** An order as S1-1c left it: captured, recorded in its metadata, no row in the table. */
        async function legacyOrder(requestHeaders = headers, keys: Record<string, unknown> = legacyKeys) {
          const orderId = await placeCashOnDeliveryOrder(requestHeaders)
          expect((await captureInMedusa(orderId)).status).toBe(200)
          await sql(`UPDATE "order" SET metadata = coalesce(metadata, '{}'::jsonb) || CAST(? AS jsonb) WHERE id = ?`, [
            JSON.stringify(keys),
            orderId,
          ])
          return orderId
        }

        const metadataOf = async (orderId: string) =>
          (await sql(`SELECT metadata FROM "order" WHERE id = ?`, [orderId]))[0].metadata as Record<string, unknown>

        it("never returns cod_ keys to a customer, before or after the move", async () => {
          const customer = await signInCustomer()
          const orderId = await legacyOrder(customer)
          const listed = async () =>
            (await api.get("/store/orders?fields=id,metadata", { headers: customer })).data.orders.find((o: any) => o.id === orderId)
          const one = async () => (await api.get(`/store/orders/${orderId}?fields=id,metadata`, { headers: customer })).data.order
          for (const order of [await listed(), await one()]) {
            expect(Object.keys(order.metadata ?? {}).filter((k) => k.startsWith("cod_"))).toEqual([])
            expect(JSON.stringify(order)).not.toContain("TCS OLD-1")
            expect(JSON.stringify(order)).not.toContain("user_01OLDSTAFF")
          }
          await moveLegacyCodMetadata(getContainer())
          expect(Object.keys((await listed()).metadata ?? {}).filter((k) => k.startsWith("cod_"))).toEqual([])
        })

        it("moves the slip and time into the table and removes every cod_ key, and a second run does nothing", async () => {
          const container = getContainer()
          const orderId = await legacyOrder(headers, { ...legacyKeys, cod_extra: 1, team: "Lions" })
          expect(await panel(orderId)).toMatchObject({ stage: "captured_without_slip" })

          const first = await moveLegacyCodMetadata(container)
          expect(first).toEqual({ orders: 1, recordsCreated: 1, withoutSlip: [] })
          expect(await records(orderId)).toEqual([
            { slip_reference: "TCS OLD-1", collected_at: new Date("2026-11-11T09:30:00.000Z") },
          ])
          const metadata = await metadataOf(orderId)
          expect(Object.keys(metadata).filter((k) => k.startsWith("cod_"))).toEqual([])
          expect(metadata.team).toBe("Lions")
          expect(metadata.delivery_promise).toBeTruthy()
          expect(await panel(orderId)).toMatchObject({
            stage: "recorded",
            slip_reference: "TCS OLD-1",
            collected_at: "2026-11-11T09:30:00.000Z",
            label: "Collected",
          })

          const second = await moveLegacyCodMetadata(container)
          expect(second).toEqual({ orders: 0, recordsCreated: 0, withoutSlip: [] })
          expect(await records(orderId)).toHaveLength(1)
        })

        it("keeps a record the table has already, and still removes the keys; an order without a slip records nothing", async () => {
          const container = getContainer()
          const recordedSince = await legacyOrder()
          expect((await record(recordedSince, "TCS NEW-9")).status).toBe(200)
          const noSlip = await legacyOrder(headers, { cod_collected_by: "user_01OLDSTAFF" })
          const result = await moveLegacyCodMetadata(container)
          expect(result).toEqual({ orders: 2, recordsCreated: 0, withoutSlip: [noSlip] })
          expect((await records(recordedSince)).map((r) => r.slip_reference)).toEqual(["TCS NEW-9"])
          expect(await records(noSlip)).toEqual([])
          for (const id of [recordedSince, noSlip]) {
            expect(Object.keys(await metadataOf(id)).filter((k) => k.startsWith("cod_"))).toEqual([])
          }
        })

        it("runs as a migration script, twice without harm", async () => {
          const orderId = await legacyOrder()
          await moveCodMetadataToCashCollection({ container: getContainer(), args: [] } as any)
          await moveCodMetadataToCashCollection({ container: getContainer(), args: [] } as any)
          expect((await records(orderId)).map((r) => r.slip_reference)).toEqual(["TCS OLD-1"])
          expect(Object.keys(await metadataOf(orderId)).filter((k) => k.startsWith("cod_"))).toEqual([])
        })

        it("strips cod_ keys a cart carried into its order (written past the store routes), and never shows them", async () => {
          const { data } = await api.post(
            "/store/carts",
            {
              region_id: regionIds.pk,
              email: "organizer@example.com",
              shipping_address: { first_name: "T", last_name: "O", address_1: "1 Rd", city: "Lahore", postal_code: "54000", country_code: "pk" },
              items: [{ variant_id: variantIds["t-shirt/M"], quantity: 1 }],
            },
            { headers }
          )
          const cartId = data.cart.id
          // The store routes refuse cod_ keys; written straight into the cart module instead.
          await getContainer()
            .resolve(Modules.CART)
            .updateCarts(cartId, { metadata: { cod_slip_reference: "FORGED", team: "Lions" } })
          const { data: options } = await api.get(`/store/shipping-options?cart_id=${cartId}`, { headers })
          await api.post(`/store/carts/${cartId}/shipping-methods`, { option_id: options.shipping_options[0].id }, { headers })
          const { data: pc } = await api.post("/store/payment-collections", { cart_id: cartId }, { headers })
          await api.post(`/store/payment-collections/${pc.payment_collection.id}/payment-sessions`, { provider_id: COD }, { headers })
          const completed = await api.post(`/store/carts/${cartId}/complete`, {}, { headers })
          expect(completed.data.type).toBe("order")
          expect(JSON.stringify(completed.data)).not.toContain("FORGED")
          const orderId = completed.data.order.id
          // The order-placed subscriber removes them from the order itself.
          let metadata: Record<string, unknown> = {}
          for (let i = 0; i < 100; i++) {
            metadata = await metadataOf(orderId)
            if (metadata.delivery_promise && !("cod_slip_reference" in metadata)) {
              break
            }
            await sleep(50)
          }
          expect(metadata.cod_slip_reference).toBeUndefined()
          expect(metadata.team).toBe("Lions")
          // ...and they record nothing.
          expect(await records(orderId)).toEqual([])
          expect(await panel(orderId)).toMatchObject({ stage: "not_collected" })
        })
      })
    })
  },
})
