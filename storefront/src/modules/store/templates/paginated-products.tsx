import { listProductsWithSort } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"
import { sortProducts } from "@lib/util/sort-products"
import {
  productCardImageSizes,
  productGridClasses,
  showsSort,
} from "@modules/products/components/product-grid/grid"
import ProductCard from "@modules/products/components/product-preview"
import EmptyProducts from "@modules/store/components/empty-products"
import { Pagination } from "@modules/store/components/pagination"
import RefinementList from "@modules/store/components/refinement-list"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"

const PRODUCT_LIMIT = 12

type PaginatedProductsParams = {
  limit: number
  collection_id?: string[]
  category_id?: string[]
  id?: string[]
  order?: string
}

export default async function PaginatedProducts({
  sortBy,
  page,
  collectionId,
  categoryId,
  productsIds,
  countryCode,
}: {
  sortBy?: SortOptions
  page: number
  collectionId?: string
  categoryId?: string
  productsIds?: string[]
  countryCode: string
}) {
  const queryParams: PaginatedProductsParams = {
    limit: 12,
  }

  if (collectionId) {
    queryParams["collection_id"] = [collectionId]
  }

  if (categoryId) {
    queryParams["category_id"] = [categoryId]
  }

  if (productsIds) {
    queryParams["id"] = productsIds
  }

  if (sortBy === "created_at") {
    queryParams["order"] = "created_at"
  }

  const region = await getRegion(countryCode)

  if (!region) {
    return null
  }

  const {
    response: { products, count },
  } = await listProductsWithSort({
    page,
    queryParams,
    sortBy,
    countryCode,
  })

  if (!products.length) {
    return <EmptyProducts />
  }

  const totalPages = Math.ceil(count / PRODUCT_LIMIT)

  // "Sort by" waits until there are more than 8 products. Until then the
  // page neither shows it nor obeys a sortBy left in the URL: everything is
  // on the first page, in the default order.
  const sortVisible = showsSort(count)
  const shown =
    sortVisible || sortBy === "created_at" || !sortBy
      ? products
      : sortProducts([...products], "created_at")

  return (
    <>
      {sortVisible && (
        <div data-testid="store-sort">
          <RefinementList sortBy={sortBy || "created_at"} />
        </div>
      )}
      <ul
        className={productGridClasses(shown.length)}
        data-testid="products-list"
      >
        {shown.map((p, index) => {
          return (
            <li key={p.id}>
              <ProductCard
                product={p}
                region={region}
                headingLevel={2}
                imageSizes={productCardImageSizes(shown.length)}
                priority={index === 0}
              />
            </li>
          )
        })}
      </ul>
      {totalPages > 1 && (
        <Pagination
          data-testid="product-pagination"
          page={page}
          totalPages={totalPages}
        />
      )}
    </>
  )
}
