/**
 * Idempotent seed of the placeholder store data. Thin: it reads the data files, asks Medusa
 * what already exists, lets the plain planning modules decide what is missing, and applies that.
 *
 * Safe to run again after a run that stopped half-way: every step checks the parts a
 * Medusa workflow writes separately (variants, prices, size ranks, links, payment providers,
 * the admin's login), not only whether a record with the handle or name exists.
 * It never overwrites a value an admin can edit, with these deliberate exceptions: the seed
 * currencies are always supported with pkr as the only default, Medusa's starter currency eur is
 * removed when no region uses it, and a store still named "Medusa Store" is renamed.
 */
import type { MedusaContainer } from "@medusajs/framework/types"
import { MedusaModule } from "@medusajs/framework/modules-sdk"
import {
  ContainerRegistrationKeys,
  generateEntityId,
  Modules,
  RBAC_SUPER_ADMIN_ROLE_ID,
} from "@medusajs/framework/utils"
import {
  createApiKeysWorkflow,
  createCollectionsWorkflow,
  createPricePreferencesWorkflow,
  createProductsWorkflow,
  createProductVariantsWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  createShippingProfilesWorkflow,
  createUsersWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  updateProductsWorkflow,
  updateRegionsWorkflow,
  updateStoresWorkflow,
  upsertVariantPricesWorkflow,
} from "@medusajs/medusa/core-flows"
import { describeNodeEnv } from "../../lib/config/node-env"
import { seedData as defaultSeedData } from "../seed-data"
import type { SeedData } from "../seed-data/types"
import { planAdminUser, type AdminUserPlan } from "./admin-user-plan"
import { buildProductInput } from "./build-product-input"
import { planPlaceholderImages, type ExistingProduct } from "./product-images"
import {
  describeRepair,
  orderedIds,
  planProductRepair,
  type ExistingSeededProduct,
} from "./product-repair-plan"
import { DEFAULT_PAYMENT_PROVIDER, planRegions, type ExistingRegion } from "./region-plan"
import { planStoreCurrencies, planStoreName } from "./store-plan"
import { missingStoreSettings } from "./store-settings"
import { assertValidSeedData } from "./validate-seed-data"

export type SeedOptions = {
  seedData?: SeedData
  /** Local admin user. Skipped (with a warning) when either value is missing. */
  adminEmail?: string
  adminPassword?: string
  /** NODE_ENV. The dev admin user is created only when it is unset, development or test. */
  nodeEnv?: string
}

export type SeedResult = {
  publishableKey: string
  created: {
    /** Names (from the seed data) of the regions created in this run. */
    regions: string[]
    /** Store metadata settings written in this run (only ones that were missing). */
    settings: string[]
    collections: string[]
    products: string[]
    /** Handles of the products that got their placeholder images in this run. */
    images: string[]
    shippingProfile: boolean
    salesChannel: boolean
    publishableKey: boolean
    adminUser: boolean
  }
  /**
   * What this run completed on records an earlier, interrupted run left half-made, or that
   * needed bringing in line with the seed data (currencies, store name). Empty on a re-run of a
   * complete store.
   */
  repaired: string[]
}

export async function seedStore(
  container: MedusaContainer,
  options: SeedOptions = {}
): Promise<SeedResult> {
  const seed = options.seedData ?? defaultSeedData
  assertValidSeedData(seed)

  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const storeModule = container.resolve(Modules.STORE)
  const salesChannelModule = container.resolve(Modules.SALES_CHANNEL)
  const fulfillmentModule = container.resolve(Modules.FULFILLMENT)
  const productModule = container.resolve(Modules.PRODUCT)
  const pricingModule = container.resolve(Modules.PRICING)

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
  const repaired: string[] = []

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

  // 2. Store: the seed currencies (with their price preferences) and any an admin added, the
  // default sales channel, the name. Medusa's starter eur goes, unless a region uses it.
  const [storeRecord] = await storeModule.listStores(
    {},
    { relations: ["supported_currencies"] }
  )
  const currencyPreferences = await pricingModule.listPricePreferences({
    attribute: "currency_code",
    value: store.supported_currencies,
  })
  const { data: regionCurrencyRows } = await query.graph({
    entity: "region",
    fields: ["currency_code"],
  })
  const currencyList = planStoreCurrencies(storeRecord.supported_currencies, {
    wanted: store.supported_currencies,
    defaultCode: store.default_currency_code,
    regionCurrencies: (regionCurrencyRows as { currency_code?: string | null }[]).map(
      (r) => r.currency_code
    ),
    withPricePreference: currencyPreferences.map((p) => p.value),
  })
  const newName = planStoreName(storeRecord.name, store.name)
  const channelWrong = storeRecord.default_sales_channel_id !== salesChannel.id
  if (currencyList || newName || channelWrong) {
    await updateStoresWorkflow(container).run({
      input: {
        selector: { id: storeRecord.id },
        update: {
          ...(currencyList ? { supported_currencies: currencyList } : {}),
          ...(newName ? { name: newName } : {}),
          default_sales_channel_id: salesChannel.id,
        },
      },
    })
    if (currencyList) {
      repaired.push(`store: currencies ${currencyList.map((c) => c.currency_code).join(", ")}`)
    }
    if (newName) repaired.push(`store: name "${newName}"`)
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

  // 3. Regions, matched by country code (an admin may rename them)
  await seedRegions(container, seed, created, repaired)

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

  // 6. Products whose handle does not exist yet. Their ids are chosen so that they sort in seed
  // order, which is the store API's default listing order.
  const existingProducts = await productModule.listProducts({
    handle: seed.products.data.map((p) => p.handle),
  })
  const existingHandles = new Set(existingProducts.map((p) => p.handle))
  const missingProducts = seed.products.data.filter((p) => !existingHandles.has(p.handle))
  if (missingProducts.length > 0) {
    const ids = orderedIds(missingProducts.length, () => generateEntityId(undefined, "prod"))
    await createProductsWorkflow(container).run({
      input: {
        products: missingProducts.map((product, index) =>
          buildProductInput(product, {
            id: ids[index],
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
  }

  // 6b. Complete every seeded product: variants, prices, size ranks, sales channel and shipping
  // profile. For a product created just now this sets the size ranks (Medusa ignores ranks
  // passed at creation); for one an interrupted run left half-made it fills in the rest.
  const { data: productRows } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "handle",
      "options.id",
      "options.title",
      "options.values.value",
      "options.values.rank",
      "variants.id",
      "variants.title",
      "variants.variant_rank",
      "variants.options.value",
      "variants.price_set.id",
      "variants.price_set.prices.id",
      "sales_channels.id",
      "shipping_profile.id",
    ],
    filters: { handle: seed.products.data.map((p) => p.handle) },
  })
  for (const row of productRows as unknown as ExistingSeededProduct[]) {
    const productSeed = seed.products.data.find((p) => p.handle === row.handle)
    if (!productSeed) {
      continue
    }
    const repair = planProductRepair(row, productSeed, {
      sizes: seed.sizes.data,
      prices: seed.prices.data,
      currencies: store.supported_currencies,
      salesChannelId: salesChannel.id,
      shippingProfileId: shippingProfile.id,
    })
    if (repair.createVariants.length > 0) {
      await createProductVariantsWorkflow(container).run({
        input: { product_variants: repair.createVariants },
      })
    }
    if (repair.sizeRanks) {
      await productModule.updateProductOptions(repair.sizeRanks.optionId, {
        ranks: repair.sizeRanks.ranks,
      })
    }
    for (const { id, variant_rank } of repair.variantRanks) {
      // variant_rank is a column of the variant (the admin API sets it), but the update type
      // does not list it.
      await productModule.updateProductVariants(id, { variant_rank } as Record<string, unknown>)
    }
    const withoutPriceSet = repair.prices.filter((p) => !p.priceSetId)
    if (withoutPriceSet.length > 0) {
      await upsertVariantPricesWorkflow(container).run({
        input: {
          variantPrices: withoutPriceSet.map((p) => ({
            variant_id: p.variantId,
            product_id: row.id,
            prices: p.prices,
          })),
          previousVariantIds: [],
        },
      })
    }
    for (const p of repair.prices.filter((entry) => entry.priceSetId)) {
      await pricingModule.addPrices({ priceSetId: p.priceSetId as string, prices: p.prices })
    }
    if (repair.linkSalesChannel || repair.linkShippingProfile) {
      await updateProductsWorkflow(container).run({
        input: {
          products: [
            {
              id: row.id,
              ...(repair.linkSalesChannel ? { sales_channels: [{ id: salesChannel.id }] } : {}),
              ...(repair.linkShippingProfile ? { shipping_profile_id: shippingProfile.id } : {}),
            },
          ],
        },
      })
    }
    // Setting the size ranks of a product created in this run is part of creating it.
    if (!created.products.includes(row.handle)) {
      repaired.push(...describeRepair(repair))
    }
  }

  // 6c. Placeholder images: web URLs from the seed data, set on every seeded product that has no
  // thumbnail and no images. A product with a picture (for example one set in the admin) is left
  // alone. Nothing is downloaded or uploaded.
  const { data: pictureRows } = await query.graph({
    entity: "product",
    fields: ["id", "handle", "thumbnail", "images.id"],
    filters: { handle: seed.products.data.map((p) => p.handle) },
  })
  const imagePlan = planPlaceholderImages(
    pictureRows as unknown as ExistingProduct[],
    seed.products.data
  )
  if (imagePlan.length > 0) {
    await updateProductsWorkflow(container).run({
      input: {
        products: imagePlan.map((entry) => ({
          id: entry.productId,
          thumbnail: entry.thumbnail,
          images: entry.images,
        })),
      },
    })
    created.images = imagePlan.map((entry) => entry.handle)
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
    if (!created.publishableKey) repaired.push("publishable key: sales channel")
  }

  // 8. Local admin user (never in production)
  if (options.adminEmail && options.adminPassword) {
    const outcome = await ensureAdminUser(
      container,
      options.adminEmail,
      options.adminPassword,
      options.nodeEnv
    )
    if (outcome.skip === "not-local") {
      logger.info(
        `NODE_ENV is ${describeNodeEnv(options.nodeEnv)}, not development or test: ` +
          "the dev admin user is not created."
      )
    } else {
      created.adminUser = outcome.createUser
      if (!outcome.createUser && (outcome.createLogin || outcome.link)) {
        repaired.push("admin user: login")
      }
    }
  } else {
    logger.warn(
      "MEDUSA_ADMIN_EMAIL or MEDUSA_ADMIN_PASSWORD is not set: skipping the admin user."
    )
  }

  logger.info(
    `Seed done. Created: ${JSON.stringify(created)}. Repaired: ${JSON.stringify(repaired)}. ` +
      "(Anything not listed already existed.)"
  )
  return { publishableKey: key.token as string, created, repaired }
}

async function seedRegions(
  container: MedusaContainer,
  seed: SeedData,
  created: SeedResult["created"],
  repaired: string[]
): Promise<void> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const pricingModule = container.resolve(Modules.PRICING)

  const { data: regionRows } = await query.graph({
    entity: "region",
    fields: ["id", "name", "countries.iso_2", "payment_providers.id"],
  })
  const plan = planRegions(regionRows as unknown as ExistingRegion[], seed.regions.data)

  if (plan.create.length > 0) {
    await createRegionsWorkflow(container).run({
      input: {
        regions: plan.create.map((region) => ({
          name: region.name,
          currency_code: region.currency_code,
          countries: region.country_codes,
          metadata: region.metadata,
          payment_providers: [DEFAULT_PAYMENT_PROVIDER],
        })),
      },
    })
    created.regions = plan.create.map((r) => r.name)
  }

  for (const entry of plan.linkPaymentProvider) {
    await updateRegionsWorkflow(container).run({
      input: {
        selector: { id: entry.regionId },
        update: { payment_providers: [DEFAULT_PAYMENT_PROVIDER] },
      },
    })
    repaired.push(`region ${entry.seedName}: payment provider`)
  }

  // Each region has a price preference (tax-inclusive or not), written by the same workflow
  // after the region itself. Give one to a seed region that lacks it.
  const { data: seedRegionRows } = await query.graph({
    entity: "region",
    fields: ["id", "name", "countries.iso_2"],
  })
  const seedCountries = new Set(seed.regions.data.flatMap((r) => r.country_codes))
  const seedRegionIds = (seedRegionRows as unknown as Required<ExistingRegion>[])
    .filter((r) => (r.countries ?? []).some((c) => !!c?.iso_2 && seedCountries.has(c.iso_2)))
    .map((r) => ({ id: r.id, name: r.name }))
  if (seedRegionIds.length === 0) {
    return
  }
  const preferences = await pricingModule.listPricePreferences({
    attribute: "region_id",
    value: seedRegionIds.map((r) => r.id),
  })
  const withPreference = new Set(preferences.map((p) => p.value))
  const lacking = seedRegionIds.filter((r) => !withPreference.has(r.id))
  if (lacking.length > 0) {
    await createPricePreferencesWorkflow(container).run({
      input: lacking.map((r) => ({ attribute: "region_id", value: r.id })),
    })
    if (!lacking.every((r) => created.regions.includes(r.name ?? ""))) {
      repaired.push(...lacking.map((r) => `region ${r.name}: price preference`))
    }
  }
}

async function ensureAdminUser(
  container: MedusaContainer,
  email: string,
  password: string,
  nodeEnv: string | undefined
): Promise<AdminUserPlan> {
  const userModule = container.resolve(Modules.USER)
  const authModule = container.resolve(Modules.AUTH)

  const [user] = await userModule.listUsers({ email })
  const [providerIdentity] = await authModule.listProviderIdentities(
    { entity_id: email, provider: "emailpass" },
    { relations: ["auth_identity"] }
  )
  const authIdentity = providerIdentity?.auth_identity
  const linkedUserId = (authIdentity?.app_metadata?.user_id as string | undefined) ?? null

  const plan = planAdminUser(
    {
      userId: user?.id ?? null,
      authIdentityId: providerIdentity?.auth_identity_id ?? null,
      linkedUserId,
    },
    nodeEnv
  )
  if (plan.skip !== null) {
    return plan
  }

  // Same steps as `medusa user -e ... -p ...`: create the user, then an emailpass identity linked to it.
  let userId = user?.id
  if (plan.createUser) {
    const roles = MedusaModule.isInstalled(Modules.RBAC)
      ? [{ role_id: RBAC_SUPER_ADMIN_ROLE_ID }]
      : []
    const { result: users } = await createUsersWorkflow(container).run({
      input: { users: [{ email, roles }] },
    })
    userId = users[0].id
  }
  let authIdentityId = providerIdentity?.auth_identity_id
  let appMetadata = authIdentity?.app_metadata ?? {}
  if (plan.createLogin) {
    const { authIdentity: registered, error } = await authModule.register("emailpass", {
      body: { email, password },
    })
    if (error || !registered) {
      throw new Error(`Could not create the admin login: ${error ?? "unknown error"}`)
    }
    authIdentityId = registered.id
    appMetadata = registered.app_metadata ?? {}
  }
  if (plan.link) {
    await authModule.updateAuthIdentities({
      id: authIdentityId as string,
      app_metadata: { ...appMetadata, user_id: userId },
    })
  }
  return plan
}
