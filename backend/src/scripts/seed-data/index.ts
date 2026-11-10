import { collections } from "./collections"
import { prices } from "./prices"
import { products } from "./products"
import { regions } from "./regions"
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
}

export type { SeedData } from "./types"
