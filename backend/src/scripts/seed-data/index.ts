import { collections } from "./collections"
import { prices } from "./prices"
import { products } from "./products"
import { regions } from "./regions"
import { settings } from "./settings"
import { sizes } from "./sizes"
import { store } from "./store"
import type { SeedData } from "./types"

export const seedData: SeedData = {
  regions,
  store,
  sizes,
  collections,
  products,
  prices,
  settings,
}

export type { SeedData } from "./types"
