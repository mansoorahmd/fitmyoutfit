import { productContent } from "@content/product"
import { retrieveCart } from "@lib/data/cart"
import { getCheckoutRules } from "@lib/data/checkout-rules"
import { listProducts } from "@lib/data/products"
import { productMinimumLine } from "@lib/util/product-minimum"
import { HttpTypes } from "@medusajs/types"
import ProductActions from "@modules/products/components/product-actions"

/**
 * Fetches real time pricing for a product and renders the product actions
 * component. When the minimum order line shows (export regions, garments,
 * while its content switch is on), it also reads how many garment pieces
 * the cart already holds from the backend's rules, for "You have 4 in your
 * cart." Without a cart or rules, that line is left out.
 */
export default async function ProductActionsWrapper({
  id,
  region,
  countryCode,
}: {
  id: string
  region: HttpTypes.StoreRegion
  countryCode: string
}) {
  const product = await listProducts({
    queryParams: { id: [id] },
    regionId: region.id,
  }).then(({ response }) => response.products[0])

  if (!product) {
    return null
  }

  const minimumShows = productMinimumLine({
    show: productContent.minimum.show,
    countryCode,
    product,
    region,
    counted: null,
  })

  let counted: number | null = null
  if (minimumShows) {
    const cart = await retrieveCart(undefined, "id").catch(() => null)
    const rules = cart ? await getCheckoutRules(cart.id) : null
    counted = rules?.minimum_quantity?.counted ?? null
  }

  return (
    <ProductActions product={product} region={region} initialCounted={counted} />
  )
}
