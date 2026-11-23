import { HttpTypes } from "@medusajs/types"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"

interface MinPricedProduct extends HttpTypes.StoreProduct {
  _minPrice?: number
}

/**
 * The store's own order of two products: the order the seed lists them in. Medusa's default listing order is the
 * product id ascending (the seed makes the ids sort in its list's order, backend/src/scripts/seed-lib/
 * product-repair-plan.ts, `orderedIds`), and the products of one seed run share one `created_at`, so the date cannot
 * decide it (a tie is left to the database's own row order, which moves when a row is updated: the "Team kit" list
 * once showed Jacket, T-shirt, Jersey after the seed changed the pictures). The id is stable and is the home page's order.
 */
export const compareStoreOrder = (
  a: Pick<HttpTypes.StoreProduct, "id">,
  b: Pick<HttpTypes.StoreProduct, "id">
): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

/**
 * Helper function to sort products by price until the store API supports sorting by price
 * @param products
 * @param sortBy
 * @returns products sorted by price
 */
export function sortProducts(
  products: HttpTypes.StoreProduct[],
  sortBy: SortOptions
): HttpTypes.StoreProduct[] {
  let sortedProducts = products as MinPricedProduct[]

  if (["price_asc", "price_desc"].includes(sortBy)) {
    // Precompute the minimum price for each product
    sortedProducts.forEach((product) => {
      if (product.variants && product.variants.length > 0) {
        product._minPrice = Math.min(
          ...product.variants.map(
            (variant) => variant?.calculated_price?.calculated_amount || 0
          )
        )
      } else {
        product._minPrice = Infinity
      }
    })

    // Sort products based on the precomputed minimum prices
    sortedProducts.sort((a, b) => {
      const diff = a._minPrice! - b._minPrice!
      return sortBy === "price_asc" ? diff : -diff
    })
  }

  if (sortBy === "store_order") {
    sortedProducts.sort(compareStoreOrder)
  }

  if (sortBy === "created_at") {
    sortedProducts.sort((a, b) => {
      return (
        new Date(b.created_at!).getTime() - new Date(a.created_at!).getTime()
      )
    })
  }

  return sortedProducts
}
