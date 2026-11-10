/**
 * Idempotent seed of the placeholder store data. Thin: it reads the data files, asks Medusa
 * what already exists, and creates only what is missing. It never overwrites or deletes
 * existing records, so values edited in the admin survive a re-run. The one repair it makes:
 * a seeded product with no picture at all gets its placeholder image.
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { MedusaContainer } from "@medusajs/framework/types"
import { MedusaModule } from "@medusajs/framework/modules-sdk"
import {
  ContainerRegistrationKeys,
  Modules,
  RBAC_SUPER_ADMIN_ROLE_ID,
} from "@medusajs/framework/utils"
import {
  createApiKeysWorkflow,
  createCollectionsWorkflow,
  createProductsWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  createShippingProfilesWorkflow,
  createUsersWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  updateProductsWorkflow,
  updateStoresWorkflow,
  uploadFilesWorkflow,
} from "@medusajs/medusa/core-flows"
import { SEED_IMAGES_DIR, seedData as defaultSeedData } from "../seed-data"
import type { SeedData } from "../seed-data/types"
import { buildProductInput, buildSizeRanks, SIZE_OPTION } from "./build-product-input"
import { imageMimeType, planPlaceholderImages, type ExistingProduct } from "./product-images"
import { missingStoreSettings } from "./store-settings"
import { assertValidSeedData } from "./validate-seed-data"

export type SeedOptions = {
  seedData?: SeedData
  /** Local admin user. Skipped (with a warning) when either value is missing. */
  adminEmail?: string
  adminPassword?: string
  /** Folder with the product image files. Defaults to seed-data/images. */
  imagesDir?: string
}

export type SeedResult = {
  publishableKey: string
  created: {
    regions: string[]
    /** Store metadata settings written in this run (only ones that were missing). */
    settings: string[]
    collections: string[]
    products: string[]
    /** Handles of the products that got their placeholder image in this run. */
    images: string[]
    shippingProfile: boolean
    salesChannel: boolean
    publishableKey: boolean
    adminUser: boolean
  }
}

export async function seedStore(
  container: MedusaContainer,
  options: SeedOptions = {}
): Promise<SeedResult> {
  const seed = options.seedData ?? defaultSeedData
  const imagesDir = options.imagesDir ?? SEED_IMAGES_DIR
  assertValidSeedData(seed, { imageExists: (file) => existsSync(join(imagesDir, file)) })

  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const storeModule = container.resolve(Modules.STORE)
  const salesChannelModule = container.resolve(Modules.SALES_CHANNEL)
  const regionModule = container.resolve(Modules.REGION)
  const fulfillmentModule = container.resolve(Modules.FULFILLMENT)
  const productModule = container.resolve(Modules.PRODUCT)

  const store = seed.store.data
  const created: SeedResult["created"] = {
    regions: [],
    settings: [],
    collections: [],
    products: [],
    images: [],
    shippingProfile: false,
    salesChannel: false,
    publishableKey: false,
    adminUser: false,
  }

  // 1. Default sales channel
  let [salesChannel] = await salesChannelModule.listSalesChannels({
    name: store.default_sales_channel_name,
  })
  if (!salesChannel) {
    const { result } = await createSalesChannelsWorkflow(container).run({
      input: { salesChannelsData: [{ name: store.default_sales_channel_name }] },
    })
    salesChannel = result[0]
    created.salesChannel = true
  }

  // 2. Store currencies (keep any the admin added) and default sales channel
  const [storeRecord] = await storeModule.listStores(
    {},
    { relations: ["supported_currencies"] }
  )
  const existingCurrencies = storeRecord.supported_currencies ?? []
  const wanted = new Set([
    ...existingCurrencies.map((c) => c.currency_code),
    ...store.supported_currencies,
  ])
  const currencyList = [...wanted].map((currency_code) => ({
    currency_code,
    is_default: currency_code === store.default_currency_code,
  }))
  const currenciesUpToDate =
    currencyList.length === existingCurrencies.length &&
    currencyList.every((c) =>
      existingCurrencies.some(
        (e) => e.currency_code === c.currency_code && !!e.is_default === c.is_default
      )
    )
  if (!currenciesUpToDate || storeRecord.default_sales_channel_id !== salesChannel.id) {
    await updateStoresWorkflow(container).run({
      input: {
        selector: { id: storeRecord.id },
        update: {
          supported_currencies: currencyList,
          default_sales_channel_id: salesChannel.id,
        },
      },
    })
  }

  // 2b. Store-wide settings (rush_percentage, ...) in the Store's metadata, which an admin edits
  // in Settings > Store > Metadata. Only keys that are missing are written; existing values,
  // including other metadata keys, are kept.
  const missingSettings = missingStoreSettings(storeRecord.metadata, seed.settings.data)
  if (Object.keys(missingSettings).length > 0) {
    await updateStoresWorkflow(container).run({
      input: {
        selector: { id: storeRecord.id },
        update: { metadata: { ...(storeRecord.metadata ?? {}), ...missingSettings } },
      },
    })
    created.settings = Object.keys(missingSettings)
  }

  // 3. Regions
  const existingRegions = await regionModule.listRegions({
    name: { $in: seed.regions.data.map((r) => r.name) },
  })
  const existingRegionNames = new Set(existingRegions.map((r) => r.name))
  const missingRegions = seed.regions.data.filter((r) => !existingRegionNames.has(r.name))
  if (missingRegions.length > 0) {
    await createRegionsWorkflow(container).run({
      input: {
        regions: missingRegions.map((region) => ({
          name: region.name,
          currency_code: region.currency_code,
          countries: region.country_codes,
          metadata: region.metadata,
          payment_providers: ["pp_system_default"],
        })),
      },
    })
    created.regions = missingRegions.map((r) => r.name)
  }

  // 4. Default shipping profile (products need one; shipping options come in Sprint 1)
  const shippingProfiles = await fulfillmentModule.listShippingProfiles({ type: "default" })
  let shippingProfile = shippingProfiles[0]
  if (!shippingProfile) {
    const { result } = await createShippingProfilesWorkflow(container).run({
      input: { data: [{ name: "Default Shipping Profile", type: "default" }] },
    })
    shippingProfile = result[0]
    created.shippingProfile = true
  }

  // 5. Collections
  const collectionIds = new Map<string, string>()
  const existingCollections = await productModule.listProductCollections({
    handle: seed.collections.data.map((c) => c.handle),
  })
  for (const collection of existingCollections) {
    collectionIds.set(collection.handle, collection.id)
  }
  const missingCollections = seed.collections.data.filter((c) => !collectionIds.has(c.handle))
  if (missingCollections.length > 0) {
    const { result } = await createCollectionsWorkflow(container).run({
      input: { collections: missingCollections },
    })
    for (const collection of result) {
      collectionIds.set(collection.handle, collection.id)
    }
    created.collections = missingCollections.map((c) => c.handle)
  }

  // 6. Products (only the ones whose handle does not exist yet)
  const existingProducts = await productModule.listProducts({
    handle: seed.products.data.map((p) => p.handle),
  })
  const existingHandles = new Set(existingProducts.map((p) => p.handle))
  const missingProducts = seed.products.data.filter((p) => !existingHandles.has(p.handle))
  if (missingProducts.length > 0) {
    await createProductsWorkflow(container).run({
      input: {
        products: missingProducts.map((product) =>
          buildProductInput(product, {
            sizes: seed.sizes.data,
            prices: seed.prices.data,
            currencies: store.supported_currencies,
            collectionId: product.collection_handle
              ? collectionIds.get(product.collection_handle)
              : undefined,
            shippingProfileId: shippingProfile.id,
            salesChannelId: salesChannel.id,
          })
        ),
      },
    })
    created.products = missingProducts.map((p) => p.handle)

    // Keep the sizes in display order (YS ... 3XL). Only for products created in this run.
    const sizedHandles = missingProducts.filter((p) => p.has_sizes).map((p) => p.handle)
    const createdProducts = await productModule.listProducts(
      { handle: sizedHandles },
      { relations: ["options"] }
    )
    const ranks = buildSizeRanks(seed.sizes.data)
    for (const product of createdProducts) {
      const sizeOption = product.options?.find((o) => o.title === SIZE_OPTION)
      if (sizeOption) {
        await productModule.updateProductOptions(sizeOption.id, { ranks })
      }
    }
  }

  // 6b. Placeholder images. Uploaded through the file module, the same path an admin upload
  // takes (MinIO in local dev; Medusa's local file provider when S3 is not configured), and
  // linked to every seeded product that has no thumbnail and no images. A product that has a
  // picture is left alone, and nothing is uploaded for it.
  const { data: pictureRows } = await query.graph({
    entity: "product",
    fields: ["id", "handle", "thumbnail", "images.id"],
    filters: { handle: seed.products.data.map((p) => p.handle) },
  })
  const imagePlan = planPlaceholderImages(
    pictureRows as unknown as ExistingProduct[],
    seed.products.data
  )
  for (const entry of imagePlan) {
    const { result: files } = await uploadFilesWorkflow(container).run({
      input: {
        files: [
          {
            filename: entry.image,
            mimeType: imageMimeType(entry.image) as string,
            content: readFileSync(join(imagesDir, entry.image)).toString("base64"),
            access: "public",
          },
        ],
      },
    })
    const url = files[0].url
    await updateProductsWorkflow(container).run({
      input: { products: [{ id: entry.productId, thumbnail: url, images: [{ url }] }] },
    })
    created.images.push(entry.handle)
  }

  // 7. Publishable API key, linked to the default sales channel. Medusa's migrations already create
  // a "Default Publishable API Key" linked to the default channel, so reuse an existing key
  // (preferring one already linked) and only create one when the store has none.
  // (Own record type: the generated query types exist only after `medusa build`, and this must
  // type-check both with and without them.)
  type KeyRecord = {
    id: string
    token: string
    revoked_at?: unknown
    sales_channels?: ({ id: string } | null)[] | null
  }
  const { data: keyRows } = await query.graph({
    entity: "api_key",
    fields: ["id", "token", "title", "revoked_at", "sales_channels.id"],
    filters: { type: "publishable" },
  })
  const keys = keyRows as unknown as KeyRecord[]
  const isLinked = (k: KeyRecord) =>
    (k.sales_channels ?? []).some((channel) => channel?.id === salesChannel.id)
  const usableKeys = keys.filter((k) => !k.revoked_at)
  let key: KeyRecord | undefined = usableKeys.find(isLinked) ?? usableKeys[0]
  if (!key) {
    const { result } = await createApiKeysWorkflow(container).run({
      input: {
        api_keys: [{ title: store.publishable_key_title, type: "publishable", created_by: "" }],
      },
    })
    key = { id: result[0].id, token: result[0].token, sales_channels: [] }
    created.publishableKey = true
  }
  if (!isLinked(key)) {
    await linkSalesChannelsToApiKeyWorkflow(container).run({
      input: { id: key.id, add: [salesChannel.id] },
    })
  }

  // 8. Local admin user
  if (options.adminEmail && options.adminPassword) {
    created.adminUser = await ensureAdminUser(
      container,
      options.adminEmail,
      options.adminPassword
    )
  } else {
    logger.warn(
      "MEDUSA_ADMIN_EMAIL or MEDUSA_ADMIN_PASSWORD is not set: skipping the admin user."
    )
  }

  logger.info(
    `Seed done. Created: ${JSON.stringify(created)}. (Anything not listed already existed.)`
  )
  return { publishableKey: key.token as string, created }
}

async function ensureAdminUser(
  container: MedusaContainer,
  email: string,
  password: string
): Promise<boolean> {
  const userModule = container.resolve(Modules.USER)
  const [existing] = await userModule.listUsers({ email })
  if (existing) {
    return false
  }

  // Same steps as `medusa user -e ... -p ...`: create the user, then an emailpass identity linked to it.
  const authModule = container.resolve(Modules.AUTH)
  const roles = MedusaModule.isInstalled(Modules.RBAC)
    ? [{ role_id: RBAC_SUPER_ADMIN_ROLE_ID }]
    : []
  const { result: users } = await createUsersWorkflow(container).run({
    input: { users: [{ email, roles }] },
  })
  const { authIdentity, error } = await authModule.register("emailpass", {
    body: { email, password },
  })
  if (error || !authIdentity) {
    throw new Error(`Could not create the admin login: ${error ?? "unknown error"}`)
  }
  await authModule.updateAuthIdentities({
    id: authIdentity.id,
    app_metadata: { user_id: users[0].id },
  })
  return true
}
