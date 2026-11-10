import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { updateProductsWorkflow } from "@medusajs/medusa/core-flows"
import { seedData } from "../../src/scripts/seed-data"
import { seedStore } from "../../src/scripts/seed-lib/seed-store"

jest.setTimeout(300 * 1000)

const ADMIN_EMAIL = "seed-test-admin@example.com"
const ADMIN_PASSWORD = "seed-test-password"

const regionCurrencies = Object.fromEntries(
  seedData.regions.data.map((r) => [r.name, r.currency_code])
)

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("seed: placeholder store data", () => {
      let publishableKey: string
      let headers: Record<string, string>
      let firstRunImages: string[]

      // The runner snapshots the database after this hook and restores it before every test,
      // so each test starts from the freshly seeded state.
      beforeAll(async () => {
        const result = await seedStore(getContainer(), {
          adminEmail: ADMIN_EMAIL,
          adminPassword: ADMIN_PASSWORD,
        })
        publishableKey = result.publishableKey
        headers = { "x-publishable-api-key": publishableKey }
        firstRunImages = result.created.images
      })

      it("gives every product its placeholder image through the file module", async () => {
        // No S3 variables in the tests, so this runs on Medusa's fallback file provider.
        expect([...firstRunImages].sort()).toEqual(
          seedData.products.data.map((p) => p.handle).sort()
        )
        const { data } = await api.get(
          "/store/products?limit=50&fields=handle,thumbnail,*images",
          { headers }
        )
        expect(data.products).toHaveLength(5)
        for (const product of data.products) {
          const file = seedData.products.data.find((p) => p.handle === product.handle)!.image
          const stem = file.replace(/\.png$/, "")
          expect(typeof product.thumbnail).toBe("string")
          expect(product.thumbnail).toContain(stem)
          expect(product.thumbnail).toMatch(/\.png$/)
          expect(product.images).toHaveLength(1)
          expect(product.images[0].url).toBe(product.thumbnail)
        }
      })

      it("repairs a product without a picture and leaves a product with a photo alone", async () => {
        const container = getContainer()
        const productModule = container.resolve(Modules.PRODUCT)
        const [jersey] = await productModule.listProducts({ handle: "jersey" })
        const [jacket] = await productModule.listProducts({ handle: "jacket" })
        const adminPhoto = "https://example.com/real-jacket-photo.jpg"
        await updateProductsWorkflow(container).run({
          input: {
            products: [
              { id: jersey.id, thumbnail: null, images: [] },
              { id: jacket.id, thumbnail: adminPhoto, images: [{ url: adminPhoto }] },
            ],
          },
        })

        const rerun = await seedStore(container, {
          adminEmail: ADMIN_EMAIL,
          adminPassword: ADMIN_PASSWORD,
        })
        expect(rerun.created.images).toEqual(["jersey"])

        const [jerseyAfter] = await productModule.listProducts(
          { handle: "jersey" },
          { relations: ["images"] }
        )
        expect(jerseyAfter.thumbnail).toMatch(/jersey.*\.png$/)
        expect(jerseyAfter.images).toHaveLength(1)
        const [jacketAfter] = await productModule.listProducts(
          { handle: "jacket" },
          { relations: ["images"] }
        )
        expect(jacketAfter.thumbnail).toBe(adminPhoto)
        expect(jacketAfter.images?.map((i) => i.url)).toEqual([adminPhoto])
      })

      it("serves 4 regions with the right currencies, countries and tax_final metadata", async () => {
        const { data } = await api.get("/store/regions", { headers })
        expect(data.regions).toHaveLength(4)
        for (const region of data.regions) {
          expect(region.currency_code).toBe(regionCurrencies[region.name])
          expect(region.metadata).toMatchObject({ tax_final: false })
        }
        const countries = data.regions.flatMap((r: any) =>
          r.countries.map((c: any) => c.iso_2)
        )
        expect(countries.sort()).toEqual(["ae", "gb", "pk", "us"])
      })

      it("has pkr as the default store currency, with all four supported", async () => {
        const store = getContainer().resolve(Modules.STORE)
        const [record] = await store.listStores({}, { relations: ["supported_currencies"] })
        const supported = (record.supported_currencies ?? []).map((c) => c.currency_code)
        expect(supported).toEqual(expect.arrayContaining(["pkr", "gbp", "aed", "usd"]))
        expect(record.supported_currencies?.find((c) => c.is_default)?.currency_code).toBe("pkr")
      })

      it("lists Jersey, T-Shirt and Jacket in the garments collection, priced per region", async () => {
        const { data: collections } = await api.get("/store/collections?handle=garments", {
          headers,
        })
        expect(collections.collections).toHaveLength(1)
        const collectionId = collections.collections[0].id

        const { data: regionsRes } = await api.get("/store/regions", { headers })

        for (const region of regionsRes.regions) {
          const { data } = await api.get(
            `/store/products?collection_id=${collectionId}&region_id=${region.id}` +
              `&fields=handle,title,metadata,*variants,*variants.calculated_price&limit=50`,
            { headers }
          )
          const handles = data.products.map((p: any) => p.handle).sort()
          expect(handles).toEqual(["jacket", "jersey", "t-shirt"])

          for (const product of data.products) {
            expect(product.metadata.kind).toBe("garment")
            expect(product.variants.map((v: any) => v.title)).toEqual(
              expect.arrayContaining(seedData.sizes.data)
            )
            expect(product.variants).toHaveLength(seedData.sizes.data.length)
            const expected = seedData.prices.data[product.handle][region.currency_code]
            for (const variant of product.variants) {
              expect(variant.calculated_price.currency_code).toBe(region.currency_code)
              expect(variant.calculated_price.calculated_amount).toBe(expected)
              expect(variant.manage_inventory).toBe(false)
            }
          }
        }
      })

      it("stores the sizes in display order as option value ranks", async () => {
        const query = getContainer().resolve(ContainerRegistrationKeys.QUERY)
        const { data } = await query.graph({
          entity: "product",
          fields: ["handle", "options.title", "options.values.value", "options.values.rank"],
          filters: { handle: "jersey" },
        })
        const sizeOption = (data as any[])[0].options.find((o: any) => o.title === "Size")
        const inRankOrder = [...sizeOption.values]
          .sort((a: any, b: any) => a.rank - b.rank)
          .map((v: any) => v.value)
        expect(inRankOrder).toEqual(seedData.sizes.data)
      })

      it("keeps the fit kit and rush add-on out of the garments collection but reachable by handle", async () => {
        const { data: all } = await api.get("/store/products?limit=50&fields=handle,metadata,collection_id", {
          headers,
        })
        expect(all.products.map((p: any) => p.handle).sort()).toEqual([
          "fit-kit",
          "jacket",
          "jersey",
          "rush-add-on",
          "t-shirt",
        ])
        const kinds = Object.fromEntries(all.products.map((p: any) => [p.handle, p.metadata.kind]))
        expect(kinds).toEqual({
          jersey: "garment",
          "t-shirt": "garment",
          jacket: "garment",
          "fit-kit": "fit_kit",
          "rush-add-on": "rush_add_on",
        })
        for (const handle of ["fit-kit", "rush-add-on"]) {
          const product = all.products.find((p: any) => p.handle === handle)
          expect(product.collection_id).toBeNull()
        }

        const { data: pkr } = await api.get("/store/regions", { headers })
        const pakistan = pkr.regions.find((r: any) => r.currency_code === "pkr")
        const { data: fitKit } = await api.get(
          `/store/products?handle=fit-kit&region_id=${pakistan.id}&fields=*variants.calculated_price`,
          { headers }
        )
        expect(fitKit.products[0].variants).toHaveLength(1)
        expect(fitKit.products[0].variants[0].calculated_price.calculated_amount).toBe(5000)
      })

      it("rejects store requests without the publishable key", async () => {
        const response = await api.get("/store/products", { validateStatus: () => true })
        expect(response.status).toBe(400)
      })

      it("creates a local admin user that can log in", async () => {
        const response = await api.post("/auth/user/emailpass", {
          email: ADMIN_EMAIL,
          password: ADMIN_PASSWORD,
        })
        expect(response.status).toBe(200)
        expect(typeof response.data.token).toBe("string")
      })

      it("is idempotent: a second run creates nothing and changes no counts", async () => {
        const container = getContainer()
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        const count = async (entity: string) =>
          (await query.graph({ entity, fields: ["id"] })).data.length

        const before = {
          region: await count("region"),
          product: await count("product"),
          variant: await count("product_variant"),
          collection: await count("product_collection"),
          apiKey: await count("api_key"),
          user: await count("user"),
          price: await count("price"),
          image: await count("product_image"),
        }
        expect(before.region).toBe(4)
        expect(before.product).toBe(5)
        expect(before.image).toBe(5)

        const second = await seedStore(container, {
          adminEmail: ADMIN_EMAIL,
          adminPassword: ADMIN_PASSWORD,
        })
        expect(second.created).toEqual({
          regions: [],
          collections: [],
          products: [],
          images: [],
          shippingProfile: false,
          salesChannel: false,
          publishableKey: false,
          adminUser: false,
        })
        expect(second.publishableKey).toBe(publishableKey)

        const after = {
          region: await count("region"),
          product: await count("product"),
          variant: await count("product_variant"),
          collection: await count("product_collection"),
          apiKey: await count("api_key"),
          user: await count("user"),
          price: await count("price"),
          image: await count("product_image"),
        }
        expect(after).toEqual(before)
      })
    })
  },
})
