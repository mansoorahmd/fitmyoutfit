import { HttpTypes } from "@medusajs/types"

type ProductInfoProps = {
  product: HttpTypes.StoreProduct
}

/**
 * The product's name: the page's only h1. The description moved to the
 * "Description" details under the buy block, so the price and sizes come
 * straight after the name.
 */
const ProductInfo = ({ product }: ProductInfoProps) => (
  <h1 className="type-h1 text-brand-ink" data-testid="product-title">
    {product.title}
  </h1>
)

export default ProductInfo
