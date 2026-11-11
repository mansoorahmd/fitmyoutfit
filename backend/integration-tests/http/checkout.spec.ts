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

        it("never rewrites a valid kept promise, also when the days setting changes later", async () => {
          const container = getContainer()
          const orderId = await placeCashOnDeliveryOrder()
          const kept = (await orderMetadata(container, orderId)).delivery_promise
          expect(kept).toEqual(promisedToday())
          const previous = await setStoreMetadata(container, { delivery_days_standard: 12 })
          try {
            expect((await readPromise(orderId)).data).toEqual({ delivery_promise: kept })
            // An older valid promise (another base date) is kept as well.
            const older = { date: "2026-11-25", days: 15, based_on: "2026-11-10", applies: "standard" }
            await rewriteOrder(orderId, { metadata: { delivery_promise: older } })
            expect((await readPromise(orderId)).data).toEqual({ delivery_promise: older })
            expect((await orderMetadata(container, orderId)).delivery_promise).toEqual(older)
            // A new order gets the new setting.
            const newOrder = await placeCashOnDeliveryOrder()
            expect((await readPromise(newOrder)).data.delivery_promise).toMatchObject({ days: 12 })
          } finally {
            await setStoreMetadata(container, { delivery_days_standard: previous?.delivery_days_standard })
          }
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

        it("still refuses, at completion, a cart that carries a staff-only key some other way", async () => {
          const container = getContainer()
          const cart = await createCart("pk", [{ handle: "t-shirt", size: "M", quantity: 1 }])
          // Past the door: the cart module directly.
          await container.resolve(Modules.CART).updateCarts(cart.id, {
            metadata: { cod_slip_reference: "forged" },
          })
          await addShipping(cart.id)
          expect((await choosePayment(cart.id, COD)).status).toBe(200)
          await expectRefused(cart.id, /The cart must not carry cod_slip_reference\./)
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

        async function payments(container: MedusaContainer, orderId: string) {
          const query = container.resolve(ContainerRegistrationKeys.QUERY)
          // payment_status is worked out by Medusa's admin order route, not stored.
          const { data: admin } = await api.get(`/admin/orders/${orderId}?fields=payment_status`, {
            headers: adminHeaders,
          })
          const { data } = await query.graph({
            entity: "order",
            fields: [
              "payment_collections.payments.provider_id",
              "payment_collections.payments.captured_at",
              "payment_collections.payments.captures.id",
              "payment_collections.payments.captures.created_by",
            ],
            filters: { id: orderId },
          })
          const order = data[0] as any
          return {
            payment_status: admin.order.payment_status,
            payments: order.payment_collections.flatMap((c: any) => c.payments),
          }
        }

        it("goes from a completed cash-on-delivery order to a captured payment with the slip reference kept", async () => {
          const container = getContainer()
          const orderId = await placeCashOnDeliveryOrder()

          const before = await api.get(collection(orderId), { headers: adminHeaders })
          expect(before.data.cash_collection).toEqual({
            applies: true,
            collected: false,
            can_collect: true,
            reason: null,
            slip_reference: null,
            collected_at: null,
            collected_by: null,
            collected_by_email: null,
          })
          expect((await payments(container, orderId)).payments[0].captured_at).toBeNull()

          const blank = await api.post(collection(orderId), { slip_reference: "  " }, { headers: adminHeaders, ...allow })
          expect(blank.status).toBe(400)
          expect(blank.data).toMatchObject({ type: "invalid_data", message: "Enter the slip reference from the courier's slip." })

          const startedAt = Date.now()
          const marked = await api.post(collection(orderId), { slip_reference: " TCS  778812 " }, { headers: adminHeaders })
          expect(marked.status).toBe(200)
          expect(marked.data.cash_collection).toMatchObject({
            applies: true,
            collected: true,
            can_collect: false,
            reason: "already_collected",
            slip_reference: "TCS 778812",
            collected_by: adminUserId,
            collected_by_email: ADMIN_EMAIL,
          })
          const collectedAt = Date.parse(marked.data.cash_collection.collected_at)
          expect(collectedAt).toBeGreaterThanOrEqual(startedAt - 1000)
          expect(collectedAt).toBeLessThanOrEqual(Date.now() + 1000)

          const after = await payments(container, orderId)
          expect(after.payment_status).toBe("captured")
          expect(after.payments).toHaveLength(1)
          expect(after.payments[0].provider_id).toBe(COD)
          expect(after.payments[0].captured_at).not.toBeNull()
          expect(after.payments[0].captures).toHaveLength(1)
          expect(after.payments[0].captures[0].created_by).toBe(adminUserId)

          expect(await orderMetadata(container, orderId)).toEqual({
            delivery_promise: promisedToday(),
            cod_slip_reference: "TCS 778812",
            cod_collected_at: marked.data.cash_collection.collected_at,
            cod_collected_by: adminUserId,
          })

          // It cannot be recorded twice.
          const again = await api.post(collection(orderId), { slip_reference: "TCS 999" }, { headers: adminHeaders, ...allow })
          expect(again.status).toBe(400)
          expect(again.data).toMatchObject({
            type: "not_allowed",
            message: "The cash for this order is already recorded as collected.",
          })
          expect((await payments(container, orderId)).payments[0].captures).toHaveLength(1)
          expect((await orderMetadata(container, orderId)).cod_slip_reference).toBe("TCS 778812")
        })

        it("records it once when the button is pressed twice at once", async () => {
          const container = getContainer()
          const orderId = await placeCashOnDeliveryOrder()
          const responses = await Promise.all(
            ["SLIP-A", "SLIP-B"].map((slip) =>
              api.post(collection(orderId), { slip_reference: slip }, { headers: adminHeaders, ...allow })
            )
          )
          expect(responses.map((r) => r.status).sort()).toEqual([200, 400])
          const winner = responses.find((r) => r.status === 200)!.data.cash_collection.slip_reference
          expect((await payments(container, orderId)).payments[0].captures).toHaveLength(1)
          expect((await orderMetadata(container, orderId)).cod_slip_reference).toBe(winner)
        })

        it("does not apply to an order paid another way", async () => {
          const cart = await createCart("pk", [{ handle: "t-shirt", size: "M", quantity: 1 }])
          await addShipping(cart.id)
          expect((await choosePayment(cart.id, PLACEHOLDER)).status).toBe(200)
          const orderId = (await complete(cart.id)).data.order.id

          const state = await api.get(collection(orderId), { headers: adminHeaders })
          expect(state.data.cash_collection).toMatchObject({
            applies: false,
            can_collect: false,
            reason: "not_cash_on_delivery",
          })
          const refused = await api.post(collection(orderId), { slip_reference: "TCS 1" }, { headers: adminHeaders, ...allow })
          expect(refused.status).toBe(400)
          expect(refused.data).toMatchObject({ type: "not_allowed", message: "This order is not paid by cash on delivery." })
          expect((await orderMetadata(getContainer(), orderId)).cod_slip_reference).toBeUndefined()
        })

        it("needs a signed-in admin, and answers 404 for an unknown order", async () => {
          const orderId = await placeCashOnDeliveryOrder()
          expect((await api.get(collection(orderId), allow)).status).toBe(401)
          expect(
            (await api.post(collection(orderId), { slip_reference: "TCS 1" }, { headers, ...allow })).status
          ).toBe(401)
          expect((await api.get(collection("order_unknown"), { headers: adminHeaders, ...allow })).status).toBe(404)
        })
      })
    })
  },
})
