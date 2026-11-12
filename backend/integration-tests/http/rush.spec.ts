/**
 * The rush charge through the store API: docs/contracts/m1-checkout.md, section 9 (task S1-6),
 * line by line. Decision 011 has the reasons.
 */
import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { completeCartWorkflow, updateStoresWorkflow } from "@medusajs/medusa/core-flows"
import { addCalendarDays, calendarDateIn } from "../../src/lib/rules/delivery-promise"
import { seedStore } from "../../src/scripts/seed-lib/seed-store"

jest.setTimeout(300 * 1000)

const COD = "pp_cod_cod"
const PLACEHOLDER = "pp_system_default"
const ADMIN_EMAIL = "rush-test-admin@example.com"
const ADMIN_PASSWORD = "rush-test-password"

type Line = { handle: string; size?: string; quantity: number }
type CartLine = {
  id: string
  title: string
  unit_price: number
  quantity: number
  product_handle?: string
  variant_id: string
  metadata?: Record<string, unknown> | null
}
type Cart = { id: string; total: number; currency_code: string; items: CartLine[] }

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("Rush charge through the store API (contract section 9)", () => {
      let headers: Record<string, string>
      let adminHeaders: Record<string, string>
      const regionIds: Record<string, string> = {}
      /** variant id per "handle" or "handle/size" */
      const variantIds: Record<string, string> = {}
      let rushVariantId: string
      let rushProductId: string

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
        const { data: regions } = await api.get("/store/regions", { headers })
        for (const region of regions.regions) {
          for (const country of region.countries) {
            regionIds[country.iso_2] = region.id
          }
        }
        const { data: products } = await api.get(
          "/store/products?limit=50&fields=id,handle,*variants,*variants.options",
          { headers }
        )
        for (const product of products.products) {
          for (const variant of product.variants) {
            const size = variant.options?.find((o: any) => o.value)?.value
            variantIds[product.handle] ??= variant.id
            variantIds[`${product.handle}/${size}`] = variant.id
          }
          if (product.handle === "rush-add-on") {
            rushProductId = product.id
          }
        }
        rushVariantId = variantIds["rush-add-on"]
        expect(rushVariantId).toBeTruthy()
      })

      afterEach(async () => {
        // Every test starts from the seeded settings and a published rush product.
        await setStoreMetadata(getContainer(), {
          rush_percentage: 20,
          cod_max_total: 20000,
          delivery_days_standard: 15,
          delivery_days_rush: 10,
        })
        await getContainer()
          .resolve(Modules.PRODUCT)
          .updateProducts(rushProductId, { status: "published" as any })
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

      const variantOf = (line: Line) => variantIds[line.size ? `${line.handle}/${line.size}` : line.handle]

      async function createCart(country: string, lines: Line[]): Promise<Cart> {
        const { data } = await api.post(
          "/store/carts",
          {
            region_id: regionIds[country],
            email: "organizer@example.com",
            shipping_address: address(country),
            items: lines.map((line) => ({ variant_id: variantOf(line), quantity: line.quantity })),
          },
          { headers }
        )
        return data.cart
      }

      const addRush = (cartId: string) => api.post(`/store/carts/${cartId}/rush`, {}, { headers, ...allow })
      const removeRush = (cartId: string) => api.delete(`/store/carts/${cartId}/rush`, { headers, ...allow })
      const rules = (cartId: string) =>
        api.get(`/store/carts/${cartId}/checkout-rules`, { headers, ...allow })
      const getCart = async (cartId: string): Promise<Cart> =>
        (await api.get(`/store/carts/${cartId}`, { headers })).data.cart

      const rushLines = (cart: Cart) => cart.items.filter((item) => item.variant_id === rushVariantId)
      const rushLine = (cart: Cart) => {
        const lines = rushLines(cart)
        expect(lines.length).toBeLessThanOrEqual(1)
        return lines[0]
      }
      /** The rush line's price, or null when the cart has none. */
      const rushPrice = (cart: Cart) => rushLine(cart)?.unit_price ?? null

      async function addShipping(cartId: string) {
        const { data } = await api.get(`/store/shipping-options?cart_id=${cartId}`, { headers })
        await api.post(
          `/store/carts/${cartId}/shipping-methods`,
          { option_id: data.shipping_options[0].id },
          { headers }
        )
      }

      async function paymentCollection(cartId: string): Promise<string> {
        const { data } = await api.post("/store/payment-collections", { cart_id: cartId }, { headers })
        return data.payment_collection.id
      }

      async function choosePayment(cartId: string, providerId: string) {
        const collectionId = await paymentCollection(cartId)
        return api.post(
          `/store/payment-collections/${collectionId}/payment-sessions`,
          { provider_id: providerId },
          { headers, ...allow }
        )
      }

      /** A cash-on-delivery session made without the store API, so completion is checked alone. */
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

      async function setStoreMetadata(container: MedusaContainer, changes: Record<string, unknown>) {
        const [store] = await container.resolve(Modules.STORE).listStores({})
        const metadata = { ...store.metadata, ...changes }
        for (const [key, value] of Object.entries(changes)) {
          if (value === undefined) {
            delete metadata[key]
          }
        }
        await updateStoresWorkflow(container).run({
          input: { selector: { id: store.id }, update: { metadata } },
        })
      }

      async function sql(statement: string, bindings: unknown[] = []) {
        const knex = getContainer().resolve(ContainerRegistrationKeys.PG_CONNECTION) as any
        return (await knex.raw(statement, bindings)).rows as any[]
      }

      async function orderCount() {
        const query = getContainer().resolve(ContainerRegistrationKeys.QUERY)
        return (await query.graph({ entity: "order", fields: ["id"] })).data.length
      }

      /** The order's lines as kept: title, unit price and quantity, rush last. */
      async function orderLines(orderId: string) {
        const rows = await sql(
          `SELECT li.title, li.unit_price, oi.quantity, li.variant_id
             FROM order_item oi JOIN order_line_item li ON li.id = oi.item_id
            WHERE oi.order_id = ? AND oi.deleted_at IS NULL
            ORDER BY li.variant_id = ?, li.title, oi.quantity DESC`,
          [orderId, rushVariantId]
        )
        return rows.map((r) => ({ title: r.title, unit_price: Number(r.unit_price), quantity: Number(r.quantity) }))
      }

      async function orderMetadata(orderId: string) {
        const query = getContainer().resolve(ContainerRegistrationKeys.QUERY)
        const { data } = await query.graph({ entity: "order", fields: ["metadata"], filters: { id: orderId } })
        return (data[0] as any).metadata as Record<string, unknown>
      }

      async function promiseOncePlaced(orderId: string, timeoutMs = 10000) {
        const until = Date.now() + timeoutMs
        for (;;) {
          const metadata = await orderMetadata(orderId)
          if (metadata?.delivery_promise || Date.now() > until) {
            return metadata?.delivery_promise
          }
          await sleep(50)
        }
      }

      const today = () => calendarDateIn(new Date(), "Asia/Karachi")

      let promotionCount = 0
      /** An active promotion code taking `percent` off every item (each, any quantity). */
      async function createPromotion(percent: number): Promise<string> {
        const code = `RUSHTEST${++promotionCount}`
        const response = await api.post(
          "/admin/promotions",
          {
            code,
            type: "standard",
            status: "active",
            is_automatic: false,
            application_method: {
              type: "percentage",
              target_type: "items",
              allocation: "each",
              max_quantity: 100,
              value: percent,
            },
          },
          { headers: adminHeaders, ...allow }
        )
        expect(response.status).toBe(200)
        return code
      }

      // --- Adding and removing ---

      describe("adding and removing", () => {
        it("adds one rush line at the server's price and answers { cart }; adding again changes nothing", async () => {
          const cart = await createCart("pk", [{ handle: "t-shirt", size: "M", quantity: 1 }])
          const first = await addRush(cart.id)
          expect(first.status).toBe(200)
          expect(Object.keys(first.data)).toEqual(["cart"])
          expect(first.data.cart.id).toBe(cart.id)
          expect(rushLine(first.data.cart)).toMatchObject({ title: "Rush Production", quantity: 1, unit_price: 400 })
          expect(first.data.cart.total).toBe(2400)

          const again = await addRush(cart.id)
          expect(again.status).toBe(200)
          expect(rushLines(again.data.cart)).toHaveLength(1)
          expect(rushLine(again.data.cart)).toMatchObject({ id: rushLine(first.data.cart).id, quantity: 1, unit_price: 400 })
          expect(again.data.cart.total).toBe(2400)
        })

        it("answers with the fields asked for, like Medusa's cart routes", async () => {
          const cart = await createCart("pk", [{ handle: "t-shirt", size: "M", quantity: 1 }])
          const response = await api.post(`/store/carts/${cart.id}/rush?fields=id,total`, {}, { headers })
          expect(response.data.cart).toEqual({ id: cart.id, total: 2400 })
        })

        it("removes the rush line; removing again changes nothing", async () => {
          const cart = await createCart("pk", [{ handle: "t-shirt", size: "M", quantity: 1 }])
          await addRush(cart.id)
          const removed = await removeRush(cart.id)
          expect(removed.status).toBe(200)
          expect(Object.keys(removed.data)).toEqual(["cart"])
          expect(rushLines(removed.data.cart)).toHaveLength(0)
          expect(removed.data.cart.total).toBe(2000)
          const again = await removeRush(cart.id)
          expect(again.status).toBe(200)
          expect(again.data.cart.items).toHaveLength(1)
        })

        it("lets Medusa's own DELETE line route remove the rush line", async () => {
          const cart = await createCart("pk", [{ handle: "t-shirt", size: "M", quantity: 1 }])
          const line = rushLine((await addRush(cart.id)).data.cart)
          const response = await api.delete(`/store/carts/${cart.id}/line-items/${line.id}`, { headers, ...allow })
          expect(response.status).toBe(200)
          expect(rushLines(await getCart(cart.id))).toHaveLength(0)
        })

        it("removing needs no setting: it works while rush_percentage is missing", async () => {
          const cart = await createCart("pk", [{ handle: "t-shirt", size: "M", quantity: 1 }])
          await addRush(cart.id)
          await setStoreMetadata(getContainer(), { rush_percentage: undefined })
          const response = await removeRush(cart.id)
          expect(response.status).toBe(200)
          expect(rushLines(response.data.cart)).toHaveLength(0)
        })

        it("keeps one rush line when several adds arrive at once", async () => {
          const cart = await createCart("pk", [{ handle: "t-shirt", size: "M", quantity: 2 }])
          const responses = await Promise.all(Array.from({ length: 10 }, () => addRush(cart.id)))
          // Medusa's cart workflows wait 2 seconds for the cart's lock; a request that waited longer
          // is answered 409 conflict (try again), never 500. None adds a second line.
          for (const response of responses) {
            if (response.status !== 200) {
              expect(response.status).toBe(409)
              expect(response.data).toMatchObject({ type: "conflict" })
            }
          }
          expect(responses.some((r) => r.status === 200)).toBe(true)
          const after = await getCart(cart.id)
          expect(rushLines(after)).toHaveLength(1)
          expect(rushLine(after)).toMatchObject({ quantity: 1, unit_price: 800 })
        })
      })

      // --- Refusals ---

      describe("refusals", () => {
        it("refuses a cart with no garment line (400 not_allowed), also one holding only a fit kit", async () => {
          const cart = await createCart("pk", [{ handle: "fit-kit", quantity: 1 }])
          const response = await addRush(cart.id)
          expect(response.status).toBe(400)
          expect(response.data).toMatchObject({ type: "not_allowed" })
          expect(response.data.message).toMatch(/at least one garment/)
          expect(rushLines(await getCart(cart.id))).toHaveLength(0)
        })

        it("answers 404 for an unknown cart, on both routes", async () => {
          expect((await addRush("cart_unknown")).status).toBe(404)
          expect((await removeRush("cart_unknown")).status).toBe(404)
        })

        it("needs the publishable key, like every store route", async () => {
          const cart = await createCart("pk", [{ handle: "t-shirt", size: "M", quantity: 1 }])
          const response = await api.post(`/store/carts/${cart.id}/rush`, {}, allow)
          expect(response.status).toBe(400)
          expect(rushLines(await getCart(cart.id))).toHaveLength(0)
        })

        it("refuses with 400 not_allowed when rush_percentage is 0 (rush not offered)", async () => {
          await setStoreMetadata(getContainer(), { rush_percentage: 0 })
          const cart = await createCart("pk", [{ handle: "t-shirt", size: "M", quantity: 1 }])
          const response = await addRush(cart.id)
          expect(response.status).toBe(400)
          expect(response.data).toMatchObject({ type: "not_allowed" })
          expect(response.data.message).toMatch(/not offered/)
        })

        it.each([
          ["missing", undefined, "rush_percentage is not set"],
          ["not a number", "twenty", 'rush_percentage must be a number from 0 to 100, got "twenty"'],
          ["negative", -5, "rush_percentage must not be negative"],
          ["above 100", 150, "rush_percentage must not be above 100"],
        ])("answers 500 naming the key when rush_percentage is %s", async (_label, value, message) => {
          const cart = await createCart("pk", [{ handle: "t-shirt", size: "M", quantity: 1 }])
          await setStoreMetadata(getContainer(), { rush_percentage: value })
          const response = await addRush(cart.id)
          expect(response.status).toBe(500)
          expect(response.data.message).toContain(message)
          expect(rushLines(await getCart(cart.id))).toHaveLength(0)
          const rulesResponse = await rules(cart.id)
          expect(rulesResponse.status).toBe(500)
          expect(rulesResponse.data.message).toContain(message)
        })

        it("answers 500 naming the rush product when it is missing (not published)", async () => {
          await getContainer().resolve(Modules.PRODUCT).updateProducts(rushProductId, { status: "draft" as any })
          const cart = await createCart("pk", [{ handle: "t-shirt", size: "M", quantity: 1 }])
          const response = await addRush(cart.id)
          expect(response.status).toBe(500)
          expect(response.data.message).toContain('The rush product is missing')
          expect(response.data.message).toContain('"rush-add-on"')
        })
      })

      // --- The rush product only through its routes ---

      describe("Medusa's own routes refuse the rush product", () => {
        it("refuses the rush variant through POST /store/carts/:id/line-items (400 not_allowed)", async () => {
          const cart = await createCart("pk", [{ handle: "t-shirt", size: "M", quantity: 1 }])
          const response = await api.post(
            `/store/carts/${cart.id}/line-items`,
            { variant_id: rushVariantId, quantity: 1 },
            { headers, ...allow }
          )
          expect(response.status).toBe(400)
          expect(response.data).toMatchObject({ type: "not_allowed" })
          expect(rushLines(await getCart(cart.id))).toHaveLength(0)
        })

        it("refuses the rush variant in the items of a new cart (400 not_allowed)", async () => {
          const response = await api.post(
            "/store/carts",
            {
              region_id: regionIds.pk,
              items: [
                { variant_id: variantIds["t-shirt/M"], quantity: 1 },
                { variant_id: rushVariantId, quantity: 1 },
              ],
            },
            { headers, ...allow }
          )
          expect(response.status).toBe(400)
          expect(response.data).toMatchObject({ type: "not_allowed" })
        })

        it.each([
          ["a quantity change", { quantity: 3 }],
          ["a quantity of 0", { quantity: 0 }],
          ["metadata", { quantity: 1, metadata: { note: "free please" } }],
          ["a unit price", { quantity: 1, unit_price: 1 }],
        ])("refuses %s on the rush line and leaves the line as it was", async (_label, body) => {
          const cart = await createCart("pk", [{ handle: "t-shirt", size: "M", quantity: 1 }])
          const line = rushLine((await addRush(cart.id)).data.cart)
          const response = await api.post(`/store/carts/${cart.id}/line-items/${line.id}`, body, {
            headers,
            ...allow,
          })
          expect(response.status).toBe(400)
          const after = rushLine(await getCart(cart.id))
          expect(after).toMatchObject({ id: line.id, quantity: 1, unit_price: 400 })
          expect(after.metadata ?? {}).toEqual({})
        })
      })

      // --- The charge ---

      describe("the charge", () => {
        it("is PKR 400 for PKR 2,000 of garments at 20%", async () => {
          const cart = await createCart("pk", [{ handle: "t-shirt", size: "M", quantity: 1 }])
          expect(rushPrice((await addRush(cart.id)).data.cart)).toBe(400)
        })

        it("is GBP 44.00 for GBP 220.00 of garments at 20%", async () => {
          const cart = await createCart("gb", [{ handle: "jersey", size: "M", quantity: 10 }])
          const response = await addRush(cart.id)
          expect(rushPrice(response.data.cart)).toBe(44)
          expect(response.data.cart.total).toBe(264)
        })

        it("rounds half up to the rupee: PKR 2,000 at 20.025% is 401, not 400", async () => {
          await setStoreMetadata(getContainer(), { rush_percentage: "20.025" })
          const cart = await createCart("pk", [{ handle: "t-shirt", size: "M", quantity: 1 }])
          expect(rushPrice((await addRush(cart.id)).data.cart)).toBe(401)
        })

        it("rounds half up to the penny: GBP 14.00 at 3.75% is 0.53, not 0.52", async () => {
          await setStoreMetadata(getContainer(), { rush_percentage: 3.75 })
          const cart = await createCart("gb", [{ handle: "t-shirt", size: "M", quantity: 1 }])
          expect(rushPrice((await addRush(cart.id)).data.cart)).toBe(0.53)
        })

        it("does not charge for the fit kit", async () => {
          const cart = await createCart("pk", [
            { handle: "t-shirt", size: "M", quantity: 1 },
            { handle: "fit-kit", quantity: 1 },
          ])
          const response = await addRush(cart.id)
          expect(rushPrice(response.data.cart)).toBe(400)
          expect(response.data.cart.total).toBe(2000 + 5000 + 400)
        })
      })

      // --- Always the server's figure ---

      describe("priced again after every change", () => {
        it("follows lines added, a quantity changed and a line removed", async () => {
          const cart = await createCart("pk", [{ handle: "t-shirt", size: "M", quantity: 1 }])
          await addRush(cart.id)

          let response = await api.post(
            `/store/carts/${cart.id}/line-items`,
            { variant_id: variantIds["jersey/L"], quantity: 2 },
            { headers }
          )
          // 2,000 + 2 × 3,500 = 9,000; 20% is 1,800, already in the answer.
          expect(rushPrice(response.data.cart)).toBe(1800)
          expect(response.data.cart.total).toBe(9000 + 1800)

          const jersey = response.data.cart.items.find((i: CartLine) => i.variant_id === variantIds["jersey/L"])
          response = await api.post(`/store/carts/${cart.id}/line-items/${jersey.id}`, { quantity: 1 }, { headers })
          expect(rushPrice(response.data.cart)).toBe(1100)

          response = await api.delete(`/store/carts/${cart.id}/line-items/${jersey.id}`, { headers })
          expect(rushPrice(response.data.parent)).toBe(400)
          expect(rushPrice(await getCart(cart.id))).toBe(400)
        })

        it("follows a change of region and currency", async () => {
          const cart = await createCart("pk", [{ handle: "t-shirt", size: "M", quantity: 2 }])
          await addRush(cart.id)
          let response = await api.post(`/store/carts/${cart.id}`, { region_id: regionIds.gb }, { headers })
          expect(response.data.cart.currency_code).toBe("gbp")
          expect(rushPrice(response.data.cart)).toBe(5.6)
          response = await api.post(`/store/carts/${cart.id}`, { region_id: regionIds.ae }, { headers })
          expect(response.data.cart.currency_code).toBe("aed")
          expect(rushPrice(response.data.cart)).toBe(24)
          response = await api.post(`/store/carts/${cart.id}`, { region_id: regionIds.pk }, { headers })
          expect(rushPrice(response.data.cart)).toBe(800)
        })

        it("follows a promotion applied and removed, through the promotions route and the cart update", async () => {
          const code = await createPromotion(50)
          const cart = await createCart("pk", [{ handle: "t-shirt", size: "M", quantity: 2 }])
          await addRush(cart.id)

          let response = await api.post(`/store/carts/${cart.id}/promotions`, { promo_codes: [code] }, { headers })
          expect(response.status).toBe(200)
          // 4,000 less 50% is 2,000; 20% of that is 400. The rush line itself is not discounted.
          expect(rushPrice(response.data.cart)).toBe(400)
          expect(response.data.cart.total).toBe(2400)

          response = await api.delete(`/store/carts/${cart.id}/promotions`, {
            headers,
            data: { promo_codes: [code] },
          })
          expect(rushPrice(response.data.cart)).toBe(800)
          expect(response.data.cart.total).toBe(4800)

          response = await api.post(`/store/carts/${cart.id}`, { promo_codes: [code] }, { headers })
          expect(rushPrice(response.data.cart)).toBe(400)
          expect(response.data.cart.total).toBe(2400)
        })

        it("charges nothing on garments a promotion makes free", async () => {
          const code = await createPromotion(100)
          const cart = await createCart("pk", [{ handle: "t-shirt", size: "M", quantity: 1 }])
          await addRush(cart.id)
          const response = await api.post(`/store/carts/${cart.id}/promotions`, { promo_codes: [code] }, { headers })
          expect(rushPrice(response.data.cart)).toBe(0)
          expect(response.data.cart.total).toBe(0)
        })

        it("removes the rush line with the last garment line", async () => {
          const cart = await createCart("pk", [
            { handle: "t-shirt", size: "M", quantity: 1 },
            { handle: "fit-kit", quantity: 1 },
          ])
          const added = (await addRush(cart.id)).data.cart
          const tee = added.items.find((i: CartLine) => i.variant_id === variantIds["t-shirt/M"])
          await api.delete(`/store/carts/${cart.id}/line-items/${tee.id}`, { headers })
          const after = await getCart(cart.id)
          expect(after.items.map((i) => i.title)).toEqual(["Fit Kit"])
          expect(after.total).toBe(5000)
        })

        it("updates the payment collection's amount with the new charge", async () => {
          const cart = await createCart("pk", [{ handle: "t-shirt", size: "M", quantity: 1 }])
          await addShipping(cart.id)
          const collectionId = await paymentCollection(cart.id)
          await addRush(cart.id)
          await api.post(`/store/carts/${cart.id}/line-items`, { variant_id: variantIds["t-shirt/L"], quantity: 1 }, { headers })
          const query = getContainer().resolve(ContainerRegistrationKeys.QUERY)
          const { data } = await query.graph({ entity: "payment_collection", fields: ["amount"], filters: { id: collectionId } })
          expect(Number((data[0] as any).amount)).toBe(4000 + 800 + 250)
        })
      })

      // --- The rules route ---

      describe("the rules route", () => {
        it("has the rush object, and applies follows the cart", async () => {
          const date = today()
          const cart = await createCart("pk", [{ handle: "t-shirt", size: "M", quantity: 1 }])
          let response = await rules(cart.id)
          expect(response.status).toBe(200)
          expect(response.data.rush).toEqual({
            available: true,
            in_cart: false,
            percentage: 20,
            amount: 400,
            currency_code: "pkr",
          })
          expect(response.data.delivery_promise).toEqual({
            based_on: date,
            standard: { days: 15, date: addCalendarDays(date, 15) },
            rush: { days: 10, date: addCalendarDays(date, 10) },
            applies: "standard",
          })

          await addRush(cart.id)
          response = await rules(cart.id)
          expect(response.data.rush).toEqual({
            available: true,
            in_cart: true,
            percentage: 20,
            amount: 400,
            currency_code: "pkr",
          })
          expect(response.data.delivery_promise.applies).toBe("rush")

          await removeRush(cart.id)
          response = await rules(cart.id)
          expect(response.data.rush.in_cart).toBe(false)
          expect(response.data.delivery_promise.applies).toBe("standard")
        })

        it("gives the amount in whole currency units, pence included", async () => {
          const cart = await createCart("gb", [{ handle: "t-shirt", size: "M", quantity: 1 }])
          await setStoreMetadata(getContainer(), { rush_percentage: 3.75 })
          const response = await rules(cart.id)
          expect(response.data.rush).toEqual({
            available: true,
            in_cart: false,
            percentage: 3.75,
            amount: 0.53,
            currency_code: "gbp",
          })
        })

        it("is not available, at 0, without a garment line or at a percentage of 0", async () => {
          const fitKit = await createCart("pk", [{ handle: "fit-kit", quantity: 1 }])
          expect((await rules(fitKit.id)).data.rush).toEqual({
            available: false,
            in_cart: false,
            percentage: 20,
            amount: 0,
            currency_code: "pkr",
          })
          const cart = await createCart("pk", [{ handle: "t-shirt", size: "M", quantity: 1 }])
          await addRush(cart.id)
          await setStoreMetadata(getContainer(), { rush_percentage: 0 })
          const response = await rules(cart.id)
          expect(response.data.rush).toMatchObject({ available: false, percentage: 0, amount: 0 })
        })
      })

      // --- The other rules ---

      describe("the other rules", () => {
        it("does not count the rush line toward the minimum: UK 9 garments plus rush is refused, 10 plus rush places", async () => {
          const cart = await createCart("gb", [{ handle: "jersey", size: "M", quantity: 9 }])
          await addRush(cart.id)
          await addShipping(cart.id)
          expect((await rules(cart.id)).data.minimum_quantity).toEqual({ required: 10, counted: 9, ok: false })
          expect((await choosePayment(cart.id, PLACEHOLDER)).status).toBe(200)
          const before = await orderCount()
          const refused = await complete(cart.id)
          expect(refused.status).toBe(400)
          expect(refused.data).toMatchObject({ type: "not_allowed" })
          expect(refused.data.message).toMatch(/this cart has 9/)
          expect(await orderCount()).toBe(before)

          await api.post(`/store/carts/${cart.id}/line-items`, { variant_id: variantIds["jersey/L"], quantity: 1 }, { headers })
          expect((await rules(cart.id)).data.minimum_quantity).toEqual({ required: 10, counted: 10, ok: true })
          expect((await choosePayment(cart.id, PLACEHOLDER)).status).toBe(200)
          const placed = await complete(cart.id)
          expect(placed.status).toBe(200)
          expect(placed.data.type).toBe("order")
          expect(await orderLines(placed.data.order.id)).toEqual([
            { title: "Jersey", unit_price: 22, quantity: 9 },
            { title: "Jersey", unit_price: 22, quantity: 1 },
            { title: "Rush Production", unit_price: 44, quantity: 1 },
          ])
          expect(placed.data.order.total).toBe(264)
        })

        it("refuses cash on delivery chosen when rush takes the total over the limit", async () => {
          // 9 T-shirts are PKR 18,000 and delivery 250: 18,250 is within 20,000; rush adds 3,600.
          const cart = await createCart("pk", [{ handle: "t-shirt", size: "M", quantity: 9 }])
          await addShipping(cart.id)
          expect((await rules(cart.id)).data.cash_on_delivery.available).toBe(true)
          await addRush(cart.id)
          const rulesNow = (await rules(cart.id)).data
          expect(rulesNow.cash_on_delivery).toMatchObject({ available: false, reason: "over_limit" })
          const chosen = await choosePayment(cart.id, COD)
          expect(chosen.status).toBe(400)
          expect(chosen.data).toMatchObject({ type: "not_allowed" })
          expect(chosen.data.message).toMatch(/21850 PKR/)
        })

        it("refuses completion by cash on delivery when rush takes the total over the limit", async () => {
          const cart = await createCart("pk", [{ handle: "t-shirt", size: "M", quantity: 9 }])
          await addShipping(cart.id)
          await addRush(cart.id)
          await forceCashOnDeliverySession(getContainer(), cart.id)
          const before = await orderCount()
          const response = await complete(cart.id)
          expect(response.status).toBe(400)
          expect(response.data).toMatchObject({ type: "not_allowed" })
          expect(response.data.message).toMatch(/Cash on delivery is available up to 20000 PKR/)
          expect(await orderCount()).toBe(before)

          // Without rush the same cart may pay by cash on delivery.
          await removeRush(cart.id)
          expect((await choosePayment(cart.id, COD)).status).toBe(200)
          expect((await complete(cart.id)).data.type).toBe("order")
        })
      })

      // --- The order ---

      describe("the order", () => {
        async function placeRushOrder(): Promise<{ orderId: string; cartId: string }> {
          const cart = await createCart("pk", [{ handle: "t-shirt", size: "M", quantity: 1 }])
          await addRush(cart.id)
          await addShipping(cart.id)
          expect((await choosePayment(cart.id, COD)).status).toBe(200)
          const response = await complete(cart.id)
          expect(response.status).toBe(200)
          expect(response.data.type).toBe("order")
          return { orderId: response.data.order.id, cartId: cart.id }
        }

        it("keeps the rush line, and the rush date with applies rush, readable through the read route", async () => {
          const { orderId } = await placeRushOrder()
          expect(await orderLines(orderId)).toEqual([
            { title: "T-Shirt", unit_price: 2000, quantity: 1 },
            { title: "Rush Production", unit_price: 400, quantity: 1 },
          ])
          const expected = {
            date: addCalendarDays(today(), 10),
            days: 10,
            based_on: today(),
            applies: "rush",
          }
          expect(await promiseOncePlaced(orderId)).toEqual(expected)
          const read = await api.get(`/store/orders/${orderId}/delivery-promise`, { headers })
          expect(read.data).toEqual({ delivery_promise: expected })
        })

        it("keeps the rush promise when the days settings change later", async () => {
          const { orderId } = await placeRushOrder()
          await promiseOncePlaced(orderId)
          await setStoreMetadata(getContainer(), { delivery_days_standard: 20, delivery_days_rush: 7 })
          const read = await api.get(`/store/orders/${orderId}/delivery-promise`, { headers })
          expect(read.data.delivery_promise).toEqual({
            date: addCalendarDays(today(), 10),
            days: 10,
            based_on: today(),
            applies: "rush",
          })
          // A new rush order uses the new rush days.
          const second = await placeRushOrder()
          expect(await promiseOncePlaced(second.orderId)).toMatchObject({ days: 7, applies: "rush" })
        })

        it("replaces a kept standard promise on a rush order: it is not the order's own", async () => {
          const { orderId } = await placeRushOrder()
          await promiseOncePlaced(orderId)
          const standard = {
            date: addCalendarDays(today(), 15),
            days: 15,
            based_on: today(),
            applies: "standard",
          }
          await sql(
            `UPDATE "order" SET metadata = jsonb_set(metadata, '{delivery_promise}', CAST(? AS jsonb)) WHERE id = ?`,
            [JSON.stringify(standard), orderId]
          )
          const read = await api.get(`/store/orders/${orderId}/delivery-promise`, { headers })
          expect(read.data.delivery_promise).toMatchObject({ days: 10, applies: "rush" })
          expect((await orderMetadata(orderId)).delivery_promise).toMatchObject({ days: 10, applies: "rush" })
        })

        it("keeps standard on an order without rush", async () => {
          const cart = await createCart("pk", [{ handle: "t-shirt", size: "M", quantity: 1 }])
          await addRush(cart.id)
          await removeRush(cart.id)
          await addShipping(cart.id)
          await choosePayment(cart.id, COD)
          const response = await complete(cart.id)
          expect(await promiseOncePlaced(response.data.order.id)).toMatchObject({ days: 15, applies: "standard" })
        })

        it("prices the rush line once more at completion: a percentage changed since the last cart change reaches the order", async () => {
          const cart = await createCart("pk", [{ handle: "t-shirt", size: "M", quantity: 1 }])
          await addRush(cart.id)
          await addShipping(cart.id)
          expect((await choosePayment(cart.id, PLACEHOLDER)).status).toBe(200)
          await setStoreMetadata(getContainer(), { rush_percentage: 25 })

          // The completion prices the line again (2,000 at 25% is 500). The total changed, so
          // Medusa drops the payment session, as for every change of the total, and the
          // completion asks for a payment session again; no order is made at the old price.
          const before = await orderCount()
          const first = await complete(cart.id)
          expect(first.status).toBe(400)
          expect(first.data.message).toMatch(/Payment sessions are required/)
          expect(await orderCount()).toBe(before)
          expect(rushPrice(await getCart(cart.id))).toBe(500)

          expect((await choosePayment(cart.id, PLACEHOLDER)).status).toBe(200)
          const placed = await complete(cart.id)
          expect(placed.data.type).toBe("order")
          expect(await orderLines(placed.data.order.id)).toEqual([
            { title: "T-Shirt", unit_price: 2000, quantity: 1 },
            { title: "Rush Production", unit_price: 500, quantity: 1 },
          ])
        })

        it("never makes an order whose rush line differs from the rule, also when completed without the store route", async () => {
          const cart = await createCart("pk", [{ handle: "t-shirt", size: "M", quantity: 1 }])
          const line = rushLine((await addRush(cart.id)).data.cart)
          await addShipping(cart.id)
          expect((await choosePayment(cart.id, PLACEHOLDER)).status).toBe(200)
          // A stale price on the line, as a change racing the completion could leave for an
          // instant (written past every route, straight into the cart module).
          await getContainer().resolve(Modules.CART).updateLineItems(line.id, { unit_price: 1 } as any)
          const before = await orderCount()
          const { errors } = await completeCartWorkflow(getContainer()).run({
            input: { id: cart.id },
            throwOnError: false,
          })
          expect(errors[0]?.error?.message).toMatch(/rush charge was updated/)
          expect(await orderCount()).toBe(before)
        })

        it("gives every order the rule's rush line when garments are added during completion", async () => {
          for (let round = 0; round < 5; round++) {
            const cart = await createCart("pk", [{ handle: "t-shirt", size: "M", quantity: 1 }])
            await addRush(cart.id)
            await addShipping(cart.id)
            await choosePayment(cart.id, PLACEHOLDER)
            const [completion] = await Promise.all([
              complete(cart.id),
              api.post(
                `/store/carts/${cart.id}/line-items`,
                { variant_id: variantIds["jersey/M"], quantity: 3 },
                { headers, ...allow }
              ),
            ])
            if (completion.data?.type === "order") {
              const lines = await orderLines(completion.data.order.id)
              const garments = lines
                .filter((l) => l.title !== "Rush Production")
                .reduce((sum, l) => sum + l.unit_price * l.quantity, 0)
              const rush = lines.filter((l) => l.title === "Rush Production")
              expect(rush).toEqual([{ title: "Rush Production", unit_price: Math.round(garments * 0.2), quantity: 1 }])
            }
          }
        })
      })
    })
  },
})
