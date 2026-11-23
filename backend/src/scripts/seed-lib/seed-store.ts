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
  createLocationFulfillmentSetWorkflow,
  createPricePreferencesWorkflow,
  createProductsWorkflow,
  createProductVariantsWorkflow,
  createRegionsWorkflow,
  createSalesChannelsWorkflow,
  createServiceZonesWorkflow,
  createShippingOptionsWorkflow,
  createShippingProfilesWorkflow,
  createStockLocationsWorkflow,
  createUsersWorkflow,
  linkSalesChannelsToApiKeyWorkflow,
  linkSalesChannelsToStockLocationWorkflow,
  updateProductsWorkflow,
  updateRegionsWorkflow,
  updateStoresWorkflow,
  uploadFilesWorkflow,
  upsertVariantPricesWorkflow,
} from "@medusajs/medusa/core-flows"
import { describeNodeEnv } from "../../lib/config/node-env"
import { seedData as defaultSeedData } from "../seed-data"
import type { SeedData } from "../seed-data/types"
import { planAdminUser, type AdminUserPlan } from "./admin-user-plan"
import { buildProductInput } from "./build-product-input"
import { planProductPictures, settlePicturePlan, type ExistingProduct } from "./product-images"
import { pictureMimeType, readPictureFiles } from "./product-picture-files"
import {
  describeRepair,
  orderedIds,
  planProductRepair,
  type ExistingSeededProduct,
} from "./product-repair-plan"
import { planRegions, type ExistingRegion } from "./region-plan"
import {
  buildShippingOptionInput,
  hasLink,
  MANUAL_FULFILLMENT_PROVIDER,
  pickShippingSet,
  pickStockLocation,
  planServiceZones,
  planShippingOptions,
  type ExistingStockLocation,
} from "./shipping-plan"
import { planSizeCharts, type ProductWithMetadata } from "./size-chart-plan"
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
  /** Where to look for our product picture files; by default next to the backend (tests set it). */
  picturesDirectories?: string[]
}

export type SeedResult = {
  publishableKey: string
  created: {
    /** Names (from the seed data) of the regions created in this run. */
    regions: string[]
    /** Store metadata settings written in this run (only ones that were missing). */
    settings: string[]
    /**
     * Region metadata settings written in this run on regions that already existed, as
     * "<seed region name>: <key>" (a region created in this run gets its metadata with it).
     */
    regionSettings: string[]
    collections: string[]
    products: string[]
    /** Handles of the products that got their pictures in this run (they had none). */
    images: string[]
    /** Handles of the products that got their placeholder size chart in this run. */
    sizeCharts: string[]
    shippingProfile: boolean
    stockLocation: boolean
    fulfillmentSet: boolean
    /** Names of the service zones created in this run. */
    serviceZones: string[]
    /** Seed names of the regions that got their shipping option in this run. */
    shippingOptions: string[]
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
  /** Problems found on seeded records that the seed left alone (also logged as warnings). */
  warnings: string[]
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
    regionSettings: [],
    collections: [],
    products: [],
    images: [],
    sizeCharts: [],
    shippingProfile: false,
    stockLocation: false,
    fulfillmentSet: false,
    serviceZones: [],
    shippingOptions: [],
    salesChannel: false,
    publishableKey: false,
    adminUser: false,
  }
  const repaired: string[] = []
  const warnings: string[] = []

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

  // 4. Default shipping profile (products and the shipping options need one)
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
      "variants.sku",
      "variants.title",
      "variants.variant_rank",
      "variants.options.value",
      "variants.options.option_id",
      "variants.price_set.id",
      "variants.price_set.prices.id",
      "variants.price_set.prices.currency_code",
      "variants.price_set.prices.price_list_id",
      "variants.price_set.prices.rules_count",
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
    for (const entry of repair.optionValues) {
      // Medusa's variant update takes the variant's values for every option of the product, by
      // option title, and refuses a combination another variant already has.
      await productModule.updateProductVariants(entry.variantId, { options: entry.options })
    }
    for (const warning of repair.warnings) {
      logger.warn(`Seed: ${warning}`)
    }
    warnings.push(...repair.warnings)
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

  // 6c. Product pictures. A product with no picture gets them; one that still shows exactly the
  // seed's old stand-in photos gets our own pictures instead (the repair). A picture an admin
  // uploaded or changed is never touched, and a product already showing our pictures is left
  // alone, so a second run uploads nothing. Our files are uploaded through the File Module (local
  // files or S3 / MinIO, whichever is configured); the URLs it returns are what the product
  // shows. When a file cannot be read, one warning names it and the images stay as they are (a
  // product with no picture at all gets its stand-in links, as before).
  const { data: pictureRows } = await query.graph({
    entity: "product",
    fields: ["id", "handle", "thumbnail", "images.id", "images.url"],
    filters: { handle: seed.products.data.map((p) => p.handle) },
  })
  const picturePlan = planProductPictures(
    pictureRows as unknown as ExistingProduct[],
    seed.products.data
  )
  const wantedFiles = [...new Set(picturePlan.flatMap((entry) => entry.files))]
  const pictureFiles = await readPictureFiles(wantedFiles, options.picturesDirectories)
  if (pictureFiles.unreadable.length > 0) {
    const message =
      `Product pictures: could not read ${pictureFiles.unreadable.join(", ")} ` +
      "(packages/editor/samples/pictures/products/ is not next to the backend), so the images " +
      "were left as they are."
    logger.warn(message)
    warnings.push(message)
  }
  const pictureSteps = settlePicturePlan(picturePlan, new Set(pictureFiles.unreadable))
  const uploadedUrls = new Map<string, string>()
  for (const file of new Set(
    pictureSteps.filter((step) => step.set === "files").flatMap((step) => step.entry.files)
  )) {
    const { result } = await uploadFilesWorkflow(container).run({
      input: {
        files: [
          {
            filename: file,
            mimeType: pictureMimeType(file),
            content: (pictureFiles.found.get(file) as Buffer).toString("base64"),
            access: "public",
          },
        ],
      },
    })
    uploadedUrls.set(file, result[0].url)
  }
  if (pictureSteps.length > 0) {
    const pictures = pictureSteps.map((step) => {
      const urls =
        step.set === "files" ? step.entry.files.map((file) => uploadedUrls.get(file) as string) : step.entry.urls
      return {
        id: step.entry.productId,
        thumbnail: urls[0],
        images: urls.map((url) => ({ url })),
      }
    })
    await updateProductsWorkflow(container).run({ input: { products: pictures } })
    created.images = pictureSteps.filter((step) => step.entry.kind === "fresh").map((step) => step.entry.handle)
    repaired.push(
      ...pictureSteps
        .filter((step) => step.entry.kind === "replace")
        .map((step) => `${step.entry.handle}: pictures (stand-in photos replaced by our own)`)
    )
  }

  // 6d. Placeholder size charts (metadata.size_chart), only on a product that has none, so a
  // chart edited in the admin is kept. The rest of the product's metadata is kept as it is.
  const { data: metadataRows } = await query.graph({
    entity: "product",
    fields: ["id", "handle", "metadata"],
    filters: { handle: Object.keys(seed.sizeCharts.data) },
  })
  const chartPlan = planSizeCharts(
    metadataRows as unknown as ProductWithMetadata[],
    seed.sizeCharts.data
  )
  if (chartPlan.length > 0) {
    await updateProductsWorkflow(container).run({
      input: {
        products: chartPlan.map((entry) => ({ id: entry.productId, metadata: entry.metadata })),
      },
    })
    created.sizeCharts = chartPlan.map((entry) => entry.handle)
  }

  // 6e. Shipping: stock location, fulfillment set, a service zone and a shipping option per region.
  await seedShipping(container, seed, {
    salesChannelId: salesChannel.id,
    shippingProfileId: shippingProfile.id,
    created,
    repaired,
  })

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
      (warnings.length > 0 ? `Left as they are (see the warnings): ${warnings.length}. ` : "") +
      "(Anything not listed already existed.)"
  )
  return { publishableKey: key.token as string, created, repaired, warnings }
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
    fields: ["id", "name", "metadata", "countries.iso_2", "payment_providers.id"],
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
          payment_providers: region.payment_providers,
        })),
      },
    })
    created.regions = plan.create.map((r) => r.name)
  }

  // Seed payment providers a region lacks (an interrupted create, or cash on delivery on a
  // Pakistan seeded before it existed). The region keeps any provider an admin linked.
  for (const entry of plan.linkPaymentProviders) {
    await updateRegionsWorkflow(container).run({
      input: {
        selector: { id: entry.regionId },
        update: { payment_providers: entry.providers },
      },
    })
    repaired.push(`region ${entry.seedName}: payment providers ${entry.added.join(", ")}`)
  }

  // Region settings (min_garment_quantity, ...) a region lacks. A value that is set is kept.
  for (const entry of plan.addMetadata) {
    await updateRegionsWorkflow(container).run({
      input: { selector: { id: entry.regionId }, update: { metadata: entry.metadata } },
    })
    created.regionSettings.push(...entry.added.map((key) => `${entry.seedName}: ${key}`))
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

const STOCK_LOCATION_FIELDS = [
  "id",
  "name",
  "created_at",
  "sales_channels.id",
  "fulfillment_providers.id",
  "fulfillment_sets.id",
  "fulfillment_sets.name",
  "fulfillment_sets.type",
  "fulfillment_sets.service_zones.id",
  "fulfillment_sets.service_zones.name",
  "fulfillment_sets.service_zones.geo_zones.type",
  "fulfillment_sets.service_zones.geo_zones.country_code",
  "fulfillment_sets.service_zones.shipping_options.id",
  "fulfillment_sets.service_zones.shipping_options.rules.attribute",
  "fulfillment_sets.service_zones.shipping_options.rules.value",
]

/**
 * One stock location (linked to the manual fulfillment provider and the default sales channel),
 * one shipping fulfillment set on it, and per region a service zone with one shipping option.
 * Each part is checked on its own, so a run that stopped half-way is completed by the next one;
 * the decisions are in shipping-plan.ts.
 */
async function seedShipping(
  container: MedusaContainer,
  seed: SeedData,
  ctx: {
    salesChannelId: string
    shippingProfileId: string
    created: SeedResult["created"]
    repaired: string[]
  }
): Promise<void> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const link = container.resolve(ContainerRegistrationKeys.LINK)
  const fulfillmentModule = container.resolve(Modules.FULFILLMENT)
  const shipping = seed.shipping.data
  const { created, repaired } = ctx

  const loadLocation = async (id?: string): Promise<ExistingStockLocation | null> => {
    const { data } = await query.graph({
      entity: "stock_location",
      fields: STOCK_LOCATION_FIELDS,
      ...(id ? { filters: { id } } : {}),
    })
    const rows = data as unknown as ExistingStockLocation[]
    return id ? (rows[0] ?? null) : pickStockLocation(rows, shipping.stock_location.name)
  }

  let location = await loadLocation()
  if (!location) {
    const { result } = await createStockLocationsWorkflow(container).run({
      input: {
        locations: [
          { name: shipping.stock_location.name, address: { ...shipping.stock_location.address } },
        ],
      },
    })
    location = { id: result[0].id, name: result[0].name }
    created.stockLocation = true
  }
  const locationId = location.id

  if (!hasLink(location.fulfillment_providers, MANUAL_FULFILLMENT_PROVIDER)) {
    await link.create({
      [Modules.STOCK_LOCATION]: { stock_location_id: locationId },
      [Modules.FULFILLMENT]: { fulfillment_provider_id: MANUAL_FULFILLMENT_PROVIDER },
    })
    if (!created.stockLocation) repaired.push("stock location: fulfillment provider")
  }
  if (!hasLink(location.sales_channels, ctx.salesChannelId)) {
    await linkSalesChannelsToStockLocationWorkflow(container).run({
      input: { id: locationId, add: [ctx.salesChannelId] },
    })
    if (!created.stockLocation) repaired.push("stock location: sales channel")
  }

  if (!pickShippingSet(location, shipping.fulfillment_set_name)) {
    // Fulfillment set names are unique: a set with the seed's name that lost its link to the
    // location is linked again instead of created.
    const [orphan] = await fulfillmentModule.listFulfillmentSets({
      name: shipping.fulfillment_set_name,
    })
    if (orphan) {
      await link.create({
        [Modules.STOCK_LOCATION]: { stock_location_id: locationId },
        [Modules.FULFILLMENT]: { fulfillment_set_id: orphan.id },
      })
      repaired.push("fulfillment set: stock location")
    } else {
      await createLocationFulfillmentSetWorkflow(container).run({
        input: {
          location_id: locationId,
          fulfillment_set_data: { name: shipping.fulfillment_set_name, type: "shipping" },
        },
      })
      created.fulfillmentSet = true
    }
  }

  const currentSet = async () => {
    const reloaded = await loadLocation(locationId)
    const set = reloaded ? pickShippingSet(reloaded, shipping.fulfillment_set_name) : null
    if (!set) {
      throw new Error(`Seed: the stock location ${locationId} has no shipping fulfillment set`)
    }
    return set
  }

  let set = await currentSet()
  const zones = planServiceZones(set, shipping, seed.regions.data)
  if (zones.length > 0) {
    await createServiceZonesWorkflow(container).run({
      input: {
        data: zones.map((zone) => ({
          name: zone.name,
          fulfillment_set_id: set.id,
          geo_zones: zone.countryCodes.map((country_code) => ({
            type: "country" as const,
            country_code,
          })),
        })),
      },
    })
    created.serviceZones = zones.map((zone) => zone.name)
    set = await currentSet()
  }

  const options = planShippingOptions(set, shipping, seed.regions.data)
  if (options.length > 0) {
    await createShippingOptionsWorkflow(container).run({
      input: options.map((entry) => buildShippingOptionInput(entry, ctx.shippingProfileId)),
    })
    created.shippingOptions = options.map((entry) => entry.regionName)
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
