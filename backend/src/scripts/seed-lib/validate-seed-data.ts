/**
 * Validation of the placeholder seed data. Plain TypeScript, no Medusa imports.
 * The seed calls `assertValidSeedData` before it writes anything, so a bad data file fails fast
 * with a readable list of problems instead of half-seeding the database.
 */
import type { PlaceholderData, ProductKind, SeedData } from "../seed-data/types"
import { readCodMaxTotal } from "../../lib/settings/cod-max-total"
import { readDeliveryDays } from "../../lib/settings/delivery-days"
import { readMinGarmentQuantity } from "../../lib/settings/min-garment-quantity"
import { readRushPercentage } from "../../lib/settings/rush-percentage"
import { isHttpsUrl } from "./product-images"

const PAYMENT_PROVIDER_RE = /^pp_[a-z0-9-]+(_[a-z0-9-]+)+$/
const CURRENCY_RE = /^[a-z]{3}$/
const COUNTRY_RE = /^[a-z]{2}$/
const HANDLE_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const SKU_PREFIX_RE = /^[A-Z0-9]+$/
const PRODUCT_KINDS: ProductKind[] = ["garment", "fit_kit", "rush_add_on"]

function duplicates(values: string[]): string[] {
  const seen = new Set<string>()
  const dupes = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) {
      dupes.add(value)
    }
    seen.add(value)
  }
  return [...dupes]
}

function hasAtMostTwoDecimals(amount: number): boolean {
  return Math.abs(amount * 100 - Math.round(amount * 100)) < 1e-6
}

function checkPlaceholderMarker(
  label: string,
  file: PlaceholderData<unknown> | undefined,
  problems: string[]
): void {
  if (!file) {
    problems.push(`${label}: file is missing`)
    return
  }
  if (file.placeholder !== true) {
    problems.push(`${label}: must be marked placeholder: true`)
  }
  if (typeof file.note !== "string" || file.note.trim() === "") {
    problems.push(`${label}: needs a non-empty note saying what the real input is`)
  }
}

/** Returns a list of problems. An empty list means the data is valid. */
export function validateSeedData(seed: SeedData): string[] {
  const problems: string[] = []

  for (const key of Object.keys(seed) as (keyof SeedData)[]) {
    checkPlaceholderMarker(key, seed[key] as PlaceholderData<unknown>, problems)
  }
  // Without the data, the cross-checks below cannot run.
  if (problems.some((p) => p.endsWith("file is missing"))) {
    return problems
  }

  const regions = seed.regions.data
  const store = seed.store.data
  const sizes = seed.sizes.data
  const collections = seed.collections.data
  const products = seed.products.data
  const prices = seed.prices.data

  // Store
  if (typeof store.name !== "string" || store.name.trim() === "") {
    problems.push("store: name must not be blank")
  }
  if (store.supported_currencies.length === 0) {
    problems.push("store: supported_currencies must not be empty")
  }
  for (const code of store.supported_currencies) {
    if (!CURRENCY_RE.test(code)) {
      problems.push(`store: currency "${code}" must be 3 lower-case letters`)
    }
  }
  for (const code of duplicates(store.supported_currencies)) {
    problems.push(`store: currency "${code}" is listed twice`)
  }
  if (!store.supported_currencies.includes(store.default_currency_code)) {
    problems.push(
      `store: default currency "${store.default_currency_code}" is not in supported_currencies`
    )
  }
  if (store.default_sales_channel_name.trim() === "") {
    problems.push("store: default_sales_channel_name must not be blank")
  }
  if (store.publishable_key_title.trim() === "") {
    problems.push("store: publishable_key_title must not be blank")
  }

  // Regions
  if (regions.length === 0) {
    problems.push("regions: at least one region is required")
  }
  for (const name of duplicates(regions.map((r) => r.name))) {
    problems.push(`regions: name "${name}" is used twice`)
  }
  for (const region of regions) {
    if (region.name.trim() === "") {
      problems.push("regions: a region has a blank name")
    }
    if (!CURRENCY_RE.test(region.currency_code)) {
      problems.push(
        `regions: "${region.name}" currency "${region.currency_code}" must be 3 lower-case letters`
      )
    } else if (!store.supported_currencies.includes(region.currency_code)) {
      problems.push(
        `regions: "${region.name}" currency "${region.currency_code}" is not in the store's supported_currencies`
      )
    }
    if (region.country_codes.length === 0) {
      problems.push(`regions: "${region.name}" has no countries`)
    }
    for (const country of region.country_codes) {
      if (!COUNTRY_RE.test(country)) {
        problems.push(
          `regions: "${region.name}" country "${country}" must be 2 lower-case letters`
        )
      }
    }
    if (typeof region.metadata?.tax_final !== "boolean") {
      problems.push(`regions: "${region.name}" metadata.tax_final must be true or false`)
    }
  }
  for (const country of duplicates(regions.flatMap((r) => r.country_codes))) {
    problems.push(`regions: country "${country}" belongs to more than one region`)
  }
  const usedCurrencies = new Set(regions.map((r) => r.currency_code))
  for (const code of store.supported_currencies) {
    if (!usedCurrencies.has(code)) {
      problems.push(`store: currency "${code}" has no region`)
    }
  }

  // Sizes
  if (sizes.length === 0) {
    problems.push("sizes: the size list must not be empty")
  }
  for (const size of sizes) {
    if (typeof size !== "string" || size.trim() === "" || size !== size.trim()) {
      problems.push(`sizes: "${size}" must be a non-blank string without surrounding spaces`)
    }
  }
  for (const size of duplicates(sizes)) {
    problems.push(`sizes: "${size}" is listed twice`)
  }

  // Collections
  for (const handle of duplicates(collections.map((c) => c.handle))) {
    problems.push(`collections: handle "${handle}" is used twice`)
  }
  for (const collection of collections) {
    if (!HANDLE_RE.test(collection.handle)) {
      problems.push(`collections: handle "${collection.handle}" is not a valid handle`)
    }
    if (collection.title.trim() === "") {
      problems.push(`collections: "${collection.handle}" has a blank title`)
    }
  }
  const collectionHandles = new Set(collections.map((c) => c.handle))

  // Products
  if (products.length === 0) {
    problems.push("products: at least one product is required")
  }
  for (const handle of duplicates(products.map((p) => p.handle))) {
    problems.push(`products: handle "${handle}" is used twice`)
  }
  for (const prefix of duplicates(products.map((p) => p.sku_prefix))) {
    problems.push(`products: sku_prefix "${prefix}" is used twice`)
  }
  for (const product of products) {
    if (!HANDLE_RE.test(product.handle)) {
      problems.push(`products: handle "${product.handle}" is not a valid handle`)
    }
    if (product.title.trim() === "") {
      problems.push(`products: "${product.handle}" has a blank title`)
    }
    if (!PRODUCT_KINDS.includes(product.kind)) {
      problems.push(`products: "${product.handle}" has an unknown kind "${product.kind}"`)
    }
    if (!SKU_PREFIX_RE.test(product.sku_prefix)) {
      problems.push(
        `products: "${product.handle}" sku_prefix "${product.sku_prefix}" must be upper-case letters and digits`
      )
    }
    if (product.collection_handle !== null && !collectionHandles.has(product.collection_handle)) {
      problems.push(
        `products: "${product.handle}" refers to unknown collection "${product.collection_handle}"`
      )
    }
    if (product.has_sizes && sizes.length === 0) {
      problems.push(`products: "${product.handle}" needs sizes but the size list is empty`)
    }
    const images = product.images
    if (!images || !Array.isArray(images.urls)) {
      problems.push(`products: "${product.handle}" needs images: { placeholder, urls }`)
    } else {
      if (images.placeholder !== true) {
        problems.push(`products: "${product.handle}" images must be marked placeholder: true`)
      }
      if (images.urls.length === 0) {
        problems.push(`products: "${product.handle}" needs at least one image URL`)
      }
      for (const url of images.urls) {
        if (!isHttpsUrl(url)) {
          problems.push(`products: "${product.handle}" image ${JSON.stringify(url)} must be an https URL`)
        }
      }
      for (const url of duplicates(images.urls.filter((u) => typeof u === "string"))) {
        problems.push(`products: "${product.handle}" image "${url}" is listed twice`)
      }
    }
  }

  // Prices: a product with has_fixed_prices has a valid price in every supported currency and
  // nothing extra; a product without has no price row at all.
  const productHandles = new Set(products.map((p) => p.handle))
  for (const handle of Object.keys(prices)) {
    if (!productHandles.has(handle)) {
      problems.push(`prices: "${handle}" is not a product`)
    }
  }
  for (const product of products) {
    const row = prices[product.handle]
    if (typeof product.has_fixed_prices !== "boolean") {
      problems.push(`products: "${product.handle}" has_fixed_prices must be true or false`)
      continue
    }
    if (!product.has_fixed_prices) {
      if (row) {
        problems.push(
          `prices: product "${product.handle}" has has_fixed_prices: false, so it must have no prices`
        )
      }
      continue
    }
    if (!row) {
      problems.push(`prices: product "${product.handle}" has no prices`)
      continue
    }
    for (const currency of store.supported_currencies) {
      const amount = row[currency]
      if (amount === undefined) {
        problems.push(`prices: product "${product.handle}" has no price in ${currency}`)
      } else if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
        problems.push(
          `prices: product "${product.handle}" price in ${currency} must be a number above zero`
        )
      } else if (!hasAtMostTwoDecimals(amount)) {
        problems.push(
          `prices: product "${product.handle}" price in ${currency} has more than 2 decimals`
        )
      }
    }
    for (const currency of Object.keys(row)) {
      if (!store.supported_currencies.includes(currency)) {
        problems.push(
          `prices: product "${product.handle}" has a price in unsupported currency "${currency}"`
        )
      }
    }
  }

  // Store settings
  const rush = readRushPercentage(seed.settings.data)
  if (!rush.ok) {
    problems.push(`settings: ${rush.error}`)
  }
  const codLimit = readCodMaxTotal(seed.settings.data)
  if (!codLimit.ok) {
    problems.push(`settings: ${codLimit.error}`)
  }
  const deliveryDays = readDeliveryDays(seed.settings.data)
  if (!deliveryDays.ok) {
    problems.push(`settings: ${deliveryDays.error}`)
  }

  // Region settings and payment providers
  for (const region of regions) {
    const minimum = readMinGarmentQuantity(region.metadata, region.name)
    if (!minimum.ok) {
      problems.push(`regions: ${minimum.error}`)
    }
    const providers = region.payment_providers
    if (!Array.isArray(providers) || providers.length === 0) {
      problems.push(`regions: "${region.name}" needs at least one payment provider`)
      continue
    }
    for (const id of providers) {
      if (typeof id !== "string" || !PAYMENT_PROVIDER_RE.test(id)) {
        problems.push(
          `regions: "${region.name}" payment provider ${JSON.stringify(id)} must look like pp_<identifier>_<id>`
        )
      }
    }
    for (const id of duplicates(providers)) {
      problems.push(`regions: "${region.name}" payment provider "${id}" is listed twice`)
    }
  }

  problems.push(...validateSizeCharts(seed))
  problems.push(...validateShipping(seed))

  return problems
}

/** Products of these kinds carry a size chart (docs/contracts/m1-checkout.md, section 2). */
const KINDS_WITH_SIZE_CHART: ProductKind[] = ["garment", "fit_kit"]

function validateSizeCharts(seed: SeedData): string[] {
  const problems: string[] = []
  const charts = seed.sizeCharts.data
  const sizes = seed.sizes.data
  const products = seed.products.data
  const productHandles = new Set(products.map((p) => p.handle))
  for (const handle of Object.keys(charts)) {
    if (!productHandles.has(handle)) {
      problems.push(`sizeCharts: "${handle}" is not a product`)
    }
  }
  for (const product of products) {
    const chart = charts[product.handle]
    const label = `sizeCharts: "${product.handle}"`
    if (!KINDS_WITH_SIZE_CHART.includes(product.kind)) {
      if (chart) {
        problems.push(`${label} is a ${product.kind}, which has no size chart`)
      }
      continue
    }
    if (!chart) {
      problems.push(`${label} needs a size chart`)
      continue
    }
    if (typeof chart.draft !== "boolean") {
      problems.push(`${label} draft must be true or false`)
    }
    if (chart.unit !== "cm") {
      problems.push(`${label} unit must be "cm"`)
    }
    const columns = Array.isArray(chart.columns) ? chart.columns : []
    if (columns.length === 0) {
      problems.push(`${label} needs at least one column`)
    }
    for (const column of columns) {
      if (typeof column.key !== "string" || !/^[a-z][a-z0-9_]*$/.test(column.key)) {
        problems.push(`${label} column key ${JSON.stringify(column.key)} must be lower-case letters, digits and _`)
      }
      if (typeof column.label !== "string" || column.label.trim() === "") {
        problems.push(`${label} column "${column.key}" needs a label`)
      }
    }
    const keys = columns.map((c) => c.key)
    for (const key of duplicates(keys)) {
      problems.push(`${label} column "${key}" is listed twice`)
    }
    const rows = Array.isArray(chart.rows) ? chart.rows : []
    const rowSizes = rows.map((r) => r.size)
    // Every product with a chart lists every size in order: the garments sell them all, and the
    // fit kit holds a sample of each.
    if (rowSizes.join("|") !== sizes.join("|")) {
      problems.push(`${label} rows must be the sizes ${sizes.join(", ")} in that order`)
    }
    for (const row of rows) {
      const values = row.values ?? {}
      for (const key of keys) {
        const value = values[key]
        if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
          problems.push(`${label} size ${row.size} ${key} must be a number above zero`)
        }
      }
      for (const key of Object.keys(values)) {
        if (!keys.includes(key)) {
          problems.push(`${label} size ${row.size} has a value for unknown column "${key}"`)
        }
      }
    }
  }
  return problems
}

function validateShipping(seed: SeedData): string[] {
  const problems: string[] = []
  const shipping = seed.shipping.data
  const location = shipping.stock_location
  if (!location || typeof location.name !== "string" || location.name.trim() === "") {
    problems.push("shipping: stock_location needs a name")
  } else if (!COUNTRY_RE.test(location.address?.country_code ?? "")) {
    problems.push("shipping: stock_location country_code must be 2 lower-case letters")
  }
  if (typeof shipping.fulfillment_set_name !== "string" || shipping.fulfillment_set_name.trim() === "") {
    problems.push("shipping: fulfillment_set_name must not be blank")
  }
  const options = shipping.options ?? []
  const regionByCountry = new Map(
    seed.regions.data.flatMap((r) => r.country_codes.map((code) => [code, r] as const))
  )
  for (const option of options) {
    const label = `shipping: option for "${option.region_country_code}"`
    if (!regionByCountry.has(option.region_country_code)) {
      problems.push(`${label} does not match a seed region's country`)
    }
    if (typeof option.name !== "string" || option.name.trim() === "") {
      problems.push(`${label} needs a name`)
    }
    if (typeof option.service_zone_name !== "string" || option.service_zone_name.trim() === "") {
      problems.push(`${label} needs a service_zone_name`)
    }
    if (typeof option.amount !== "number" || !Number.isFinite(option.amount) || option.amount < 0) {
      problems.push(`${label} amount must be a number, 0 or more`)
    } else if (!hasAtMostTwoDecimals(option.amount)) {
      problems.push(`${label} amount has more than 2 decimals`)
    }
    if (typeof option.ddp !== "boolean") {
      problems.push(`${label} ddp must be true or false`)
    }
    if (!option.type || !option.type.code?.trim() || !option.type.label?.trim()) {
      problems.push(`${label} needs a type with a code and a label`)
    }
  }
  for (const country of duplicates(options.map((o) => o.region_country_code))) {
    problems.push(`shipping: more than one option for "${country}"`)
  }
  for (const name of duplicates(options.map((o) => o.service_zone_name))) {
    problems.push(`shipping: service zone name "${name}" is used twice`)
  }
  for (const code of duplicates(options.map((o) => o.type?.code ?? ""))) {
    problems.push(`shipping: type code "${code}" is used twice`)
  }
  for (const region of seed.regions.data) {
    if (!options.some((o) => region.country_codes.includes(o.region_country_code))) {
      problems.push(`shipping: region "${region.name}" has no shipping option`)
    }
  }
  return problems
}

export class SeedDataError extends Error {
  constructor(public readonly problems: string[]) {
    super(`Seed data is invalid:\n- ${problems.join("\n- ")}`)
  }
}

export function assertValidSeedData(seed: SeedData): void {
  const problems = validateSeedData(seed)
  if (problems.length > 0) {
    throw new SeedDataError(problems)
  }
}
