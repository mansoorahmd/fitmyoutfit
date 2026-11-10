import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  updateProductsWorkflow,
  updateRegionsWorkflow,
  updateStoresWorkflow,
} from "@medusajs/medusa/core-flows"
import { readRushPercentage } from "../../src/lib/settings/rush-percentage"
import { seedData } from "../../src/scripts/seed-data"
import { seedStore } from "../../src/scripts/seed-lib/seed-store"

jest.setTimeout(300 * 1000)

const ADMIN_EMAIL = "seed-test-admin@example.com"
const ADMIN_PASSWORD = "seed-test-password"
const adminOptions = { adminEmail: ADMIN_EMAIL, adminPassword: ADMIN_PASSWORD, nodeEnv: "test" }

const regionCurrencies = Object.fromEntries(
  seedData.regions.data.map((r) => [r.name, r.currency_code])
)
const contractOrder = ["jersey", "t-shirt", "jacket", "fit-kit", "rush-add-on"]

/**
 * Everything the seed is responsible for, without ids (a repaired variant or price gets a new
 * id), in a stable order. Two stores with equal snapshots look the same to the storefront and
 * the admin.
 */
async function snapshot(container: MedusaContainer) {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const pricing = container.resolve(Modules.PRICING)
  const byKey = <T>(key: (t: T) => string) => (a: T, b: T) => key(a).localeCompare(key(b))

  const { data: stores } = await query.graph({
    entity: "store",
    fields: ["name", "metadata", "supported_currencies.currency_code", "supported_currencies.is_default"],
  })
  const store = (stores as any[]).map((s) => ({
    name: s.name,
    metadata: s.metadata,
    currencies: s.supported_currencies
      .map((c: any) => `${c.currency_code}${c.is_default ? "*" : ""}`)
      .sort(),
  }))

  const { data: regions } = await query.graph({
    entity: "region",
    fields: ["name", "currency_code", "metadata", "countries.iso_2", "payment_providers.id"],
  })
  const regionList = (regions as any[])
    .map((r) => ({
      name: r.name,
      currency_code: r.currency_code,
      metadata: r.metadata,
      countries: r.countries.map((c: any) => c.iso_2).sort(),
      payment_providers: (r.payment_providers ?? []).map((p: any) => p.id).sort(),
    }))
    .sort(byKey((r) => r.countries.join()))

  const { data: products } = await query.graph({
    entity: "product",
    fields: [
      "handle",
      "title",
      "status",
      "metadata",
      "thumbnail",
      "images.url",
      "collection.handle",
      "sales_channels.name",
      "shipping_profile.type",
      "options.title",
      "options.values.value",
      "options.values.rank",
      "variants.sku",
      "variants.title",
      "variants.variant_rank",
      "variants.manage_inventory",
      "variants.options.value",
      "variants.price_set.id",
      "variants.price_set.prices.currency_code",
      "variants.price_set.prices.amount",
    ],
  })
  const productList = (products as any[])
    .map((p) => ({
      handle: p.handle,
      title: p.title,
      status: p.status,
      metadata: p.metadata,
      thumbnail: p.thumbnail,
      images: (p.images ?? []).map((i: any) => i.url).sort(),
      collection: p.collection?.handle ?? null,
      sales_channels: (p.sales_channels ?? []).map((s: any) => s.name).sort(),
      shipping_profile: p.shipping_profile?.type ?? null,
      options: (p.options ?? [])
        .map((o: any) => ({
          title: o.title,
          values: o.values
            .map((v: any) => `${v.value}:${v.rank}`)
            .sort(),
        }))
        .sort(byKey((o: any) => o.title)),
      variants: (p.variants ?? [])
        .map((v: any) => ({
          sku: v.sku,
          title: v.title,
          variant_rank: v.variant_rank,
          manage_inventory: v.manage_inventory,
          options: (v.options ?? []).map((o: any) => o.value).sort(),
          // A variant without a price set cannot be priced in the admin later, even with no prices.
          has_price_set: !!v.price_set?.id,
          prices: (v.price_set?.prices ?? [])
            .map((pr: any) => `${pr.currency_code}:${pr.amount}`)
            .sort(),
        }))
        .sort(byKey((v: any) => v.sku)),
    }))
    .sort(byKey((p) => p.handle))

  const preferences = (await pricing.listPricePreferences({}))
    .map((p) => `${p.attribute}:${p.attribute === "region_id" ? "region" : p.value}`)
    .sort()

  const { data: keys } = await query.graph({
    entity: "api_key",
    fields: ["type", "sales_channels.name"],
    filters: { type: "publishable" },
  })
  const keyList = (keys as any[]).map((k) => (k.sales_channels ?? []).map((s: any) => s.name).sort())

  const users = (await container.resolve(Modules.USER).listUsers({})).map((u) => u.email).sort()

  return { store, regions: regionList, products: productList, preferences, keys: keyList, users }
}

medusaIntegrationTestRunner({
  testSuite: ({ api, getContainer }) => {
    describe("seed: placeholder store data", () => {
      let publishableKey: string
      let headers: Record<string, string>
      let firstRun: Awaited<ReturnType<typeof seedStore>>
      let clean: Awaited<ReturnType<typeof snapshot>>

      // The runner snapshots the database after this hook and restores it before every test,
      // so each test starts from the freshly seeded state.
      beforeAll(async () => {
        firstRun = await seedStore(getContainer(), adminOptions)
        publishableKey = firstRun.publishableKey
        headers = { "x-publishable-api-key": publishableKey }
        clean = await snapshot(getContainer())
      })

      const login = () =>
        api.post(
          "/auth/user/emailpass",
          { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
          { validateStatus: () => true }
        )

      // --- Store ---

      it("supports exactly pkr, gbp, aed and usd, with pkr the default (Medusa's eur removed)", async () => {
        const store = getContainer().resolve(Modules.STORE)
        const [record] = await store.listStores({}, { relations: ["supported_currencies"] })
        const supported = (record.supported_currencies ?? []).map((c) => c.currency_code)
        expect(supported.sort()).toEqual(["aed", "gbp", "pkr", "usd"])
        expect(record.supported_currencies?.find((c) => c.is_default)?.currency_code).toBe("pkr")
      })

      it("removes eur again from an already-seeded store that still has it", async () => {
        const container = getContainer()
        const storeModule = container.resolve(Modules.STORE)
        const [record] = await storeModule.listStores({})
        await updateStoresWorkflow(container).run({
          input: {
            selector: { id: record.id },
            update: {
              supported_currencies: [
                { currency_code: "eur", is_default: false },
                ...seedData.store.data.supported_currencies.map((currency_code) => ({
                  currency_code,
                  is_default: currency_code === "pkr",
                })),
              ],
            },
          },
        })
        await seedStore(container, adminOptions)
        const [after] = await storeModule.listStores({}, { relations: ["supported_currencies"] })
        expect((after.supported_currencies ?? []).map((c) => c.currency_code).sort()).toEqual([
          "aed",
          "gbp",
          "pkr",
          "usd",
        ])
      })

      it("names the store FitMyOutfit, and keeps a name an admin sets later", async () => {
        const container = getContainer()
        const storeModule = container.resolve(Modules.STORE)
        const [record] = await storeModule.listStores({})
        expect(record.name).toBe("FitMyOutfit")

        await updateStoresWorkflow(container).run({
          input: { selector: { id: record.id }, update: { name: "FitMyOutfit Lahore" } },
        })
        await seedStore(container, adminOptions)
        const [after] = await storeModule.listStores({})
        expect(after.name).toBe("FitMyOutfit Lahore")
      })

      it("stores rush_percentage 20 in the Store's metadata, readable by the settings module", async () => {
        expect(firstRun.created.settings).toEqual(["rush_percentage"])
        const storeModule = getContainer().resolve(Modules.STORE)
        const [store] = await storeModule.listStores({})
        expect(store.metadata).toMatchObject({ rush_percentage: 20 })
        expect(readRushPercentage(store.metadata)).toEqual({ ok: true, value: 20 })
      })

      it("keeps an admin's rush_percentage and other metadata on a re-run", async () => {
        const container = getContainer()
        const storeModule = container.resolve(Modules.STORE)
        const [store] = await storeModule.listStores({})
        await updateStoresWorkflow(container).run({
          input: {
            selector: { id: store.id },
            update: { metadata: { rush_percentage: 35, admin_note: "keep me" } },
          },
        })
        const rerun = await seedStore(container, adminOptions)
        expect(rerun.created.settings).toEqual([])
        const [after] = await storeModule.listStores({})
        expect(after.metadata).toMatchObject({ rush_percentage: 35, admin_note: "keep me" })
      })

      // --- Regions ---

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

      it("matches regions by country code: a region renamed in the admin survives a re-run", async () => {
        const container = getContainer()
        const regionModule = container.resolve(Modules.REGION)
        const [pakistan] = await regionModule.listRegions({ name: "Pakistan" })
        await updateRegionsWorkflow(container).run({
          input: { selector: { id: pakistan.id }, update: { name: "Pakistan (renamed)" } },
        })

        const rerun = await seedStore(container, adminOptions)
        expect(rerun.created.regions).toEqual([])
        const regions = await regionModule.listRegions({})
        expect(regions).toHaveLength(4)
        expect(regions.map((r) => r.name)).toContain("Pakistan (renamed)")
      })

      // --- Products ---

      it("lists the five products in the contract's order by default", async () => {
        const { data } = await api.get("/store/products?fields=handle", { headers })
        expect(data.products.map((p: any) => p.handle)).toEqual(contractOrder)
        const { data: garments } = await api.get(
          `/store/products?fields=handle&collection_id=${
            (await api.get("/store/collections?handle=garments", { headers })).data.collections[0].id
          }`,
          { headers }
        )
        expect(garments.products.map((p: any) => p.handle)).toEqual(["jersey", "t-shirt", "jacket"])
      })

      it("gives rush-add-on a variant with no fixed price, still listed by the store API", async () => {
        const { data: regionsRes } = await api.get("/store/regions", { headers })
        for (const region of regionsRes.regions) {
          const { data } = await api.get(
            `/store/products?handle=rush-add-on&region_id=${region.id}` +
              `&fields=handle,*variants,*variants.calculated_price`,
            { headers }
          )
          expect(data.products).toHaveLength(1)
          expect(data.products[0].variants).toHaveLength(1)
          expect(data.products[0].variants[0].calculated_price ?? null).toBeNull()
        }
        const query = getContainer().resolve(ContainerRegistrationKeys.QUERY)
        const { data: rows } = await query.graph({
          entity: "product_variant",
          fields: ["sku", "prices.id"],
          filters: { sku: "RUSH" },
        })
        expect((rows as any[])[0].prices ?? []).toHaveLength(0)
      })

      it("sets each product's placeholder image URLs from the seed data, first as the thumbnail", async () => {
        expect([...firstRun.created.images].sort()).toEqual([...contractOrder].sort())
        const { data } = await api.get("/store/products?fields=handle,thumbnail,*images", {
          headers,
        })
        expect(data.products).toHaveLength(5)
        for (const product of data.products) {
          const urls = seedData.products.data.find((p) => p.handle === product.handle)!.images.urls
          expect(product.thumbnail).toBe(urls[0])
          expect(product.images.map((i: any) => i.url)).toEqual(urls)
        }
        // The contract's first jersey photo, query string included (no network: only the stored URL).
        const jersey = data.products.find((p: any) => p.handle === "jersey")
        expect(jersey.thumbnail).toBe(
          "https://www.spized.com/thumbnail/4b/cb/26/1744736603/abc184bc-ffaa-6972-d8f4-67ad4c530dd0_784006_600x600.webp?ts=1793783716"
        )
        expect(jersey.images.map((i: any) => i.url)).toHaveLength(2)
      })

      it("gives a product without a picture its images again and never replaces an admin's photo", async () => {
        const container = getContainer()
        const productModule = container.resolve(Modules.PRODUCT)
        const [jersey] = await productModule.listProducts({ handle: "jersey" })
        const [jacket] = await productModule.listProducts({ handle: "jacket" })
        const [tshirt] = await productModule.listProducts({ handle: "t-shirt" })
        const adminPhoto = "https://example.com/real-jacket-photo.jpg"
        await updateProductsWorkflow(container).run({
          input: {
            products: [
              { id: jersey.id, thumbnail: null, images: [] },
              { id: jacket.id, thumbnail: adminPhoto, images: [{ url: adminPhoto }] },
              // Images uploaded in the admin, but no thumbnail chosen: still left alone.
              { id: tshirt.id, thumbnail: null, images: [{ url: adminPhoto }] },
            ],
          },
        })

        const rerun = await seedStore(container, adminOptions)
        expect(rerun.created.images).toEqual(["jersey"])

        const [jerseyAfter] = await productModule.listProducts(
          { handle: "jersey" },
          { relations: ["images"] }
        )
        expect(jerseyAfter.thumbnail).toBe(seedData.products.data[0].images.urls[0])
        expect(jerseyAfter.images?.map((i) => i.url)).toEqual(seedData.products.data[0].images.urls)
        const [jacketAfter] = await productModule.listProducts(
          { handle: "jacket" },
          { relations: ["images"] }
        )
        expect(jacketAfter.thumbnail).toBe(adminPhoto)
        expect(jacketAfter.images?.map((i) => i.url)).toEqual([adminPhoto])
        const [tshirtAfter] = await productModule.listProducts(
          { handle: "t-shirt" },
          { relations: ["images"] }
        )
        expect(tshirtAfter.thumbnail).toBeNull()
        expect(tshirtAfter.images?.map((i) => i.url)).toEqual([adminPhoto])
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

      it("stores the sizes in display order as option value ranks and variant ranks", async () => {
        const query = getContainer().resolve(ContainerRegistrationKeys.QUERY)
        for (const handle of ["jersey", "t-shirt", "jacket"]) {
          const { data } = await query.graph({
            entity: "product",
            fields: [
              "options.title",
              "options.values.value",
              "options.values.rank",
              "variants.title",
              "variants.variant_rank",
            ],
            filters: { handle },
          })
          const product = (data as any[])[0]
          const sizeOption = product.options.find((o: any) => o.title === "Size")
          const inRankOrder = [...sizeOption.values]
            .sort((a: any, b: any) => a.rank - b.rank)
            .map((v: any) => v.value)
          expect(inRankOrder).toEqual(seedData.sizes.data)
          const variantsInOrder = [...product.variants]
            .sort((a: any, b: any) => a.variant_rank - b.variant_rank)
            .map((v: any) => v.title)
          expect(variantsInOrder).toEqual(seedData.sizes.data)
        }
      })

      it("keeps the fit kit and rush add-on out of the garments collection but reachable by handle", async () => {
        const { data: all } = await api.get("/store/products?limit=50&fields=handle,metadata,collection_id", {
          headers,
        })
        expect(all.products.map((p: any) => p.handle).sort()).toEqual([...contractOrder].sort())
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

      // --- Admin user ---

      it("creates a local admin user that can log in", async () => {
        const response = await login()
        expect(response.status).toBe(200)
        expect(typeof response.data.token).toBe("string")
      })

      it("does not create the dev admin user when NODE_ENV is production", async () => {
        const container = getContainer()
        const result = await seedStore(container, {
          adminEmail: "prod-admin@example.com",
          adminPassword: "some-password",
          nodeEnv: "production",
        })
        expect(result.created.adminUser).toBe(false)
        const users = await container.resolve(Modules.USER).listUsers({
          email: "prod-admin@example.com",
        })
        expect(users).toHaveLength(0)
      })

      // --- Repairs after an interrupted run ---

      it("repairs size ranks an interrupted run left unset, so sizes come back in order", async () => {
        const container = getContainer()
        const pg = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        const { data } = await query.graph({
          entity: "product",
          fields: ["handle", "options.values.id", "variants.id"],
          filters: { handle: ["jersey", "t-shirt", "jacket"] },
        })
        const valueIds = (data as any[]).flatMap((p) => p.options.flatMap((o: any) => o.values.map((v: any) => v.id)))
        const variantIds = (data as any[]).flatMap((p) => p.variants.map((v: any) => v.id))
        // The state a run killed between product creation and ranking leaves.
        await pg("product_option_value").whereIn("id", valueIds).update({ rank: null })
        await pg("product_variant").whereIn("id", variantIds).update({ variant_rank: 0 })

        const rerun = await seedStore(container, adminOptions)
        expect(await snapshot(container)).toEqual(clean)
        expect(rerun.repaired).toEqual(
          expect.arrayContaining(["jersey: size ranks", "jersey: variant ranks", "jacket: size ranks"])
        )
      })

      it("repairs a product an interrupted run left without prices", async () => {
        const container = getContainer()
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        const link = container.resolve(ContainerRegistrationKeys.LINK)
        const pricing = container.resolve(Modules.PRICING)
        const { data } = await query.graph({
          entity: "product",
          fields: ["variants.id", "variants.price_set.id"],
          filters: { handle: "jersey" },
        })
        const variants = (data as any[])[0].variants
        // Half the variants lost their price set link, the other half have an empty price set.
        for (const [i, variant] of variants.entries()) {
          if (i % 2 === 0) {
            await link.dismiss({
              [Modules.PRODUCT]: { variant_id: variant.id },
              [Modules.PRICING]: { price_set_id: variant.price_set.id },
            })
            await pricing.deletePriceSets([variant.price_set.id])
          } else {
            const prices = await pricing.listPrices({ price_set_id: [variant.price_set.id] })
            await pricing.removePrices(prices.map((p) => p.id))
          }
        }

        const { data: regions } = await api.get("/store/regions", { headers })
        const pakistan = regions.regions.find((r: any) => r.currency_code === "pkr")
        const priced = async () =>
          (
            await api.get(
              `/store/products?handle=jersey&region_id=${pakistan.id}&fields=*variants.calculated_price`,
              { headers }
            )
          ).data.products[0].variants.map((v: any) => v.calculated_price?.calculated_amount ?? null)
        expect((await priced()).filter((amount: unknown) => amount === null).length).toBe(11)

        const rerun = await seedStore(container, adminOptions)
        expect(await priced()).toEqual(Array(11).fill(3500))
        expect(await snapshot(container)).toEqual(clean)
        expect(rerun.repaired).toEqual(["jersey: prices"])
      })

      it("gives the rush variant back the empty price set a clean run gives it", async () => {
        const container = getContainer()
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        const link = container.resolve(ContainerRegistrationKeys.LINK)
        const { data } = await query.graph({
          entity: "product_variant",
          fields: ["id", "price_set.id"],
          filters: { sku: "RUSH" },
        })
        const rush = (data as any[])[0]
        expect(rush.price_set?.id).toBeTruthy()
        await link.dismiss({
          [Modules.PRODUCT]: { variant_id: rush.id },
          [Modules.PRICING]: { price_set_id: rush.price_set.id },
        })

        const rerun = await seedStore(container, adminOptions)
        expect(await snapshot(container)).toEqual(clean)
        expect(rerun.repaired).toEqual(["rush-add-on: price set"])
      })

      it("repairs a product an interrupted run left without variants or links", async () => {
        const container = getContainer()
        const productModule = container.resolve(Modules.PRODUCT)
        const link = container.resolve(ContainerRegistrationKeys.LINK)
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        const { data } = await query.graph({
          entity: "product",
          fields: ["id", "variants.id", "sales_channels.id", "shipping_profile.id"],
          filters: { handle: "t-shirt" },
        })
        const tshirt = (data as any[])[0]
        // The state a run killed right after the product step of create-products leaves.
        await productModule.deleteProductVariants(tshirt.variants.map((v: any) => v.id))
        await link.dismiss({
          [Modules.PRODUCT]: { product_id: tshirt.id },
          [Modules.SALES_CHANNEL]: { sales_channel_id: tshirt.sales_channels[0].id },
        })
        await link.dismiss({
          [Modules.PRODUCT]: { product_id: tshirt.id },
          [Modules.FULFILLMENT]: { shipping_profile_id: tshirt.shipping_profile.id },
        })
        // (Checked through query, not the store API, which may answer from its cache.)
        const { data: broken } = await query.graph({
          entity: "product",
          fields: ["variants.id", "sales_channels.id", "shipping_profile.id"],
          filters: { handle: "t-shirt" },
        })
        expect((broken as any[])[0].variants ?? []).toHaveLength(0)
        expect((broken as any[])[0].sales_channels ?? []).toHaveLength(0)
        expect((broken as any[])[0].shipping_profile ?? null).toBeNull()

        const rerun = await seedStore(container, adminOptions)
        expect(rerun.created.products).toEqual([])
        expect(await snapshot(container)).toEqual(clean)
        const { data: after } = await api.get("/store/products?fields=handle", { headers })
        expect(after.products.map((p: any) => p.handle)).toEqual(contractOrder)
        expect(rerun.repaired).toEqual(
          expect.arrayContaining([
            "t-shirt: variants",
            "t-shirt: sales channel",
            "t-shirt: shipping profile",
          ])
        )
      })

      it("repairs an admin user an interrupted run left without its login", async () => {
        const container = getContainer()
        const auth = container.resolve(Modules.AUTH)
        const [identity] = await auth.listProviderIdentities({
          entity_id: ADMIN_EMAIL,
          provider: "emailpass",
        })
        await auth.deleteProviderIdentities([identity.id])
        await auth.deleteAuthIdentities([identity.auth_identity_id as string])
        expect((await login()).status).toBe(401)

        const rerun = await seedStore(container, adminOptions)
        const response = await login()
        expect(response.status).toBe(200)
        expect(typeof response.data.token).toBe("string")
        expect(rerun.created.adminUser).toBe(false)
        expect(rerun.repaired).toEqual(["admin user: login"])
      })

      it("repairs regions and currencies an interrupted run left without provider or price preferences", async () => {
        const container = getContainer()
        const regionModule = container.resolve(Modules.REGION)
        const pricing = container.resolve(Modules.PRICING)
        const [pakistan] = await regionModule.listRegions({ name: "Pakistan" })
        await updateRegionsWorkflow(container).run({
          input: { selector: { id: pakistan.id }, update: { payment_providers: [] } },
        })
        const preferences = await pricing.listPricePreferences({
          value: [pakistan.id, "gbp"],
        })
        expect(preferences).toHaveLength(2)
        await pricing.deletePricePreferences(preferences.map((p) => p.id))

        const rerun = await seedStore(container, adminOptions)
        expect(await snapshot(container)).toEqual(clean)
        expect(rerun.repaired).toEqual(
          expect.arrayContaining([
            "region Pakistan: payment provider",
            "region Pakistan: price preference",
            "store: currencies pkr, gbp, aed, usd",
          ])
        )
      })

      it("ends in the same state as a clean run after every kind of interruption at once", async () => {
        const container = getContainer()
        const pg = container.resolve(ContainerRegistrationKeys.PG_CONNECTION)
        const productModule = container.resolve(Modules.PRODUCT)
        const auth = container.resolve(Modules.AUTH)
        const link = container.resolve(ContainerRegistrationKeys.LINK)
        const query = container.resolve(ContainerRegistrationKeys.QUERY)

        const { data } = await query.graph({
          entity: "product",
          fields: ["id", "handle", "options.values.id", "variants.id", "variants.price_set.id", "sales_channels.id"],
          filters: { handle: contractOrder },
        })
        const rows = data as any[]
        const jacket = rows.find((p) => p.handle === "jacket")
        await pg("product_option_value")
          .whereIn("id", jacket.options.flatMap((o: any) => o.values.map((v: any) => v.id)))
          .update({ rank: null })
        const fitKit = rows.find((p) => p.handle === "fit-kit")
        await link.dismiss({
          [Modules.PRODUCT]: { variant_id: fitKit.variants[0].id },
          [Modules.PRICING]: { price_set_id: fitKit.variants[0].price_set.id },
        })
        const rush = rows.find((p) => p.handle === "rush-add-on")
        await productModule.deleteProductVariants(rush.variants.map((v: any) => v.id))
        await link.dismiss({
          [Modules.PRODUCT]: { product_id: rush.id },
          [Modules.SALES_CHANNEL]: { sales_channel_id: rush.sales_channels[0].id },
        })
        const jersey = rows.find((p) => p.handle === "jersey")
        await updateProductsWorkflow(container).run({
          input: { products: [{ id: jersey.id, thumbnail: null, images: [] }] },
        })
        const [identity] = await auth.listProviderIdentities({ entity_id: ADMIN_EMAIL })
        await auth.deleteProviderIdentities([identity.id])
        await auth.deleteAuthIdentities([identity.auth_identity_id as string])

        await seedStore(container, adminOptions)
        expect(await snapshot(container)).toEqual(clean)
        expect((await login()).status).toBe(200)
        const third = await seedStore(container, adminOptions)
        expect(third.repaired).toEqual([])
      })

      // --- Idempotency ---

      it("is idempotent: a second run creates and repairs nothing and changes no counts", async () => {
        const container = getContainer()
        const query = container.resolve(ContainerRegistrationKeys.QUERY)
        const count = async (entity: string) =>
          (await query.graph({ entity, fields: ["id"] })).data.length

        const counts = async () => ({
          region: await count("region"),
          product: await count("product"),
          variant: await count("product_variant"),
          collection: await count("product_collection"),
          apiKey: await count("api_key"),
          user: await count("user"),
          price: await count("price"),
          image: await count("product_image"),
        })
        const before = await counts()
        expect(before.region).toBe(4)
        expect(before.product).toBe(5)
        expect(before.image).toBe(9)

        const second = await seedStore(container, adminOptions)
        expect(second.created).toEqual({
          regions: [],
          settings: [],
          collections: [],
          products: [],
          images: [],
          shippingProfile: false,
          salesChannel: false,
          publishableKey: false,
          adminUser: false,
        })
        expect(second.repaired).toEqual([])
        expect(second.publishableKey).toBe(publishableKey)
        expect(await counts()).toEqual(before)
        expect(await snapshot(container)).toEqual(clean)
      })
    })
  },
})
