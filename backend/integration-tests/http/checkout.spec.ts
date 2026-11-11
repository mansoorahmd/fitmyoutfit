/**
 * M1 checkout, through the store API: docs/contracts/m1-checkout.md, section 7 (the five proofs)
 * and section 6 (the checkout-rules route and how refusals look).
 */
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { updateRegionsWorkflow, updateStoresWorkflow } from "@medusajs/medusa/core-flows"
import { calendarDateIn, addCalendarDays } from "../../src/lib/rules/delivery-promise"
import { seedStore } from "../../src/scripts/seed-lib/seed-store"

jest.setTimeout(300 * 1000)

const COD = "pp_cod_cod"
const PLACEHOLDER = "pp_system_default"

type Line = { handle: string; size?: string; quantity: number }

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("M1 checkout through the store API", () => {
      let headers: Record<string, string>
      const regionIds: Record<string, string> = {}
      /** variant id per "handle" or "handle/size" */
      const variantIds: Record<string, string> = {}

      beforeAll(async () => {
        const { publishableKey } = await seedStore(getContainer(), { nodeEnv: "test" })
        headers = { "x-publishable-api-key": publishableKey }
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

      async function createCart(country: string, lines: Line[]) {
        const { data } = await api.post(
          "/store/carts",
          {
            region_id: regionIds[country],
            email: "organizer@example.com",
            shipping_address: {
              first_name: "Test",
              last_name: "Organizer",
              address_1: "1 Test Road",
              city: "Test City",
              postal_code: "12345",
              country_code: country,
            },
            items: lines.map((line) => ({
              variant_id: variantIds[line.size ? `${line.handle}/${line.size}` : line.handle],
              quantity: line.quantity,
            })),
          },
          { headers }
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
        const today = calendarDateIn(new Date(), "Asia/Karachi")
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
            based_on: today,
            standard: { days: 15, date: addCalendarDays(today, 15) },
            rush: { days: 10, date: addCalendarDays(today, 10) },
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
    })
  },
})
