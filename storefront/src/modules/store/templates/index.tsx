import { Suspense } from "react"

import { listingContent } from "@content/listing"
import { navigationContent } from "@content/navigation"
import { ButtonLink } from "@modules/common/components/button"
import { isPakistan } from "@lib/util/home-regions"
import SkeletonProductGrid from "@modules/skeletons/templates/skeleton-product-grid"
import EmptyProducts from "@modules/store/components/empty-products"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"

import PaginatedProducts from "./paginated-products"

/**
 * The listing (`/store`, docs/design/03-direction.md, "Product listing"):
 * the title "Team kit", in export regions the duty-paid note, then the grid.
 * "Sort by" appears only once there are more than 8 products; the grid
 * decides, because only it knows the count.
 */
const StoreTemplate = ({
  sortBy,
  page,
  countryCode,
  collectionId,
}: {
  sortBy?: SortOptions
  page?: string
  countryCode: string
  /** Id of the collection to list. Without one there is nothing to list. */
  collectionId?: string
}) => {
  const pageNumber = page ? parseInt(page) : 1
  const sort = sortBy || "store_order"

  return (
    <div
      className="content-container flex flex-col gap-6 py-8 md:gap-8 md:py-12 xl:py-16"
      data-testid="category-container"
    >
      <header className="flex flex-col gap-2">
        <h1 className="type-h1 text-brand-ink" data-testid="store-page-title">
          {listingContent.title}
        </h1>
        {!isPakistan(countryCode) && (
          <p className="type-body text-brand-ink-muted" data-testid="store-export-note">
            {listingContent.exportNote}
          </p>
        )}
        <ButtonLink href={navigationContent.designLink.href} variant="secondary" className="mt-2 self-start" data-testid="store-design-link">
          {navigationContent.designLink.label}
        </ButtonLink>
      </header>
      {collectionId ? (
        <Suspense fallback={<SkeletonProductGrid />}>
          <PaginatedProducts
            sortBy={sort}
            page={pageNumber}
            countryCode={countryCode}
            collectionId={collectionId}
          />
        </Suspense>
      ) : (
        <EmptyProducts />
      )}
    </div>
  )
}

export default StoreTemplate
