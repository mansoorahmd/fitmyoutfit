import repeat from "@lib/util/repeat"
import { productGridClasses } from "@modules/products/components/product-grid/grid"
import SkeletonProductPreview from "@modules/skeletons/components/skeleton-product-preview"

/** The product grid while it loads. Three cards: the garments we sell today. */
const SkeletonProductGrid = ({
  numberOfProducts = 3,
}: {
  numberOfProducts?: number
}) => {
  return (
    <ul
      className={productGridClasses(numberOfProducts)}
      data-testid="products-list-loader"
    >
      {repeat(numberOfProducts).map((index) => (
        <li key={index}>
          <SkeletonProductPreview />
        </li>
      ))}
    </ul>
  )
}

export default SkeletonProductGrid
