/**
 * Validation of the placeholder seed data. Plain TypeScript, no Medusa imports.
 * The seed calls `assertValidSeedData` before it writes anything, so a bad data file fails fast
 * with a readable list of problems instead of half-seeding the database.
 */
import type { PlaceholderData, ProductKind, SeedData } from "../seed-data/types"

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
  }

  // Prices: every product has a valid price in every supported currency, and nothing extra.
  const productHandles = new Set(products.map((p) => p.handle))
  for (const handle of Object.keys(prices)) {
    if (!productHandles.has(handle)) {
      problems.push(`prices: "${handle}" is not a product`)
    }
  }
  for (const product of products) {
    const row = prices[product.handle]
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
