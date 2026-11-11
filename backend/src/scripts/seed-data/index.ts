import { collections } from "./collections"
import { prices } from "./prices"
import { products } from "./products"
import { regions } from "./regions"
import { settings } from "./settings"
import { shipping } from "./shipping"
import { sizeCharts } from "./size-charts"
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
  sizeCharts,
  shipping,
}

export type { SeedData } from "./types"
