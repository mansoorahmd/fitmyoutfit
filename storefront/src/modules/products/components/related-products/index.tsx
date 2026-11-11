import { listingContent } from "@content/listing"
import { listProducts } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"
import { listedOnly } from "@lib/util/product-kind"
import { hasRelatedProducts } from "@lib/util/product-page"
import { HttpTypes } from "@medusajs/types"
import {
  productCardImageSizes,
  productGridClasses,
} from "@modules/products/components/product-grid/grid"
import ProductCard from "../product-preview"

type RelatedProductsProps = {
  product: HttpTypes.StoreProduct
  countryCode: string
}

/**
 * "Complete the kit" on the product page: the other products of the same
 * collection (for a garment, the other two garments), as product cards.
 */
export default async function RelatedProducts({
  product,
  countryCode,
}: RelatedProductsProps) {
  // A product with no collection and no tags (the fit kit, the rush add-on)
  // has nothing to be related by. Without this check the query below would
  // list every other product.
  if (!hasRelatedProducts(product)) {
    return null
  }

  const region = await getRegion(countryCode)

  if (!region) {
    return null
  }

  const queryParams: HttpTypes.StoreProductListParams = {}
  if (region?.id) {
    queryParams.region_id = region.id
  }
  if (product.collection_id) {
    queryParams.collection_id = [product.collection_id]
  }
  if (product.tags) {
    queryParams.tag_id = product.tags
      .map((t) => t.id)
      .filter(Boolean) as string[]
  }
  queryParams.is_giftcard = false

  const products = await listProducts({
    queryParams,
    countryCode,
  }).then(({ response }) => {
    // never the product itself, nor a kind that is never listed (the rush
    // add-on, lib/util/product-kind)
    return listedOnly(response.products).filter(
      (responseProduct) => responseProduct.id !== product.id
    )
  })

  if (!products.length) {
    return null
  }

  return (
    <section
      className="flex flex-col gap-6 md:gap-8"
      aria-labelledby="related-products-heading"
      data-testid="related-products"
    >
      <h2 id="related-products-heading" className="type-h2 text-brand-ink">
        {listingContent.relatedTitle}
      </h2>
      <ul className={productGridClasses(products.length)}>
        {products.map((related) => (
          <li key={related.id}>
            <ProductCard
              product={related}
              imageSizes={productCardImageSizes(products.length)}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}
