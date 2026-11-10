import { listProducts } from "@lib/data/products"
import { listedOnly } from "@lib/util/product-kind"
import { HttpTypes } from "@medusajs/types"

import { homeContent } from "@content/home"
import {
  productCardImageSizes,
  productGridClasses,
} from "@modules/products/components/product-grid/grid"
import ProductCard from "@modules/products/components/product-preview"
import EmptyProducts from "@modules/store/components/empty-products"

/**
 * "Choose your garment" on the home page: the garments collection as
 * product cards, in the listing's grid (docs/design/03-direction.md,
 * "Home page" 3).
 */
export default async function ProductRail({
  collection,
  region,
}: {
  collection: HttpTypes.StoreCollection
  region: HttpTypes.StoreRegion
}) {
  const {
    response: { products },
  } = await listProducts({
    regionId: region.id,
    queryParams: {
      collection_id: collection.id,
      // metadata for the kind: a kind never listed stays out (lib/util/product-kind)
      fields: "*variants.calculated_price,+metadata",
    },
  })
  const pricedProducts = listedOnly(products ?? [])

  if (!pricedProducts?.length) {
    return <EmptyProducts />
  }

  return (
    <ul className={productGridClasses(pricedProducts.length)}>
      {pricedProducts.map((product) => (
        <li key={product.id}>
          <ProductCard
            product={product}
            region={region}
            imageSizes={productCardImageSizes(pricedProducts.length)}
          />
        </li>
      ))}
    </ul>
  )
}

/** The section around the rail, with its title. The rail or an empty state goes inside. */
export const GarmentsSection = ({ children }: { children: React.ReactNode }) => (
  <section
    className="content-container flex flex-col gap-6 py-12 md:gap-8 xl:py-24"
    aria-labelledby="home-garments-heading"
    data-testid="home-garments"
  >
    <h2 id="home-garments-heading" className="type-h2 text-brand-ink">
      {homeContent.garments.title}
    </h2>
    {children}
  </section>
)
