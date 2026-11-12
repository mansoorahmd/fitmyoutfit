/**
 * M1 checkout, through the store API: docs/contracts/m1-checkout.md, section 7 (the five proofs),
 * section 6 (the checkout-rules route and how refusals look) and section 8 (the S1-1b additions:
 * products with no kind, which date applies, the date kept on the order, completing twice, rush
 * days, and cash on delivery recorded as collected through the admin route), with the S1-1c fixes
 * after QA's review (the promise written on the order by the server, reserved metadata keys
 * refused at the door, cash captured before the slip is written).
 */
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  completeCartWorkflow,
  createProductsWorkflow,
  updateRegionsWorkflow,
  updateStoresWorkflow,
} from "@medusajs/medusa/core-flows"
import { calendarDateIn, addCalendarDays } from "../../src/lib/rules/delivery-promise"
import { seedStore } from "../../src/scripts/seed-lib/seed-store"
import keepDeliveryPromiseOnPlacedOrder from "../../src/subscribers/order-placed-delivery-promise"
import { keepOrderDeliveryPromise } from "../../src/workflows/delivery-promise/keep-order-delivery-promise"
import { replaceOrderMetadataKey } from "../../src/workflows/order-metadata/write-order-metadata"

jest.setTimeout(300 * 1000)

const COD = "pp_cod_cod"
const PLACEHOLDER = "pp_system_default"
const ADMIN_EMAIL = "checkout-test-admin@example.com"
const ADMIN_PASSWORD = "checkout-test-password"

type Line = { handle: string; size?: string; quantity: number }

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("M1 checkout through the store API", () => {
      let headers: Record<string, string>
      let adminHeaders: Record<string, string>
      let adminUserId: string
      const regionIds: Record<string, string> = {}
      /** variant id per "handle" or "handle/size" */
      const variantIds: Record<string, string> = {}

      beforeAll(async () => {
        const { publishableKey } = await seedStore(getContainer(), {
          nodeEnv: "test",
          adminEmail: ADMIN_EMAIL,
          adminPassword: ADMIN_PASSWORD,
        })
        headers = { "x-publishable-api-key": publishableKey }
        const { data: login } = await api.post("/auth/user/emailpass", {
          email: ADMIN_EMAIL,
          password: ADMIN_PASSWORD,
        })
        adminHeaders = { authorization: `Bearer ${login.token}` }
        const { data: me } = await api.get("/admin/users/me", { headers: adminHeaders })
        adminUserId = me.user.id
        const { data: regions } = await api.get("/store/regions", { headers })
        for (const region of regions.regions) {
          for (const country of region.countries) {
            regionIds[country.iso_2] = region.id
          }
        }
        const { data: products } = await api.get(
          "/store/products?limit=50&fields=handle,*variants,*variants.options",
          { headers }
        )
        for (const product of products.products) {
          for (const variant of product.variants) {
            const size = variant.options?.find((o: any) => o.value)?.value
            variantIds[product.handle] ??= variant.id
            variantIds[`${product.handle}/${size}`] = variant.id
          }
        }
      })

      const allow = { validateStatus: () => true }

      const address = (country: string) => ({
        first_name: "Test",
        last_name: "Organizer",
        address_1: "1 Test Road",
        city: "Test City",
        postal_code: "12345",
        country_code: country,
      })

      async function createCart(country: string, lines: Line[], requestHeaders = headers) {
        const { data } = await api.post(
          "/store/carts",
          {
            region_id: regionIds[country],
            email: "organizer@example.com",
            shipping_address: address(country),
            items: lines.map((line) => ({
              variant_id: variantIds[line.size ? `${line.handle}/${line.size}` : line.handle],
              quantity: line.quantity,
            })),
          },
          { headers: requestHeaders }
        )
        return data.cart as { id: string; total: number; currency_code: string }
      }

      async function addShipping(cartId: string) {
        const { data } = await api.get(`/store/shipping-options?cart_id=${cartId}`, { headers })
        expect(data.shipping_options).toHaveLength(1)
        await api.post(
          `/store/carts/${cartId}/shipping-methods`,
          { option_id: data.shipping_options[0].id },
          { headers }
        )
        return data.shipping_options[0]
      }

      async function paymentCollection(cartId: string): Promise<string> {
        const { data } = await api.post("/store/payment-collections", { cart_id: cartId }, { headers })
        return data.payment_collection.id
      }

      /** Choose a payment provider through the store API. Returns the raw response. */
      async function choosePayment(cartId: string, providerId: string) {
        const collectionId = await paymentCollection(cartId)
        return api.post(
          `/store/payment-collections/${collectionId}/payment-sessions`,
          { provider_id: providerId },
          { headers, ...allow }
        )
      }

      /**
       * Give the cart a cash-on-delivery session without the store API (as a bug or a future
       * route might), to prove that completion is checked on its own.
       */
      async function forceCashOnDeliverySession(container: MedusaContainer, cartId: string) {
        const collectionId = await paymentCollection(cartId)
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        const { data } = await query.graph({
          entity: "payment_collection",
          fields: ["amount", "currency_code"],
          filters: { id: collectionId },
        })
        const collection = data[0] as any
        await container.resolve(Modules.PAYMENT).createPaymentSession(collectionId, {
          provider_id: COD,
          amount: collection.amount,
          currency_code: collection.currency_code,
          data: {},
        })
      }

      const complete = (cartId: string) =>
        api.post(`/store/carts/${cartId}/complete`, {}, { headers, ...allow })

      const today = () => calendarDateIn(new Date(), "Asia/Karachi")

      /** The promise kept on an order placed today, as section 8 of the contract describes. */
      const promisedToday = () => ({
        date: addCalendarDays(today(), 15),
        days: 15,
        based_on: today(),
        applies: "standard",
      })

      async function orderMetadata(container: MedusaContainer, orderId: string) {
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        const { data } = await query.graph({
          entity: "order",
          fields: ["metadata"],
          filters: { id: orderId },
        })
        return (data[0] as any).metadata as Record<string, unknown>
      }

      /**
       * The order's metadata once the order-placed subscriber has written the promise. The
       * subscriber runs just after the order is created, so it may not have run when the
       * completion answers.
       */
      async function metadataOncePlaced(orderId: string, timeoutMs = 10000) {
        const until = Date.now() + timeoutMs
        for (;;) {
          const metadata = await orderMetadata(getContainer(), orderId)
          if (metadata?.delivery_promise || Date.now() > until) {
            return metadata
          }
          await sleep(50)
        }
      }

      async function sql(statement: string, bindings: unknown[] = []) {
        const knex = getContainer().resolve(ContainerRegistrationKeys.PG_CONNECTION) as any
        return (await knex.raw(statement, bindings)).rows as any[]
      }

      /** Overwrite an order's metadata and creation time directly, standing in for another time. */
      async function rewriteOrder(orderId: string, change: { createdAt?: string; metadata?: Record<string, unknown> }) {
        if (change.createdAt) {
          await sql(`UPDATE "order" SET created_at = ? WHERE id = ?`, [change.createdAt, orderId])
        }
        if (change.metadata) {
          await sql(`UPDATE "order" SET metadata = CAST(? AS jsonb) WHERE id = ?`, [JSON.stringify(change.metadata), orderId])
        }
      }

      const readPromise = (orderId: string) =>
        api.get(`/store/orders/${orderId}/delivery-promise`, { headers, ...allow })

      /** A Pakistan order of 1 T-shirt paid by cash on delivery. Returns the order id. */
      async function placeCashOnDeliveryOrder(): Promise<string> {
        const cart = await createCart("pk", [{ handle: "t-shirt", size: "M", quantity: 1 }])
        await addShipping(cart.id)
        expect((await choosePayment(cart.id, COD)).status).toBe(200)
        const response = await complete(cart.id)
        expect(response.data.type).toBe("order")
        await metadataOncePlaced(response.data.order.id)
        return response.data.order.id
      }

      async function setStoreMetadata(container: MedusaContainer, changes: Record<string, unknown>) {
        const [store] = await container.resolve(Modules.STORE).listStores({})
        await updateStoresWorkflow(container).run({
          input: { selector: { id: store.id }, update: { metadata: { ...store.metadata, ...changes } } },
        })
        return store.metadata
      }

      async function orderCount(container: MedusaContainer) {
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        return (await query.graph({ entity: "order", fields: ["id"] })).data.length
      }

      async function paymentState(container: MedusaContainer, cartId: string) {
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        const { data } = await query.graph({
          entity: "cart",
          fields: [
            "payment_collection.payment_sessions.status",
            "payment_collection.payments.id",
          ],
          filters: { id: cartId },
        })
        const collection = (data[0] as any).payment_collection
        return {
          sessions: (collection?.payment_sessions ?? []).map((s: any) => s.status),
          payments: (collection?.payments ?? []).length,
        }
      }

      /** A refused completion: HTTP 400, Medusa's error body, no order, nothing authorized. */
      async function expectRefused(cartId: string, message: RegExp) {
        const container = getContainer()
        const before = await orderCount(container)
        const response = await complete(cartId)
        expect(response.status).toBe(400)
        expect(response.data).toMatchObject({ type: "not_allowed" })
        expect(response.data.message).toMatch(message)
        expect(await orderCount(container)).toBe(before)
        const payment = await paymentState(container, cartId)
        expect(payment.payments).toBe(0)
        expect(payment.sessions).not.toContain("authorized")
      }

      // --- Section 7 ---

      it("1. Pakistan: a cart with 1 T-shirt completes with cash on delivery and becomes an order", async () => {
        const cart = await createCart("pk", [{ handle: "t-shirt", size: "M", quantity: 1 }])
        const option = await addShipping(cart.id)
        expect(option.name).toBe("Delivery in Pakistan")
        expect(option.amount).toBe(250)

        const { data: providers } = await api.get(
          `/store/payment-providers?region_id=${regionIds.pk}`,
          { headers }
        )
        expect(providers.payment_providers.map((p: any) => p.id).sort()).toEqual([COD, PLACEHOLDER])

        const chosen = await choosePayment(cart.id, COD)
        expect(chosen.status).toBe(200)
        const response = await complete(cart.id)
        expect(response.status).toBe(200)
        expect(response.data.type).toBe("order")
        expect(response.data.order.total).toBe(2250)
        expect(response.data.order.currency_code).toBe("pkr")

        const query = getContainer().resolve(ContainerRegistrationKeys.QUERY)
        const { data } = await query.graph({
          entity: "order",
          fields: ["id", "payment_collections.payments.provider_id", "payment_collections.status"],
          filters: { id: response.data.order.id },
        })
        const payments = (data[0] as any).payment_collections.flatMap((c: any) => c.payments)
        expect(payments.map((p: any) => p.provider_id)).toEqual([COD])

        // Section 8: the order keeps the date that was promised, as placed.
        expect(await metadataOncePlaced(response.data.order.id)).toEqual({
          delivery_promise: promisedToday(),
        })
      })

      it("2. United Kingdom: 9 garment pieces cannot complete; with 10 it completes with the placeholder payment", async () => {
        const cart = await createCart("gb", [
          { handle: "jersey", size: "M", quantity: 5 },
          { handle: "t-shirt", size: "L", quantity: 4 },
          // The fit kit does not count towards the minimum.
          { handle: "fit-kit", quantity: 1 },
        ])
        const option = await addShipping(cart.id)
        expect(option.name).toBe("Shipping & duties included")
        expect(option.amount).toBe(0)
        expect(option.data).toEqual({ ddp: true })
        expect((await choosePayment(cart.id, PLACEHOLDER)).status).toBe(200)
        await expectRefused(cart.id, /minimum order in this region is 10 garment pieces; this cart has 9/)

        await api.post(
          `/store/carts/${cart.id}/line-items`,
          { variant_id: variantIds["jacket/XL"], quantity: 1 },
          { headers }
        )
        expect((await choosePayment(cart.id, PLACEHOLDER)).status).toBe(200)
        const response = await complete(cart.id)
        expect(response.status).toBe(200)
        expect(response.data.type).toBe("order")
        expect(
          response.data.order.items.reduce((n: number, item: any) => n + item.quantity, 0)
        ).toBe(11)
      })

      it("3. United Kingdom: cash on delivery is refused, even if an admin links it to the region", async () => {
        const container = getContainer()
        const cart = await createCart("gb", [{ handle: "jersey", size: "S", quantity: 10 }])
        await addShipping(cart.id)

        const chosen = await choosePayment(cart.id, COD)
        expect(chosen.status).toBe(400)
        expect(chosen.data).toMatchObject({ type: "not_allowed" })
        expect(chosen.data.message).toMatch(/Pakistan only/)

        // Our own rule, not only Medusa's region check: link COD to the UK and try again.
        await updateRegionsWorkflow(container).run({
          input: { selector: { id: regionIds.gb }, update: { payment_providers: [PLACEHOLDER, COD] } },
        })
        const again = await choosePayment(cart.id, COD)
        expect(again.status).toBe(400)
        expect(again.data.message).toMatch(/Pakistan only/)

        // A cash-on-delivery session that got onto the cart some other way cannot complete it.
        await forceCashOnDeliverySession(container, cart.id)
        await expectRefused(cart.id, /Pakistan only/)
      })

      it("4. Pakistan: cash on delivery is refused for a cart above cod_max_total", async () => {
        const container = getContainer()
        // 11 x Rs 2,000 + Rs 250 shipping = Rs 22,250, above the placeholder limit of Rs 20,000.
        const cart = await createCart("pk", [{ handle: "t-shirt", size: "S", quantity: 11 }])
        await addShipping(cart.id)

        const { data: rules } = await api.get(`/store/carts/${cart.id}/checkout-rules`, { headers })
        expect(rules.cash_on_delivery).toEqual({
          available: false,
          reason: "over_limit",
          limit: 20000,
          limit_currency_code: "pkr",
        })

        const chosen = await choosePayment(cart.id, COD)
        expect(chosen.status).toBe(400)
        expect(chosen.data).toMatchObject({ type: "not_allowed" })
        expect(chosen.data.message).toMatch(/up to 20000 PKR/)

        await forceCashOnDeliverySession(container, cart.id)
        await expectRefused(cart.id, /up to 20000 PKR\. This cart's total is 22250 PKR/)

        // The same cart can still be paid another way.
        expect((await choosePayment(cart.id, PLACEHOLDER)).status).toBe(200)
        expect((await complete(cart.id)).data.type).toBe("order")
      })

      it("4b. Pakistan: the limit is the admin's setting, and a cart at the limit may use cash on delivery", async () => {
        const container = getContainer()
        const [store] = await container.resolve(Modules.STORE).listStores({})
        await updateStoresWorkflow(container).run({
          input: {
            selector: { id: store.id },
            update: { metadata: { ...store.metadata, cod_max_total: "22250" } },
          },
        })
        const cart = await createCart("pk", [{ handle: "t-shirt", size: "S", quantity: 11 }])
        await addShipping(cart.id)
        expect((await choosePayment(cart.id, COD)).status).toBe(200)
        expect((await complete(cart.id)).data.type).toBe("order")
      })

      it("5. Any region: a cart with only a fit kit completes", async () => {
        for (const country of ["gb", "ae", "us", "pk"]) {
          const cart = await createCart(country, [{ handle: "fit-kit", quantity: 1 }])
          await addShipping(cart.id)
          expect((await choosePayment(cart.id, PLACEHOLDER)).status).toBe(200)
          const response = await complete(cart.id)
          expect({ country, status: response.status, type: response.data.type }).toEqual({
            country,
            status: 200,
            type: "order",
          })
        }
      })

      // --- Section 6 ---

      it("GET /store/carts/:id/checkout-rules returns exactly the contract's JSON", async () => {
        const cart = await createCart("gb", [
          { handle: "jersey", size: "M", quantity: 3 },
          { handle: "t-shirt", size: "M", quantity: 1 },
          { handle: "fit-kit", quantity: 1 },
        ])
        const date = today()
        const response = await api.get(`/store/carts/${cart.id}/checkout-rules`, { headers })
        expect(response.status).toBe(200)
        expect(response.data).toEqual({
          minimum_quantity: { required: 10, counted: 4, ok: false },
          cash_on_delivery: {
            available: false,
            reason: "region",
            limit: 20000,
            limit_currency_code: "pkr",
          },
          delivery_promise: {
            based_on: date,
            standard: { days: 15, date: addCalendarDays(date, 15) },
            rush: { days: 10, date: addCalendarDays(date, 10) },
            // Section 8: which date applies; "standard" until the rush charge exists.
            applies: "standard",
          },
        })

        const pakistan = await createCart("pk", [{ handle: "t-shirt", size: "M", quantity: 1 }])
        const { data } = await api.get(`/store/carts/${pakistan.id}/checkout-rules`, { headers })
        expect(data.minimum_quantity).toEqual({ required: 1, counted: 1, ok: true })
        expect(data.cash_on_delivery).toEqual({
          available: true,
          reason: null,
          limit: 20000,
          limit_currency_code: "pkr",
        })
      })

      it("checkout-rules needs the publishable key, and answers 404 for an unknown cart", async () => {
        const cart = await createCart("pk", [{ handle: "t-shirt", size: "M", quantity: 1 }])
        const withoutKey = await api.get(`/store/carts/${cart.id}/checkout-rules`, allow)
        expect(withoutKey.status).toBe(400)
        const unknown = await api.get("/store/carts/cart_unknown/checkout-rules", {
          headers,
          ...allow,
        })
        expect(unknown.status).toBe(404)
      })

      it("checkout-rules names a missing setting in a readable error", async () => {
        const container = getContainer()
        const cart = await createCart("us", [{ handle: "jersey", size: "M", quantity: 10 }])
        await updateRegionsWorkflow(container).run({
          // "" clears the key whether Medusa merges metadata or replaces it.
          input: {
            selector: { id: regionIds.us },
            update: { metadata: { tax_final: false, min_garment_quantity: "" } },
          },
        })
        const response = await api.get(`/store/carts/${cart.id}/checkout-rules`, {
          headers,
          ...allow,
        })
        expect(response.status).toBe(500)
        expect(response.data.message).toContain(
          'min_garment_quantity is not set. Add it to the metadata of the region "United States"'
        )
      })

      // --- Section 8 (S1-1b) ---

      describe("a product with no kind counts toward the minimum (QA defect D1)", () => {
        /** A published product in the default sales channel, priced in GBP, with `metadata`. */
        async function createProduct(handle: string, metadata: Record<string, unknown>) {
          const container = getContainer()
          const query = container.resolve(ContainerRegistrationKeys.QUERY)
          const { data: profiles } = await query.graph({
            entity: "shipping_profile",
            fields: ["id"],
            filters: { type: "default" },
          })
          const { data: channels } = await query.graph({ entity: "sales_channel", fields: ["id"] })
          const { result } = await createProductsWorkflow(container).run({
            input: {
              products: [
                {
                  title: handle,
                  handle,
                  status: "published",
                  metadata,
                  shipping_profile_id: (profiles[0] as any).id,
                  sales_channels: [{ id: (channels[0] as any).id }],
                  options: [{ title: "Size", values: ["M"] }],
                  variants: [
                    {
                      title: "M",
                      options: { Size: "M" },
                      manage_inventory: false,
                      prices: [{ currency_code: "gbp", amount: 20 }],
                    },
                  ],
                },
              ],
            },
          })
          return (result[0] as any).variants[0].id as string
        }

        async function ukCart(variantId: string, quantity: number) {
          const { data } = await api.post(
            "/store/carts",
            {
              region_id: regionIds.gb,
              email: "organizer@example.com",
              shipping_address: {
                first_name: "Test",
                last_name: "Organizer",
                address_1: "1 Test Road",
                city: "London",
                postal_code: "E1 6AN",
                country_code: "gb",
              },
              items: [{ variant_id: variantId, quantity }],
            },
            { headers }
          )
          await addShipping(data.cart.id)
          expect((await choosePayment(data.cart.id, PLACEHOLDER)).status).toBe(200)
          return data.cart.id as string
        }

        for (const [label, handle, metadata] of [
          ["kind removed", "jacket-without-kind", {}],
          ["kind written as Garment", "jacket-kind-capital", { kind: "Garment" }],
        ] as const) {
          it(`refuses a UK cart of 9 jackets with ${label}, and completes 10`, async () => {
            const variantId = await createProduct(handle, metadata)
            const nine = await ukCart(variantId, 9)
            const { data: rules } = await api.get(`/store/carts/${nine}/checkout-rules`, { headers })
            expect(rules.minimum_quantity).toEqual({ required: 10, counted: 9, ok: false })
            await expectRefused(nine, /minimum order in this region is 10 garment pieces; this cart has 9/)

            const ten = await ukCart(variantId, 10)
            const response = await complete(ten)
            expect(response.status).toBe(200)
            expect(response.data.type).toBe("order")
          })
        }
      })

      describe("the promised delivery date is kept on the order", () => {
        it("keeps date, days, based_on and applies, readable through GET /store/orders/:id/delivery-promise", async () => {
          const cart = await createCart("pk", [{ handle: "t-shirt", size: "M", quantity: 1 }])
          await addShipping(cart.id)
          expect((await choosePayment(cart.id, COD)).status).toBe(200)
          const completed = await complete(cart.id)
          expect(completed.data.type).toBe("order")
          // The completion's own answer has no metadata (Medusa's complete route does not take
          // `fields` for the order), so the confirmation page reads the order.
          expect(completed.data.order.metadata).toBeUndefined()
          const orderId = completed.data.order.id
          // The route answers at once, whether or not the order-placed subscriber has run yet.
          const { data } = await readPromise(orderId)
          expect(data).toEqual({ delivery_promise: promisedToday() })
          expect(await metadataOncePlaced(orderId)).toEqual({ delivery_promise: promisedToday() })
          // Medusa's own order route leaves metadata out, even when asked for it.
          const medusa = await api.get(`/store/orders/${orderId}?fields=+metadata`, { headers })
          expect(medusa.data.order.metadata).toBeUndefined()

          const withoutKey = await api.get(`/store/orders/${orderId}/delivery-promise`, allow)
          expect(withoutKey.status).toBe(400)
          const unknown = await readPromise("order_unknown")
          expect(unknown.status).toBe(404)
        })

        it("gives a webhook-completed order (completeCartWorkflow called directly) its promise", async () => {
          const container = getContainer()
          const cart = await createCart("pk", [{ handle: "t-shirt", size: "M", quantity: 1 }])
          await addShipping(cart.id)
          expect((await choosePayment(cart.id, COD)).status).toBe(200)
          const before = await orderCount(container)
          // As a payment provider's webhook does (Medusa's completeCartAfterPaymentStep): the
          // workflow directly, without the store route and its middlewares.
          const { result, errors } = await completeCartWorkflow(container).run({
            input: { id: cart.id },
            throwOnError: false,
          })
          expect(errors).toEqual([])
          expect(await orderCount(container)).toBe(before + 1)
          const orderId = result.id
          // Shortly after, from the order-placed subscriber...
          expect((await metadataOncePlaced(orderId)).delivery_promise).toEqual(promisedToday())
          // ...and through the read route.
          expect((await readPromise(orderId)).data).toEqual({ delivery_promise: promisedToday() })
        })

        it("gives an order its promise at once through the read route, before any subscriber", async () => {
          const cart = await createCart("pk", [{ handle: "t-shirt", size: "M", quantity: 1 }])
          await addShipping(cart.id)
          expect((await choosePayment(cart.id, COD)).status).toBe(200)
          const orderId = (await complete(cart.id)).data.order.id
          await metadataOncePlaced(orderId)
          // As if the subscriber had not run (or the order was placed before the promise was kept).
          await rewriteOrder(orderId, { metadata: { team: "Lahore Lions" } })
          const { status, data } = await readPromise(orderId)
          expect(status).toBe(200)
          expect(data).toEqual({ delivery_promise: promisedToday() })
          expect(await orderMetadata(getContainer(), orderId)).toEqual({
            team: "Lahore Lions",
            delivery_promise: promisedToday(),
          })
        })

        it("bases the promise on the order's creation date in Asia/Karachi, just before and just after midnight", async () => {
          const orderId = await placeCashOnDeliveryOrder()
          // 23:59:59 on 11 Nov in Karachi (UTC+5), then 00:00:00.5 on 12 Nov.
          for (const [createdAt, basedOn, date] of [
            ["2026-11-11T18:59:59.000Z", "2026-11-11", "2026-11-26"],
            ["2026-11-11T19:00:00.500Z", "2026-11-12", "2026-11-27"],
          ]) {
            // The read route on an order without a promise...
            await rewriteOrder(orderId, { createdAt, metadata: {} })
            expect((await readPromise(orderId)).data.delivery_promise).toEqual({
              date,
              days: 15,
              based_on: basedOn,
              applies: "standard",
            })
            // ...and the placement check on one carrying today's promise copied from a cart.
            await rewriteOrder(orderId, { metadata: { delivery_promise: promisedToday() } })
            await keepDeliveryPromiseOnPlacedOrder({
              event: { name: "order.placed", data: { id: orderId } },
              container: getContainer(),
            } as any)
            expect((await orderMetadata(getContainer(), orderId)).delivery_promise).toEqual({
              date,
              days: 15,
              based_on: basedOn,
              applies: "standard",
            })
          }
        })

        it("never rewrites the order's own promise, also when the days setting changes later", async () => {
          const container = getContainer()
          const orderId = await placeCashOnDeliveryOrder()
          const kept = (await orderMetadata(container, orderId)).delivery_promise
          expect(kept).toEqual(promisedToday())
          const previous = await setStoreMetadata(container, { delivery_days_standard: 12 })
          try {
            expect((await readPromise(orderId)).data).toEqual({ delivery_promise: kept })
            expect((await orderMetadata(container, orderId)).delivery_promise).toEqual(kept)
            // An order placed on 10 Nov, under a setting of 20 days, keeps that promise.
            const older = { date: "2026-11-30", days: 20, based_on: "2026-11-10", applies: "standard" }
            await rewriteOrder(orderId, { createdAt: "2026-11-10T07:00:00.000Z", metadata: { delivery_promise: older } })
            expect((await readPromise(orderId)).data).toEqual({ delivery_promise: older })
            expect((await orderMetadata(container, orderId)).delivery_promise).toEqual(older)
            // A new order gets the new setting.
            const newOrder = await placeCashOnDeliveryOrder()
            expect((await readPromise(newOrder)).data.delivery_promise).toMatchObject({ days: 12 })
          } finally {
            await setStoreMetadata(container, { delivery_days_standard: previous?.delivery_days_standard })
          }
        })

        it("replaces, on the first read, a kept promise that is not based on the order's creation date", async () => {
          const container = getContainer()
          const orderId = await placeCashOnDeliveryOrder()
          // Valid in itself, but based on another date than the order's creation (today).
          const otherDate = { date: "2026-11-25", days: 15, based_on: "2026-11-10", applies: "standard" }
          const rush = { date: addCalendarDays(today(), 10), days: 10, based_on: today(), applies: "rush" }
          for (const wrong of [otherDate, rush]) {
            await rewriteOrder(orderId, { metadata: { team: "Lahore Lions", delivery_promise: wrong } })
            expect((await readPromise(orderId)).data).toEqual({ delivery_promise: promisedToday() })
            expect(await orderMetadata(container, orderId)).toEqual({
              team: "Lahore Lions",
              delivery_promise: promisedToday(),
            })
          }
        })

        // QA's eighth review, N4: a cart that carried a delivery_promise from before the
        // reserved-key refusal. The read route returned the copied promise before the subscriber
        // replaced it, because it was valid and based on the right date.
        it("never returns a promise copied from the cart, also before the subscriber has run", async () => {
          const container = getContainer()
          const forged = { date: addCalendarDays(today(), 1), days: 1, based_on: today(), applies: "standard" }
          for (let i = 0; i < 6; i++) {
            const cart = await createCart("pk", [{ handle: "t-shirt", size: "M", quantity: 1 }])
            await addShipping(cart.id)
            expect((await choosePayment(cart.id, COD)).status).toBe(200)
            // Written in the database, as a cart from before the door refused the key.
            await sql(`UPDATE cart SET metadata = CAST(? AS jsonb) WHERE id = ?`, [
              JSON.stringify({ delivery_promise: forged }),
              cart.id,
            ])
            const completed = await complete(cart.id)
            expect(completed.data.type).toBe("order")
            const orderId = completed.data.order.id
            const reads = await Promise.all([readPromise(orderId), readPromise(orderId)])
            for (const read of reads) {
              expect(read.data).toEqual({ delivery_promise: promisedToday() })
            }
            // As if the subscriber had not run yet: the order carries the cart's copy.
            await metadataOncePlaced(orderId)
            await rewriteOrder(orderId, { metadata: { delivery_promise: forged } })
            expect((await readPromise(orderId)).data).toEqual({ delivery_promise: promisedToday() })
            expect((await orderMetadata(container, orderId)).delivery_promise).toEqual(promisedToday())
          }
          // With the days setting invalid, a copied promise is emptied and never shown.
          const cart = await createCart("pk", [{ handle: "t-shirt", size: "M", quantity: 1 }])
          await addShipping(cart.id)
          expect((await choosePayment(cart.id, COD)).status).toBe(200)
          await sql(`UPDATE cart SET metadata = CAST(? AS jsonb) WHERE id = ?`, [
            JSON.stringify({ delivery_promise: forged }),
            cart.id,
          ])
          const orderId = (await complete(cart.id)).data.order.id
          await metadataOncePlaced(orderId)
          await rewriteOrder(orderId, { metadata: { delivery_promise: forged } })
          const previous = await setStoreMetadata(container, { delivery_days_standard: "" })
          try {
            const response = await readPromise(orderId)
            expect(response.status).toBe(500)
            expect(response.data.message).toContain("delivery_days_standard")
            expect((await orderMetadata(container, orderId)).delivery_promise).toBeNull()
          } finally {
            await setStoreMetadata(container, { delivery_days_standard: previous?.delivery_days_standard })
          }
          // Settings fixed: the first read gives the answer for the order's creation date.
          expect((await readPromise(orderId)).data).toEqual({ delivery_promise: promisedToday() })
        })

        it("answers 500 naming the key when no promise is kept and the settings are invalid, and never invents one", async () => {
          const container = getContainer()
          const orderId = await placeCashOnDeliveryOrder()
          const kept = (await orderMetadata(container, orderId)).delivery_promise
          const previous = await setStoreMetadata(container, { delivery_days_standard: "" })
          try {
            // A valid kept promise needs no setting.
            expect((await readPromise(orderId)).data).toEqual({ delivery_promise: kept })
            await rewriteOrder(orderId, { metadata: {} })
            const response = await readPromise(orderId)
            expect(response.status).toBe(500)
            expect(response.data.message).toContain("delivery_days_standard")
            expect((await orderMetadata(container, orderId)).delivery_promise).toBeUndefined()
          } finally {
            await setStoreMetadata(container, { delivery_days_standard: previous?.delivery_days_standard })
          }
          expect((await readPromise(orderId)).data).toEqual({ delivery_promise: promisedToday() })
        })

        it("leaves one correct value when several runs keep the promise at once, and keeps other keys", async () => {
          const container = getContainer()
          const orderId = await placeCashOnDeliveryOrder()
          await rewriteOrder(orderId, { metadata: { team: "Lahore Lions" } })
          const results = await Promise.all([
            ...Array.from({ length: 4 }, async (): Promise<unknown> => (await readPromise(orderId)).data.delivery_promise),
            ...Array.from({ length: 4 }, (): Promise<unknown> => keepOrderDeliveryPromise(container, orderId, "server_answer_only")),
          ])
          for (const result of results) {
            expect(result).toEqual(promisedToday())
          }
          expect(await orderMetadata(container, orderId)).toEqual({
            team: "Lahore Lions",
            delivery_promise: promisedToday(),
          })
        })

        it("writes a key only if it still holds what was read (compare-and-set)", async () => {
          const container = getContainer()
          const orderId = await placeCashOnDeliveryOrder()
          const stale = { date: "2026-11-25", days: 15, based_on: "2026-11-10", applies: "standard" }
          expect(await replaceOrderMetadataKey(container, orderId, "delivery_promise", stale, { forged: true })).toBe(false)
          expect((await orderMetadata(container, orderId)).delivery_promise).toEqual(promisedToday())
          expect(
            await replaceOrderMetadataKey(container, orderId, "delivery_promise", promisedToday(), stale)
          ).toBe(true)
          expect((await orderMetadata(container, orderId)).delivery_promise).toEqual(stale)
        })

        it("gives a converted draft order the server's promise, not one written on the draft", async () => {
          const { data: draft } = await api.post(
            "/admin/draft-orders",
            {
              email: "organizer@example.com",
              region_id: regionIds.pk,
              shipping_address: address("pk"),
              items: [{ variant_id: variantIds["t-shirt/M"], quantity: 1 }],
              metadata: {
                delivery_promise: { date: "2026-11-13", days: 1, based_on: "2026-11-12", applies: "standard" },
              },
            },
            { headers: adminHeaders }
          )
          const draftId = draft.draft_order.id
          // A draft is not an order yet.
          expect((await readPromise(draftId)).status).toBe(404)
          const converted = await api.post(`/admin/draft-orders/${draftId}/convert-to-order`, {}, { headers: adminHeaders })
          expect(converted.status).toBe(200)
          const metadata = await (async () => {
            const until = Date.now() + 10000
            for (;;) {
              const current = await orderMetadata(getContainer(), draftId)
              if ((current?.delivery_promise as any)?.days !== 1 || Date.now() > until) {
                return current
              }
              await sleep(50)
            }
          })()
          // Based on the order's creation date, which for a draft is when the draft was created.
          expect(metadata.delivery_promise).toEqual(promisedToday())
          expect((await readPromise(draftId)).data).toEqual({ delivery_promise: promisedToday() })
        })
      })

      describe("keys a customer may not write in a cart's metadata", () => {
        const forged = { date: addCalendarDays(today(), 14), days: 15, based_on: addCalendarDays(today(), -1), applies: "standard" }

        it("refuses them when a cart is created, whatever the value, and takes other keys", async () => {
          for (const metadata of [
            { delivery_promise: forged },
            { delivery_promise: null },
            { cod_slip_reference: "forged" },
            { cod_collected_at: null },
            { cod_collected_by: "someone" },
            { cod_anything: 1 },
            { team: "Lahore Lions", delivery_promise: "2026-11-13" },
          ]) {
            const response = await api.post(
              "/store/carts",
              { region_id: regionIds.pk, metadata },
              { headers, ...allow }
            )
            expect({ metadata, status: response.status, type: response.data.type }).toEqual({
              metadata,
              status: 400,
              type: "invalid_data",
            })
            expect(response.data.message).toMatch(/^A cart's metadata may not contain .+: the store writes these on the order\.$/)
          }
          const ok = await api.post(
            "/store/carts",
            { region_id: regionIds.pk, metadata: { team: "Lahore Lions" } },
            { headers, ...allow }
          )
          expect(ok.status).toBe(200)
        })

        it("refuses them when a cart is updated, and leaves the cart as it was", async () => {
          const cart = await createCart("pk", [{ handle: "t-shirt", size: "M", quantity: 1 }])
          for (const metadata of [
            { delivery_promise: forged },
            { delivery_promise: null },
            { cod_slip_reference: "forged", team: "A" },
            { cod_collected_at: "2026-11-12T00:00:00Z" },
          ]) {
            const response = await api.post(`/store/carts/${cart.id}`, { metadata }, { headers, ...allow })
            expect({ metadata, status: response.status, type: response.data.type }).toEqual({
              metadata,
              status: 400,
              type: "invalid_data",
            })
          }
          const updated = await api.post(
            `/store/carts/${cart.id}`,
            { metadata: { team: "Lahore Lions" } },
            { headers, ...allow }
          )
          expect(updated.status).toBe(200)
          const query = getContainer().resolve(ContainerRegistrationKeys.QUERY)
          const { data } = await query.graph({ entity: "cart", fields: ["metadata"], filters: { id: cart.id } })
          expect((data[0] as any).metadata).toEqual({ team: "Lahore Lions" })

          // A line item's own metadata does not become the order's, and is left alone.
          const item = await api.post(
            `/store/carts/${cart.id}/line-items`,
            { variant_id: variantIds["t-shirt/L"], quantity: 1, metadata: { delivery_promise: "note" } },
            { headers, ...allow }
          )
          expect(item.status).toBe(200)
          await addShipping(cart.id)
          expect((await choosePayment(cart.id, COD)).status).toBe(200)
          const order = (await complete(cart.id)).data.order
          expect(await metadataOncePlaced(order.id)).toEqual({
            team: "Lahore Lions",
            delivery_promise: promisedToday(),
          })
        })

        it("completes a cart that carries a cod_ key some other way: the key records nothing", async () => {
          const container = getContainer()
          const cart = await createCart("pk", [{ handle: "t-shirt", size: "M", quantity: 1 }])
          // Past the door: the cart module directly.
          await container.resolve(Modules.CART).updateCarts(cart.id, {
            metadata: { cod_slip_reference: "forged", cod_collected_at: "2026-11-12T00:00:00Z" },
          })
          await addShipping(cart.id)
          expect((await choosePayment(cart.id, COD)).status).toBe(200)
          const completed = await complete(cart.id)
          expect(completed.status).toBe(200)
          expect(completed.data.type).toBe("order")
          // Cash collection is not read from metadata: the order is not collected.
          const { data } = await api.get(`/admin/orders/${completed.data.order.id}/cash-collection`, {
            headers: adminHeaders,
          })
          expect(data.cash_collection).toMatchObject({ stage: "not_collected", slip_reference: null, collected_at: null })
        })

        it("never lets a promise planted during completion reach the order (QA's race, D1)", async () => {
          const plants: number[] = []
          for (let i = 0; i < 12; i++) {
            const cart = await createCart("pk", [{ handle: "t-shirt", size: "M", quantity: 1 }])
            await addShipping(cart.id)
            expect((await choosePayment(cart.id, COD)).status).toBe(200)
            const [completed, planted] = await Promise.all([
              complete(cart.id),
              (async () => {
                await sleep((i % 4) * 3)
                return api.post(
                  `/store/carts/${cart.id}`,
                  { metadata: { delivery_promise: { ...forged, note: "forged-by-customer" } } },
                  { headers, ...allow }
                )
              })(),
            ])
            plants.push(planted.status)
            expect(completed.data.type).toBe("order")
            expect((await metadataOncePlaced(completed.data.order.id)).delivery_promise).toEqual(promisedToday())
          }
          expect(new Set(plants)).toEqual(new Set([400]))
        })
      })

      describe("completing a cart twice", () => {
        it("returns the same order when a completed cart is completed again", async () => {
          const container = getContainer()
          const cart = await createCart("pk", [{ handle: "t-shirt", size: "M", quantity: 1 }])
          await addShipping(cart.id)
          expect((await choosePayment(cart.id, COD)).status).toBe(200)
          const first = await complete(cart.id)
          expect(first.data.type).toBe("order")
          const count = await orderCount(container)

          const second = await complete(cart.id)
          expect(second.status).toBe(200)
          expect(second.data.type).toBe("order")
          expect(second.data.order.id).toBe(first.data.order.id)
          expect(await orderCount(container)).toBe(count)
          expect((await paymentState(container, cart.id)).payments).toBe(1)
        })

        it("creates one order when three completions arrive at once", async () => {
          const container = getContainer()
          const cart = await createCart("pk", [{ handle: "t-shirt", size: "M", quantity: 1 }])
          await addShipping(cart.id)
          expect((await choosePayment(cart.id, COD)).status).toBe(200)
          const before = await orderCount(container)

          const responses = await Promise.all([complete(cart.id), complete(cart.id), complete(cart.id)])
          expect(responses.map((r) => [r.status, r.data.type])).toEqual([
            [200, "order"],
            [200, "order"],
            [200, "order"],
          ])
          expect(new Set(responses.map((r) => r.data.order.id)).size).toBe(1)
          expect(await orderCount(container)).toBe(before + 1)
          expect((await paymentState(container, cart.id)).payments).toBe(1)
        })
      })

      it("treats rush days that are not lower than standard days as an invalid setting", async () => {
        const container = getContainer()
        const cart = await createCart("pk", [{ handle: "t-shirt", size: "M", quantity: 1 }])
        await addShipping(cart.id)
        const previous = await setStoreMetadata(container, { delivery_days_rush: "15" })
        try {
          const message =
            "delivery_days_rush in the store's metadata must be lower than delivery_days_standard, " +
            "got delivery_days_rush 15 and delivery_days_standard 15."
          const rules = await api.get(`/store/carts/${cart.id}/checkout-rules`, { headers, ...allow })
          expect(rules.status).toBe(500)
          expect(rules.data.message).toContain(message)

          const chosen = await choosePayment(cart.id, COD)
          expect(chosen.status).toBe(500)
          expect(chosen.data.message).toContain(message)

          await setStoreMetadata(container, { delivery_days_rush: previous?.delivery_days_rush })
          expect((await choosePayment(cart.id, COD)).status).toBe(200)
          await setStoreMetadata(container, { delivery_days_rush: 16 })
          const before = await orderCount(container)
          const completed = await complete(cart.id)
          expect(completed.status).toBe(500)
          expect(completed.data.message).toContain("must be lower than delivery_days_standard")
          expect(await orderCount(container)).toBe(before)
        } finally {
          await setStoreMetadata(container, { delivery_days_rush: previous?.delivery_days_rush })
        }
      })

      describe("cash on delivery recorded as collected (admin)", () => {
        const collection = (orderId: string) => `/admin/orders/${orderId}/cash-collection`
        const record = (orderId: string, slip: unknown) =>
          api.post(collection(orderId), { slip_reference: slip }, { headers: adminHeaders, ...allow })
        const panel = async (orderId: string) =>
          (await api.get(collection(orderId), { headers: adminHeaders })).data.cash_collection

        /** The order's cash-collection records (live and soft-deleted), from our own table. */
        async function records(orderId: string) {
          return sql(
            `SELECT slip_reference, collected_at, deleted_at FROM cash_collection WHERE order_id = ? ORDER BY created_at`,
            [orderId]
          )
        }

        async function payments(container: MedusaContainer, orderId: string) {
          const query = container.resolve(ContainerRegistrationKeys.QUERY)
          // payment_status and the summary are worked out by Medusa's admin order route.
          const { data: admin } = await api.get(`/admin/orders/${orderId}?fields=payment_status,summary`, {
            headers: adminHeaders,
          })
          const { data } = await query.graph({
            entity: "order",
            fields: [
              "transactions.reference",
              "transactions.amount",
              "payment_collections.payments.id",
              "payment_collections.payments.provider_id",
              "payment_collections.payments.captured_at",
              "payment_collections.payments.captures.id",
              "payment_collections.payments.captures.amount",
              "payment_collections.payments.captures.created_by",
            ],
            filters: { id: orderId },
          })
          const order = data[0] as any
          const captureTransactions = (order.transactions ?? []).filter((t: any) => t.reference === "capture")
          return {
            payment_status: admin.order.payment_status,
            paid_total: admin.order.summary.paid_total,
            pending_difference: admin.order.summary.pending_difference,
            payments: order.payment_collections.flatMap((c: any) => c.payments),
            captureTransactions: captureTransactions.length,
            captureTransactionTotal: captureTransactions.reduce((sum: number, t: any) => sum + Number(t.amount), 0),
          }
        }

        /** Capture with Medusa's own admin route (the "Capture payment" button). */
        async function captureInMedusa(orderId: string, amount?: number) {
          const paymentId = (await payments(getContainer(), orderId)).payments[0].id
          const response = await api.post(
            `/admin/payments/${paymentId}/capture`,
            amount === undefined ? {} : { amount },
            { headers: adminHeaders, ...allow }
          )
          return response
        }

        /** Runs `fn` with every capture slowed down, so presses overlap. */
        async function withSlowCapture<T>(ms: number, fn: () => Promise<T>): Promise<T> {
          const payment = getContainer().resolve(Modules.PAYMENT) as any
          const original = payment.capturePayment
          payment.capturePayment = async (...args: any[]) => {
            await sleep(ms)
            return original.apply(payment, args)
          }
          try {
            return await fn()
          } finally {
            payment.capturePayment = original
          }
        }

        /** Runs `fn` while the database refuses every new cash-collection record (QA's N1 trigger). */
        async function withRecordRefused<T>(fn: () => Promise<T>): Promise<T> {
          await sql(
            `CREATE OR REPLACE FUNCTION s11d_refuse_cash_collection() RETURNS trigger AS $body$
             BEGIN RAISE EXCEPTION 'insert into cash_collection refused by the test'; END $body$ LANGUAGE plpgsql`
          )
          await sql(
            `CREATE TRIGGER s11d_refuse_cash_collection BEFORE INSERT ON cash_collection
             FOR EACH ROW EXECUTE FUNCTION s11d_refuse_cash_collection()`
          )
          try {
            return await fn()
          } finally {
            await sql(`DROP TRIGGER IF EXISTS s11d_refuse_cash_collection ON cash_collection`)
            await sql(`DROP FUNCTION IF EXISTS s11d_refuse_cash_collection()`)
          }
        }

        /** No SQL, stack trace or internal id in what staff are told. */
        function expectReadable(message: string) {
          expect(message).not.toMatch(/insert|select|update|cash_collection|\$\d|\bat \S+:\d+|(order|pay|capt|cashcol)_[0-9A-Z]{10,}/i)
        }

        it("goes from a completed cash-on-delivery order to a captured payment with the slip recorded", async () => {
          const container = getContainer()
          const orderId = await placeCashOnDeliveryOrder()

          expect(await panel(orderId)).toEqual({
            applies: true,
            stage: "not_collected",
            collected: false,
            can_record: true,
            capture_needed: true,
            reason: null,
            slip_reference: null,
            collected_at: null,
            amount: 2250,
            captured_amount: 0,
            captured_by: null,
            captured_by_email: null,
            captured_at: null,
          })
          expect((await payments(container, orderId)).payments[0].captured_at).toBeNull()

          const blank = await record(orderId, "  ")
          expect(blank.status).toBe(400)
          expect(blank.data).toMatchObject({ type: "invalid_data", message: "Enter the slip reference from the courier's slip." })

          const startedAt = Date.now()
          const marked = await record(orderId, " TCS  778812 ")
          expect(marked.status).toBe(200)
          expect(marked.data.cash_collection).toMatchObject({
            applies: true,
            stage: "recorded",
            collected: true,
            can_record: false,
            reason: "already_recorded",
            slip_reference: "TCS 778812",
            captured_amount: 2250,
            captured_by: adminUserId,
            captured_by_email: ADMIN_EMAIL,
          })
          const collectedAt = Date.parse(marked.data.cash_collection.collected_at)
          expect(collectedAt).toBeGreaterThanOrEqual(startedAt - 1000)
          expect(collectedAt).toBeLessThanOrEqual(Date.now() + 1000)

          const after = await payments(container, orderId)
          expect(after).toMatchObject({ payment_status: "captured", paid_total: 2250, pending_difference: 0 })
          expect(after.payments).toHaveLength(1)
          expect(after.payments[0].provider_id).toBe(COD)
          expect(after.payments[0].captured_at).not.toBeNull()
          expect(after.payments[0].captures).toHaveLength(1)
          expect(after.payments[0].captures[0].created_by).toBe(adminUserId)
          expect(after.captureTransactions).toBe(1)

          // The record is a row of its own; nothing about it is in the order's metadata.
          const rows = await records(orderId)
          expect(rows).toHaveLength(1)
          expect(rows[0].slip_reference).toBe("TCS 778812")
          expect(new Date(rows[0].collected_at).toISOString()).toBe(marked.data.cash_collection.collected_at)
          expect(await orderMetadata(container, orderId)).toEqual({ delivery_promise: promisedToday() })

          // It cannot be recorded twice.
          const again = await record(orderId, "TCS 999")
          expect(again.status).toBe(400)
          expect(again.data).toMatchObject({
            type: "not_allowed",
            message: "The cash for this order is already recorded as collected.",
          })
          expect((await payments(container, orderId)).payments[0].captures).toHaveLength(1)
          expect(await records(orderId)).toHaveLength(1)
        })

        it("captures once and keeps the winner's slip when six presses arrive at once", async () => {
          const container = getContainer()
          for (let round = 0; round < 3; round++) {
            const orderId = await placeCashOnDeliveryOrder()
            const responses = await withSlowCapture(round === 0 ? 0 : 200, () =>
              Promise.all(Array.from({ length: 6 }, (_, i) => record(orderId, `SLIP-${round}-${i}`)))
            )
            const statuses = responses.map((r) => r.status).sort()
            expect(statuses).toEqual([200, 400, 400, 400, 400, 400])
            for (const refused of responses.filter((r) => r.status !== 200)) {
              expect(refused.data.type).toBe("not_allowed")
              expect(refused.data.message).toMatch(
                /already recorded as collected|captured by another request at the same moment/
              )
            }
            const winner = responses.find((r) => r.status === 200)!.data.cash_collection.slip_reference
            const after = await payments(container, orderId)
            expect(after.payments[0].captures).toHaveLength(1)
            expect(after.captureTransactions).toBe(1)
            expect((await records(orderId)).map((r: any) => r.slip_reference)).toEqual([winner])
          }
        })

        // QA's eighth review, N1: the record failed after the capture, and the workflow undid the
        // capture's order transaction while the capture stayed.
        it("keeps the capture and the order's payment intact when the record fails after it, and a retry records", async () => {
          const container = getContainer()
          const orderId = await placeCashOnDeliveryOrder()
          const failed: any = await withRecordRefused(() => record(orderId, "N1-FAIL"))
          expect(failed.status).toBe(500)
          expect(failed.data).toEqual({
            type: "unexpected_state",
            message:
              "The payment is captured, but the slip reference could not be saved. Reload the order and " +
              "enter the slip reference again; the payment will not be captured a second time.",
          })
          expectReadable(failed.data.message)

          const after = await payments(container, orderId)
          expect(after).toMatchObject({
            payment_status: "captured",
            paid_total: 2250,
            pending_difference: 0,
            captureTransactions: 1,
            captureTransactionTotal: 2250,
          })
          expect(after.payments[0].captured_at).not.toBeNull()
          expect(after.payments[0].captures).toHaveLength(1)
          expect(await records(orderId)).toEqual([])
          expect(await panel(orderId)).toMatchObject({
            stage: "captured_without_slip",
            can_record: true,
            capture_needed: false,
          })

          const retry = await record(orderId, "N1-OK")
          expect(retry.status).toBe(200)
          expect(retry.data.cash_collection).toMatchObject({ stage: "recorded", slip_reference: "N1-OK" })
          const final = await payments(container, orderId)
          expect(final.payments[0].captures).toHaveLength(1)
          expect(final).toMatchObject({ captureTransactions: 1, paid_total: 2250, pending_difference: 0 })
          expect((await records(orderId)).map((r: any) => r.slip_reference)).toEqual(["N1-OK"])
        })

        it("records nothing when the capture fails, tells staff what happened without the cause, and a retry works", async () => {
          const container = getContainer()
          const orderId = await placeCashOnDeliveryOrder()
          const payment = container.resolve(Modules.PAYMENT) as any
          const original = payment.capturePayment
          payment.capturePayment = async () => {
            throw new Error(`select "id" from "payment" where "id" = $1 for update - lock timeout`)
          }
          let failed: any
          try {
            failed = await record(orderId, "FAIL-1")
          } finally {
            payment.capturePayment = original
          }
          expect(failed.status).toBe(500)
          expect(failed.data).toEqual({
            type: "unexpected_state",
            message:
              "The payment could not be captured. Nothing was recorded. Reload the order and try again; " +
              "if it fails again, check the Payments section of the order.",
          })
          expectReadable(failed.data.message)
          expect(await records(orderId)).toEqual([])
          expect((await payments(container, orderId)).payments[0].captures).toHaveLength(0)
          expect(await panel(orderId)).toMatchObject({ stage: "not_collected", can_record: true })

          const retry = await record(orderId, "OK-2")
          expect(retry.status).toBe(200)
          expect((await records(orderId)).map((r: any) => r.slip_reference)).toEqual(["OK-2"])
          expect((await payments(container, orderId)).payments[0].captures).toHaveLength(1)
        })

        it("answers an error that is not one of its own with a sentence, never the error itself", async () => {
          const orderId = await placeCashOnDeliveryOrder()
          const service = getContainer().resolve("cashCollection") as any
          const original = service.listCashCollections
          service.listCashCollections = async () => {
            throw new Error(`relation "cash_collection" does not exist at Object.query (pg.js:12:3)`)
          }
          let read: any
          let marked: any
          try {
            read = await api.get(collection(orderId), { headers: adminHeaders, ...allow })
            marked = await record(orderId, "X-1")
          } finally {
            service.listCashCollections = original
          }
          expect(read.status).toBe(500)
          expect(read.data.message).toBe(
            "The cash-on-delivery state of this order could not be loaded because of an unexpected error. Reload the order."
          )
          expect(marked.status).toBe(500)
          expect(marked.data.message).toBe(
            "The cash could not be recorded because of an unexpected error. Reload the order to see what is captured and recorded, and try again."
          )
          for (const message of [read.data.message, marked.data.message]) {
            expectReadable(message)
          }
          expect((await payments(getContainer(), orderId)).payments[0].captures).toHaveLength(0)
        })

        it("records the slip once on a payment captured with Medusa's own button, without capturing again", async () => {
          const container = getContainer()
          const orderId = await placeCashOnDeliveryOrder()
          expect((await captureInMedusa(orderId)).status).toBe(200)
          const state = await panel(orderId)
          expect(state).toMatchObject({
            stage: "captured_without_slip",
            collected: true,
            can_record: true,
            capture_needed: false,
            slip_reference: null,
            captured_by: adminUserId,
            captured_by_email: ADMIN_EMAIL,
          })
          expect(state.captured_at).not.toBeNull()

          const responses = await Promise.all(Array.from({ length: 5 }, (_, i) => record(orderId, `LATE-${i}`)))
          expect(responses.map((r) => r.status).sort()).toEqual([200, 400, 400, 400, 400])
          const winner = responses.find((r) => r.status === 200)!
          expect(winner.data.cash_collection).toMatchObject({ stage: "recorded", collected: true })
          expect((await records(orderId)).map((r: any) => r.slip_reference)).toEqual([
            winner.data.cash_collection.slip_reference,
          ])
          const after = await payments(container, orderId)
          expect(after.payments[0].captures).toHaveLength(1)
          expect(after.captureTransactions).toBe(1)

          const again = await record(orderId, "LATE-X")
          expect(again.status).toBe(400)
          expect(again.data.message).toBe("The cash for this order is already recorded as collected.")
        })

        // QA's eighth review, N3: Medusa's "Capture payment" button sends the full amount, which
        // Medusa 2.22.6 refuses once part is captured; a capture with no amount is refused as well.
        it("captures the rest of a partly captured payment and records the slip, in one press", async () => {
          const container = getContainer()
          const orderId = await placeCashOnDeliveryOrder()
          expect((await captureInMedusa(orderId, 1000)).status).toBe(200)
          // What Medusa itself does with the rest: the full amount, or no amount, is refused.
          const full = await captureInMedusa(orderId, 2250)
          const noAmount = await captureInMedusa(orderId)
          for (const response of [full, noAmount]) {
            expect(response.status).toBe(400)
            expect(response.data.message).toBe(
              "You cannot capture more than the authorized amount substracted by what is already captured."
            )
          }
          expect(await panel(orderId)).toMatchObject({
            stage: "partly_captured",
            collected: false,
            can_record: true,
            capture_needed: true,
            reason: null,
            amount: 2250,
            captured_amount: 1000,
          })

          const recorded = await record(orderId, "TCS PART")
          expect(recorded.status).toBe(200)
          expect(recorded.data.cash_collection).toMatchObject({
            stage: "recorded",
            collected: true,
            captured_amount: 2250,
            slip_reference: "TCS PART",
          })
          const after = await payments(container, orderId)
          expect(after.payments[0].captures.map((c: any) => Number(c.amount)).sort((a: number, b: number) => a - b)).toEqual([1000, 1250])
          expect(after.payments[0].captured_at).not.toBeNull()
          expect(after).toMatchObject({
            payment_status: "captured",
            paid_total: 2250,
            pending_difference: 0,
            captureTransactions: 2,
            captureTransactionTotal: 2250,
          })
          expect((await records(orderId)).map((r: any) => r.slip_reference)).toEqual(["TCS PART"])
        })

        it("captures the rest once when several presses arrive at once on a partly captured payment", async () => {
          const container = getContainer()
          const orderId = await placeCashOnDeliveryOrder()
          expect((await captureInMedusa(orderId, 750)).status).toBe(200)
          const responses = await withSlowCapture(200, () =>
            Promise.all(Array.from({ length: 5 }, (_, i) => record(orderId, `PART-${i}`)))
          )
          expect(responses.map((r) => r.status).sort()).toEqual([200, 400, 400, 400, 400])
          const winner = responses.find((r) => r.status === 200)!.data.cash_collection.slip_reference
          const after = await payments(container, orderId)
          expect(after.payments[0].captures.map((c: any) => Number(c.amount)).sort((a: number, b: number) => a - b)).toEqual([750, 1500])
          expect(after).toMatchObject({ paid_total: 2250, pending_difference: 0, captureTransactions: 2 })
          expect((await records(orderId)).map((r: any) => r.slip_reference)).toEqual([winner])
        })

        // QA's eighth review, N2: Medusa's own order update saves the metadata whole and dropped a
        // slip kept there. The record is not in the metadata any more.
        it("keeps the record when the order's metadata is edited through Medusa's admin at the same moment", async () => {
          for (let round = 0; round < 3; round++) {
            const orderId = await placeCashOnDeliveryOrder()
            const edits = Array.from({ length: 8 }, async (_, k) => {
              await sleep(k * 10)
              return api.post(
                `/admin/orders/${orderId}`,
                { metadata: { staff_note: `note ${k}` } },
                { headers: adminHeaders, ...allow }
              )
            })
            const [marked, ...edited] = await Promise.all([record(orderId, `EDIT-${round}`), ...edits])
            expect(marked.status).toBe(200)
            expect(new Set(edited.map((r) => r.status))).toEqual(new Set([200]))
            expect((await records(orderId)).map((r: any) => r.slip_reference)).toEqual([`EDIT-${round}`])
            expect(await panel(orderId)).toMatchObject({ stage: "recorded", slip_reference: `EDIT-${round}` })
          }
        })

        it("refuses invisible and blank characters in the slip reference, and keeps Urdu and Arabic with marks", async () => {
          const orderId = await placeCashOnDeliveryOrder()
          for (const slip of [
            "AB\nCD",
            "‮A1",
            "A​B",
            "TCS\t1",
            "ㅤㅤ",
            "TCSㅤ1",
            "⠀",
            "TCS️1",
            "TCS\u{E0100}1",
            "AᅠB",
            "ﾠA1",
            "A".repeat(65),
          ]) {
            const response = await record(orderId, slip)
            expect({ slip, status: response.status, type: response.data.type }).toEqual({
              slip,
              status: 400,
              type: "invalid_data",
            })
          }
          expect(await records(orderId)).toEqual([])
          expect((await payments(getContainer(), orderId)).payments[0].captures).toHaveLength(0)
          const urdu = await record(orderId, "رَسِید ۴۲")
          expect(urdu.status).toBe(200)
          expect(urdu.data.cash_collection.slip_reference).toBe("رَسِید ۴۲")
          const second = await placeCashOnDeliveryOrder()
          const longest = await record(second, "A".repeat(64))
          expect(longest.status).toBe(200)
          const third = await placeCashOnDeliveryOrder()
          const arabic = await record(third, "إيصال مُحَمَّد ٤٢")
          expect(arabic.status).toBe(200)
        })

        it("does not apply to an order paid another way", async () => {
          const cart = await createCart("pk", [{ handle: "t-shirt", size: "M", quantity: 1 }])
          await addShipping(cart.id)
          expect((await choosePayment(cart.id, PLACEHOLDER)).status).toBe(200)
          const orderId = (await complete(cart.id)).data.order.id

          expect(await panel(orderId)).toMatchObject({
            applies: false,
            can_record: false,
            reason: "not_cash_on_delivery",
          })
          const refused = await record(orderId, "TCS 1")
          expect(refused.status).toBe(400)
          expect(refused.data).toMatchObject({ type: "not_allowed", message: "This order is not paid by cash on delivery." })
          expect(await records(orderId)).toEqual([])
        })

        it("answers 404 for a deleted order and keeps its record, which comes back with the order", async () => {
          const orderId = await placeCashOnDeliveryOrder()
          expect((await record(orderId, "DEL-1")).status).toBe(200)
          const orders = getContainer().resolve(Modules.ORDER) as any
          await orders.softDeleteOrders([orderId])
          for (const response of [
            await api.get(collection(orderId), { headers: adminHeaders, ...allow }),
            await record(orderId, "DEL-2"),
          ]) {
            expect(response.status).toBe(404)
            expect(response.data).toEqual({
              type: "not_found",
              message: "This order was not found. It may have been deleted.",
            })
          }
          // The record of cash received stays, like Medusa's own payment and capture.
          const rows = await records(orderId)
          expect(rows.map((r: any) => [r.slip_reference, r.deleted_at])).toEqual([["DEL-1", null]])
          await orders.restoreOrders([orderId])
          expect(await panel(orderId)).toMatchObject({ stage: "recorded", slip_reference: "DEL-1" })
        })

        describe("as a signed-in customer", () => {
          /**
           * A registered customer's headers. Made in each test: the test runner restores the
           * database to its state after seeding before every test.
           */
          async function signInCustomer(): Promise<Record<string, string>> {
            const email = "customer-s11d@example.com"
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

          it("cannot reach the admin routes with no credentials, a publishable key or a customer token", async () => {
            const customerHeaders = await signInCustomer()
            const orderId = await placeCashOnDeliveryOrder()
            for (const credentials of [{}, headers, customerHeaders]) {
              expect((await api.get(collection(orderId), { headers: credentials, ...allow })).status).toBe(401)
              expect(
                (await api.post(collection(orderId), { slip_reference: "TCS 1" }, { headers: credentials, ...allow })).status
              ).toBe(401)
            }
            expect((await api.get(collection("order_unknown"), { headers: adminHeaders, ...allow })).status).toBe(404)
            expect(await records(orderId)).toEqual([])
          })

          it("sees the promise on their orders, and no cash-collection data or staff id", async () => {
            const customerHeaders = await signInCustomer()
            const cart = await createCart("pk", [{ handle: "t-shirt", size: "M", quantity: 1 }], customerHeaders)
            await addShipping(cart.id)
            expect((await choosePayment(cart.id, COD)).status).toBe(200)
            const orderId = (await complete(cart.id)).data.order.id
            await metadataOncePlaced(orderId)
            const marked = await record(orderId, "TCS 4242")
            expect(marked.status).toBe(200)
            const collectedAt = marked.data.cash_collection.collected_at

            const { data: list } = await api.get("/store/orders", { headers: customerHeaders })
            const listed = list.orders.find((o: any) => o.id === orderId)
            expect(listed.metadata).toEqual({ delivery_promise: promisedToday() })
            const { data: one } = await api.get(`/store/orders/${orderId}`, { headers: customerHeaders })
            expect(one.order.metadata).toBeUndefined()
            for (const body of [JSON.stringify(list), JSON.stringify(one)]) {
              expect(body).not.toContain("TCS 4242")
              expect(body).not.toContain(collectedAt)
              expect(body).not.toContain("cod_")
              expect(body).not.toContain("cash_collection")
              expect(body).not.toContain(adminUserId)
            }
          })
        })
      })
    })
  },
})
