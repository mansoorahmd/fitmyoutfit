import React, { Suspense } from "react"

import { editorProductFor } from "@lib/editor/products"
import { hasRelatedProducts } from "@lib/util/product-page"
import DesignButton from "@modules/design/components/design-button"
import DesignSavedNotice from "@modules/design/components/design-saved-notice"
import ImageGallery from "@modules/products/components/image-gallery"
import ProductActions from "@modules/products/components/product-actions"
import ProductBreadcrumb from "@modules/products/components/product-breadcrumb"
import ProductDetails from "@modules/products/components/product-details"
import ProductFacts from "@modules/products/components/product-facts"
import RelatedProducts from "@modules/products/components/related-products"
import ProductInfo from "@modules/products/templates/product-info"
import SkeletonRelatedProducts from "@modules/skeletons/templates/skeleton-related-products"
import { notFound } from "next/navigation"
import { HttpTypes } from "@medusajs/types"

import ProductActionsWrapper from "./product-actions-wrapper"
import { productLayout } from "./layout"

type ProductTemplateProps = {
  product: HttpTypes.StoreProduct
  region: HttpTypes.StoreRegion
  countryCode: string
  images: HttpTypes.StoreProductImage[] | null
  /** The designer's "Done" sent the customer back here (?design=saved). */
  designSaved?: boolean
}

/**
 * The product page (docs/design/03-direction.md, "Product page", with the
 * differences decided in task S0-16).
 *
 * Below 1024 px one column, in this order: breadcrumb, gallery, name,
 * price, size, main button, facts, details, "Complete the kit". From 768 px
 * the column is at most 560 px wide and centred.
 *
 * From 1024 px two columns: the gallery on 7/12, the buy column on 5/12
 * with the details under the buy block. Both columns are sticky under the
 * header (header + 16 px): whichever is shorter stays in place while the
 * other scrolls, so neither leaves an empty column beside it. See ./layout.
 */
const ProductTemplate: React.FC<ProductTemplateProps> = ({
  product,
  region,
  countryCode,
  images,
  designSaved = false,
}) => {
  if (!product || !product.id) {
    return notFound()
  }

  // Only a product that has a 3D model gets the designer's button.
  const hasDesigner = !!editorProductFor(product.handle)

  return (
    <div className={productLayout.page} data-testid="product-container">
      <div className={productLayout.narrow}>
        <ProductBreadcrumb title={product.title} />
      </div>

      <div className={productLayout.columns}>
        <div className={productLayout.gallery}>
          <ImageGallery images={images ?? []} productTitle={product.title} />
        </div>

        <div className={productLayout.buy} data-testid="product-buy-column">
          <div className="flex flex-col gap-4">
            <ProductInfo product={product} />
            {hasDesigner && designSaved && <DesignSavedNotice />}
            {hasDesigner && <DesignButton handle={product.handle} />}
            <Suspense
              fallback={
                <ProductActions
                  disabled={true}
                  product={product}
                  region={region}
                />
              }
            >
              <ProductActionsWrapper
                id={product.id}
                region={region}
                countryCode={countryCode}
              />
            </Suspense>
          </div>
          <ProductFacts product={product} countryCode={countryCode} />
          <ProductDetails product={product} />
        </div>
      </div>

      {hasRelatedProducts(product) && (
        <div
          className={productLayout.related}
          data-testid="related-products-container"
        >
          <Suspense fallback={<SkeletonRelatedProducts />}>
            <RelatedProducts product={product} countryCode={countryCode} />
          </Suspense>
        </div>
      )}
    </div>
  )
}

export default ProductTemplate
